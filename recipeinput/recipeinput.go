// Package recipeinput turns the loosely-typed recipe data an AI produces into
// the ids the database wants.
//
// A model reading a web page has names, not ids: "olive oil", not ingredient
// 14. Every AI entry point therefore needs the same step - match a name against
// what already exists, case- and whitespace-insensitively, and create whatever
// is missing. This lived inside package mcp until the import-from-URL endpoint
// needed exactly the same thing.
//
// Ingredients and tags are a shared taxonomy any signed-in user may add to, so
// creating one here is not a privilege escalation; the recipe itself is still
// written by database.CreateRecipeTx under the acting user's id.
package recipeinput

import (
	"fmt"
	"slices"
	"strings"

	"recipe-book/database"
)

// Colours new tags cycle through, matching the palette the app seeds with, so a
// tag created from here does not stand out as the one grey chip.
var tagPalette = []string{
	"#ff6b6b", "#ff8e53", "#fab005", "#ffd93d",
	"#69db7c", "#4ecdc4", "#a8e6cf", "#74c0fc",
	"#9775fa", "#f06292", "#ff5722", "#9aa1ae",
}

// NamedIngredient is one line of a recipe as an AI writes it: the ingredient by
// name in as many languages as the writer could supply, with how much of it.
//
// Names is keyed by language code and English is the one that matters - it
// becomes the canonical stored on the ingredient row - but any of them will
// find an ingredient that already exists, which is what stops a Czech import
// creating a second "Máslo" beside the stored "Butter".
type NamedIngredient struct {
	Names    map[string]string `json:"names"`
	Quantity float64           `json:"quantity"`
	Unit     string            `json:"unit"`
}

// NamedTag is a tag under the same rules.
type NamedTag struct {
	Names map[string]string `json:"names"`
}

// canonical picks the name to store on the row itself: English when it was
// given, otherwise whatever there is, so a missing translation costs a less
// tidy canonical rather than a lost ingredient.
func canonical(names map[string]string) string {
	if name := strings.TrimSpace(names[database.DefaultLanguage]); name != "" {
		return name
	}
	for _, language := range sortedLanguages(names) {
		if name := strings.TrimSpace(names[language]); name != "" {
			return name
		}
	}
	return ""
}

func sortedLanguages(names map[string]string) []string {
	languages := make([]string, 0, len(names))
	for language := range names {
		languages = append(languages, language)
	}
	slices.Sort(languages)
	return languages
}

// Resolver maps names to ids, creating whatever is missing. Build one per
// request: it caches the taxonomy as it was read, which is what keeps two
// mentions of the same new ingredient in one recipe from creating it twice.
type Resolver struct {
	// Keyed on the normalised form of every name an ingredient or tag is known
	// by, in every language, so a lookup succeeds whichever one the model used.
	ingredients map[string]int
	tags        map[string]int
	tagCount    int

	// The taxonomy as it is spelled in the language being worked in, for the
	// prompt. The maps above are keyed on the normalised form, which is not
	// what a model should be shown.
	ingredientNames []string
	tagNames        []string
}

func normalizeName(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(name), " "))
}

// NewResolver builds the index. language decides only what the prompt is shown;
// matching happens against every language the collection knows, because a model
// writing Czech and a collection storing English canonicals would otherwise
// never meet.
func NewResolver(language string) (*Resolver, error) {
	r := &Resolver{ingredients: map[string]int{}, tags: map[string]int{}}

	allIngredients, err := database.AllIngredientNames()
	if err != nil {
		return nil, err
	}
	for id, names := range allIngredients {
		for _, name := range names {
			r.ingredients[normalizeName(name)] = id
		}
	}

	allTags, err := database.AllTagNames()
	if err != nil {
		return nil, err
	}
	for id, names := range allTags {
		for _, name := range names {
			r.tags[normalizeName(name)] = id
		}
	}
	r.tagCount = len(allTags)

	// What the prompt sees: the names as they read in the language being
	// worked in, which is what the model should reuse.
	displayIngredients, err := database.GetAllIngredients(language)
	if err != nil {
		return nil, err
	}
	for _, ingredient := range displayIngredients {
		r.ingredientNames = append(r.ingredientNames, ingredient.Name)
	}
	slices.Sort(r.ingredientNames)

	displayTags, err := database.GetAllTags(language)
	if err != nil {
		return nil, err
	}
	for _, tag := range displayTags {
		r.tagNames = append(r.tagNames, tag.Name)
	}
	slices.Sort(r.tagNames)

	return r, nil
}

