package handlers

// import (
// 	"fmt"
// 	"net/http"
// 	"recipe-book/auth"
// 	"recipe-book/database"
// 	"recipe-book/models"
// 	"recipe-book/templates"
// 	"recipe-book/utils"
// 	"strconv"
// 	"strings"
// )

// // Updated page handlers to use templ templates

// func HomeHandler(w http.ResponseWriter, r *http.Request) {
// 	http.Redirect(w, r, "/recipes", http.StatusSeeOther)
// }

// func LoginPageHandler(w http.ResponseWriter, r *http.Request) {
// 	data := &models.PageData{
// 		Title: "Login",
// 	}

// 	if message := r.URL.Query().Get("message"); message != "" {
// 		// Sanitize message to prevent XSS
// 		data.Message = utils.SanitizeInput(message)
// 		if len(data.Message) > 200 {
// 			data.Message = data.Message[:200]
// 		}
// 	}

// 	// Render using templ
// 	if err := templates.Login(data).Render(r.Context(), w); err != nil {
// 		clientIP := getClientIP(r)
// 		utils.LogSecurityEvent("TEMPLATE_ERROR", clientIP, err.Error())
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 	}
// }

// func RegisterPageHandler(w http.ResponseWriter, r *http.Request) {
// 	data := &models.PageData{
// 		Title: "Register",
// 	}

// 	// Render using templ
// 	if err := templates.Register(data).Render(r.Context(), w); err != nil {
// 		clientIP := getClientIP(r)
// 		utils.LogSecurityEvent("TEMPLATE_ERROR", clientIP, err.Error())
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 	}
// }

// func RecipesPageHandler(w http.ResponseWriter, r *http.Request) {
// 	user, _ := auth.GetUserFromToken(r)
// 	clientIP := getClientIP(r)

// 	query := strings.TrimSpace(r.URL.Query().Get("search"))
// 	tagFilter := strings.TrimSpace(r.URL.Query().Get("tag"))

// 	// Validate search query if provided
// 	if query != "" {
// 		if validation := utils.ValidateSearchQuery(query); !validation.Valid {
// 			utils.LogSecurityEvent("INVALID_SEARCH_QUERY", clientIP, query)
// 			query = "" // Clear invalid query
// 		}
// 	}

// 	var recipes []models.Recipe
// 	var err error
// 	var activeTagID int
// 	var activeTag *models.Tag

// 	// Parse and validate tag filter
// 	if tagFilter != "" {
// 		activeTagID, err = strconv.Atoi(tagFilter)
// 		if err != nil || !utils.IsValidID(activeTagID) {
// 			activeTagID = 0
// 		}
// 	}

// 	// Get recipes based on filters with security validation
// 	if activeTagID > 0 {
// 		recipes, err = database.GetRecipesByTag(activeTagID)
// 		if err != nil {
// 			utils.LogSecurityEvent("TAG_FILTER_ERROR", clientIP, err.Error())
// 		}

// 		activeTag, err = database.GetTagByID(activeTagID)
// 		if err != nil {
// 			utils.LogSecurityEvent("TAG_LOOKUP_ERROR", clientIP, err.Error())
// 			activeTag = nil
// 			activeTagID = 0
// 		}
// 	} else if query != "" {
// 		recipes, err = database.SearchRecipes(query)
// 		if err != nil {
// 			utils.LogSecurityEvent("SEARCH_ERROR", clientIP, err.Error())
// 		}
// 	} else {
// 		recipes, err = database.GetAllRecipes()
// 		if err != nil {
// 			utils.LogSecurityEvent("RECIPES_LOAD_ERROR", clientIP, err.Error())
// 		}
// 	}

// 	if err != nil {
// 		recipes = []models.Recipe{}
// 	}

// 	// Get all tags for the filter dropdown
// 	tags, err := database.GetAllTags()
// 	if err != nil {
// 		tags = []models.Tag{}
// 	}

// 	data := &models.PageData{
// 		Title:       "Recipes",
// 		User:        user,
// 		IsLoggedIn:  user != nil,
// 		Recipes:     recipes,
// 		Tags:        tags,
// 		SearchQuery: query,
// 		ActiveTagID: activeTagID,
// 		ActiveTag:   activeTag,
// 	}

// 	// Render using templ
// 	if err := templates.Recipes(data).Render(r.Context(), w); err != nil {
// 		utils.LogSecurityEvent("TEMPLATE_ERROR", clientIP, err.Error())
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 	}
// }

// func RecipePageHandler(w http.ResponseWriter, r *http.Request) {
// 	clientIP := getClientIP(r)

// 	// Extract ID from URL path with validation
// 	path := strings.TrimPrefix(r.URL.Path, "/recipe/")
// 	id, err := strconv.Atoi(path)
// 	if err != nil || !utils.IsValidID(id) {
// 		utils.LogSecurityEvent("INVALID_RECIPE_ID", clientIP, path)
// 		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
// 		return
// 	}

// 	user, _ := auth.GetUserFromToken(r)
// 	recipe, err := database.GetRecipeByIDSecure(id)
// 	if err != nil {
// 		utils.LogSecurityEvent("RECIPE_NOT_FOUND", clientIP, fmt.Sprintf("ID: %d", id))
// 		http.Error(w, "Recipe not found", http.StatusNotFound)
// 		return
// 	}

