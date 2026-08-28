package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"recipe-book/auth"
	"recipe-book/database"
	"recipe-book/models"
	"recipe-book/utils"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
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

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type RecipeRequest struct {
	// Texts is the recipe's words keyed by language, and is what a current
	// client sends. The three flat fields below are the older single-language
	// shape, still accepted so that a write from anything that predates
	// translations lands in the language it says it is in rather than being
	// rejected.
	Texts        map[string]models.RecipeText `json:"texts"`
	Title        string                       `json:"title"`
	Description  string                       `json:"description"`
	Instructions string                       `json:"instructions"`
	Language     string                       `json:"language"`

	PrepTime    int                   `json:"prep_time"`
	CookTime    int                   `json:"cook_time"`
	Servings    int                   `json:"servings"`
	ServingUnit string                `json:"serving_unit"`
	SourceURL   string                `json:"source_url"`
	Ingredients []RecipeIngredientReq `json:"ingredients"`
	Tags        []int                 `json:"tags"`
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

// Authentication Handlers

// registrationOpen reports whether strangers may create their own accounts.
//
// Off by default. The collection is shared - every signed-in user may edit and
// delete every recipe - so an account is not a small thing to hand out, and an
// open registration form on a public address hands one to anybody. Set
// ALLOW_REGISTRATION=true to open it, add the person, and turn it off again.
func registrationOpen() bool {
	value := strings.TrimSpace(os.Getenv("ALLOW_REGISTRATION"))
	return strings.EqualFold(value, "true") || value == "1" || strings.EqualFold(value, "yes")
}

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	if !registrationOpen() {
		utils.LogSecurityEvent("REGISTRATION_CLOSED", clientIP, "attempt while ALLOW_REGISTRATION is off")
		sendJSONError(w, http.StatusForbidden, "Registration is closed on this site")
		return
	}

	var req RegisterRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
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
	if err := decodeJSONBody(w, r, &req); err != nil {
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
	auth.SetAuthCookie(w, r, tokenString)
	utils.LogSecurityEvent("LOGIN_SUCCESS", clientIP, req.Username)

	sendJSONSuccess(w, "Login successful", map[string]interface{}{
		"user": map[string]interface{}{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
	})
}

// ChangePasswordHandler replaces the signed-in user's password. It carries the
// login rate limit rather than the general one, because the body contains a
// password guess like a login does.
func ChangePasswordHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "You must be logged in to change your password")
		return
	}

	var req ChangePasswordRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_PASSWORD_CHANGE", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		sendJSONError(w, http.StatusBadRequest, "Both the current and the new password are required")
		return
	}

	switch err := database.ChangeUserPassword(user.ID, req.CurrentPassword, req.NewPassword); {
	case err == nil:
		// fall through to the success path
	case errors.Is(err, database.ErrWrongPassword):
		utils.LogSecurityEvent("PASSWORD_CHANGE_WRONG_PASSWORD", clientIP, user.Username)
		sendJSONError(w, http.StatusUnauthorized, "The current password is incorrect")
		return
	case database.IsValidationError(err):
		sendJSONError(w, http.StatusBadRequest, err.Error())
		return
	default:
		utils.LogSecurityEvent("PASSWORD_CHANGE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Could not change the password")
		return
	}

	// The change retires every token issued before it, this request's included.
	// Reissuing keeps the user signed in here while everywhere else is logged
	// out, which is the point of changing a password someone else may know.
	tokenString, err := auth.CreateToken(user)
	if err != nil {
		utils.LogSecurityEvent("TOKEN_CREATION_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Password changed, but the session could not be renewed - please log in again")
		return
	}
	auth.SetAuthCookie(w, r, tokenString)

	utils.LogSecurityEvent("PASSWORD_CHANGED", clientIP, user.Username)
	sendJSONSuccess(w, "Password changed. Any other sessions have been signed out.", nil)
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)

	// Try to get user info for logging
	if user, err := auth.GetUserFromToken(r); err == nil {
		utils.LogSecurityEvent("USER_LOGOUT", clientIP, user.Username)
	} else {
		utils.LogSecurityEvent("ANONYMOUS_LOGOUT", clientIP, "")
	}

	auth.ClearAuthCookie(w, r)
	sendJSONSuccess(w, "Logged out successfully", nil)
}

func CheckAuthHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	sendJSONData(w, http.StatusOK, map[string]interface{}{
		"id":       user.ID,
		"username": user.Username,
		"email":    user.Email,
	})
}

// Recipe Handlers (JSON only)

// GetRecipesHandler serves the recipe collection and its two filtered forms,
// GET /api/recipes?q=... and GET /api/recipes?tag=... The filters are dispatched
// here rather than through mux Queries() routes: a failing Queries matcher
// clears mux's record of a method mismatch, so registering one on this path
// turned every 405 into a 404.
func GetRecipesHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("q") != "" {
		SearchHandler(w, r)
		return
	}

	if r.URL.Query().Get("tag") != "" {
		GetRecipesByTagHandler(w, r)
		return
	}

	recipes, err := database.GetAllRecipes(requestLanguage(r))
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Failed to fetch recipes")
		return
	}

	sendJSONData(w, http.StatusOK, recipes)
}

func GetRecipeHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr, exists := vars["id"]
	if !exists {
		sendJSONError(w, http.StatusBadRequest, "Recipe ID is required")
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil || !utils.IsValidID(id) {
		sendJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	recipe, err := database.GetRecipeByIDSecure(id, requestLanguage(r))
	if err != nil {
		sendJSONError(w, http.StatusNotFound, "Recipe not found")
		return
	}

	sendJSONData(w, http.StatusOK, recipe)
}

// GetRecipesByTagHandler backs both GET /api/recipes?tag={id} - the filtered
// collection, which is the form to prefer - and the older GET
// /api/recipes/tag/{id} the frontend already calls.
func GetRecipesByTagHandler(w http.ResponseWriter, r *http.Request) {
	idStr, exists := mux.Vars(r)["id"]
	if !exists {
		idStr = r.URL.Query().Get("tag")
		exists = idStr != ""
	}
	if !exists {
		sendJSONError(w, http.StatusBadRequest, "Tag ID is required")
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil || !utils.IsValidID(id) {
		sendJSONError(w, http.StatusBadRequest, "Invalid tag ID")
		return
	}

	recipes, err := database.GetRecipesByTag(id, requestLanguage(r))
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Failed to fetch recipes")
		return
	}

	sendJSONData(w, http.StatusOK, recipes)
}

func CreateRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	var req RecipeRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_RECIPE", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	// Validate and create recipe
	recipeID, err := createRecipeFromRequest(req, user.ID, clientIP)
	if err != nil {
		// Only messages produced by validating the caller's input are echoed back;
		// a driver error must not reach the client.
		if database.IsValidationError(err) {
			sendJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		sendJSONError(w, http.StatusInternalServerError, "Failed to create recipe")
		return
	}

	utils.LogSecurityEvent("RECIPE_CREATED", clientIP, fmt.Sprintf("RecipeID:%d, Title:%s, User:%s", recipeID, req.Title, user.Username))

	// 201 with the created resource and its Location, so a client does not have
	// to issue a second GET to learn what it just made.
	created, err := database.GetRecipeByIDSecure(int(recipeID), requestLanguage(r))
	if err != nil {
		// The row exists - only reading it back failed. Report the creation.
		sendJSONCreated(w, fmt.Sprintf("/api/recipes/%d", recipeID), "Recipe created successfully", nil)
		return
	}

	sendJSONCreated(w, fmt.Sprintf("/api/recipes/%d", recipeID), "Recipe created successfully", created)
}

func UpdateRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	vars := mux.Vars(r)
	idStr, exists := vars["id"]
	if !exists {
		sendJSONError(w, http.StatusBadRequest, "Recipe ID is required")
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_RECIPE_ID_API", clientIP, idStr)
		sendJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	// Existence is still checked separately so a mistyped id answers 404 rather
	// than a silent no-op. Who wrote the recipe no longer decides anything: the
	// collection is shared and anyone signed in may edit any of it.
	if _, err := database.RecipeExists(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			sendJSONError(w, http.StatusNotFound, "Recipe not found")
			return
		}
		sendJSONError(w, http.StatusInternalServerError, "Failed to update recipe")
		return
	}

	var req RecipeRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_RECIPE_UPDATE", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	// Update recipe
	err = updateRecipeFromRequest(req, id, user.ID, clientIP)
	if err != nil {
		if errors.Is(err, database.ErrRecipeNotFound) {
			sendJSONError(w, http.StatusNotFound, "Recipe not found")
			return
		}
		if database.IsValidationError(err) {
			sendJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		sendJSONError(w, http.StatusInternalServerError, "Failed to update recipe")
		return
	}

	utils.LogSecurityEvent("RECIPE_UPDATED_API", clientIP, fmt.Sprintf("RecipeID:%d, User:%s", id, user.Username))

	// PUT replaces the resource, so the new representation is what the caller
	// gets back - the same shape GET returns.
	updated, err := database.GetRecipeByIDSecure(id, requestLanguage(r))
	if err != nil {
		sendJSONSuccess(w, "Recipe updated successfully", nil)
		return
	}
	sendJSONSuccess(w, "Recipe updated successfully", updated)
}

func DeleteRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	vars := mux.Vars(r)
	idStr, exists := vars["id"]
	if !exists {
		sendJSONError(w, http.StatusBadRequest, "Recipe ID is required")
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_RECIPE_ID_DELETE", clientIP, idStr)
		sendJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	// "No such recipe" is still worth separating from a successful delete, so a
	// mistyped id answers 404. Ownership is not consulted - see the note on
	// database.RecipeExists.
	if _, err := database.RecipeExists(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			sendJSONError(w, http.StatusNotFound, "Recipe not found")
			return
		}
		utils.LogSecurityEvent("RECIPE_DELETE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Failed to delete recipe")
		return
	}

	// Get recipe images for cleanup (before deletion)
	images := database.GetRecipeImages(id)

	// DeleteRecipeSecure still carries the ownership clause in its WHERE, which
	// is what makes the check above advisory rather than the security boundary.
	if err := database.DeleteRecipeSecure(id); err != nil {
		utils.LogSecurityEvent("RECIPE_DELETE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Failed to delete recipe")
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

// Image Handlers (Form-data only)

func UploadRecipeImagesHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	// Get recipe ID from URL
	vars := mux.Vars(r)
	idStr, exists := vars["id"]
	if !exists {
		sendJSONError(w, http.StatusBadRequest, "Recipe ID is required")
		return
	}

	recipeID, err := strconv.Atoi(idStr)
	if err != nil || !utils.IsValidID(recipeID) {
		utils.LogSecurityEvent("INVALID_RECIPE_ID_IMAGE_UPLOAD", clientIP, idStr)
		sendJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	// The recipe has to exist to hang photos off; whose it is does not matter.
	if _, err := database.RecipeExists(recipeID); err != nil {
		sendJSONError(w, http.StatusNotFound, "Recipe not found")
		return
	}

	// Cap the whole request before parsing it; ParseMultipartForm's argument only
	// bounds how much is kept in memory, not how much the client may send.
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)

	err = r.ParseMultipartForm(10 << 20)
	if err != nil {
		utils.LogSecurityEvent("MULTIPART_PARSE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid form data")
		return
	}

	// Handle file uploads
	files := r.MultipartForm.File["images"]
	if len(files) == 0 {
		sendJSONError(w, http.StatusBadRequest, "No images provided")
		return
	}

	uploadedImages := []map[string]interface{}{}
	skipped := 0

	// Numbering has to continue after the images the recipe already has. Starting
	// from the loop index again collided with the existing rows and scrambled the
	// gallery order on every upload after the first.
	nextOrder := 0
	var maxOrder int
	if err := database.DB.QueryRow(
		"SELECT COALESCE(MAX(display_order), -1) FROM recipe_images WHERE recipe_id = ?", recipeID,
	).Scan(&maxOrder); err == nil {
		nextOrder = maxOrder + 1
	}

	for i, fileHeader := range files {
		if len(uploadedImages) >= maxImagesPerUpload {
			skipped++
			continue
		}

		// Validate file
		validation := utils.ValidateFileUpload(fileHeader.Filename, fileHeader.Size)
		if !validation.Valid {
			utils.LogSecurityEvent("INVALID_FILE_UPLOAD", clientIP, validation.Message)
			skipped++
			continue
		}

		filename, err := saveUploadedImage(fileHeader)
		if err != nil {
			utils.LogSecurityEvent("FILE_SAVE_ERROR", clientIP, err.Error())
			skipped++
			continue
		}

		// Get caption from form data
		caption := ""
		if captions := r.MultipartForm.Value[fmt.Sprintf("caption_%d", i)]; len(captions) > 0 {
			caption = strings.TrimSpace(captions[0])
			if len(caption) > 200 {
				caption = caption[:200]
			}
		}

		// Save to database
		result, err := database.DB.Exec(
			"INSERT INTO recipe_images (recipe_id, filename, caption, display_order) VALUES (?, ?, ?, ?)",
			recipeID, filename, caption, nextOrder,
		)
		if err != nil {
			// Remove file if database insert fails
			os.Remove(filepath.Join("uploads", filename))
			utils.LogSecurityEvent("IMAGE_DB_INSERT_ERROR", clientIP, err.Error())
			skipped++
			continue
		}

		imageID, _ := result.LastInsertId()
		uploadedImages = append(uploadedImages, map[string]interface{}{
			"id":       imageID,
			"filename": filename,
			"caption":  caption,
			"order":    nextOrder,
		})
		nextOrder++
	}

	if len(uploadedImages) == 0 {
		sendJSONError(w, http.StatusBadRequest, "No images could be saved. Check the file type (JPG, PNG, GIF, WebP) and size (max 5MB).")
		return
	}

	utils.LogSecurityEvent("IMAGES_UPLOADED", clientIP,
		fmt.Sprintf("RecipeID:%d, ImagesCount:%d, User:%s", recipeID, len(uploadedImages), user.Username))

	message := fmt.Sprintf("Uploaded %d image(s)", len(uploadedImages))
	if skipped > 0 {
		message += fmt.Sprintf(", skipped %d", skipped)
	}

	sendJSONCreated(w, fmt.Sprintf("/api/recipes/%d", recipeID), message, map[string]interface{}{
		"images":  uploadedImages,
		"skipped": skipped,
	})
}

// SetImageCoverHandler promotes one image to be the recipe's cover. The cover
// is whichever image sorts first, so this is a reorder rather than a flag.
func SetImageCoverHandler(w http.ResponseWriter, r *http.Request) {
	// The session still has to be valid - this is a write - but the user it
	// resolves to no longer decides anything, so it is not kept.
	if _, err := auth.GetUserFromToken(r); err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	imageID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil || !utils.IsValidID(imageID) {
		utils.LogSecurityEvent("INVALID_IMAGE_ID_COVER", clientIP, mux.Vars(r)["id"])
		sendJSONError(w, http.StatusBadRequest, "Invalid image ID")
		return
	}

	recipeID, err := database.SetRecipeImageCover(imageID)
	if errors.Is(err, database.ErrImageNotFound) {
		sendJSONError(w, http.StatusNotFound, "Image not found")
		return
	}
	if err != nil {
		utils.LogSecurityEvent("IMAGE_COVER_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Could not set the cover image")
		return
	}

	sendJSONSuccess(w, "Cover image updated", database.GetRecipeImages(recipeID))
}

func DeleteImageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	vars := mux.Vars(r)
	idStr, exists := vars["id"]
	if !exists {
		sendJSONError(w, http.StatusBadRequest, "Image ID is required")
		return
	}

	imageID, err := strconv.Atoi(idStr)
	if err != nil || !utils.IsValidID(imageID) {
		utils.LogSecurityEvent("INVALID_IMAGE_ID_DELETE", clientIP, idStr)
		sendJSONError(w, http.StatusBadRequest, "Invalid image ID")
		return
	}

	// The recipe is joined only to be sure the image belongs to one that still
	// exists; created_by is no longer consulted.
	var recipeID int
	var filename string
	err = database.DB.QueryRow(`
		SELECT ri.recipe_id, ri.filename
		FROM recipe_images ri
		JOIN recipes r ON ri.recipe_id = r.id
		WHERE ri.id = ?
	`, imageID).Scan(&recipeID, &filename)

	if err != nil {
		utils.LogSecurityEvent("IMAGE_NOT_FOUND", clientIP, fmt.Sprintf("ImageID: %d", imageID))
		sendJSONError(w, http.StatusNotFound, "Image not found")
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

// renameTarget is the shared shape of the two rename endpoints. Ingredients and
// tags are a taxonomy the whole household shares - anyone signed in may add to
// it, so anyone signed in may correct a name in it too.
func renameHandler(
	w http.ResponseWriter,
	r *http.Request,
	event string,
	rename func(id int, name, color string) (any, error),
) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil || !utils.IsValidID(id) {
		sendJSONError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	var req TagRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		utils.LogSecurityEvent("INVALID_JSON_"+event, clientIP, err.Error())
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	updated, err := rename(id, req.Name, req.Color)
	switch {
	case err == nil:
	case errors.Is(err, sql.ErrNoRows):
		sendJSONError(w, http.StatusNotFound, "Not found")
		return
	case errors.Is(err, database.ErrNameTaken):
		sendJSONError(w, http.StatusConflict, "That name is already taken")
		return
	case database.IsValidationError(err):
		sendJSONError(w, http.StatusBadRequest, err.Error())
		return
	default:
		utils.LogSecurityEvent(event+"_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Could not save the change")
		return
	}

	utils.LogSecurityEvent(event, clientIP, fmt.Sprintf("ID: %d, Name: %s, User: %s", id, req.Name, user.Username))
	sendJSONSuccess(w, "Renamed", updated)
}

func UpdateIngredientHandler(w http.ResponseWriter, r *http.Request) {
	renameHandler(w, r, "INGREDIENT_RENAMED", func(id int, name, _ string) (any, error) {
		return database.UpdateIngredientSecure(id, name)
	})
}

func UpdateTagHandler(w http.ResponseWriter, r *http.Request) {
	renameHandler(w, r, "TAG_RENAMED", func(id int, name, color string) (any, error) {
		return database.UpdateTagSecure(id, name, color)
	})
}

// Ingredient Handlers

func GetIngredientsHandler(w http.ResponseWriter, r *http.Request) {
	ingredients, err := database.GetAllIngredients(requestLanguage(r))
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Failed to fetch ingredients")
		return
	}

	sendJSONData(w, http.StatusOK, ingredients)
}

func CreateIngredientHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	var req IngredientRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
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
	ingredient, err := database.CreateIngredientSecure(req.Name)
	if err != nil {
		utils.LogSecurityEvent("INGREDIENT_INSERT_ERROR", clientIP, fmt.Sprintf("Name: %s, Error: %v", req.Name, err))
		sendJSONError(w, http.StatusConflict, "Ingredient already exists or database error")
		return
	}

	utils.LogSecurityEvent("INGREDIENT_CREATED", clientIP, fmt.Sprintf("Name: %s, User: %s", req.Name, user.Username))
	sendJSONCreated(w, fmt.Sprintf("/api/ingredients/%d", ingredient.ID), "Ingredient created successfully", ingredient)
}

func DeleteIngredientHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	vars := mux.Vars(r)
	idStr, exists := vars["id"]
	if !exists {
		sendJSONError(w, http.StatusBadRequest, "Ingredient ID is required")
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_INGREDIENT_ID_DELETE", clientIP, idStr)
		sendJSONError(w, http.StatusBadRequest, "Invalid ingredient ID")
		return
	}

	// Get ingredient name for logging
	var ingredientName string
	database.DB.QueryRow("SELECT name FROM ingredients WHERE id = ?", id).Scan(&ingredientName)

	// Ask the database layer about usage instead of deleting first and then
	// reverse-engineering the refusal out of the error text.
	recipeCount, recipeNames, err := database.IngredientUsage(id)
	if err != nil {
		utils.LogSecurityEvent("INGREDIENT_DELETE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Failed to delete ingredient")
		return
	}

	if recipeCount > 0 {
		errorMsg := fmt.Sprintf("Cannot delete %s because it is used in %d recipe(s)", ingredientName, recipeCount)
		if len(recipeNames) > 0 {
			errorMsg += fmt.Sprintf(": %s", strings.Join(recipeNames, ", "))
			if recipeCount > len(recipeNames) {
				errorMsg += fmt.Sprintf(" and %d more", recipeCount-len(recipeNames))
			}
		}

		utils.LogSecurityEvent("INGREDIENT_DELETE_BLOCKED", clientIP, fmt.Sprintf("Name: %s, UsedIn: %d recipes", ingredientName, recipeCount))

		sendJSONErrorDetails(w, http.StatusConflict, errorMsg, map[string]interface{}{
			"usedInRecipes": true,
			"recipeCount":   recipeCount,
			"recipeNames":   recipeNames,
		})
		return
	}

	// DeleteIngredientSecure repeats the usage check inside the database layer;
	// it is what stops a recipe created between the check above and the delete
	// from losing its ingredient.
	if err := database.DeleteIngredientSecure(id); err != nil {
		utils.LogSecurityEvent("INGREDIENT_DELETE_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Failed to delete ingredient")
		return
	}

	utils.LogSecurityEvent("INGREDIENT_DELETED", clientIP, fmt.Sprintf("ID: %d, Name: %s, User: %s", id, ingredientName, user.Username))
	sendJSONSuccess(w, "Ingredient deleted successfully", nil)
}

