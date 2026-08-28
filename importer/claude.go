package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"

	"recipe-book/recipeinput"
	"recipe-book/utils"
)

// How many of the collection's existing names are shown to the model. Enough
// for a household collection to be listed whole; a cap so that a very large one
// cannot quietly turn every import into a long prompt.
const maxTaxonomyNames = 400

// aiRecipe is what the model is asked to produce. It mirrors the recipe form
// field for field, plus three of its own: is_recipe and problem let the model
// say "this page is a news article" as a normal answer rather than by failing,
// and notes carries whatever a cook should double-check.
type aiRecipe struct {
	IsRecipe     bool                          `json:"is_recipe"`
	Problem      string                        `json:"problem"`
	Title        string                        `json:"title"`
	Description  string                        `json:"description"`
	Instructions string                        `json:"instructions"`
	PrepTime     int                           `json:"prep_time"`
	CookTime     int                           `json:"cook_time"`
	Servings     int                           `json:"servings"`
	ServingUnit  string                        `json:"serving_unit"`
	Ingredients  []recipeinput.NamedIngredient `json:"ingredients"`
	Tags         []string                      `json:"tags"`
	Notes        []string                      `json:"notes"`
}

// readRecipe asks the model to turn a page into a recipe record.
//
// The answer is constrained by a JSON schema rather than by asking for JSON in
// the prompt, so units arrive from the enum the validator accepts and there is
// no "almost JSON" to repair. It is still normalised afterwards - a schema
// constrains the shape, not the sense.
func (s *Service) readRecipe(ctx context.Context, doc document, sourceURL string, known taxonomy) (*aiRecipe, error) {
	// The beta endpoint, for one reason: its schema field takes raw JSON, and
	// the GA one takes a map[string]any. Go marshals a map with its keys sorted,
	// which would put "cook_time" and "description" ahead of "title" - and a
	// model filling a schema writes the fields in the order the schema lists
	// them. Made to describe a dish before naming it, and to write the method
	// before deciding the page even holds a recipe, it visibly loses the thread:
	// the answers came back shaped correctly and empty, one of them with the
	// title "x". The order below is the order a person fills the form in.
	message, err := s.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     anthropic.Model(s.model),
		MaxTokens: 16000,
		System:    []anthropic.BetaTextBlockParam{{Text: systemPrompt(known)}},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Format: anthropic.BetaJSONOutputFormatParam{Schema: recipeSchema()},
		},
		Messages: []anthropic.BetaMessageParam{
			anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(userPrompt(doc, sourceURL))),
		},
	})
	if err != nil {
		log.Printf("importer: %s refused the request: %v", s.model, err)
		return nil, fmt.Errorf("the AI service could not be reached")
	}

	if message.StopReason == anthropic.BetaStopReasonRefusal {
		return nil, inputError("the AI declined to read that page")
	}

	var answer strings.Builder
	for _, block := range message.Content {
		if text, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			answer.WriteString(text.Text)
		}
	}
	if answer.Len() == 0 {
		return nil, fmt.Errorf("the AI answered with nothing")
	}

	if os.Getenv("IMPORT_DEBUG") != "" {
		log.Printf("importer DEBUG raw answer:\n%s", answer.String())
	}

	var recipe aiRecipe
	if err := json.Unmarshal([]byte(answer.String()), &recipe); err != nil {
		log.Printf("importer: could not read the model's answer: %v", err)
		return nil, fmt.Errorf("the AI answered in an unexpected shape")
	}

	log.Printf("importer: read %q from %s (structured=%t, in=%d out=%d tokens)",
		recipe.Title, sourceURL, doc.Structured,
		message.Usage.InputTokens, message.Usage.OutputTokens)

	return &recipe, nil
}

// taxonomy is what the collection already calls things.
type taxonomy struct {
	Ingredients []string
	Tags        []string
}

