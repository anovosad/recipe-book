package handlers

import (
	"encoding/json"
	"fmt"
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

// JSON request structures
type RegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type RecipeRequest struct {
	Title        string                `json:"title"`
	Description  string                `json:"description"`
	Instructions string                `json:"instructions"`
	PrepTime     int                   `json:"prep_time"`
	CookTime     int                   `json:"cook_time"`
	Servings     int                   `json:"servings"`
	ServingUnit  string                `json:"serving_unit"`
	Ingredients  []RecipeIngredientReq `json:"ingredients"`
	Tags         []int                 `json:"tags"`
}

type RecipeIngredientReq struct {
	IngredientID int     `json:"ingredient_id"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
}

type IngredientRequest struct {
	Name string `json:"name"`
}

type TagRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// API Handlers (now using JSON input)

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_REGISTER", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	// Trim whitespace
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)

	// Comprehensive input validation
	usernameValidation := utils.ValidateUsername(req.Username)
	emailValidation := utils.ValidateEmail(req.Email)
	passwordValidation := utils.ValidatePassword(req.Password)

	if !usernameValidation.Valid {
		utils.LogSecurityEvent("INVALID_REGISTRATION_USERNAME", clientIP, req.Username)
		sendJSONError(w, http.StatusBadRequest, usernameValidation.Message)
		return
	}

	if !emailValidation.Valid {
		utils.LogSecurityEvent("INVALID_REGISTRATION_EMAIL", clientIP, req.Email)
		sendJSONError(w, http.StatusBadRequest, emailValidation.Message)
		return
	}

	if !passwordValidation.Valid {
		sendJSONError(w, http.StatusBadRequest, passwordValidation.Message)
		return
	}

	// Hash password securely
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		utils.LogSecurityEvent("PASSWORD_HASH_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Error processing password")
		return
	}

	// Use secure database function
	err = database.CreateUserSecure(req.Username, req.Email, string(hashedPassword))
	if err != nil {
		utils.LogSecurityEvent("REGISTRATION_FAILED", clientIP, fmt.Sprintf("Username: %s, Email: %s, Error: %v", req.Username, req.Email, err))
		sendJSONError(w, http.StatusConflict, "Username or email already exists")
		return
	}

	utils.LogSecurityEvent("USER_REGISTERED", clientIP, fmt.Sprintf("Username: %s, Email: %s", req.Username, req.Email))
	sendJSONSuccess(w, "Registration successful! Please log in.", nil)
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_LOGIN", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	// Trim whitespace
	req.Username = strings.TrimSpace(req.Username)

	// Basic validation
	if req.Username == "" || req.Password == "" {
		utils.LogSecurityEvent("LOGIN_EMPTY_FIELDS", clientIP, fmt.Sprintf("Username: %s", req.Username))
		sendJSONError(w, http.StatusBadRequest, "Username and password are required")
		return
	}

	// Validate username format to prevent injection attempts
	usernameValidation := utils.ValidateUsername(req.Username)
	if !usernameValidation.Valid {
		utils.LogSecurityEvent("LOGIN_INVALID_USERNAME", clientIP, req.Username)
		sendJSONError(w, http.StatusBadRequest, "Invalid credentials")
		return
	}

	// Use secure database lookup
	user, hashedPassword, err := database.GetUserByUsernameSecure(req.Username)
	if err != nil {
		utils.LogSecurityEvent("LOGIN_USER_NOT_FOUND", clientIP, req.Username)
		sendJSONError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.Password)); err != nil {
		utils.LogSecurityEvent("LOGIN_WRONG_PASSWORD", clientIP, req.Username)
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
	utils.LogSecurityEvent("LOGIN_SUCCESS", clientIP, req.Username)

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

	var req RecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_RECIPE", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	// Trim whitespace
	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	req.Instructions = strings.TrimSpace(req.Instructions)
	req.ServingUnit = strings.TrimSpace(req.ServingUnit)

	// Comprehensive validation
	titleValidation := utils.ValidateRecipeTitle(req.Title)
	descValidation := utils.ValidateRecipeDescription(req.Description)
	instrValidation := utils.ValidateRecipeInstructions(req.Instructions)
	servingUnitValidation := utils.ValidateServingUnit(req.ServingUnit)

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
	prepTimeValidation := utils.ValidateNumericInput(req.PrepTime, 0, 1440, "Prep time")
	cookTimeValidation := utils.ValidateNumericInput(req.CookTime, 0, 1440, "Cook time")
	servingsValidation := utils.ValidateNumericInput(req.Servings, 1, 100, "Servings")

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

	if req.ServingUnit == "" {
		req.ServingUnit = "people"
	}

	// Use secure database function
	recipeID, err := database.CreateRecipeSecure(req.Title, req.Description, req.Instructions, req.PrepTime, req.CookTime, req.Servings, req.ServingUnit, user.ID)
	if err != nil {
		utils.LogSecurityEvent("RECIPE_INSERT_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Error creating recipe")
		return
	}

	// Handle tags with validation
	for _, tagID := range req.Tags {
		if utils.IsValidID(tagID) {
			database.DB.Exec("INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)", recipeID, tagID)
		} else {
			utils.LogSecurityEvent("INVALID_TAG_ID", clientIP, fmt.Sprintf("%d", tagID))
		}
	}

	// Handle ingredients with thorough validation
	for _, ingredient := range req.Ingredients {
		if !utils.IsValidID(ingredient.IngredientID) {
			utils.LogSecurityEvent("INVALID_INGREDIENT_ID", clientIP, fmt.Sprintf("%d", ingredient.IngredientID))
			continue
		}

		// Validate ingredient data
		quantityValidation := utils.ValidateQuantity(ingredient.Quantity)
		unitValidation := utils.ValidateUnit(ingredient.Unit)

		if !quantityValidation.Valid || !unitValidation.Valid {
			utils.LogSecurityEvent("INGREDIENT_VALIDATION_FAILED", clientIP,
				fmt.Sprintf("ID:%d, Qty:%f, Unit:%s", ingredient.IngredientID, ingredient.Quantity, ingredient.Unit))
			continue
		}

		database.DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
			recipeID, ingredient.IngredientID, ingredient.Quantity, ingredient.Unit)
	}

	utils.LogSecurityEvent("RECIPE_CREATED", clientIP, fmt.Sprintf("RecipeID:%d, Title:%s, User:%s", recipeID, req.Title, user.Username))

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

	var req RecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_RECIPE_EDIT", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	// Trim whitespace
	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	req.Instructions = strings.TrimSpace(req.Instructions)
	req.ServingUnit = strings.TrimSpace(req.ServingUnit)

	// Comprehensive validation (same as create)
	titleValidation := utils.ValidateRecipeTitle(req.Title)
	descValidation := utils.ValidateRecipeDescription(req.Description)
	instrValidation := utils.ValidateRecipeInstructions(req.Instructions)
	servingUnitValidation := utils.ValidateServingUnit(req.ServingUnit)

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
	prepTimeValidation := utils.ValidateNumericInput(req.PrepTime, 0, 1440, "Prep time")
	cookTimeValidation := utils.ValidateNumericInput(req.CookTime, 0, 1440, "Cook time")
	servingsValidation := utils.ValidateNumericInput(req.Servings, 1, 100, "Servings")

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

	if req.ServingUnit == "" {
		req.ServingUnit = "people"
	}

	// Update recipe using prepared statement
	_, err = database.DB.Exec(`
		UPDATE recipes SET title = ?, description = ?, instructions = ?, 
		prep_time = ?, cook_time = ?, servings = ?, serving_unit = ? WHERE id = ? AND created_by = ?
	`, req.Title, req.Description, req.Instructions, req.PrepTime, req.CookTime, req.Servings, req.ServingUnit, recipeID, user.ID)

	if err != nil {
		utils.LogSecurityEvent("RECIPE_UPDATE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Error updating recipe")
		return
	}

	// Update tags with validation
	database.DB.Exec("DELETE FROM recipe_tags WHERE recipe_id = ?", recipeID)
	for _, tagID := range req.Tags {
		if utils.IsValidID(tagID) {
			database.DB.Exec("INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)", recipeID, tagID)
		} else {
			utils.LogSecurityEvent("INVALID_TAG_ID_EDIT", clientIP, fmt.Sprintf("%d", tagID))
		}
	}

	// Update ingredients with validation
	database.DB.Exec("DELETE FROM recipe_ingredients WHERE recipe_id = ?", recipeID)
	for _, ingredient := range req.Ingredients {
		if !utils.IsValidID(ingredient.IngredientID) {
			utils.LogSecurityEvent("INVALID_INGREDIENT_ID_EDIT", clientIP, fmt.Sprintf("%d", ingredient.IngredientID))
			continue
		}

		// Validate ingredient data
		quantityValidation := utils.ValidateQuantity(ingredient.Quantity)
		unitValidation := utils.ValidateUnit(ingredient.Unit)

		if !quantityValidation.Valid || !unitValidation.Valid {
			utils.LogSecurityEvent("INGREDIENT_VALIDATION_FAILED_EDIT", clientIP,
				fmt.Sprintf("ID:%d, Qty:%f, Unit:%s", ingredient.IngredientID, ingredient.Quantity, ingredient.Unit))
			continue
		}

		database.DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
			recipeID, ingredient.IngredientID, ingredient.Quantity, ingredient.Unit)
	}

	utils.LogSecurityEvent("RECIPE_UPDATED", clientIP, fmt.Sprintf("RecipeID:%d, Title:%s, User:%s", recipeID, req.Title, user.Username))

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

	var req IngredientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_INGREDIENT", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	req.Name = strings.TrimSpace(req.Name)

	// Validate ingredient name
	nameValidation := utils.ValidateIngredientName(req.Name)
	if !nameValidation.Valid {
		utils.LogSecurityEvent("INGREDIENT_VALIDATION_FAILED", clientIP, fmt.Sprintf("Name: %s, Error: %s", req.Name, nameValidation.Message))
		sendJSONError(w, http.StatusBadRequest, nameValidation.Message)
		return
	}

	// Use secure database function
	err = database.CreateIngredientSecure(req.Name)
	if err != nil {
		utils.LogSecurityEvent("INGREDIENT_INSERT_ERROR", clientIP, fmt.Sprintf("Name: %s, Error: %v", req.Name, err))
		sendJSONError(w, http.StatusConflict, "Ingredient already exists or database error")
		return
	}

	utils.LogSecurityEvent("INGREDIENT_CREATED", clientIP, fmt.Sprintf("Name: %s, User: %s", req.Name, user.Username))

	sendJSONResponse(w, http.StatusCreated, map[string]interface{}{
		"success":  true,
		"message":  "Ingredient created successfully",
		"name":     req.Name,
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

	var req TagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_TAG", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Color = strings.TrimSpace(req.Color)

	if req.Color == "" {
		req.Color = "#ff6b6b" // default color
	}

	// Validate tag name
	nameValidation := utils.ValidateTagName(req.Name)
	if !nameValidation.Valid {
		utils.LogSecurityEvent("TAG_VALIDATION_FAILED", clientIP, fmt.Sprintf("Name: %s, Error: %s", req.Name, nameValidation.Message))
		sendJSONError(w, http.StatusBadRequest, nameValidation.Message)
		return
	}

	// Basic color validation (hex color)
	if !strings.HasPrefix(req.Color, "#") || len(req.Color) != 7 {
		req.Color = "#ff6b6b"
	}

	// Use secure database function
	err = database.CreateTagSecure(req.Name, req.Color)
	if err != nil {
		utils.LogSecurityEvent("TAG_INSERT_ERROR", clientIP, fmt.Sprintf("Name: %s, Error: %v", req.Name, err))
		sendJSONError(w, http.StatusConflict, "Tag already exists or database error")
		return
	}

	utils.LogSecurityEvent("TAG_CREATED", clientIP, fmt.Sprintf("Name: %s, Color: %s, User: %s", req.Name, req.Color, user.Username))

	sendJSONResponse(w, http.StatusCreated, map[string]interface{}{
		"success":  true,
		"message":  "Tag created successfully",
		"name":     req.Name,
		"color":    req.Color,
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

// Add these handlers to handlers/api.go

// CheckAuthHandler verifies if user is authenticated
func CheckAuthHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	sendJSONResponse(w, http.StatusOK, map[string]interface{}{
		"id":       user.ID,
		"username": user.Username,
		"email":    user.Email,
	})
}

// GetRecipesHandler returns all recipes
func GetRecipesHandler(w http.ResponseWriter, r *http.Request) {
	recipes, err := database.GetAllRecipes()
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Failed to fetch recipes")
		return
	}

	sendJSONResponse(w, http.StatusOK, recipes)
}

// GetRecipeHandler returns a single recipe by ID
func GetRecipeHandler(w http.ResponseWriter, r *http.Request) {
	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/recipes/")
	id, err := strconv.Atoi(path)
	if err != nil || !utils.IsValidID(id) {
		sendJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	recipe, err := database.GetRecipeByIDSecure(id)
	if err != nil {
		sendJSONError(w, http.StatusNotFound, "Recipe not found")
		return
	}

	sendJSONResponse(w, http.StatusOK, recipe)
}

// GetIngredientsHandler returns all ingredients
func GetIngredientsHandler(w http.ResponseWriter, r *http.Request) {
	ingredients, err := database.GetAllIngredients()
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Failed to fetch ingredients")
		return
	}

	sendJSONResponse(w, http.StatusOK, ingredients)
}

// GetTagsHandler returns all tags
func GetTagsHandler(w http.ResponseWriter, r *http.Request) {
	tags, err := database.GetAllTags()
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Failed to fetch tags")
		return
	}

	sendJSONResponse(w, http.StatusOK, tags)
}