// Tag Handlers

func GetTagsHandler(w http.ResponseWriter, r *http.Request) {
	tags, err := database.GetAllTags(requestLanguage(r))
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Failed to fetch tags")
		return
	}

	sendJSONData(w, http.StatusOK, tags)
}

func CreateTagHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	var req TagRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
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
	tag, err := database.CreateTagSecure(req.Name, req.Color)
	if err != nil {
		utils.LogSecurityEvent("TAG_INSERT_ERROR", clientIP, fmt.Sprintf("Name: %s, Error: %v", req.Name, err))
		sendJSONError(w, http.StatusConflict, "Tag already exists or database error")
		return
	}

	utils.LogSecurityEvent("TAG_CREATED", clientIP, fmt.Sprintf("Name: %s, Color: %s, User: %s", tag.Name, tag.Color, user.Username))
	sendJSONCreated(w, fmt.Sprintf("/api/tags/%d", tag.ID), "Tag created successfully", tag)
}

func DeleteTagHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	clientIP := getClientIP(r)

	vars := mux.Vars(r)
	idStr, exists := vars["id"]
	if !exists {
		sendJSONError(w, http.StatusBadRequest, "Tag ID is required")
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil || !utils.IsValidID(id) {
		utils.LogSecurityEvent("INVALID_TAG_ID_DELETE", clientIP, idStr)
		sendJSONError(w, http.StatusBadRequest, "Invalid tag ID")
		return
	}

	// Get tag name for logging
	var tagName string
	database.DB.QueryRow("SELECT name FROM tags WHERE id = ?", id).Scan(&tagName)

	// Tags are global and deleting one cascades to every recipe that carries it.
	// Any logged-in user could therefore strip a tag off strangers' recipes, so
	// the delete is refused once somebody else's recipe depends on it.
	otherCount, otherTitles, err := database.TagUsage(id)
	if err != nil {
		utils.LogSecurityEvent("TAG_USAGE_CHECK_ERROR", clientIP, err.Error())
		sendJSONError(w, http.StatusInternalServerError, "Failed to delete tag")
		return
	}

	if otherCount > 0 {
		errorMsg := fmt.Sprintf("Cannot delete %s because it is used by %d recipe(s) from other users", tagName, otherCount)
		if len(otherTitles) > 0 {
			errorMsg += fmt.Sprintf(": %s", strings.Join(otherTitles, ", "))
			if otherCount > len(otherTitles) {
				errorMsg += fmt.Sprintf(" and %d more", otherCount-len(otherTitles))
			}
		}

		utils.LogSecurityEvent("TAG_DELETE_BLOCKED", clientIP,
			fmt.Sprintf("TagID: %d, Name: %s, UsedByOthers: %d, User: %s", id, tagName, otherCount, user.Username))

		sendJSONErrorDetails(w, http.StatusConflict, errorMsg, map[string]interface{}{
			"usedInRecipes": true,
			"recipeCount":   otherCount,
			"recipeNames":   otherTitles,
		})
		return
	}

	// Delete tag (cascading deletes will handle recipe_tags)
	err = database.DeleteTagSecure(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			sendJSONError(w, http.StatusNotFound, "Tag not found")
			return
		}
		utils.LogSecurityEvent("TAG_DELETE_ERROR", clientIP, fmt.Sprintf("ID: %d, Error: %v", id, err))
		sendJSONError(w, http.StatusInternalServerError, "Failed to delete tag")
		return
	}

	utils.LogSecurityEvent("TAG_DELETED", clientIP, fmt.Sprintf("ID: %d, Name: %s, User: %s", id, tagName, user.Username))
	sendJSONSuccess(w, "Tag deleted successfully", nil)
}

