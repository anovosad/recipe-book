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
// name, with how much of it.
type NamedIngredient struct {
	Name     string  `json:"name"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
}

// Resolver maps names to ids, creating whatever is missing. Build one per
// request: it caches the taxonomy as it was read, which is what keeps two
// mentions of the same new ingredient in one recipe from creating it twice.
type Resolver struct {
	ingredients map[string]int
	tags        map[string]int
	tagCount    int

	// The taxonomy as it is spelled, for the prompt. The maps above are keyed
	// on the normalised form, which is not what a model should be shown.
	ingredientNames []string
	tagNames        []string
}

func normalizeName(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(name), " "))
}

func NewResolver() (*Resolver, error) {
	r := &Resolver{ingredients: map[string]int{}, tags: map[string]int{}}

	existingIngredients, err := database.GetAllIngredients()
	if err != nil {
		return nil, err
	}
	for _, ingredient := range existingIngredients {
		r.ingredients[normalizeName(ingredient.Name)] = ingredient.ID
		r.ingredientNames = append(r.ingredientNames, ingredient.Name)
	}
	slices.Sort(r.ingredientNames)

	existingTags, err := database.GetAllTags()
	if err != nil {
		return nil, err
	}
	for _, tag := range existingTags {
		r.tags[normalizeName(tag.Name)] = tag.ID
		r.tagNames = append(r.tagNames, tag.Name)
	}
	slices.Sort(r.tagNames)
	r.tagCount = len(existingTags)

	return r, nil
}

// IngredientNames lists the taxonomy as it stands. The importer puts it in the
// prompt so the model reuses "Máslo" instead of inventing "Maslo" - matching
// after the fact only catches spellings that are already identical.
func (r *Resolver) IngredientNames() []string { return r.ingredientNames }

// TagNames is the same, for tags.
func (r *Resolver) TagNames() []string { return r.tagNames }

func (r *Resolver) IngredientID(name string) (int, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, fmt.Errorf("ingredient name is empty")
	}
	if id, ok := r.ingredients[normalizeName(name)]; ok {
		return id, nil
	}

	created, err := database.CreateIngredientSecure(name)
	if err != nil {
		return 0, fmt.Errorf("could not add ingredient %q: %w", name, err)
	}
	r.ingredients[normalizeName(name)] = created.ID
	return created.ID, nil
}

func (r *Resolver) TagID(name string) (int, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, fmt.Errorf("tag name is empty")
	}
	if id, ok := r.tags[normalizeName(name)]; ok {
		return id, nil
	}

	colour := tagPalette[r.tagCount%len(tagPalette)]
	created, err := database.CreateTagSecure(name, colour)
	if err != nil {
		return 0, fmt.Errorf("could not add tag %q: %w", name, err)
	}
	r.tags[normalizeName(name)] = created.ID
	r.tagCount++
	return created.ID, nil
}

// ResolveIngredients turns named lines into the rows a recipe write takes. A
// missing unit or a non-positive quantity is filled in rather than refused: the
// page said "a pinch of salt" and losing the line entirely is the worse answer.
func ResolveIngredients(names *Resolver, given []NamedIngredient) ([]database.RecipeIngredientInput, error) {
	resolved := make([]database.RecipeIngredientInput, 0, len(given))
	for _, item := range given {
		id, err := names.IngredientID(item.Name)
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

func ResolveTags(names *Resolver, given []string) ([]int, error) {
	resolved := make([]int, 0, len(given))
	for _, name := range given {
		if strings.TrimSpace(name) == "" {
			continue
		}
		id, err := names.TagID(name)
		if err != nil {
			return nil, err
		}
		resolved = append(resolved, id)
	}
	return resolved, nil
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
