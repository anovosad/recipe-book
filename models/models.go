// File: models/models.go
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

type Recipe struct {
	ID           int                `json:"id"`
	Title        string             `json:"title"`
	Description  string             `json:"description"`
	Instructions string             `json:"instructions"`
	PrepTime     int                `json:"prep_time"`
	CookTime     int                `json:"cook_time"`
	Servings     int                `json:"servings"`
	ServingUnit  string             `json:"serving_unit"` // NEW: Unit for servings
	CreatedBy    int                `json:"created_by"`
	CreatedAt    time.Time          `json:"created_at"`
	Ingredients  []RecipeIngredient `json:"ingredients"`
	Images       []RecipeImage      `json:"images"`
	AuthorName   string             `json:"author_name"`
}

type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
}

type PageData struct {
	User        *User
	IsLoggedIn  bool
	Recipe      *Recipe
	Recipes     []Recipe
	Ingredients []Ingredient
	Title       string
	Message     string
	Error       string
}

// Common serving units
var ServingUnits = []struct {
	Value string
	Label string
}{
	{"people", "People"},
	{"servings", "Servings"},
	{"portions", "Portions"},
	{"pieces", "Pieces"},
	{"slices", "Slices"},
	{"cups", "Cups"},
	{"bowls", "Bowls"},
	{"glasses", "Glasses"},
	{"liters", "Liters"},
	{"ml", "Milliliters"},
	{"kg", "Kilograms"},
	{"g", "Grams"},
	{"dozen", "Dozen"},
	{"cookies", "Cookies"},
	{"muffins", "Muffins"},
	{"pancakes", "Pancakes"},
}
