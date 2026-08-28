package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"

	"recipe-book/models"
)

// LanguageNames is what each supported code is called, for the prompts. The set
// is deliberately small: these are the languages the UI itself speaks, and a
// recipe in a language nothing can display is not worth the tokens.
var LanguageNames = map[string]string{
	"cs": "Czech",
	"en": "English",
}

// SupportedLanguages lists the codes a recipe may be stored in.
func SupportedLanguages() []string { return []string{"cs", "en"} }

// TranslateRecipe writes one more language of a recipe that already exists.
//
// It is given every version already stored, not just one, because they are the
// best statement of what the recipe means: where two of them differ the model
// can see it, and where a quantity was already settled it does not get a second
// chance to read it differently.
func (s *Service) TranslateRecipe(ctx context.Context, texts map[string]models.RecipeText, target string) (models.RecipeText, error) {
	name, known := LanguageNames[target]
	if !known {
		return models.RecipeText{}, inputError("that language is not one this collection speaks")
	}
	if len(texts) == 0 {
		return models.RecipeText{}, inputError("there is nothing to translate")
	}

	var source strings.Builder
	for _, code := range sortedKeys(texts) {
		text := texts[code]
		source.WriteString(fmt.Sprintf("=== %s ===\nTITLE: %s\nDESCRIPTION: %s\nMETHOD:\n%s\n\n",
			strings.ToUpper(LanguageNames[code]), text.Title, text.Description, text.Instructions))
	}

	system := fmt.Sprintf(`You translate a stored recipe into %s for a household recipe collection.

You are given the recipe as it is already held, in one or more languages. Translate it, do not rewrite it: the same dish, the same quantities, the same number of steps, in the same order. Every number stays exactly as it is - this recipe has already been checked by a person and a quantity that changes in translation is a bug, not an improvement.

Write %s as %s cookbooks write it, not word for word from the source. Keep the numbered step format: each step begins "1. ", "2. " and so on at the start of its own line.

If the versions you are given disagree about something, follow the one that reads as the original and leave the disagreement alone - do not invent a third answer.`, name, name, name)

	message, err := s.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     anthropic.Model(s.model),
		MaxTokens: 16000,
		System:    []anthropic.BetaTextBlockParam{{Text: system}},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Format: anthropic.BetaJSONOutputFormatParam{Schema: translationSchema(name)},
		},
		Messages: []anthropic.BetaMessageParam{
			anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(source.String())),
		},
	})
	if err != nil {
		log.Printf("importer: translation to %s failed: %v", target, err)
		return models.RecipeText{}, fmt.Errorf("the AI service could not be reached")
	}
	if message.StopReason == anthropic.BetaStopReasonRefusal {
		return models.RecipeText{}, inputError("the AI declined to translate that recipe")
	}

	var answer models.RecipeText
	if err := json.Unmarshal([]byte(betaText(message)), &answer); err != nil {
		return models.RecipeText{}, fmt.Errorf("the AI answered in an unexpected shape")
	}

	answer.Title = clean(answer.Title, maxTitleRunes)
	answer.Description = clean(answer.Description, maxDescriptionRunes)
	answer.Instructions = truncateRunes(strings.TrimSpace(answer.Instructions), maxInstructionRunes)
	if answer.Title == "" || answer.Instructions == "" {
		return models.RecipeText{}, inputError("the AI did not manage to translate that recipe this time; please try again")
	}

	log.Printf("importer: translated %q into %s (in=%d out=%d tokens)",
		answer.Title, target, message.Usage.InputTokens, message.Usage.OutputTokens)
	return answer, nil
}

func translationSchema(languageName string) json.RawMessage {
	return json.RawMessage(fmt.Sprintf(`{
	  "type": "object",
	  "properties": {
	    "title":        {"type": "string", "description": "The dish's name in %s, 1-200 characters."},
	    "description":  {"type": "string", "description": "The description in %s, up to 800 characters. Empty if the source has none."},
	    "instructions": {"type": "string", "description": "The method in %s as numbered steps, matching the source step for step."}
	  },
	  "required": ["title", "description", "instructions"],
	  "additionalProperties": false
	}`, languageName, languageName, languageName))
}

