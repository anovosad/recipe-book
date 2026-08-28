// Package importer fills in a recipe from a web page.
//
// The point is that nobody should retype a recipe they found online. Give it a
// URL and it fetches the page, reduces it to the recipe (schema.org data when
// the site publishes it, the stripped page text otherwise), and asks Claude to
// return it as a record this collection can hold: translated into Czech, with
// imperial measures converted where the conversion is exact, and with the
// ingredients and tags matched against the ones already stored.
//
// What comes back is a draft, not a saved recipe. It is handed to the recipe
// form for the person who asked to look over before saving - a model reading a
// page gets a quantity wrong now and then, and the check costs five seconds.
//
// The one thing it does write is the taxonomy: an ingredient or tag the recipe
// needs and the collection does not have yet is created during the import, so
// the draft can reference it by id like any other. Ingredients and tags are a
// shared list any signed-in user may add to, and an unused one is deletable
// from the ingredients page - but it does mean a discarded import can leave a
// name behind.
//
// Off unless ANTHROPIC_API_KEY is set.
package importer

import (
	"context"
	"errors"
	"log"
	"os"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"recipe-book/database"
	"recipe-book/models"
	"recipe-book/recipeinput"
	"recipe-book/utils"
)

// defaultModel is the one this is written and prompted for. RECIPE_IMPORT_MODEL
// overrides it, so a cheaper model can be tried on real pages without a rebuild.
const defaultModel = "claude-opus-5"

// Limits the recipe fields are held to. They are the database's CHECK
// constraints, minus a little room for the source line appended to the
// description, so a long page cannot produce a draft that fails to save.
const (
	maxTitleRunes        = 200
	maxDescriptionRunes  = 800
	maxInstructionRunes  = 10000
	maxIngredientEntries = 60
	maxTagEntries        = 8
	maxNoteEntries       = 10
	maxNoteRunes         = 300
)

// Service imports recipes. Build one at startup; it holds the API client.
type Service struct {
	client anthropic.Client
	model  string
}

// Draft is an unsaved recipe, shaped exactly like a stored one so the recipe
// form can populate itself from it with no special case. Notes are the model's
// own flags about what it was unsure of.
type Draft struct {
	Recipe models.Recipe `json:"recipe"`
	// Every language the model wrote, which is what a save stores. Recipe above
	// is one of them, picked for display.
	Texts     map[string]models.RecipeText `json:"texts"`
	Notes     []string                     `json:"notes"`
	SourceURL string                       `json:"source_url"`
}

// New returns the import service and whether it should be offered at all.
// Without a key there is nothing to ask, and the endpoint stays unmounted
// rather than answering every request with the same failure.
func New() (*Service, bool) {
	if strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY")) == "" {
		return nil, false
	}

	model := strings.TrimSpace(os.Getenv("RECIPE_IMPORT_MODEL"))
	if model == "" {
		model = defaultModel
	}

	log.Printf("🥄 Recipe import from URL enabled, reading with %s", model)
	return &Service{client: anthropic.NewClient(option.WithMaxRetries(2)), model: model}, true
}

// Import reads the page at rawURL and returns a draft recipe.
//
// Errors split the way the handlers expect: IsInputError means the caller gave
// a URL that cannot work and the message can be shown as-is, anything else is
// ours and gets a generic 500.
func (s *Service) Import(ctx context.Context, rawURL, language string) (*Draft, error) {
	page, finalURL, err := fetchPage(ctx, rawURL)
	if err != nil {
		return nil, err
	}

	doc := extract(page)
	if utf8.RuneCountInString(doc.Text) < 200 {
		return nil, inputError("there is not enough text on that page to read a recipe from")
	}

	// Read before the model runs, so the prompt can show what the collection
	// already calls things; the same resolver then creates whatever is new.
	names, err := recipeinput.NewResolver(database.NormalizeLanguage(language))
	if err != nil {
		return nil, err
	}

	known := taxonomy{Ingredients: names.IngredientNames(), Tags: names.TagNames()}

	answer, err := s.readRecipe(ctx, doc, finalURL, known)
	if err != nil {
		return nil, err
	}

	// An answer can come back with the shape filled in and the substance
	// missing: is_recipe true and every other field empty, once with the title
	// "x". The cause was the schema's field order (see readRecipe) and is
	// fixed, but the guard stays - it is not the page's fault when it happens,
	// and telling someone their link is bad would send them off checking a URL
	// that was never wrong. One retry, not a loop: twice means something else.
	if answer.IsRecipe && looksEmpty(answer) {
		log.Printf("importer: %s returned an empty record for %s, asking again", s.model, finalURL)
		if second, retryErr := s.readRecipe(ctx, doc, finalURL, known); retryErr == nil {
			answer = second
		}
	}

	if !answer.IsRecipe {
		if problem := strings.TrimSpace(answer.Problem); problem != "" {
			return nil, inputError(problem)
		}
		return nil, inputError("that page does not appear to hold a recipe")
	}

	if looksEmpty(answer) {
		// Twice in a row is worth saying plainly, and worth saying that trying
		// again is the thing to do - the alternative wording blames the page,
		// which sends someone off checking a URL that was never the problem.
		return nil, inputError("the AI did not manage to read that page this time; please try again")
	}

	return s.draftFrom(answer, finalURL, language, names)
}

