package mcp

import (
	"encoding/json"
	"fmt"
	"strings"

	"recipe-book/database"
	"recipe-book/models"
	"recipe-book/recipeinput"
)

type toolFunc func(json.RawMessage) (any, error)

// The schemas are written out rather than generated, because the description
// text is what the model actually reads to decide how to call the tool.
func toolDefinitions() []toolDefinition {
	return []toolDefinition{
		{
			Name: "list_recipes",
			Description: "List the recipes in the collection, newest first. Optionally narrowed by a " +
				"search over titles, descriptions, instructions, ingredients and tags. Use this before " +
				"adding anything, to check the dish is not already stored.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"query": {"type": "string", "description": "Optional text to search for."}
				},
				"additionalProperties": false
			}`),
		},
		{
			Name:        "get_recipe",
			Description: "The full text of one recipe: instructions, ingredients with quantities, and tags.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"id": {"type": "integer", "description": "The recipe's id, as returned by list_recipes."}
				},
				"required": ["id"],
				"additionalProperties": false
			}`),
		},
		{
			Name: "list_ingredients",
			Description: "Every ingredient the collection knows about. create_recipe accepts names " +
				"directly and adds any that are missing, so this is for checking what a thing is " +
				"already called rather than for looking up ids.",
			InputSchema: json.RawMessage(`{"type": "object", "properties": {}, "additionalProperties": false}`),
		},
		{
			Name:        "list_tags",
			Description: "Every tag in use, with its colour. Prefer an existing tag over inventing a near-duplicate.",
			InputSchema: json.RawMessage(`{"type": "object", "properties": {}, "additionalProperties": false}`),
		},
		{
			Name: "create_recipe",
			Description: "Add a recipe. Ingredients and tags are given by name, not id, and anything " +
				"not already in the collection is created - so a recipe read off a web page can be " +
				"passed straight in. Quantities are numbers and units are short ('g', 'ml', 'tbsp', " +
				"'piece'). Times are in minutes. If the recipe came from a page, pass source_url and " +
				"it is recorded with the description.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"title": {"type": "string", "description": "The dish's name, 1-200 characters."},
					"instructions": {"type": "string", "description": "The method. Number the steps ('1. ...' on its own line) - the site lays numbered steps out as a list."},
					"description": {"type": "string", "description": "One or two sentences, up to 1000 characters."},
					"prep_time": {"type": "integer", "description": "Preparation time in minutes, 0-1440."},
					"cook_time": {"type": "integer", "description": "Cooking time in minutes, 0-1440."},
					"servings": {"type": "integer", "description": "How many the quantities are for, 1-100. Defaults to 4."},
					"serving_unit": {"type": "string", "description": "What is being served: people, portions, pieces, slices. Defaults to people."},
					"ingredients": {
						"type": "array",
						"description": "At least one. Split compound entries: '2 cloves garlic, minced' is name 'Garlic', quantity 2, unit 'clove'.",
						"items": {
							"type": "object",
							"properties": {
								"name": {"type": "string", "description": "The ingredient on its own, without the quantity or how it is cut."},
								"quantity": {"type": "number", "description": "How much, as a number. Use 1 when a recipe just says 'a pinch'."},
								"unit": {"type": "string", "description": "g, kg, ml, l, tsp, tbsp, cup, piece, clove, pinch..."}
							},
							"required": ["name", "quantity", "unit"],
							"additionalProperties": false
						},
						"minItems": 1
					},
					"tags": {
						"type": "array",
						"description": "Categories such as Dessert, Main Dish, Vegan. Existing ones are reused.",
						"items": {"type": "string"}
					},
					"source_url": {"type": "string", "description": "Where the recipe came from. Appended to the description."}
				},
				"required": ["title", "instructions", "ingredients"],
				"additionalProperties": false
			}`),
		},
		{
			Name: "update_recipe",
			Description: "Change an existing recipe. Only the fields you pass are touched; everything " +
				"else is left as it is. Passing ingredients or tags replaces that whole list, so send " +
				"the complete set you want, not just the additions.",
			InputSchema: json.RawMessage(`{
				"type": "object",
				"properties": {
					"id": {"type": "integer", "description": "The recipe to change."},
					"title": {"type": "string"},
					"instructions": {"type": "string"},
					"description": {"type": "string"},
					"prep_time": {"type": "integer"},
					"cook_time": {"type": "integer"},
					"servings": {"type": "integer"},
					"serving_unit": {"type": "string"},
					"ingredients": {
						"type": "array",
						"items": {
							"type": "object",
							"properties": {
								"name": {"type": "string"},
								"quantity": {"type": "number"},
								"unit": {"type": "string"}
							},
							"required": ["name", "quantity", "unit"],
							"additionalProperties": false
						}
					},
					"tags": {"type": "array", "items": {"type": "string"}}
				},
				"required": ["id"],
				"additionalProperties": false
			}`),
		},
	}
}

func (s *server) tools() map[string]toolFunc {
	return map[string]toolFunc{
		"list_recipes":     s.listRecipes,
		"get_recipe":       s.getRecipe,
		"list_ingredients": s.listIngredients,
		"list_tags":        s.listTags,
		"create_recipe":    s.createRecipe,
		"update_recipe":    s.updateRecipe,
	}
}

func (s *server) listRecipes(raw json.RawMessage) (any, error) {
	var args struct {
		Query string `json:"query"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, err
	}

	var (
		recipes []models.Recipe
		err     error
	)
	if strings.TrimSpace(args.Query) == "" {
		recipes, err = database.GetAllRecipes()
	} else {
		recipes, err = database.SearchRecipes(strings.TrimSpace(args.Query))
	}
	if err != nil {
		return nil, err
	}

	summaries := make([]map[string]any, 0, len(recipes))
	for _, recipe := range recipes {
		summaries = append(summaries, recipeSummary(recipe))
	}
	return map[string]any{"count": len(summaries), "recipes": summaries}, nil
}