// 	data := &models.PageData{
// 		Title:      recipe.Title,
// 		User:       user,
// 		IsLoggedIn: user != nil,
// 		Recipe:     recipe,
// 	}

// 	// Render using templ
// 	if err := templates.Recipe(data).Render(r.Context(), w); err != nil {
// 		utils.LogSecurityEvent("TEMPLATE_ERROR", clientIP, err.Error())
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 	}
// }

// func NewRecipePageHandler(w http.ResponseWriter, r *http.Request) {
// 	user, err := auth.GetUserFromToken(r)
// 	if err != nil {
// 		http.Redirect(w, r, "/login", http.StatusSeeOther)
// 		return
// 	}

// 	ingredients, err := database.GetAllIngredients()
// 	if err != nil {
// 		ingredients = []models.Ingredient{}
// 	}

// 	tags, err := database.GetAllTags()
// 	if err != nil {
// 		tags = []models.Tag{}
// 	}

// 	data := &models.PageData{
// 		Title:       "New Recipe",
// 		User:        user,
// 		IsLoggedIn:  true,
// 		Ingredients: ingredients,
// 		Tags:        tags,
// 	}

// 	// Render using templ
// 	if err := templates.RecipeForm(data).Render(r.Context(), w); err != nil {
// 		clientIP := getClientIP(r)
// 		utils.LogSecurityEvent("TEMPLATE_ERROR", clientIP, err.Error())
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 	}
// }

// func EditRecipePageHandler(w http.ResponseWriter, r *http.Request) {
// 	user, err := auth.GetUserFromToken(r)
// 	if err != nil {
// 		http.Redirect(w, r, "/login", http.StatusSeeOther)
// 		return
// 	}

// 	clientIP := getClientIP(r)

// 	// Extract ID from URL path with validation
// 	path := strings.TrimPrefix(r.URL.Path, "/recipe/")
// 	path = strings.TrimSuffix(path, "/edit")
// 	id, err := strconv.Atoi(path)
// 	if err != nil || !utils.IsValidID(id) {
// 		utils.LogSecurityEvent("INVALID_RECIPE_ID_EDIT", clientIP, path)
// 		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
// 		return
// 	}

// 	if r.Method == "POST" {
// 		HandleEditRecipeSubmission(w, r, user, id)
// 		return
// 	}

// 	recipe, err := database.GetRecipeByIDSecure(id)
// 	if err != nil {
// 		utils.LogSecurityEvent("RECIPE_NOT_FOUND_EDIT", clientIP, fmt.Sprintf("ID: %d", id))
// 		http.Error(w, "Recipe not found", http.StatusNotFound)
// 		return
// 	}

// 	// Check ownership
// 	if recipe.CreatedBy != user.ID {
// 		utils.LogSecurityEvent("UNAUTHORIZED_RECIPE_EDIT", clientIP, fmt.Sprintf("UserID: %d, RecipeID: %d, Owner: %d", user.ID, id, recipe.CreatedBy))
// 		http.Error(w, "Forbidden", http.StatusForbidden)
// 		return
// 	}

// 	ingredients, err := database.GetAllIngredients()
// 	if err != nil {
// 		ingredients = []models.Ingredient{}
// 	}

// 	tags, err := database.GetAllTags()
// 	if err != nil {
// 		tags = []models.Tag{}
// 	}

// 	data := &models.PageData{
// 		Title:       "Edit Recipe",
// 		User:        user,
// 		IsLoggedIn:  true,
// 		Recipe:      recipe,
// 		Ingredients: ingredients,
// 		Tags:        tags,
// 	}

// 	// Render using templ
// 	if err := templates.RecipeForm(data).Render(r.Context(), w); err != nil {
// 		utils.LogSecurityEvent("TEMPLATE_ERROR", clientIP, err.Error())
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 	}
// }

// func IngredientsPageHandler(w http.ResponseWriter, r *http.Request) {
// 	user, _ := auth.GetUserFromToken(r)

// 	ingredients, err := database.GetAllIngredients()
// 	if err != nil {
// 		ingredients = []models.Ingredient{}
// 	}

// 	data := &models.PageData{
// 		Title:       "Ingredients",
// 		User:        user,
// 		IsLoggedIn:  user != nil,
// 		Ingredients: ingredients,
// 	}

// 	// Render using templ
// 	if err := templates.Ingredients(data).Render(r.Context(), w); err != nil {
// 		clientIP := getClientIP(r)
// 		utils.LogSecurityEvent("TEMPLATE_ERROR", clientIP, err.Error())
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 	}
// }

// func TagsPageHandler(w http.ResponseWriter, r *http.Request) {
// 	user, _ := auth.GetUserFromToken(r)

// 	tags, err := database.GetAllTags()
// 	if err != nil {
// 		tags = []models.Tag{}
// 	}

// 	data := &models.PageData{
// 		Title:      "Tags",
// 		User:       user,
// 		IsLoggedIn: user != nil,
// 		Tags:       tags,
// 	}

// 	// Render using templ
// 	if err := templates.Tags(data).Render(r.Context(), w); err != nil {
// 		clientIP := getClientIP(r)
// 		utils.LogSecurityEvent("TEMPLATE_ERROR", clientIP, err.Error())
// 		http.Error(w, "Internal server error", http.StatusInternalServerError)
// 	}
// }