// IngredientNames lists the taxonomy as it stands. The importer puts it in the
// prompt so the model reuses "Máslo" instead of inventing "Maslo" - matching
// after the fact only catches spellings that are already identical.
func (r *Resolver) IngredientNames() []string { return r.ingredientNames }

// TagNames is the same, for tags.
func (r *Resolver) TagNames() []string { return r.tagNames }

// IngredientID finds or creates an ingredient from the names given for it.
//
// A hit on any language wins, and the names that were not the hit are recorded
// as translations - so importing a Czech recipe teaches the collection what its
// English "Butter" is called in Czech, once, as a side effect of using it.
func (r *Resolver) IngredientID(names map[string]string) (int, error) {
	name := canonical(names)
	if name == "" {
		return 0, fmt.Errorf("ingredient name is empty")
	}

	for _, language := range sortedLanguages(names) {
		if id, ok := r.ingredients[normalizeName(names[language])]; ok {
			r.rememberIngredient(id, names)
			return id, nil
		}
	}

	created, err := database.CreateIngredientSecure(name)
	if err != nil {
		return 0, fmt.Errorf("could not add ingredient %q: %w", name, err)
	}
	r.rememberIngredient(created.ID, names)
	return created.ID, nil
}

func (r *Resolver) rememberIngredient(id int, names map[string]string) {
	for _, language := range sortedLanguages(names) {
		name := strings.TrimSpace(names[language])
		if name == "" {
			continue
		}
		r.ingredients[normalizeName(name)] = id
		if language != database.DefaultLanguage {
			_ = database.SetIngredientTranslation(id, language, name)
		}
	}
}

func (r *Resolver) TagID(names map[string]string) (int, error) {
	name := canonical(names)
	if name == "" {
		return 0, fmt.Errorf("tag name is empty")
	}

	for _, language := range sortedLanguages(names) {
		if id, ok := r.tags[normalizeName(names[language])]; ok {
			r.rememberTag(id, names)
			return id, nil
		}
	}

	colour := tagPalette[r.tagCount%len(tagPalette)]
	created, err := database.CreateTagSecure(name, colour)
	if err != nil {
		return 0, fmt.Errorf("could not add tag %q: %w", name, err)
	}
	r.tagCount++
	r.rememberTag(created.ID, names)
	return created.ID, nil
}

func (r *Resolver) rememberTag(id int, names map[string]string) {
	for _, language := range sortedLanguages(names) {
		name := strings.TrimSpace(names[language])
		if name == "" {
			continue
		}
		r.tags[normalizeName(name)] = id
		if language != database.DefaultLanguage {
			_ = database.SetTagTranslation(id, language, name)
		}
	}
}

// ResolveIngredients turns named lines into the rows a recipe write takes. A
// missing unit or a non-positive quantity is filled in rather than refused: the
// page said "a pinch of salt" and losing the line entirely is the worse answer.
func ResolveIngredients(names *Resolver, given []NamedIngredient) ([]database.RecipeIngredientInput, error) {
	resolved := make([]database.RecipeIngredientInput, 0, len(given))
	for _, item := range given {
		id, err := names.IngredientID(item.Names)
		if err != nil {
			return nil, err
		}
		unit := strings.TrimSpace(item.Unit)
		if unit == "" {
			unit = "piece"
		}
		quantity := item.Quantity
		if quantity <= 0 {
			quantity = 1
		}
		resolved = append(resolved, database.RecipeIngredientInput{
			IngredientID: id,
			Quantity:     quantity,
			Unit:         unit,
		})
	}
	return resolved, nil
}

func ResolveTags(names *Resolver, given []NamedTag) ([]int, error) {
	resolved := make([]int, 0, len(given))
	for _, tag := range given {
		if canonical(tag.Names) == "" {
			continue
		}
		id, err := names.TagID(tag.Names)
		if err != nil {
			return nil, err
		}
		resolved = append(resolved, id)
	}
	return resolved, nil
}

// PlainNames wraps a bare name as an English one, for callers that only have a
// single language to offer - the MCP tools, which predate translations.
func PlainNames(name string) map[string]string {
	return map[string]string{database.DefaultLanguage: name}
}

// WithSource records where a recipe came from. There is no column for it, and
// the description is the one field a reader will actually see it in. Skipped
// when it would push the description past what the validator accepts.
func WithSource(description, sourceURL string) string {
	sourceURL = strings.TrimSpace(sourceURL)
	if sourceURL == "" || strings.Contains(description, sourceURL) {
		return description
	}

	suffix := "Source: " + sourceURL
	if description != "" {
		suffix = "\n\n" + suffix
	}
	if len(description)+len(suffix) > 1000 {
		return description
	}
	return description + suffix
}