// Search Handler

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
	recipes, err := database.SearchRecipes(query, requestLanguage(r))
	if err != nil {
		utils.LogSecurityEvent("SEARCH_ERROR", clientIP, fmt.Sprintf("Query: %s, Error: %v", query, err))
		sendJSONError(w, http.StatusInternalServerError, "Search failed")
		return
	}

	utils.LogSecurityEvent("SEARCH_PERFORMED", clientIP, fmt.Sprintf("Query: %s, Results: %d", query, len(recipes)))

	sendJSONMeta(w, http.StatusOK, recipes, map[string]interface{}{
		"query": query,
		"count": len(recipes),
	})
}

// Helper functions

// requestLanguage decides which language a read is answered in: an explicit
// ?lang= first, then what the browser asks for, then English. The frontend
// always sends ?lang=, so the header path is for anything else that calls the
// API directly.
func requestLanguage(r *http.Request) string {
	if lang := strings.TrimSpace(r.URL.Query().Get("lang")); lang != "" {
		return database.NormalizeLanguage(lang)
	}
	if header := r.Header.Get("Accept-Language"); header != "" {
		// Only the first tag matters here; the collection has two languages and
		// a full q-value negotiation would be ceremony over a coin flip.
		primary := strings.SplitN(strings.SplitN(header, ",", 2)[0], "-", 2)[0]
		return database.NormalizeLanguage(primary)
	}
	return database.DefaultLanguage
}

