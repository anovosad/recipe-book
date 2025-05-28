// File: handlers/handlers.go (API Handlers Updated to Return JSON)
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"recipe-book/auth"
	"recipe-book/database"
	"recipe-book/models"
	"recipe-book/utils"
	"strconv"
	"strings"
)

// Page Handlers (these still return HTML)
func HomeHandler(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/recipes", http.StatusSeeOther)
}

func LoginPageHandler(w http.ResponseWriter, r *http.Request) {
	data := models.PageData{Title: "Login"}

	if message := r.URL.Query().Get("message"); message != "" {
		// Sanitize message to prevent XSS
		data.Message = utils.SanitizeInput(message)
		if len(data.Message) > 200 {
			data.Message = data.Message[:200]
		}
	}

	renderTemplate(w, r, "login.html", data)
}

func RegisterPageHandler(w http.ResponseWriter, r *http.Request) {
	data := models.PageData{Title: "Register"}
	renderTemplate(w, r, "register.html", data)
}

func RecipesPageHandler(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.GetUserFromToken(r)
	clientIP := getClientIP(r)

	query := strings.TrimSpace(r.URL.Query().Get("search"))
	tagFilter := strings.TrimSpace(r.URL.Query().Get("tag"))

	// Validate search query if provided
	if query != "" {
		if validation := utils.ValidateSearchQuery(query); !validation.Valid {
			utils.LogSecurityEvent("INVALID_SEARCH_QUERY", clientIP, query)
			query = "" // Clear invalid query
		}
	}

	var recipes []models.Recipe
	var err error
	var activeTagID int
	var activeTag *models.Tag

	// Parse and validate tag filter
	if tagFilter != "" {
		activeTagID, err = strconv.Atoi(tagFilter)
		if err != nil || !utils.IsValidID(activeTagID) {
			activeTagID = 0
		}
	}

	// Get recipes based on filters with security validation
	if activeTagID > 0 {
		recipes, err = database.GetRecipesByTag(activeTagID)
		if err != nil {
			utils.LogSecurityEvent("TAG_FILTER_ERROR", clientIP, err.Error())
		}

		activeTag, err = database.GetTagByID(activeTagID)
		if err != nil {
			utils.LogSecurityEvent("TAG_LOOKUP_ERROR", clientIP, err.Error())
			activeTag = nil
			activeTagID = 0
		}
	} else if query != "" {
		recipes, err = database.SearchRecipes(query)
		if err != nil {
			utils.LogSecurityEvent("SEARCH_ERROR", clientIP, err.Error())
		}
	} else {
		recipes, err = database.GetAllRecipes()
		if err != nil {
			utils.LogSecurityEvent("RECIPES_LOAD_ERROR", clientIP, err.Error())
		}
	}

	if err != nil {
		log.Printf("Error loading recipes: %v", err)
		recipes = []models.Recipe{}
	}

	// Get all tags for the filter dropdown
	tags, err := database.GetAllTags()
	if err != nil {
		log.Printf("Error loading tags: %v", err)
		tags = []models.Tag{}
	}

	data := models.PageData{
		Title:       "Recipes",
		User:        user,
		IsLoggedIn:  user != nil,
		Recipes:     recipes,
		Tags:        tags,
		SearchQuery: query,
		ActiveTagID: activeTagID,
		ActiveTag:   activeTag,
	}

	renderTemplate(w, r, "recipes.html", data)
}

func RecipePageHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	// Extract ID from URL path with validation
	path := strings.TrimPrefix(r.URL.Path, "/recipe/")
	id, err := strconv.Atoi(path)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_RECIPE_ID", clientIP, path)
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	user, _ := auth.GetUserFromToken(r)
	recipe, err := database.GetRecipeByIDSecure(id)
	if err != nil {
		utils.LogSecurityEvent("RECIPE_NOT_FOUND", clientIP, fmt.Sprintf("ID: %d", id))
		http.Error(w, "Recipe not found", http.StatusNotFound)
		return
	}

	data := models.PageData{
		Title:      recipe.Title,
		User:       user,
		IsLoggedIn: user != nil,
		Recipe:     recipe,
	}

	renderTemplate(w, r, "recipe.html", data)
}

func NewRecipePageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	ingredients, err := database.GetAllIngredients()
	if err != nil {
		log.Printf("Error loading ingredients: %v", err)
		ingredients = []models.Ingredient{}
	}

	tags, err := database.GetAllTags()
	if err != nil {
		log.Printf("Error loading tags: %v", err)
		tags = []models.Tag{}
	}

	data := models.PageData{
		Title:       "New Recipe",
		User:        user,
		IsLoggedIn:  true,
		Ingredients: ingredients,
		Tags:        tags,
	}

	renderTemplate(w, r, "recipe-form.html", data)
}

func EditRecipePageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	clientIP := getClientIP(r)

	// Extract ID from URL path with validation
	path := strings.TrimPrefix(r.URL.Path, "/recipe/")
	path = strings.TrimSuffix(path, "/edit")
	id, err := strconv.Atoi(path)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_RECIPE_ID_EDIT", clientIP, path)
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	if r.Method == "POST" {
		HandleEditRecipeSubmission(w, r, user, id)
		return
	}

	recipe, err := database.GetRecipeByIDSecure(id)
	if err != nil {
		utils.LogSecurityEvent("RECIPE_NOT_FOUND_EDIT", clientIP, fmt.Sprintf("ID: %d", id))
		http.Error(w, "Recipe not found", http.StatusNotFound)
		return
	}

	// Check ownership
	if recipe.CreatedBy != user.ID {
		utils.LogSecurityEvent("UNAUTHORIZED_RECIPE_EDIT", clientIP, fmt.Sprintf("UserID: %d, RecipeID: %d, Owner: %d", user.ID, id, recipe.CreatedBy))
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	ingredients, err := database.GetAllIngredients()
	if err != nil {
		log.Printf("Error loading ingredients: %v", err)
		ingredients = []models.Ingredient{}
	}

	tags, err := database.GetAllTags()
	if err != nil {
		log.Printf("Error loading tags: %v", err)
		tags = []models.Tag{}
	}

	data := models.PageData{
		Title:       "Edit Recipe",
		User:        user,
		IsLoggedIn:  true,
		Recipe:      recipe,
		Ingredients: ingredients,
		Tags:        tags,
	}

	renderTemplate(w, r, "recipe-form.html", data)
}

func IngredientsPageHandler(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.GetUserFromToken(r)

	ingredients, err := database.GetAllIngredients()
	if err != nil {
		log.Printf("Error loading ingredients: %v", err)
		ingredients = []models.Ingredient{}
	}

	data := models.PageData{
		Title:       "Ingredients",
		User:        user,
		IsLoggedIn:  user != nil,
		Ingredients: ingredients,
	}

	renderTemplate(w, r, "ingredients.html", data)
}

func NewIngredientPageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	data := models.PageData{
		Title:      "New Ingredient",
		User:       user,
		IsLoggedIn: true,
	}

	renderTemplate(w, r, "ingredient-form.html", data)
}

func TagsPageHandler(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.GetUserFromToken(r)

	tags, err := database.GetAllTags()
	if err != nil {
		log.Printf("Error loading tags: %v", err)
		tags = []models.Tag{}
	}

	data := models.PageData{
		Title:      "Tags",
		User:       user,
		IsLoggedIn: user != nil,
		Tags:       tags,
	}

	renderTemplate(w, r, "tags.html", data)
}

func NewTagPageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	data := models.PageData{
		Title:      "New Tag",
		User:       user,
		IsLoggedIn: true,
	}

	renderTemplate(w, r, "tag-form.html", data)
}
