// File: models/models.go - Add the Tag struct and update Recipe struct
package models

import "time"

type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"-"`

	// IsAdmin decides one thing only: whether this account may manage other
	// accounts. Recipes are shared and every signed-in user may edit any of
	// them, so this is not a general privilege level - it is the answer to
	// "who is allowed to hand out an account".
	IsAdmin bool `json:"is_admin"`
}

type Ingredient struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// Add this new Tag struct
type Tag struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type RecipeIngredient struct {
	IngredientID int     `json:"ingredient_id"`
	Name         string  `json:"name"`
	Unit         string  `json:"unit"`
	Quantity     float64 `json:"quantity"`
}

type RecipeImage struct {
	ID       int    `json:"id"`
	RecipeID int    `json:"recipe_id"`
	Filename string `json:"filename"`
	Caption  string `json:"caption"`
	Order    int    `json:"order"`
}

// Update Recipe struct to include Tags
type Recipe struct {
	ID           int                `json:"id"`
	Title        string             `json:"title"`
	Description  string             `json:"description"`
	Instructions string             `json:"instructions"`
	PrepTime     int                `json:"prep_time"`
	CookTime     int                `json:"cook_time"`
	Servings     int                `json:"servings"`
	ServingUnit  string             `json:"serving_unit"`
	SourceURL    string             `json:"source_url"`
	CreatedBy    int                `json:"created_by"`
	CreatedAt    time.Time          `json:"created_at"`
	Ingredients  []RecipeIngredient `json:"ingredients"`
	Images       []RecipeImage      `json:"images"`
	Tags         []Tag              `json:"tags"` // Add this line
	AuthorName   string             `json:"author_name"`

	// Language is the language the text above is actually in, which is not
	// always the one that was asked for: a recipe that exists only in Czech is
	// still shown to an English reader, labelled, rather than hidden. Languages
	// lists every version that exists, so the UI can offer the others and know
	// what is missing.
	Language  string   `json:"language"`
	Languages []string `json:"languages"`

	// Texts is every language version, filled in only when one recipe is read
	// on its own - the edit form needs the whole set, because saving replaces
	// it, and a list of thirty recipes does not need it at all.
	Texts map[string]RecipeText `json:"texts,omitempty"`
}

// RecipeText is one language's worth of a recipe. A write carries a map of
// these keyed by language code; a read returns the one resolved for display.
type RecipeText struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	Instructions string `json:"instructions"`
}

// The types above are the whole domain. A duplicate Claims struct, the PageData
// struct, the ServingUnits table and the RecipeItem enum used to live here too;
// they served the server-rendered template UI that this app no longer has. JWT
// claims are defined in package auth, which is the only place that needs them.