func recipeInputFromRequest(req RecipeRequest) (database.RecipeInput, []database.RecipeIngredientInput) {
	texts := req.Texts
	if len(texts) == 0 && strings.TrimSpace(req.Title) != "" {
		// The old flat shape. req.Language says which language it is; without
		// one it is taken as English, which is what the field defaulted to
		// before there was anywhere to record it.
		texts = map[string]models.RecipeText{
			database.NormalizeLanguage(req.Language): {
				Title:        strings.TrimSpace(req.Title),
				Description:  strings.TrimSpace(req.Description),
				Instructions: strings.TrimSpace(req.Instructions),
			},
		}
	}

	in := database.RecipeInput{
		Texts:       texts,
		PrepTime:    req.PrepTime,
		CookTime:    req.CookTime,
		Servings:    req.Servings,
		ServingUnit: strings.TrimSpace(req.ServingUnit),
		SourceURL:   strings.TrimSpace(req.SourceURL),
	}

	ingredients := make([]database.RecipeIngredientInput, 0, len(req.Ingredients))
	for _, ingredient := range req.Ingredients {
		ingredients = append(ingredients, database.RecipeIngredientInput{
			IngredientID: ingredient.IngredientID,
			Quantity:     ingredient.Quantity,
			Unit:         strings.TrimSpace(ingredient.Unit),
		})
	}

	return in, ingredients
}

