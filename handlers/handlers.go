// File: handlers/handlers.go (API Handlers Updated to Return JSON)
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"recipe-book/auth"
	"recipe-book/database"
	"recipe-book/models"
	"recipe-book/utils"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// Helper function to get client IP with proper header checking
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header (for reverse proxies)
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	// Check X-Real-IP header
	xri := r.Header.Get("X-Real-IP")
	if xri != "" {
		return strings.TrimSpace(xri)
	}

	// Fall back to RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// Helper function to validate and respond with JSON errors
func validateAndRespond(w http.ResponseWriter, r *http.Request, validations ...utils.ValidationResult) bool {
	for _, validation := range validations {
		if !validation.Valid {
			clientIP := getClientIP(r)
			utils.LogSecurityEvent("VALIDATION_FAILED", clientIP, validation.Message)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": validation.Message})
			return false
		}
	}
	return true
}

// Helper function to render template with error handling (for page handlers only)
func renderTemplate(w http.ResponseWriter, r *http.Request, templateName string, data models.PageData) {
	if err := utils.Templates.ExecuteTemplate(w, templateName, data); err != nil {
		clientIP := getClientIP(r)
		utils.LogSecurityEvent("TEMPLATE_ERROR", clientIP, fmt.Sprintf("Template: %s, Error: %v", templateName, err))
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// Helper function to send JSON response
func sendJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}

// Helper function to send JSON error response
func sendJSONError(w http.ResponseWriter, statusCode int, message string) {
	sendJSONResponse(w, statusCode, map[string]string{"error": message})
}

// Helper function to send JSON success response
func sendJSONSuccess(w http.ResponseWriter, message string, data interface{}) {
	response := map[string]interface{}{
		"success": true,
		"message": message,
	}
	if data != nil {
		response["data"] = data
	}
	sendJSONResponse(w, http.StatusOK, response)
}

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

// API Handlers (these now return JSON only)

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	username := strings.TrimSpace(r.FormValue("username"))
	email := strings.TrimSpace(r.FormValue("email"))
	password := r.FormValue("password")

	// Comprehensive input validation
	usernameValidation := utils.ValidateUsername(username)
	emailValidation := utils.ValidateEmail(email)
	passwordValidation := utils.ValidatePassword(password)

	if !usernameValidation.Valid {
		utils.LogSecurityEvent("INVALID_REGISTRATION_USERNAME", clientIP, username)
		sendJSONError(w, http.StatusBadRequest, usernameValidation.Message)
		return
	}

	if !emailValidation.Valid {
		utils.LogSecurityEvent("INVALID_REGISTRATION_EMAIL", clientIP, email)
		sendJSONError(w, http.StatusBadRequest, emailValidation.Message)
		return
	}

	if !passwordValidation.Valid {
		sendJSONError(w, http.StatusBadRequest, passwordValidation.Message)
		return
	}

	// Hash password securely
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		utils.LogSecurityEvent("PASSWORD_HASH_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Error processing password")
		return
	}

	// Use secure database function
	err = database.CreateUserSecure(username, email, string(hashedPassword))
	if err != nil {
		utils.LogSecurityEvent("REGISTRATION_FAILED", clientIP, fmt.Sprintf("Username: %s, Email: %s, Error: %v", username, email, err))
		sendJSONError(w, http.StatusConflict, "Username or email already exists")
		return
	}

	utils.LogSecurityEvent("USER_REGISTERED", clientIP, fmt.Sprintf("Username: %s, Email: %s", username, email))
	sendJSONSuccess(w, "Registration successful! Please log in.", nil)
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	username := strings.TrimSpace(r.FormValue("username"))
	password := r.FormValue("password")

	// Basic validation
	if username == "" || password == "" {
		utils.LogSecurityEvent("LOGIN_EMPTY_FIELDS", clientIP, fmt.Sprintf("Username: %s", username))
		sendJSONError(w, http.StatusBadRequest, "Username and password are required")
		return
	}

	// Validate username format to prevent injection attempts
	usernameValidation := utils.ValidateUsername(username)
	if !usernameValidation.Valid {
		utils.LogSecurityEvent("LOGIN_INVALID_USERNAME", clientIP, username)
		sendJSONError(w, http.StatusBadRequest, "Invalid credentials")
		return
	}

	// Use secure database lookup
	user, hashedPassword, err := database.GetUserByUsernameSecure(username)
	if err != nil {
		utils.LogSecurityEvent("LOGIN_USER_NOT_FOUND", clientIP, username)
		sendJSONError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)); err != nil {
		utils.LogSecurityEvent("LOGIN_WRONG_PASSWORD", clientIP, username)
		sendJSONError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Create secure JWT token
	tokenString, err := auth.CreateToken(user)
	if err != nil {
		utils.LogSecurityEvent("TOKEN_CREATION_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Error creating session")
		return
	}

	// Set secure cookie
	auth.SetAuthCookie(w, tokenString)
	utils.LogSecurityEvent("LOGIN_SUCCESS", clientIP, username)

	sendJSONResponse(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Login successful",
		"user": map[string]interface{}{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
		"redirect": "/recipes",
	})
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	// Try to get user info for logging
	if user, err := auth.GetUserFromToken(r); err == nil {
		utils.LogSecurityEvent("USER_LOGOUT", clientIP, user.Username)
	} else {
		utils.LogSecurityEvent("ANONYMOUS_LOGOUT", clientIP, "")
	}

	auth.ClearAuthCookie(w)
	sendJSONResponse(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"message":  "Logged out successfully",
		"redirect": "/recipes",
	})
}

func CreateRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	err = r.ParseMultipartForm(32 << 20) // 32MB max
	if err != nil {
		utils.LogSecurityEvent("FORM_PARSE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Error parsing form")
		return
	}

	// Extract and sanitize form values
	title := strings.TrimSpace(r.FormValue("title"))
	description := strings.TrimSpace(r.FormValue("description"))
	instructions := strings.TrimSpace(r.FormValue("instructions"))
	servingUnit := strings.TrimSpace(r.FormValue("serving_unit"))

	// Comprehensive validation
	titleValidation := utils.ValidateRecipeTitle(title)
	descValidation := utils.ValidateRecipeDescription(description)
	instrValidation := utils.ValidateRecipeInstructions(instructions)
	servingUnitValidation := utils.ValidateServingUnit(servingUnit)

	if !titleValidation.Valid {
		utils.LogSecurityEvent("RECIPE_VALIDATION_FAILED", clientIP, titleValidation.Message)
		sendJSONError(w, http.StatusBadRequest, titleValidation.Message)
		return
	}

	if !descValidation.Valid {
		utils.LogSecurityEvent("RECIPE_VALIDATION_FAILED", clientIP, descValidation.Message)
		sendJSONError(w, http.StatusBadRequest, descValidation.Message)
		return
	}

	if !instrValidation.Valid {
		utils.LogSecurityEvent("RECIPE_VALIDATION_FAILED", clientIP, instrValidation.Message)
		sendJSONError(w, http.StatusBadRequest, instrValidation.Message)
		return
	}

	if !servingUnitValidation.Valid {
		utils.LogSecurityEvent("RECIPE_VALIDATION_FAILED", clientIP, servingUnitValidation.Message)
		sendJSONError(w, http.StatusBadRequest, servingUnitValidation.Message)
		return
	}

	// Validate numeric inputs
	prepTime, _ := strconv.Atoi(r.FormValue("prep_time"))
	cookTime, _ := strconv.Atoi(r.FormValue("cook_time"))
	servings, _ := strconv.Atoi(r.FormValue("servings"))

	prepTimeValidation := utils.ValidateNumericInput(prepTime, 0, 1440, "Prep time")
	cookTimeValidation := utils.ValidateNumericInput(cookTime, 0, 1440, "Cook time")
	servingsValidation := utils.ValidateNumericInput(servings, 1, 100, "Servings")

	if !prepTimeValidation.Valid {
		sendJSONError(w, http.StatusBadRequest, prepTimeValidation.Message)
		return
	}

	if !cookTimeValidation.Valid {
		sendJSONError(w, http.StatusBadRequest, cookTimeValidation.Message)
		return
	}

	if !servingsValidation.Valid {
		sendJSONError(w, http.StatusBadRequest, servingsValidation.Message)
		return
	}

	if servingUnit == "" {
		servingUnit = "people"
	}

	// Use secure database function
	recipeID, err := database.CreateRecipeSecure(title, description, instructions, prepTime, cookTime, servings, servingUnit, user.ID)
	if err != nil {
		utils.LogSecurityEvent("RECIPE_INSERT_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Error creating recipe")
		return
	}

	// Handle tags with validation
	selectedTags := r.Form["tags"]
	for _, tagIDStr := range selectedTags {
		if tagID, err := strconv.Atoi(tagIDStr); err == nil && utils.IsValidID(tagID) {
			database.DB.Exec("INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)", recipeID, tagID)
		} else {
			utils.LogSecurityEvent("INVALID_TAG_ID", clientIP, tagIDStr)
		}
	}

	// Handle file uploads with comprehensive validation
	if r.MultipartForm != nil && r.MultipartForm.File != nil {
		files := r.MultipartForm.File["recipe_images"]
		for i, fileHeader := range files {
			// Validate file thoroughly
			fileValidation := utils.ValidateFileUpload(fileHeader.Filename, fileHeader.Size)
			if !fileValidation.Valid {
				utils.LogSecurityEvent("FILE_UPLOAD_REJECTED", clientIP, fmt.Sprintf("%s: %s", fileValidation.Message, fileHeader.Filename))
				continue
			}

			file, err := fileHeader.Open()
			if err != nil {
				utils.LogSecurityEvent("FILE_OPEN_ERROR", clientIP, err.Error())
				continue
			}
			defer file.Close()

			filename, err := utils.SaveUploadedFile(file, fileHeader)
			if err != nil {
				utils.LogSecurityEvent("FILE_SAVE_ERROR", clientIP, err.Error())
				continue
			}

			// Sanitize caption
			caption := ""
			captions := r.Form["image_captions"]
			if i < len(captions) {
				caption = utils.SanitizeInput(captions[i])
				if len(caption) > 200 {
					caption = caption[:200]
				}
			}

			_, err = database.DB.Exec("INSERT INTO recipe_images (recipe_id, filename, caption, display_order) VALUES (?, ?, ?, ?)",
				recipeID, filename, caption, i)
			if err != nil {
				utils.LogSecurityEvent("IMAGE_DB_INSERT_ERROR", clientIP, err.Error())
			}
		}
	}

	// Handle ingredients with thorough validation
	r.ParseForm()
	for key, values := range r.PostForm {
		if strings.HasPrefix(key, "ingredient_") && len(values) > 0 && values[0] != "" {
			idx := strings.TrimPrefix(key, "ingredient_")
			quantityKey := "quantity_" + idx
			unitKey := "unit_" + idx

			if quantities, ok := r.PostForm[quantityKey]; ok && len(quantities) > 0 {
				if units, ok := r.PostForm[unitKey]; ok && len(units) > 0 {
					ingredientID, err := strconv.Atoi(values[0])
					if err != nil || !utils.IsValidID(ingredientID) {
						utils.LogSecurityEvent("INVALID_INGREDIENT_ID", clientIP, values[0])
						continue
					}

					quantity, err := strconv.ParseFloat(quantities[0], 64)
					if err != nil {
						utils.LogSecurityEvent("INVALID_QUANTITY", clientIP, quantities[0])
						continue
					}

					unit := strings.TrimSpace(units[0])

					// Validate ingredient data
					quantityValidation := utils.ValidateQuantity(quantity)
					unitValidation := utils.ValidateUnit(unit)

					if !quantityValidation.Valid || !unitValidation.Valid {
						utils.LogSecurityEvent("INGREDIENT_VALIDATION_FAILED", clientIP,
							fmt.Sprintf("ID:%d, Qty:%f, Unit:%s", ingredientID, quantity, unit))
						continue
					}

					database.DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
						recipeID, ingredientID, quantity, unit)
				}
			}
		}
	}

	utils.LogSecurityEvent("RECIPE_CREATED", clientIP, fmt.Sprintf("RecipeID:%d, Title:%s, User:%s", recipeID, title, user.Username))

	sendJSONResponse(w, http.StatusCreated, map[string]interface{}{
		"success":   true,
		"message":   "Recipe created successfully",
		"recipe_id": recipeID,
		"redirect":  fmt.Sprintf("/recipe/%d", recipeID),
	})
}