func systemPrompt(known taxonomy) string {
	var prompt strings.Builder

	prompt.WriteString(`You turn a recipe web page into a structured record for one household's recipe collection. The collection is in Czech.

NEVER INVENT
This is the rule that outranks the rest. You are transcribing a page, not writing a recipe. An ingredient the page does not name, a quantity it does not give, a step it does not describe, a time it does not state - none of these are yours to supply. A gap is information: leave it visible and say so in notes. The person reading your answer can fill in a blank, but they cannot spot a plausible invention, and a wrong number that looks confident is worse to them than an obvious hole.

Where the schema forces a value on you, choose the one that reads as "the page did not say": 0 for a time or a serving count, unit "to taste" for an amount. Do not split the difference and do not reach for what a recipe like this usually uses.

LANGUAGE
Everything you write is Czech: the title, the description, the steps, the ingredient names, the tags, the notes. Write the way a Czech cookbook is written, not word for word from the source - "simmer until reduced by half" is "vařte, dokud se objem nezmenší na polovinu".

UNITS
Convert what converts exactly, and leave the rest alone.
- Ounces and pounds become grams: 1 oz = 28 g, 1 lb = 454 g.
- Fluid ounces, pints, quarts and gallons become millilitres or litres: 1 fl oz = 30 ml, 1 pint = 470 ml, 1 quart = 950 ml.
- Fahrenheit becomes Celsius everywhere it appears, including inside the steps. Round to the nearest 5: 350 °F is 175 °C.
- Inches become centimetres.
- Round every converted number to what a cook would actually write: 454 g of butter is 450 g, 28 g of cheese is 30 g, 237 ml of milk is 240 ml.

Do NOT turn a cup, a tablespoon or a teaspoon of a dry or solid ingredient into grams. A cup of flour and a cup of sugar do not weigh the same, and a guess produces a recipe that does not work. Keep those as cup, tbsp or tsp - the collection supports all three. The one exception is a plain liquid measured in cups (water, milk, stock, oil), where 1 cup = 240 ml is exact and worth converting.

INGREDIENTS
One entry per ingredient, and the name is the ingredient alone. "2 cloves garlic, finely minced" is name "Česnek", quantity 2, unit "clove" - how it is cut belongs in the steps. Names are singular and capitalised: "Máslo", "Červená cibule", "Hladká mouka". A vague amount still gets a number: "a pinch of salt" is quantity 1 unit "pinch"; "salt to taste" is quantity 1 unit "to taste"; "1 can of tomatoes" is quantity 1 unit "can".

Read the ingredient list against the method before you answer. A page's own list is sometimes incomplete - a carbonara whose steps beat eggs into the sauce but whose list names no eggs is a real thing sites publish. Those eggs are on the page, just in the wrong part of it, so put them in the list and say in notes that you moved them there. That is reading the whole page, not inventing.

The amount is a different matter. Unless the steps state it, you do not know it: give the ingredient quantity 1 and unit "to taste", and say in the note that the page gives no amount. Do not write the number a carbonara usually takes. Where the page offers a range - "4 to 6 yolks" - take the lower end and put the range in a note rather than picking a middle. Work the other way too: an ingredient listed but never used is worth a note, not a deletion.

Two things are never ingredients, however loudly the method calls for them: water for boiling, and the salt that seasons that water. Nobody shops for either. Leave them out, and do not write a note about leaving them out. Water that is part of the dish itself - in a dough, a syrup, a sauce, the splash of pasta water that makes carbonara creamy - does belong in the list.

REPAIRING THE SOURCE
The text you are given is sometimes damaged - commas and decimal points dropped by whatever generated it, so "3,5 litru vody, přidejte" arrives as "3 5 litru vody přidejte". Write correct Czech and put the punctuation back; read "3 5 litru" as 3,5 litru rather than copying the mangling forward. Where damage leaves a quantity genuinely ambiguous, choose the reading a cook would and flag it in notes.

TAGS
Two to five, describing the dish: course, cuisine, diet, occasion. Capitalised Czech nouns - "Hlavní jídlo", "Dezert", "Vegetariánské".

STEPS
Write the method as numbered steps, each beginning "1. ", "2. " and so on at the start of its own line. Keep every step the page gives - do not compress a twelve-step method into four. Do not repeat the ingredient list as a step.

TIMES AND YIELD
prep_time and cook_time are whole minutes, as the page states them. If it gives only a total, put it in cook_time and note that it is the total. **If the page states no time at all, write 0** - a blank the cook fills in beats a number nobody measured. The same for servings: the count the page gives, or 0 when it gives none. Do not estimate either from reading the method.

DESCRIPTION
Built from what the page itself says about the dish. If it says nothing, write one plain sentence naming what the dish is from its own ingredients and method - and nothing about tradition, origin, region or how good it tastes, unless the page said so. "Tradiční římská" is a claim; make it only where the page made it.

WHEN THE PAGE IS NOT A RECIPE
Set is_recipe to false and write one Czech sentence in problem saying what the page actually is. Leave the other fields empty. Never invent a recipe that the page does not contain.

NOTES
notes is for what a cook should check by hand: a conversion you were unsure of, an ingredient the page named vaguely, a step that assumed knowledge the page never gave. One short Czech sentence each, and an empty list when there is genuinely nothing to flag.
`)

	// The names the collection already uses. Matching happens again after the
	// answer comes back, but only for spellings that are already identical -
	// showing the model the list is what stops "Maslo" being created alongside
	// "Máslo" in the first place.
	if names := capNames(known.Ingredients); len(names) > 0 {
		prompt.WriteString("\nEXISTING INGREDIENTS\nThe collection already stores these. When one of them is the thing you mean, use that exact spelling; otherwise write the new name in the same style.\n")
		prompt.WriteString(strings.Join(names, ", "))
		prompt.WriteString("\n")
	}
	if names := capNames(known.Tags); len(names) > 0 {
		prompt.WriteString("\nEXISTING TAGS\nPrefer these over inventing a near-duplicate.\n")
		prompt.WriteString(strings.Join(names, ", "))
		prompt.WriteString("\n")
	}

	return prompt.String()
}

