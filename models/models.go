// File: models/models.go - Add the Tag struct and update Recipe struct
package models

import "time"

type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"-"`
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
	CreatedBy    int                `json:"created_by"`
	CreatedAt    time.Time          `json:"created_at"`
	Ingredients  []RecipeIngredient `json:"ingredients"`
	Images       []RecipeImage      `json:"images"`
	Tags         []Tag              `json:"tags"` // Add this line
	AuthorName   string             `json:"author_name"`
}

// The types above are the whole domain. A duplicate Claims struct, the PageData
// struct, the ServingUnits table and the RecipeItem enum used to live here too;
// they served the server-rendered template UI that this app no longer has. JWT
// claims are defined in package auth, which is the only place that needs them.