func HandleEditRecipeSubmission(w http.ResponseWriter, r *http.Request, user *models.User, recipeID int) {
	clientIP := getClientIP(r)

	// Verify ownership using secure function
	owns, err := database.UserOwnsRecipe(recipeID, user.ID)
	if err != nil || !owns {
		utils.LogSecurityEvent("UNAUTHORIZED_RECIPE_EDIT_ATTEMPT", clientIP, fmt.Sprintf("UserID: %d, RecipeID: %d", user.ID, recipeID))
		sendJSONError(w, http.StatusForbidden, "Access denied")
		return
	}

	err = r.ParseMultipartForm(32 << 20) // 32MB max
	if err != nil {
		utils.LogSecurityEvent("EDIT_FORM_PARSE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Error parsing form")
		return
	}

	// Extract and validate form data (same validation as create)
	title := strings.TrimSpace(r.FormValue("title"))
	description := strings.TrimSpace(r.FormValue("description"))
	instructions := strings.TrimSpace(r.FormValue("instructions"))
	servingUnit := strings.TrimSpace(r.FormValue("serving_unit"))

	// Comprehensive validation
	titleValidation := utils.ValidateRecipeTitle(title)
	descValidation := utils.ValidateRecipeDescription(description)
	instrValidation := utils.ValidateRecipeInstructions(instructions)
	servingUnitValidation := utils.ValidateServingUnit(servingUnit)

	if !titleValidation.Valid {
		utils.LogSecurityEvent("RECIPE_EDIT_VALIDATION_FAILED", clientIP, titleValidation.Message)
		sendJSONError(w, http.StatusBadRequest, titleValidation.Message)
		return
	}

	if !descValidation.Valid {
		utils.LogSecurityEvent("RECIPE_EDIT_VALIDATION_FAILED", clientIP, descValidation.Message)
		sendJSONError(w, http.StatusBadRequest, descValidation.Message)
		return
	}

	if !instrValidation.Valid {
		utils.LogSecurityEvent("RECIPE_EDIT_VALIDATION_FAILED", clientIP, instrValidation.Message)
		sendJSONError(w, http.StatusBadRequest, instrValidation.Message)
		return
	}

	if !servingUnitValidation.Valid {
		utils.LogSecurityEvent("RECIPE_EDIT_VALIDATION_FAILED", clientIP, servingUnitValidation.Message)
		sendJSONError(w, http.StatusBadRequest, servingUnitValidation.Message)
		return
	}

	// Validate numeric inputs
	prepTime, _ := strconv.Atoi(r.FormValue("prep_time"))
	cookTime, _ := strconv.Atoi(r.FormValue("cook_time"))
	servings, _ := strconv.Atoi(r.FormValue("servings"))

	prepTimeValidation := utils.ValidateNumericInput(prepTime, 0, 1440, "Prep time")
	cookTimeValidation := utils.ValidateNumericInput(cookTime, 0, 1440, "Cook time")
	servingsValidation := utils.ValidateNumericInput(servings, 1, 100, "Servings")

	if !prepTimeValidation.Valid {
		sendJSONError(w, http.StatusBadRequest, prepTimeValidation.Message)
		return
	}

	if !cookTimeValidation.Valid {
		sendJSONError(w, http.StatusBadRequest, cookTimeValidation.Message)
		return
	}

	if !servingsValidation.Valid {
		sendJSONError(w, http.StatusBadRequest, servingsValidation.Message)
		return
	}

	if servingUnit == "" {
		servingUnit = "people"
	}

	// Update recipe using prepared statement
	_, err = database.DB.Exec(`
		UPDATE recipes SET title = ?, description = ?, instructions = ?, 
		prep_time = ?, cook_time = ?, servings = ?, serving_unit = ? WHERE id = ? AND created_by = ?
	`, title, description, instructions, prepTime, cookTime, servings, servingUnit, recipeID, user.ID)

	if err != nil {
		utils.LogSecurityEvent("RECIPE_UPDATE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Error updating recipe")
		return
	}

	// Update tags with validation
	database.DB.Exec("DELETE FROM recipe_tags WHERE recipe_id = ?", recipeID)
	selectedTags := r.Form["tags"]
	for _, tagIDStr := range selectedTags {
		if tagID, err := strconv.Atoi(tagIDStr); err == nil && utils.IsValidID(tagID) {
			database.DB.Exec("INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)", recipeID, tagID)
		} else {
			utils.LogSecurityEvent("INVALID_TAG_ID_EDIT", clientIP, tagIDStr)
		}
	}

	// Handle new image uploads with validation
	if r.MultipartForm != nil && r.MultipartForm.File != nil {
		files := r.MultipartForm.File["recipe_images"]
		for i, fileHeader := range files {
			// Validate file
			fileValidation := utils.ValidateFileUpload(fileHeader.Filename, fileHeader.Size)
			if !fileValidation.Valid {
				utils.LogSecurityEvent("FILE_UPLOAD_REJECTED_EDIT", clientIP, fmt.Sprintf("%s: %s", fileValidation.Message, fileHeader.Filename))
				continue
			}

			file, err := fileHeader.Open()
			if err != nil {
				utils.LogSecurityEvent("FILE_OPEN_ERROR_EDIT", clientIP, err.Error())
				continue
			}
			defer file.Close()

			filename, err := utils.SaveUploadedFile(file, fileHeader)
			if err != nil {
				utils.LogSecurityEvent("FILE_SAVE_ERROR_EDIT", clientIP, err.Error())
				continue
			}

			// Sanitize caption
			caption := ""
			captions := r.Form["image_captions"]
			if i < len(captions) {
				caption = utils.SanitizeInput(captions[i])
				if len(caption) > 200 {
					caption = caption[:200]
				}
			}

			var maxOrder int
			database.DB.QueryRow("SELECT COALESCE(MAX(display_order), -1) FROM recipe_images WHERE recipe_id = ?", recipeID).Scan(&maxOrder)

			_, err = database.DB.Exec("INSERT INTO recipe_images (recipe_id, filename, caption, display_order) VALUES (?, ?, ?, ?)",
				recipeID, filename, caption, maxOrder+1)
			if err != nil {
				utils.LogSecurityEvent("IMAGE_DB_INSERT_ERROR_EDIT", clientIP, err.Error())
			}
		}
	}

	// Update ingredients with validation
	database.DB.Exec("DELETE FROM recipe_ingredients WHERE recipe_id = ?", recipeID)
	r.ParseForm()
	for key, values := range r.PostForm {
		if strings.HasPrefix(key, "ingredient_") && len(values) > 0 && values[0] != "" {
			idx := strings.TrimPrefix(key, "ingredient_")
			quantityKey := "quantity_" + idx
			unitKey := "unit_" + idx

			if quantities, ok := r.PostForm[quantityKey]; ok && len(quantities) > 0 {
				if units, ok := r.PostForm[unitKey]; ok && len(units) > 0 {
					ingredientID, err := strconv.Atoi(values[0])
					if err != nil || !utils.IsValidID(ingredientID) {
						utils.LogSecurityEvent("INVALID_INGREDIENT_ID_EDIT", clientIP, values[0])
						continue
					}

					quantity, err := strconv.ParseFloat(quantities[0], 64)
					if err != nil {
						utils.LogSecurityEvent("INVALID_QUANTITY_EDIT", clientIP, quantities[0])
						continue
					}

					unit := strings.TrimSpace(units[0])

					// Validate ingredient data
					quantityValidation := utils.ValidateQuantity(quantity)
					unitValidation := utils.ValidateUnit(unit)

					if !quantityValidation.Valid || !unitValidation.Valid {
						utils.LogSecurityEvent("INGREDIENT_VALIDATION_FAILED_EDIT", clientIP,
							fmt.Sprintf("ID:%d, Qty:%f, Unit:%s", ingredientID, quantity, unit))
						continue
					}

					database.DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
						recipeID, ingredientID, quantity, unit)
				}
			}
		}
	}

	utils.LogSecurityEvent("RECIPE_UPDATED", clientIP, fmt.Sprintf("RecipeID:%d, Title:%s, User:%s", recipeID, title, user.Username))

	sendJSONResponse(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"message":  "Recipe updated successfully",
		"redirect": fmt.Sprintf("/recipe/%d", recipeID),
	})
}

func UpdateRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	// Extract ID from URL path with validation
	path := strings.TrimPrefix(r.URL.Path, "/api/recipes/")
	id, err := strconv.Atoi(path)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_RECIPE_ID_API", clientIP, path)
		sendJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	// Verify ownership
	owns, err := database.UserOwnsRecipe(id, user.ID)
	if err != nil || !owns {
		utils.LogSecurityEvent("UNAUTHORIZED_RECIPE_UPDATE_API", clientIP, fmt.Sprintf("UserID: %d, RecipeID: %d", user.ID, id))
		sendJSONError(w, http.StatusForbidden, "Access denied")
		return
	}

	var recipe models.Recipe
	if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_RECIPE_UPDATE", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	// Validate recipe data
	titleValidation := utils.ValidateRecipeTitle(recipe.Title)
	descValidation := utils.ValidateRecipeDescription(recipe.Description)
	instrValidation := utils.ValidateRecipeInstructions(recipe.Instructions)
	servingUnitValidation := utils.ValidateServingUnit(recipe.ServingUnit)

	if !titleValidation.Valid {
		utils.LogSecurityEvent("INVALID_RECIPE_TITLE_API", clientIP, recipe.Title)
		sendJSONError(w, http.StatusBadRequest, titleValidation.Message)
		return
	}

	if !descValidation.Valid {
		utils.LogSecurityEvent("INVALID_RECIPE_DESC_API", clientIP, recipe.Description)
		sendJSONError(w, http.StatusBadRequest, descValidation.Message)
		return
	}

	if !instrValidation.Valid {
		utils.LogSecurityEvent("INVALID_RECIPE_INSTR_API", clientIP, recipe.Instructions)
		sendJSONError(w, http.StatusBadRequest, instrValidation.Message)
		return
	}

	if !servingUnitValidation.Valid {
		utils.LogSecurityEvent("INVALID_SERVING_UNIT_API", clientIP, recipe.ServingUnit)
		sendJSONError(w, http.StatusBadRequest, servingUnitValidation.Message)
		return
	}

	// Validate numeric fields
	prepTimeValidation := utils.ValidateNumericInput(recipe.PrepTime, 0, 1440, "Prep time")
	cookTimeValidation := utils.ValidateNumericInput(recipe.CookTime, 0, 1440, "Cook time")
	servingsValidation := utils.ValidateNumericInput(recipe.Servings, 1, 100, "Servings")

	if !prepTimeValidation.Valid {
		utils.LogSecurityEvent("INVALID_RECIPE_NUMERIC_API", clientIP, prepTimeValidation.Message)
		sendJSONError(w, http.StatusBadRequest, prepTimeValidation.Message)
		return
	}

	if !cookTimeValidation.Valid {
		utils.LogSecurityEvent("INVALID_RECIPE_NUMERIC_API", clientIP, cookTimeValidation.Message)
		sendJSONError(w, http.StatusBadRequest, cookTimeValidation.Message)
		return
	}

	if !servingsValidation.Valid {
		utils.LogSecurityEvent("INVALID_RECIPE_NUMERIC_API", clientIP, servingsValidation.Message)
		sendJSONError(w, http.StatusBadRequest, servingsValidation.Message)
		return
	}

	// Update recipe
	_, err = database.DB.Exec(`
		UPDATE recipes SET title = ?, description = ?, instructions = ?, 
		prep_time = ?, cook_time = ?, servings = ?, serving_unit = ? WHERE id = ? AND created_by = ?
	`, recipe.Title, recipe.Description, recipe.Instructions,
		recipe.PrepTime, recipe.CookTime, recipe.Servings, recipe.ServingUnit, id, user.ID)

	if err != nil {
		utils.LogSecurityEvent("RECIPE_UPDATE_API_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Failed to update recipe")
		return
	}

	// Update ingredients with validation
	database.DB.Exec("DELETE FROM recipe_ingredients WHERE recipe_id = ?", id)
	for _, ing := range recipe.Ingredients {
		if !utils.IsValidID(ing.IngredientID) {
			utils.LogSecurityEvent("INVALID_INGREDIENT_ID_API", clientIP, fmt.Sprintf("ID: %d", ing.IngredientID))
			continue
		}

		quantityValidation := utils.ValidateQuantity(ing.Quantity)
		unitValidation := utils.ValidateUnit(ing.Unit)

		if !quantityValidation.Valid || !unitValidation.Valid {
			utils.LogSecurityEvent("INVALID_INGREDIENT_DATA_API", clientIP, fmt.Sprintf("ID:%d, Qty:%f, Unit:%s", ing.IngredientID, ing.Quantity, ing.Unit))
			continue
		}

		database.DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
			id, ing.IngredientID, ing.Quantity, ing.Unit)
	}

	utils.LogSecurityEvent("RECIPE_UPDATED_API", clientIP, fmt.Sprintf("RecipeID:%d, User:%s", id, user.Username))
	sendJSONSuccess(w, "Recipe updated successfully", nil)
}

func DeleteRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	// Extract ID from URL path with validation
	path := strings.TrimPrefix(r.URL.Path, "/api/recipes/")
	id, err := strconv.Atoi(path)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_RECIPE_ID_DELETE", clientIP, path)
		sendJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	// Get recipe images for cleanup (before deletion)
	images := database.GetRecipeImages(id)

	// Use secure delete function
	err = database.DeleteRecipeSecure(id, user.ID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "access denied") {
			utils.LogSecurityEvent("UNAUTHORIZED_RECIPE_DELETE", clientIP, fmt.Sprintf("UserID: %d, RecipeID: %d", user.ID, id))
			sendJSONError(w, http.StatusForbidden, "Recipe not found or access denied")
		} else {
			utils.LogSecurityEvent("RECIPE_DELETE_ERROR", clientIP, err.Error())
			sendJSONError(w, http.StatusInternalServerError, "Failed to delete recipe")
		}
		return
	}

	// Clean up image files
	for _, img := range images {
		imagePath := filepath.Join("uploads", img.Filename)
		if err := os.Remove(imagePath); err != nil {
			utils.LogSecurityEvent("IMAGE_CLEANUP_ERROR", clientIP, fmt.Sprintf("File: %s, Error: %v", imagePath, err))
		}
	}

	utils.LogSecurityEvent("RECIPE_DELETED", clientIP, fmt.Sprintf("RecipeID:%d, User:%s", id, user.Username))
	sendJSONSuccess(w, "Recipe deleted successfully", nil)
}

func CreateIngredientHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)
	name := strings.TrimSpace(r.FormValue("name"))

	// Validate ingredient name
	nameValidation := utils.ValidateIngredientName(name)
	if !nameValidation.Valid {
		utils.LogSecurityEvent("INGREDIENT_VALIDATION_FAILED", clientIP, fmt.Sprintf("Name: %s, Error: %s", name, nameValidation.Message))
		sendJSONError(w, http.StatusBadRequest, nameValidation.Message)
		return
	}

	// Use secure database function
	err = database.CreateIngredientSecure(name)
	if err != nil {
		utils.LogSecurityEvent("INGREDIENT_INSERT_ERROR", clientIP, fmt.Sprintf("Name: %s, Error: %v", name, err))
		sendJSONError(w, http.StatusConflict, "Ingredient already exists or database error")
		return
	}

	utils.LogSecurityEvent("INGREDIENT_CREATED", clientIP, fmt.Sprintf("Name: %s, User: %s", name, user.Username))

	sendJSONResponse(w, http.StatusCreated, map[string]interface{}{
		"success":  true,
		"message":  "Ingredient created successfully",
		"name":     name,
		"redirect": "/ingredients",
	})
}

func DeleteIngredientHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	// Extract ID from URL path with validation
	path := strings.TrimPrefix(r.URL.Path, "/api/ingredients/")
	id, err := strconv.Atoi(path)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_INGREDIENT_ID_DELETE", clientIP, path)
		sendJSONError(w, http.StatusBadRequest, "Invalid ingredient ID")
		return
	}

	// Get ingredient name for logging
	var ingredientName string
	database.DB.QueryRow("SELECT name FROM ingredients WHERE id = ?", id).Scan(&ingredientName)

	// Use secure delete function
	err = database.DeleteIngredientSecure(id)
	if err != nil {
		if strings.Contains(err.Error(), "used in") {
			// Parse the error to get recipe count and names
			var recipeCount int
			database.DB.QueryRow("SELECT COUNT(*) FROM recipe_ingredients WHERE ingredient_id = ?", id).Scan(&recipeCount)

			rows, err := database.DB.Query(`
				SELECT r.title 
				FROM recipes r 
				JOIN recipe_ingredients ri ON r.id = ri.recipe_id 
				WHERE ri.ingredient_id = ? 
				LIMIT 3
			`, id)

			var recipeNames []string
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var title string
					if rows.Scan(&title) == nil {
						recipeNames = append(recipeNames, title)
					}
				}
			}

			errorMsg := fmt.Sprintf("Cannot delete %s because it is used in %d recipe(s)", ingredientName, recipeCount)
			if len(recipeNames) > 0 {
				errorMsg += fmt.Sprintf(": %s", strings.Join(recipeNames, ", "))
				if recipeCount > len(recipeNames) {
					errorMsg += fmt.Sprintf(" and %d more", recipeCount-len(recipeNames))
				}
			}

			utils.LogSecurityEvent("INGREDIENT_DELETE_BLOCKED", clientIP, fmt.Sprintf("Name: %s, UsedIn: %d recipes", ingredientName, recipeCount))

			sendJSONResponse(w, http.StatusConflict, map[string]interface{}{
				"error":         errorMsg,
				"usedInRecipes": true,
				"recipeCount":   recipeCount,
				"recipeNames":   recipeNames,
			})
			return
		} else {
			utils.LogSecurityEvent("INGREDIENT_DELETE_ERROR", clientIP, err.Error())
			sendJSONError(w, http.StatusInternalServerError, "Failed to delete ingredient")
			return
		}
	}

	utils.LogSecurityEvent("INGREDIENT_DELETED", clientIP, fmt.Sprintf("ID: %d, Name: %s, User: %s", id, ingredientName, user.Username))
	sendJSONSuccess(w, "Ingredient deleted successfully", nil)
}

func CreateTagHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)
	name := strings.TrimSpace(r.FormValue("name"))
	color := strings.TrimSpace(r.FormValue("color"))

	if color == "" {
		color = "#ff6b6b" // default color
	}

	// Validate tag name
	nameValidation := utils.ValidateTagName(name)
	if !nameValidation.Valid {
		utils.LogSecurityEvent("TAG_VALIDATION_FAILED", clientIP, fmt.Sprintf("Name: %s, Error: %s", name, nameValidation.Message))
		sendJSONError(w, http.StatusBadRequest, nameValidation.Message)
		return
	}

	// Basic color validation (hex color)
	if !strings.HasPrefix(color, "#") || len(color) != 7 {
		color = "#ff6b6b"
	}

	// Use secure database function
	err = database.CreateTagSecure(name, color)
	if err != nil {
		utils.LogSecurityEvent("TAG_INSERT_ERROR", clientIP, fmt.Sprintf("Name: %s, Error: %v", name, err))
		sendJSONError(w, http.StatusConflict, "Tag already exists or database error")
		return
	}

	utils.LogSecurityEvent("TAG_CREATED", clientIP, fmt.Sprintf("Name: %s, Color: %s, User: %s", name, color, user.Username))

	sendJSONResponse(w, http.StatusCreated, map[string]interface{}{
		"success":  true,
		"message":  "Tag created successfully",
		"name":     name,
		"color":    color,
		"redirect": "/tags",
	})
}

func DeleteTagHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	// Extract ID from URL path with validation
	path := strings.TrimPrefix(r.URL.Path, "/api/tags/")
	id, err := strconv.Atoi(path)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_TAG_ID_DELETE", clientIP, path)
		sendJSONError(w, http.StatusBadRequest, "Invalid tag ID")
		return
	}

	// Get tag name for logging
	var tagName string
	database.DB.QueryRow("SELECT name FROM tags WHERE id = ?", id).Scan(&tagName)

	// Delete tag (cascading deletes will handle recipe_tags)
	_, err = database.DB.Exec("DELETE FROM tags WHERE id = ?", id)
	if err != nil {
		utils.LogSecurityEvent("TAG_DELETE_ERROR", clientIP, fmt.Sprintf("ID: %d, Error: %v", id, err))
		sendJSONError(w, http.StatusInternalServerError, "Failed to delete tag")
		return
	}

	utils.LogSecurityEvent("TAG_DELETED", clientIP, fmt.Sprintf("ID: %d, Name: %s, User: %s", id, tagName, user.Username))
	sendJSONSuccess(w, "Tag deleted successfully", nil)
}

func DeleteImageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	// Extract ID from URL path with validation
	path := strings.TrimPrefix(r.URL.Path, "/api/images/")
	imageID, err := strconv.Atoi(path)
	if err != nil || !utils.IsValidID(imageID) {
		utils.LogSecurityEvent("INVALID_IMAGE_ID_DELETE", clientIP, path)
		sendJSONError(w, http.StatusBadRequest, "Invalid image ID")
		return
	}

	// Check if user owns the recipe containing this image
	var recipeID, createdBy int
	var filename string
	err = database.DB.QueryRow(`
		SELECT ri.recipe_id, r.created_by, ri.filename 
		FROM recipe_images ri 
		JOIN recipes r ON ri.recipe_id = r.id 
		WHERE ri.id = ?
	`, imageID).Scan(&recipeID, &createdBy, &filename)

	if err != nil {
		utils.LogSecurityEvent("IMAGE_NOT_FOUND", clientIP, fmt.Sprintf("ImageID: %d", imageID))
		sendJSONError(w, http.StatusNotFound, "Image not found")
		return
	}

	if createdBy != user.ID {
		utils.LogSecurityEvent("UNAUTHORIZED_IMAGE_DELETE", clientIP, fmt.Sprintf("UserID: %d, ImageID: %d, Owner: %d", user.ID, imageID, createdBy))
		sendJSONError(w, http.StatusForbidden, "Access denied")
		return
	}

	// Delete file from filesystem
	imagePath := filepath.Join("uploads", filename)
	if err := os.Remove(imagePath); err != nil {
		utils.LogSecurityEvent("IMAGE_FILE_DELETE_ERROR", clientIP, fmt.Sprintf("File: %s, Error: %v", imagePath, err))
		// Continue with database deletion even if file deletion fails
	}

	// Delete from database
	_, err = database.DB.Exec("DELETE FROM recipe_images WHERE id = ?", imageID)
	if err != nil {
		utils.LogSecurityEvent("IMAGE_DB_DELETE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Failed to delete image")
		return
	}

	utils.LogSecurityEvent("IMAGE_DELETED", clientIP, fmt.Sprintf("ImageID: %d, Filename: %s, User: %s", imageID, filename, user.Username))
	sendJSONSuccess(w, "Image deleted successfully", nil)
}

func SearchHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)
	query := strings.TrimSpace(r.URL.Query().Get("q"))

	// Validate search query
	searchValidation := utils.ValidateSearchQuery(query)
	if !searchValidation.Valid {
		utils.LogSecurityEvent("SEARCH_VALIDATION_FAILED", clientIP, fmt.Sprintf("Query: %s, Error: %s", query, searchValidation.Message))
		sendJSONError(w, http.StatusBadRequest, searchValidation.Message)
		return
	}

	if query == "" {
		sendJSONError(w, http.StatusBadRequest, "Search query is required")
		return
	}

	// Use secure search function
	recipes, err := database.SearchRecipes(query)
	if err != nil {
		utils.LogSecurityEvent("SEARCH_ERROR", clientIP, fmt.Sprintf("Query: %s, Error: %v", query, err))
		sendJSONError(w, http.StatusInternalServerError, "Search failed")
		return
	}

	utils.LogSecurityEvent("SEARCH_PERFORMED", clientIP, fmt.Sprintf("Query: %s, Results: %d", query, len(recipes)))

	sendJSONResponse(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"query":   query,
		"results": recipes,
		"count":   len(recipes),
	})
}