// draftFrom turns the model's answer into a draft. Everything here is a
// correction of something the schema cannot express: the schema can pin a unit
// to the allowed set, but not stop a title running to 400 characters or an
// ingredient name arriving with a colon in it, and either would be refused at
// the point of saving - long after the person had reviewed the draft.
func (s *Service) draftFrom(answer *aiRecipe, sourceURL, language string, names *recipeinput.Resolver) (*Draft, error) {
	notes := answer.Notes

	// Every language the model returned, held to the same limits. A language
	// whose title or method came back empty is dropped rather than stored
	// half-written; losing the English side of a recipe is recoverable with the
	// translate button, storing a blank one is not obviously wrong until
	// somebody opens it.
	texts := map[string]models.RecipeText{}
	for code, text := range answer.Texts {
		title := clean(text.Title, maxTitleRunes)
		instructions := truncateRunes(strings.TrimSpace(text.Instructions), maxInstructionRunes)
		if title == "" || instructions == "" {
			continue
		}
		texts[code] = models.RecipeText{
			Title:        title,
			Description:  clean(text.Description, maxDescriptionRunes),
			Instructions: instructions,
		}
	}
	if len(texts) == 0 {
		return nil, inputError("no recipe text could be read from that page")
	}

	// Ingredients. A name the validator would refuse is dropped rather than
	// allowed to fail the whole import, and said so in the notes - losing one
	// line off a recipe someone can still fix by hand beats losing the import.
	ingredients := make([]recipeinput.NamedIngredient, 0, len(answer.Ingredients))
	for _, item := range answer.Ingredients {
		if len(ingredients) == maxIngredientEntries {
			break
		}
		cleaned := sanitizeNames(item.Name.names(), ingredientRune, 100, utils.ValidateIngredientName)
		if len(cleaned) == 0 {
			notes = append(notes, "Ingredienci „"+clean(item.Name.Cs+" / "+item.Name.En, 60)+"“ se nepodařilo uložit, doplňte ji ručně.")
			continue
		}

		unit := strings.ToLower(strings.TrimSpace(item.Unit))
		if !utils.ValidateUnit(unit).Valid {
			unit = "piece"
		}
		quantity := item.Quantity
		if quantity <= 0 || quantity > 10000 {
			quantity = 1
		}

		ingredients = append(ingredients, recipeinput.NamedIngredient{Names: cleaned, Quantity: quantity, Unit: unit})
	}
	if len(ingredients) == 0 {
		return nil, inputError("no ingredients could be read from that page")
	}

	// Tags, deduplicated the same way the resolver matches them so a repeated
	// name does not become two chips on the same recipe.
	tags := make([]recipeinput.NamedTag, 0, maxTagEntries)
	seen := map[string]bool{}
	for _, raw := range answer.Tags {
		if len(tags) == maxTagEntries {
			break
		}
		cleaned := sanitizeNames(raw.names(), tagRune, 50, utils.ValidateTagName)
		if len(cleaned) == 0 {
			continue
		}
		key := strings.ToLower(cleaned["en"] + "|" + cleaned["cs"])
		if seen[key] {
			continue
		}
		seen[key] = true
		tags = append(tags, recipeinput.NamedTag{Names: cleaned})
	}

	// 0 is how the model reports that the page never said. The column will not
	// hold it, so a number has to go in - but it goes in declared, or the
	// default would smuggle back exactly the invented figure the prompt spends
	// a paragraph forbidding.
	servings := answer.Servings
	if servings <= 0 {
		servings = 4
		notes = append(notes, "Počet porcí stránka neuvádí, doplnili jsme 4 – upravte podle množství surovin.")
	}

	servingUnit := strings.ToLower(strings.TrimSpace(answer.ServingUnit))
	if !utils.ValidateServingUnit(servingUnit).Valid {
		servingUnit = "people"
	}

	// Creating whatever is new. This is the only write the import makes.
	resolvedIngredients, err := recipeinput.ResolveIngredients(names, ingredients)
	if err != nil {
		return nil, err
	}
	tagIDs, err := recipeinput.ResolveTags(names, tags)
	if err != nil {
		return nil, err
	}

	// The draft is shown in one language; the rest travels alongside in Texts
	// and is what actually gets saved.
	shown := texts[database.NormalizeLanguage(language)]
	if shown.Title == "" {
		for _, code := range sortedKeys(texts) {
			shown = texts[code]
			language = code
			break
		}
	}

	recipe := models.Recipe{
		Title:        shown.Title,
		Description:  shown.Description,
		Instructions: shown.Instructions,
		Language:     database.NormalizeLanguage(language),
		Languages:    sortedKeys(texts),
		PrepTime:     clamp(answer.PrepTime, 0, 1440),
		CookTime:     clamp(answer.CookTime, 0, 1440),
		Servings:     clamp(servings, 1, 100),
		ServingUnit:  servingUnit,
		SourceURL:    sourceURL,
		Ingredients:  make([]models.RecipeIngredient, 0, len(resolvedIngredients)),
		Images:       []models.RecipeImage{},
		Tags:         make([]models.Tag, 0, len(tagIDs)),
	}
	// The ids are back; hang the stored names and tag colours off them so the
	// form can render the draft without a second round trip.
	for index, resolved := range resolvedIngredients {
		recipe.Ingredients = append(recipe.Ingredients, models.RecipeIngredient{
			IngredientID: resolved.IngredientID,
			Name:         displayName(ingredients[index].Names, language),
			Quantity:     resolved.Quantity,
			Unit:         resolved.Unit,
		})
	}
	if storedTags, err := database.GetAllTags(language); err == nil {
		byID := make(map[int]models.Tag, len(storedTags))
		for _, tag := range storedTags {
			byID[tag.ID] = tag
		}
		for _, id := range tagIDs {
			if tag, ok := byID[id]; ok {
				recipe.Tags = append(recipe.Tags, tag)
			}
		}
	}

	return &Draft{Recipe: recipe, Texts: texts, Notes: cleanNotes(notes), SourceURL: sourceURL}, nil
}