// createRecipeFromRequest validates and persists a recipe. Validation and the
// tag/ingredient inserts all happen inside one transaction in the database layer,
// so a rejected ingredient fails the whole request instead of being dropped.
func createRecipeFromRequest(req RecipeRequest, userID int, clientIP string) (int64, error) {
	in, ingredients := recipeInputFromRequest(req)

	recipeID, err := database.CreateRecipeTx(in, userID, req.Tags, ingredients)
	if err != nil {
		utils.LogSecurityEvent("RECIPE_CREATE_FAILED", clientIP, err.Error())
		return 0, err
	}

	return recipeID, nil
}

func updateRecipeFromRequest(req RecipeRequest, recipeID, userID int, clientIP string) error {
	in, ingredients := recipeInputFromRequest(req)

	if err := database.UpdateRecipeTx(recipeID, userID, in, req.Tags, ingredients); err != nil {
		utils.LogSecurityEvent("RECIPE_UPDATE_FAILED", clientIP, err.Error())
		return err
	}

	return nil
}

// saveUploadedImage opens, stores and closes one uploaded file. It exists so the
// close happens per file rather than piling up deferred closes inside the loop.
func saveUploadedImage(fileHeader *multipart.FileHeader) (string, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer file.Close()

	return utils.SaveUploadedFile(file, fileHeader)
}