func (s *server) getRecipe(raw json.RawMessage) (any, error) {
	var args struct {
		ID int `json:"id"`
	}
	if err := decodeArgs(raw, &args); err != nil {
		return nil, err
	}

	recipe, err := database.GetRecipeByIDSecure(args.ID)
	if err != nil {
		return nil, fmt.Errorf("no recipe with id %d", args.ID)
	}
	recipe.Ingredients = database.GetRecipeIngredients(recipe.ID)
	recipe.Tags = database.GetRecipeTags(recipe.ID)
	return recipeDetail(recipe), nil
}

func (s *server) listIngredients(json.RawMessage) (any, error) {
	ingredients, err := database.GetAllIngredients()
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(ingredients))
	for _, ingredient := range ingredients {
		names = append(names, ingredient.Name)
	}
	return map[string]any{"count": len(names), "ingredients": names}, nil
}

func (s *server) listTags(json.RawMessage) (any, error) {
	tags, err := database.GetAllTags()
	if err != nil {
		return nil, err
	}
	listed := make([]map[string]any, 0, len(tags))
	for _, tag := range tags {
		listed = append(listed, map[string]any{"name": tag.Name, "color": tag.Color})
	}
	return map[string]any{"count": len(listed), "tags": listed}, nil
}

type recipeArgs struct {
	ID           int                           `json:"id"`
	Title        *string                       `json:"title"`
	Instructions *string                       `json:"instructions"`
	Description  *string                       `json:"description"`
	PrepTime     *int                          `json:"prep_time"`
	CookTime     *int                          `json:"cook_time"`
	Servings     *int                          `json:"servings"`
	ServingUnit  *string                       `json:"serving_unit"`
	Ingredients  []recipeinput.NamedIngredient `json:"ingredients"`
	Tags         []string                      `json:"tags"`
	SourceURL    string                        `json:"source_url"`
}