// ----------------------------------------------------------------- errors ---

// inputErr marks a failure the person who asked can do something about: a URL
// that is not reachable, a page that holds no recipe. Its message is written to
// be shown to them, so it says what happened without naming internals.
type inputErr string

func (e inputErr) Error() string { return string(e) }

func inputError(message string) error { return inputErr(message) }

func isInputError(err error) bool {
	var target inputErr
	return errors.As(err, &target)
}

// IsInputError reports whether err should be answered with a 400 carrying its
// message, rather than a 500.
func IsInputError(err error) bool { return isInputError(err) }

// ---------------------------------------------------------------- helpers ---

// sanitizeName strips whatever the name validator would refuse instead of
// refusing the name. Models write "Sůl / pepř" or "Mouka: hladká" often enough
// that dropping those lines outright would be felt. Anything unicode calls a
// space becomes a plain one: the validators' \s is the ASCII set, so a
// non-breaking space would otherwise survive this and fail there.
func sanitizeName(name string, allowed func(rune) bool, limit int) string {
	var out strings.Builder
	for _, r := range name {
		switch {
		case unicode.IsSpace(r):
			out.WriteRune(' ')
		case allowed(r):
			out.WriteRune(r)
		default:
			out.WriteRune(' ')
		}
	}
	return clean(out.String(), limit)
}

// ingredientRune and tagRune mirror utils.IngredientNameRegex and
// utils.TagNameRegex character for character; the two validators accept
// different punctuation.
func ingredientRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsNumber(r) || strings.ContainsRune("-'.,()", r)
}

func tagRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsNumber(r) || strings.ContainsRune("-&", r)
}

func clean(text string, limit int) string {
	return truncateRunes(strings.Join(strings.Fields(text), " "), limit)
}

func cleanNotes(notes []string) []string {
	cleaned := make([]string, 0, len(notes))
	for _, note := range notes {
		if len(cleaned) == maxNoteEntries {
			break
		}
		if trimmed := clean(note, maxNoteRunes); trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	return cleaned
}

// looksEmpty reports an answer that parsed but says nothing - the failure mode
// a retry fixes, as distinct from a page that genuinely holds no recipe.
func looksEmpty(answer *aiRecipe) bool {
	if len(answer.Ingredients) == 0 || len(answer.Texts) == 0 {
		return true
	}
	// Every language has to have arrived with something in it: half an answer
	// is the same failure as none, and retrying is cheaper than storing a
	// recipe whose English side is blank.
	for _, text := range answer.Texts {
		if strings.TrimSpace(text.Title) == "" || strings.TrimSpace(text.Instructions) == "" {
			return true
		}
	}
	return false
}

// sanitizeNames cleans every language of a name, keeping only the ones that
// survive the validator. A name that is unusable in one language but fine in
// another is kept - half a name beats none - and only an entry with nothing
// left is dropped by the caller.
func sanitizeNames(names map[string]string, allowed func(rune) bool, limit int,
	validate func(string) utils.ValidationResult) map[string]string {

	cleaned := map[string]string{}
	for language, raw := range names {
		name := sanitizeName(raw, allowed, limit)
		if name != "" && validate(name).Valid {
			cleaned[database.NormalizeLanguage(language)] = name
		}
	}
	return cleaned
}

// displayName picks the name to show beside a quantity in the draft.
func displayName(names map[string]string, language string) string {
	if name := names[database.NormalizeLanguage(language)]; name != "" {
		return name
	}
	for _, code := range sortedKeys(names) {
		return names[code]
	}
	return ""
}

func sortedKeys[T any](m map[string]T) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

func clamp(value, low, high int) int {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}