func userPrompt(doc document, sourceURL string) string {
	var prompt strings.Builder
	prompt.WriteString("Source URL: " + sourceURL + "\n\n")

	if doc.Structured {
		prompt.WriteString("The page publishes schema.org Recipe data. Here it is, as the site wrote it - the labels and the times come from the page itself, so trust them over your own reading:\n\n")
	} else {
		prompt.WriteString("The page has no structured recipe data, so here is its text with the markup stripped. Navigation, comments and cross-promotion may still be mixed in; take only the recipe:\n\n")
	}

	prompt.WriteString(doc.Text)
	return prompt.String()
}

// recipeSchema is raw JSON rather than a Go map, and its field order is load
// bearing - see the note in readRecipe. It is written out rather than generated
// from the struct because the descriptions are what the model reads to decide
// what belongs in each field, and the unit enums come straight from the
// validator, so a value that satisfies the schema is a value the database will
// accept.
func recipeSchema() json.RawMessage {
	units, _ := json.Marshal(utils.AllowedUnits)
	servingUnits, _ := json.Marshal(utils.AllowedServingUnits)

	// Ranges are stated in the descriptions rather than as minimum/maximum:
	// structured outputs reject those keywords on numeric types. draftFrom
	// enforces them regardless of what the schema managed to express.
	return json.RawMessage(fmt.Sprintf(`{
	  "type": "object",
	  "properties": {
	    "is_recipe":    {"type": "boolean", "description": "Whether this page holds a recipe at all. Decide this first."},
	    "problem":      {"type": "string", "description": "When is_recipe is false, one Czech sentence saying what the page is instead. Empty otherwise."},
	    "title":        {"type": "string", "description": "The dish's name in Czech, 1-200 characters."},
	    "description":  {"type": "string", "description": "One or two Czech sentences about the dish, up to 800 characters."},
	    "servings":     {"type": "integer", "description": "How many the quantities are for, as the page states it, between 1 and 100. Write 0 when the page does not say - never an estimate."},
	    "serving_unit": {"type": "string", "enum": %s, "description": "What is being served. 'people' unless the recipe counts something else."},
	    "prep_time":    {"type": "integer", "description": "Preparation time in whole minutes as the page states it, up to 1440. Write 0 when the page does not say - never an estimate."},
	    "cook_time":    {"type": "integer", "description": "Cooking time in whole minutes as the page states it, up to 1440. Write 0 when the page does not say - never an estimate."},
	    "ingredients": {
	      "type": "array",
	      "description": "Every ingredient the recipe needs, in the order the page lists them.",
	      "items": {
	        "type": "object",
	        "properties": {
	          "name":     {"type": "string", "description": "The ingredient in Czech, singular and capitalised, without the quantity or how it is cut."},
	          "quantity": {"type": "number", "description": "How much, as the page states it, greater than 0 and at most 10000. When the page gives no amount, write 1 and set unit to \"to taste\"."},
	          "unit":     {"type": "string", "enum": %s, "description": "The unit the quantity is in."}
	        },
	        "required": ["name", "quantity", "unit"],
	        "additionalProperties": false
	      }
	    },
	    "instructions": {"type": "string", "description": "The method in Czech as numbered steps, each starting '1. ', '2. ' at the beginning of its own line."},
	    "tags":         {"type": "array", "description": "Two to five Czech categories for the dish.", "items": {"type": "string"}},
	    "notes":        {"type": "array", "description": "Czech sentences naming every gap you left and every inference you made: an amount the page never gave, a time it never stated, an ingredient you moved out of the method. Empty only when the page really did say everything.", "items": {"type": "string"}}
	  },
	  "required": ["is_recipe", "problem", "title", "description", "servings", "serving_unit", "prep_time", "cook_time", "ingredients", "instructions", "tags", "notes"],
	  "additionalProperties": false
	}`, servingUnits, units))
}

func capNames(names []string) []string {
	if len(names) > maxTaxonomyNames {
		return names[:maxTaxonomyNames]
	}
	return names
}