func (s *server) createRecipe(raw json.RawMessage) (any, error) {
	var args recipeArgs
	if err := decodeArgs(raw, &args); err != nil {
		return nil, err
	}
	if args.Title == nil || strings.TrimSpace(*args.Title) == "" {
		return nil, fmt.Errorf("title is required")
	}
	if args.Instructions == nil || strings.TrimSpace(*args.Instructions) == "" {
		return nil, fmt.Errorf("instructions are required")
	}
	if len(args.Ingredients) == 0 {
		return nil, fmt.Errorf("at least one ingredient is required")
	}

	user, err := s.actingUser()
	if err != nil {
		return nil, err
	}

	names, err := recipeinput.NewResolver()
	if err != nil {
		return nil, err
	}

	ingredients, err := recipeinput.ResolveIngredients(names, args.Ingredients)
	if err != nil {
		return nil, err
	}
	tagIDs, err := recipeinput.ResolveTags(names, args.Tags)
	if err != nil {
		return nil, err
	}

	input := database.RecipeInput{
		Title:        strings.TrimSpace(*args.Title),
		Instructions: strings.TrimSpace(*args.Instructions),
		Description:  recipeinput.WithSource(deref(args.Description, ""), args.SourceURL),
		PrepTime:     deref(args.PrepTime, 0),
		CookTime:     deref(args.CookTime, 0),
		Servings:     deref(args.Servings, 4),
		ServingUnit:  strings.TrimSpace(deref(args.ServingUnit, "")),
	}

	id, err := database.CreateRecipeTx(input, user.ID, tagIDs, ingredients)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"id":      id,
		"title":   input.Title,
		"path":    fmt.Sprintf("/recipe/%d", id),
		"message": "Recipe added.",
	}, nil
}

func (s *server) updateRecipe(raw json.RawMessage) (any, error) {
	var args recipeArgs
	if err := decodeArgs(raw, &args); err != nil {
		return nil, err
	}
	if args.ID == 0 {
		return nil, fmt.Errorf("id is required")
	}

	user, err := s.actingUser()
	if err != nil {
		return nil, err
	}

	current, err := database.GetRecipeByIDSecure(args.ID)
	if err != nil {
		return nil, fmt.Errorf("no recipe with id %d", args.ID)
	}

	input := database.RecipeInput{
		Title:        strings.TrimSpace(deref(args.Title, current.Title)),
		Instructions: strings.TrimSpace(deref(args.Instructions, current.Instructions)),
		Description:  recipeinput.WithSource(deref(args.Description, current.Description), args.SourceURL),
		PrepTime:     deref(args.PrepTime, current.PrepTime),
		CookTime:     deref(args.CookTime, current.CookTime),
		Servings:     deref(args.Servings, current.Servings),
		ServingUnit:  strings.TrimSpace(deref(args.ServingUnit, current.ServingUnit)),
	}

	names, err := recipeinput.NewResolver()
	if err != nil {
		return nil, err
	}

	// Omitting a list keeps what is stored; sending one replaces it wholesale,
	// which is what the underlying write does either way.
	var ingredients []database.RecipeIngredientInput
	if args.Ingredients != nil {
		if ingredients, err = recipeinput.ResolveIngredients(names, args.Ingredients); err != nil {
			return nil, err
		}
	} else {
		for _, existing := range database.GetRecipeIngredients(args.ID) {
			ingredients = append(ingredients, database.RecipeIngredientInput{
				IngredientID: existing.IngredientID,
				Quantity:     existing.Quantity,
				Unit:         existing.Unit,
			})
		}
	}

	var tagIDs []int
	if args.Tags != nil {
		if tagIDs, err = recipeinput.ResolveTags(names, args.Tags); err != nil {
			return nil, err
		}
	} else {
		for _, existing := range database.GetRecipeTags(args.ID) {
			tagIDs = append(tagIDs, existing.ID)
		}
	}

	if err := database.UpdateRecipeTx(args.ID, user.ID, input, tagIDs, ingredients); err != nil {
		return nil, err
	}

	return map[string]any{
		"id":      args.ID,
		"title":   input.Title,
		"path":    fmt.Sprintf("/recipe/%d", args.ID),
		"message": "Recipe updated.",
	}, nil
}

func deref[T any](pointer *T, fallback T) T {
	if pointer == nil {
		return fallback
	}
	return *pointer
}

func decodeArgs(raw json.RawMessage, into any) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	if err := decoder.Decode(into); err != nil {
		return fmt.Errorf("could not read the arguments: %w", err)
	}
	return nil
}