// TranslateNames fills in what ingredients or tags are called in one more
// language. Everything goes in one call: these are two-word names, and asking
// per name would cost a request each for no gain in quality.
func (s *Service) TranslateNames(ctx context.Context, names map[int]string, target, kind string) (map[int]string, error) {
	languageName, known := LanguageNames[target]
	if !known {
		return nil, inputError("that language is not one this collection speaks")
	}
	if len(names) == 0 {
		return map[int]string{}, nil
	}

	ids := make([]int, 0, len(names))
	for id := range names {
		ids = append(ids, id)
	}
	// Sorted so the prompt is stable between runs, which keeps the cache warm
	// and makes a bad answer reproducible.
	slicesSortInts(ids)

	var list strings.Builder
	for _, id := range ids {
		list.WriteString(fmt.Sprintf("%d\t%s\n", id, names[id]))
	}

	system := fmt.Sprintf(`You are given a list of cooking %s names, one per line as "id<TAB>name", and you return each one's ordinary %s name.

Return the name a %s cook would actually use, not a transliteration: "Butter" is "Máslo", not "Butter". Keep them singular and capitalised. Where a name is already %s, return it unchanged.

Every id you were given must appear in your answer exactly once, and no id you were not given may appear.`, kind, languageName, languageName, languageName)

	message, err := s.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     anthropic.Model(s.model),
		MaxTokens: 8000,
		System:    []anthropic.BetaTextBlockParam{{Text: system}},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Format: anthropic.BetaJSONOutputFormatParam{Schema: json.RawMessage(`{
			  "type": "object",
			  "properties": {
			    "names": {
			      "type": "array",
			      "items": {
			        "type": "object",
			        "properties": {
			          "id":   {"type": "integer", "description": "The id exactly as it was given."},
			          "name": {"type": "string", "description": "The translated name."}
			        },
			        "required": ["id", "name"],
			        "additionalProperties": false
			      }
			    }
			  },
			  "required": ["names"],
			  "additionalProperties": false
			}`)},
		},
		Messages: []anthropic.BetaMessageParam{
			anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(list.String())),
		},
	})
	if err != nil {
		log.Printf("importer: name translation to %s failed: %v", target, err)
		return nil, fmt.Errorf("the AI service could not be reached")
	}

	var answer struct {
		Names []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"names"`
	}
	if err := json.Unmarshal([]byte(betaText(message)), &answer); err != nil {
		return nil, fmt.Errorf("the AI answered in an unexpected shape")
	}

	// Only ids that were actually asked about are kept: a model that invents an
	// id would otherwise have its answer written against a real ingredient.
	translated := map[int]string{}
	for _, entry := range answer.Names {
		if _, asked := names[entry.ID]; !asked {
			continue
		}
		if name := clean(entry.Name, 100); name != "" {
			translated[entry.ID] = name
		}
	}

	log.Printf("importer: translated %d of %d %s names into %s", len(translated), len(names), kind, target)
	return translated, nil
}

func betaText(message *anthropic.BetaMessage) string {
	var out strings.Builder
	for _, block := range message.Content {
		if text, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			out.WriteString(text.Text)
		}
	}
	return out.String()
}

func slicesSortInts(values []int) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

// EnglishCanonicals picks the names that are not English out of a list, and
// says what each should be.
//
// Distinct from TranslateNames, which translates everything it is given: here
// most of the list is already correct and must come back untouched. A model
// asked to "translate" a list of English words will improve them - "Tomato"
// becomes "Tomatoes", "Pasta" becomes "Noodles" - and every one of those is a
// rename of a real ingredient. So the answer carries only what needed changing,
// and anything it returns unchanged is dropped here as well.
func (s *Service) EnglishCanonicals(ctx context.Context, names map[int]string, kind string) (map[int]string, error) {
	if len(names) == 0 {
		return map[int]string{}, nil
	}

	ids := make([]int, 0, len(names))
	for id := range names {
		ids = append(ids, id)
	}
	slicesSortInts(ids)

	var list strings.Builder
	for _, id := range ids {
		list.WriteString(fmt.Sprintf("%d\t%s\n", id, names[id]))
	}

	system := fmt.Sprintf(`You are given a list of cooking %s names, one per line as "id<TAB>name". Some are English and some are not.

Return an entry ONLY for the names that are not English, giving each one's ordinary English name. A name that is already English must not appear in your answer at all - not even unchanged. Do not tidy, pluralise or improve an English name: "Tomato" and "Pasta" are English and are none of your business.

Be careful with words that look English but are not. "Olej" is Czech for "Oil". "Maso" is Czech for "Meat". Judge the language of the word, not whether it is spelled with accents - plenty of Czech words have none.

Give the ordinary English name a cook would use, singular and capitalised.`, kind)

	message, err := s.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     anthropic.Model(s.model),
		MaxTokens: 8000,
		System:    []anthropic.BetaTextBlockParam{{Text: system}},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Format: anthropic.BetaJSONOutputFormatParam{Schema: json.RawMessage(`{
			  "type": "object",
			  "properties": {
			    "not_english": {
			      "type": "array",
			      "description": "Only the entries whose name is not English. Omit everything already English.",
			      "items": {
			        "type": "object",
			        "properties": {
			          "id":      {"type": "integer", "description": "The id exactly as it was given."},
			          "english": {"type": "string", "description": "The ordinary English name."}
			        },
			        "required": ["id", "english"],
			        "additionalProperties": false
			      }
			    }
			  },
			  "required": ["not_english"],
			  "additionalProperties": false
			}`)},
		},
		Messages: []anthropic.BetaMessageParam{
			anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(list.String())),
		},
	})
	if err != nil {
		log.Printf("importer: could not sort %s canonicals: %v", kind, err)
		return nil, fmt.Errorf("the AI service could not be reached")
	}

	var answer struct {
		NotEnglish []struct {
			ID      int    `json:"id"`
			English string `json:"english"`
		} `json:"not_english"`
	}
	if err := json.Unmarshal([]byte(betaText(message)), &answer); err != nil {
		return nil, fmt.Errorf("the AI answered in an unexpected shape")
	}

	english := map[int]string{}
	for _, entry := range answer.NotEnglish {
		original, asked := names[entry.ID]
		if !asked {
			continue // an id nobody asked about must not be written anywhere
		}
		name := clean(entry.English, 100)
		if name == "" || strings.EqualFold(name, original) {
			continue // no change is not a change
		}
		english[entry.ID] = name
	}

	log.Printf("importer: %d of %d %s canonicals are not English", len(english), len(names), kind)
	return english, nil
}
