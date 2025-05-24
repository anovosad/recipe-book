// File: handlers/handlers.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
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

// Page Handlers
func HomeHandler(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/recipes", http.StatusSeeOther)
}

func LoginPageHandler(w http.ResponseWriter, r *http.Request) {
	data := models.PageData{Title: "Login"}

	if message := r.URL.Query().Get("message"); message != "" {
		data.Message = message
	}

	if err := utils.Templates.ExecuteTemplate(w, "login.html", data); err != nil {
		http.Error(w, fmt.Sprintf("Template error: %v", err), http.StatusInternalServerError)
		return
	}
}

func RegisterPageHandler(w http.ResponseWriter, r *http.Request) {
	data := models.PageData{Title: "Register"}

	if err := utils.Templates.ExecuteTemplate(w, "register.html", data); err != nil {
		http.Error(w, fmt.Sprintf("Template error: %v", err), http.StatusInternalServerError)
		return
	}
}

// Updated RecipesPageHandler function in handlers/handlers.go
// Updated RecipesPageHandler function in handlers/handlers.go
func RecipesPageHandler(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.GetUserFromToken(r)

	query := r.URL.Query().Get("search")
	tagFilter := r.URL.Query().Get("tag")
	var recipes []models.Recipe
	var err error
	var activeTagID int
	var activeTag *models.Tag

	// Parse tag filter
	if tagFilter != "" {
		activeTagID, err = strconv.Atoi(tagFilter)
		if err != nil {
			activeTagID = 0
		}
	}

	// Get recipes based on filters
	if activeTagID > 0 {
		// Filter by tag
		recipes, err = database.GetRecipesByTag(activeTagID)

		// Get the active tag details
		activeTag, err = database.GetTagByID(activeTagID)
		if err != nil {
			log.Printf("Error loading active tag: %v", err)
			activeTag = nil
			activeTagID = 0
		}
	} else if query != "" {
		// Search recipes
		recipes, err = database.SearchRecipes(query)
	} else {
		// Get all recipes
		recipes, err = database.GetAllRecipes()
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

	if err := utils.Templates.ExecuteTemplate(w, "recipes.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func RecipePageHandler(w http.ResponseWriter, r *http.Request) {
	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/recipe/")
	id, err := strconv.Atoi(path)
	if err != nil {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	user, _ := auth.GetUserFromToken(r)
	recipe, err := database.GetRecipeByID(id)
	if err != nil {
		http.Error(w, "Recipe not found", http.StatusNotFound)
		return
	}

	data := models.PageData{
		Title:      recipe.Title,
		User:       user,
		IsLoggedIn: user != nil,
		Recipe:     recipe,
	}

	if err := utils.Templates.ExecuteTemplate(w, "recipe.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
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

	if err := utils.Templates.ExecuteTemplate(w, "recipe-form.html", data); err != nil {
		log.Printf("Error executing template: %v", err)
		return
	}
}

func EditRecipePageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/recipe/")
	path = strings.TrimSuffix(path, "/edit")
	id, err := strconv.Atoi(path)
	if err != nil {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	if r.Method == "POST" {
		HandleEditRecipeSubmission(w, r, user, id)
		return
	}

	recipe, err := database.GetRecipeByID(id)
	if err != nil {
		http.Error(w, "Recipe not found", http.StatusNotFound)
		return
	}

	if recipe.CreatedBy != user.ID {
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

	if err := utils.Templates.ExecuteTemplate(w, "recipe-form.html", data); err != nil {
		log.Printf("Error executing template: %v", err)
		return
	}
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

	if err := utils.Templates.ExecuteTemplate(w, "ingredients.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
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

	if err := utils.Templates.ExecuteTemplate(w, "ingredient-form.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// Tag Page Handlers
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

	if err := utils.Templates.ExecuteTemplate(w, "tags.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
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

	if err := utils.Templates.ExecuteTemplate(w, "tag-form.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// API Handlers
func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	username := r.FormValue("username")
	email := r.FormValue("email")
	password := r.FormValue("password")

	if username == "" || email == "" || password == "" {
		data := models.PageData{Title: "Register", Error: "All fields are required"}
		utils.Templates.ExecuteTemplate(w, "register.html", data)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		data := models.PageData{Title: "Register", Error: "Error processing password"}
		utils.Templates.ExecuteTemplate(w, "register.html", data)
		return
	}

	_, err = database.DB.Exec("INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
		username, email, string(hashedPassword))
	if err != nil {
		data := models.PageData{Title: "Register", Error: "Username or email already exists"}
		utils.Templates.ExecuteTemplate(w, "register.html", data)
		return
	}

	http.Redirect(w, r, "/login?message=Registration successful! Please log in.", http.StatusSeeOther)
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	username := r.FormValue("username")
	password := r.FormValue("password")

	if username == "" || password == "" {
		data := models.PageData{Title: "Login", Error: "Username and password are required"}
		utils.Templates.ExecuteTemplate(w, "login.html", data)
		return
	}

	var user models.User
	var hashedPassword string
	err := database.DB.QueryRow("SELECT id, username, email, password FROM users WHERE username = ?",
		username).Scan(&user.ID, &user.Username, &user.Email, &hashedPassword)
	if err != nil {
		data := models.PageData{Title: "Login", Error: "Invalid credentials"}
		utils.Templates.ExecuteTemplate(w, "login.html", data)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)); err != nil {
		data := models.PageData{Title: "Login", Error: "Invalid credentials"}
		utils.Templates.ExecuteTemplate(w, "login.html", data)
		return
	}

	tokenString, err := auth.CreateToken(&user)
	if err != nil {
		data := models.PageData{Title: "Login", Error: "Error creating session"}
		utils.Templates.ExecuteTemplate(w, "login.html", data)
		return
	}

	auth.SetAuthCookie(w, tokenString)
	http.Redirect(w, r, "/recipes", http.StatusSeeOther)
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	auth.ClearAuthCookie(w)
	http.Redirect(w, r, "/recipes", http.StatusSeeOther)
}

func CreateRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	err = r.ParseMultipartForm(32 << 20) // 32MB max
	if err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	title := r.FormValue("title")
	description := r.FormValue("description")
	instructions := r.FormValue("instructions")
	prepTime, _ := strconv.Atoi(r.FormValue("prep_time"))
	cookTime, _ := strconv.Atoi(r.FormValue("cook_time"))
	servings, _ := strconv.Atoi(r.FormValue("servings"))
	servingUnit := r.FormValue("serving_unit")
	if servingUnit == "" {
		servingUnit = "people"
	}

	if title == "" || instructions == "" {
		ingredients, _ := database.GetAllIngredients()
		tags, _ := database.GetAllTags()
		data := models.PageData{
			Title:       "New Recipe",
			User:        user,
			IsLoggedIn:  true,
			Ingredients: ingredients,
			Tags:        tags,
			Error:       "Title and instructions are required",
		}
		utils.Templates.ExecuteTemplate(w, "recipe-form.html", data)
		return
	}

	result, err := database.DB.Exec(`
		INSERT INTO recipes (title, description, instructions, prep_time, cook_time, servings, serving_unit, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, title, description, instructions, prepTime, cookTime, servings, servingUnit, user.ID)

	if err != nil {
		ingredients, _ := database.GetAllIngredients()
		tags, _ := database.GetAllTags()
		data := models.PageData{
			Title:       "New Recipe",
			User:        user,
			IsLoggedIn:  true,
			Ingredients: ingredients,
			Tags:        tags,
			Error:       "Error creating recipe",
		}
		utils.Templates.ExecuteTemplate(w, "recipe-form.html", data)
		return
	}

	recipeID, _ := result.LastInsertId()

	// Handle tags
	selectedTags := r.Form["tags"] // Get selected tag IDs
	for _, tagIDStr := range selectedTags {
		if tagID, err := strconv.Atoi(tagIDStr); err == nil {
			database.DB.Exec("INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)", recipeID, tagID)
		}
	}

	// Handle file uploads
	if r.MultipartForm != nil && r.MultipartForm.File != nil {
		files := r.MultipartForm.File["recipe_images"]
		for i, fileHeader := range files {
			file, err := fileHeader.Open()
			if err != nil {
				continue
			}
			defer file.Close()

			filename, err := utils.SaveUploadedFile(file, fileHeader)
			if err != nil {
				log.Printf("Error saving file %s: %v", fileHeader.Filename, err)
				continue
			}

			caption := ""
			captions := r.Form["image_captions"]
			if i < len(captions) {
				caption = captions[i]
			}

			_, err = database.DB.Exec("INSERT INTO recipe_images (recipe_id, filename, caption, display_order) VALUES (?, ?, ?, ?)",
				recipeID, filename, caption, i)
			if err != nil {
				log.Printf("Error inserting image record: %v", err)
			}
		}
	}

	// Insert ingredients
	r.ParseForm()
	for key, values := range r.PostForm {
		if strings.HasPrefix(key, "ingredient_") && len(values) > 0 && values[0] != "" {
			idx := strings.TrimPrefix(key, "ingredient_")
			quantityKey := "quantity_" + idx
			unitKey := "unit_" + idx
			if quantities, ok := r.PostForm[quantityKey]; ok && len(quantities) > 0 {
				if units, ok := r.PostForm[unitKey]; ok && len(units) > 0 {
					ingredientID, _ := strconv.Atoi(values[0])
					quantity, _ := strconv.ParseFloat(quantities[0], 64)
					unit := units[0]
					if ingredientID > 0 && quantity > 0 && unit != "" {
						database.DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
							recipeID, ingredientID, quantity, unit)
					}
				}
			}
		}
	}

	http.Redirect(w, r, fmt.Sprintf("/recipe/%d", recipeID), http.StatusSeeOther)
}

func HandleEditRecipeSubmission(w http.ResponseWriter, r *http.Request, user *models.User, recipeID int) {
	var createdBy int
	err := database.DB.QueryRow("SELECT created_by FROM recipes WHERE id = ?", recipeID).Scan(&createdBy)
	if err != nil || createdBy != user.ID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	err = r.ParseMultipartForm(32 << 20) // 32MB max
	if err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	title := r.FormValue("title")
	description := r.FormValue("description")
	instructions := r.FormValue("instructions")
	prepTime, _ := strconv.Atoi(r.FormValue("prep_time"))
	cookTime, _ := strconv.Atoi(r.FormValue("cook_time"))
	servings, _ := strconv.Atoi(r.FormValue("servings"))
	servingUnit := r.FormValue("serving_unit")
	if servingUnit == "" {
		servingUnit = "people"
	}

	if title == "" || instructions == "" {
		recipe, _ := database.GetRecipeByID(recipeID)
		ingredients, _ := database.GetAllIngredients()
		tags, _ := database.GetAllTags()
		data := models.PageData{
			Title:       "Edit Recipe",
			User:        user,
			IsLoggedIn:  true,
			Recipe:      recipe,
			Ingredients: ingredients,
			Tags:        tags,
			Error:       "Title and instructions are required",
		}
		utils.Templates.ExecuteTemplate(w, "recipe-form.html", data)
		return
	}

	_, err = database.DB.Exec(`
		UPDATE recipes SET title = ?, description = ?, instructions = ?, 
		prep_time = ?, cook_time = ?, servings = ?, serving_unit = ? WHERE id = ?
	`, title, description, instructions, prepTime, cookTime, servings, servingUnit, recipeID)

	if err != nil {
		recipe, _ := database.GetRecipeByID(recipeID)
		ingredients, _ := database.GetAllIngredients()
		tags, _ := database.GetAllTags()
		data := models.PageData{
			Title:       "Edit Recipe",
			User:        user,
			IsLoggedIn:  true,
			Recipe:      recipe,
			Ingredients: ingredients,
			Tags:        tags,
			Error:       "Error updating recipe",
		}
		utils.Templates.ExecuteTemplate(w, "recipe-form.html", data)
		return
	}

	// Update tags
	database.DB.Exec("DELETE FROM recipe_tags WHERE recipe_id = ?", recipeID)
	selectedTags := r.Form["tags"] // Get selected tag IDs
	for _, tagIDStr := range selectedTags {
		if tagID, err := strconv.Atoi(tagIDStr); err == nil {
			database.DB.Exec("INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)", recipeID, tagID)
		}
	}

	// Handle new image uploads
	if r.MultipartForm != nil && r.MultipartForm.File != nil {
		files := r.MultipartForm.File["recipe_images"]
		for i, fileHeader := range files {
			file, err := fileHeader.Open()
			if err != nil {
				continue
			}
			defer file.Close()

			filename, err := utils.SaveUploadedFile(file, fileHeader)
			if err != nil {
				log.Printf("Error saving file %s: %v", fileHeader.Filename, err)
				continue
			}

			caption := ""
			captions := r.Form["image_captions"]
			if i < len(captions) {
				caption = captions[i]
			}

			var maxOrder int
			database.DB.QueryRow("SELECT COALESCE(MAX(display_order), -1) FROM recipe_images WHERE recipe_id = ?", recipeID).Scan(&maxOrder)

			_, err = database.DB.Exec("INSERT INTO recipe_images (recipe_id, filename, caption, display_order) VALUES (?, ?, ?, ?)",
				recipeID, filename, caption, maxOrder+1)
			if err != nil {
				log.Printf("Error inserting image record: %v", err)
			}
		}
	}

	// Update ingredients
	database.DB.Exec("DELETE FROM recipe_ingredients WHERE recipe_id = ?", recipeID)
	r.ParseForm()
	for key, values := range r.PostForm {
		if strings.HasPrefix(key, "ingredient_") && len(values) > 0 && values[0] != "" {
			idx := strings.TrimPrefix(key, "ingredient_")
			quantityKey := "quantity_" + idx
			unitKey := "unit_" + idx
			if quantities, ok := r.PostForm[quantityKey]; ok && len(quantities) > 0 {
				if units, ok := r.PostForm[unitKey]; ok && len(units) > 0 {
					ingredientID, _ := strconv.Atoi(values[0])
					quantity, _ := strconv.ParseFloat(quantities[0], 64)
					unit := units[0]
					if ingredientID > 0 && quantity > 0 && unit != "" {
						database.DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
							recipeID, ingredientID, quantity, unit)
					}
				}
			}
		}
	}

	http.Redirect(w, r, fmt.Sprintf("/recipe/%d", recipeID), http.StatusSeeOther)
}

func UpdateRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/recipes/")
	id, err := strconv.Atoi(path)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var createdBy int
	err = database.DB.QueryRow("SELECT created_by FROM recipes WHERE id = ?", id).Scan(&createdBy)
	if err != nil || createdBy != user.ID {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	var recipe models.Recipe
	if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`
		UPDATE recipes SET title = ?, description = ?, instructions = ?, 
		prep_time = ?, cook_time = ?, servings = ?, serving_unit = ? WHERE id = ?
	`, recipe.Title, recipe.Description, recipe.Instructions,
		recipe.PrepTime, recipe.CookTime, recipe.Servings, recipe.ServingUnit, id)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	database.DB.Exec("DELETE FROM recipe_ingredients WHERE recipe_id = ?", id)
	for _, ing := range recipe.Ingredients {
		database.DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
			id, ing.IngredientID, ing.Quantity, ing.Unit)
	}

	w.WriteHeader(http.StatusOK)
}

func DeleteRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/recipes/")
	id, err := strconv.Atoi(path)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var createdBy int
	err = database.DB.QueryRow("SELECT created_by FROM recipes WHERE id = ?", id).Scan(&createdBy)
	if err != nil || createdBy != user.ID {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	// Get all images for this recipe to delete files
	images := database.GetRecipeImages(id)
	for _, img := range images {
		os.Remove(filepath.Join("uploads", img.Filename))
	}

	_, err = database.DB.Exec("DELETE FROM recipes WHERE id = ?", id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func CreateIngredientHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	name := r.FormValue("name")

	if name == "" {
		data := models.PageData{
			Title:      "New Ingredient",
			User:       user,
			IsLoggedIn: true,
			Error:      "Ingredient name is required",
		}
		utils.Templates.ExecuteTemplate(w, "ingredient-form.html", data)
		return
	}

	_, err = database.DB.Exec("INSERT INTO ingredients (name) VALUES (?)", name)
	if err != nil {
		data := models.PageData{
			Title:      "New Ingredient",
			User:       user,
			IsLoggedIn: true,
			Error:      "Ingredient already exists or database error",
		}
		utils.Templates.ExecuteTemplate(w, "ingredient-form.html", data)
		return
	}

	http.Redirect(w, r, "/ingredients", http.StatusSeeOther)
}

func DeleteIngredientHandler(w http.ResponseWriter, r *http.Request) {
	_, err := auth.GetUserFromToken(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/ingredients/")
	id, err := strconv.Atoi(path)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec("DELETE FROM ingredients WHERE id = ?", id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// Tag API Handlers
func CreateTagHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	name := r.FormValue("name")
	color := r.FormValue("color")
	if color == "" {
		color = "#ff6b6b" // default color
	}

	if name == "" {
		data := models.PageData{
			Title:      "New Tag",
			User:       user,
			IsLoggedIn: true,
			Error:      "Tag name is required",
		}
		utils.Templates.ExecuteTemplate(w, "tag-form.html", data)
		return
	}

	_, err = database.DB.Exec("INSERT INTO tags (name, color) VALUES (?, ?)", name, color)
	if err != nil {
		data := models.PageData{
			Title:      "New Tag",
			User:       user,
			IsLoggedIn: true,
			Error:      "Tag already exists or database error",
		}
		utils.Templates.ExecuteTemplate(w, "tag-form.html", data)
		return
	}

	http.Redirect(w, r, "/tags", http.StatusSeeOther)
}

func DeleteTagHandler(w http.ResponseWriter, r *http.Request) {
	_, err := auth.GetUserFromToken(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/tags/")
	id, err := strconv.Atoi(path)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec("DELETE FROM tags WHERE id = ?", id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func DeleteImageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/images/")
	imageID, err := strconv.Atoi(path)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// Check if user owns the recipe
	var recipeID, createdBy int
	var filename string
	err = database.DB.QueryRow(`
		SELECT ri.recipe_id, r.created_by, ri.filename 
		FROM recipe_images ri 
		JOIN recipes r ON ri.recipe_id = r.id 
		WHERE ri.id = ?
	`, imageID).Scan(&recipeID, &createdBy, &filename)

	if err != nil || createdBy != user.ID {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	// Delete file from filesystem
	os.Remove(filepath.Join("uploads", filename))

	// Delete from database
	_, err = database.DB.Exec("DELETE FROM recipe_images WHERE id = ?", imageID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func SearchHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	recipes, err := database.SearchRecipes(query)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipes)
}
