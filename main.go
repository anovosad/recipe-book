package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

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

type Recipe struct {
	ID           int                `json:"id"`
	Title        string             `json:"title"`
	Description  string             `json:"description"`
	Instructions string             `json:"instructions"`
	PrepTime     int                `json:"prep_time"`
	CookTime     int                `json:"cook_time"`
	Servings     int                `json:"servings"`
	CreatedBy    int                `json:"created_by"`
	CreatedAt    time.Time          `json:"created_at"`
	Ingredients  []RecipeIngredient `json:"ingredients"`
	AuthorName   string             `json:"author_name"`
}

type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
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

var db *sql.DB
var jwtKey = []byte("your-secret-key-change-in-production")
var templates *template.Template

func main() {
	initDB()
	loadTemplates()

	r := mux.NewRouter()

	// Page routes
	r.HandleFunc("/", homeHandler).Methods("GET")
	r.HandleFunc("/login", loginPageHandler).Methods("GET")
	r.HandleFunc("/register", registerPageHandler).Methods("GET")
	r.HandleFunc("/recipes", recipesPageHandler).Methods("GET")
	r.HandleFunc("/recipe/new", newRecipePageHandler).Methods("GET")
	r.HandleFunc("/recipe/{id}/edit", editRecipePageHandler).Methods("GET", "POST")
	r.HandleFunc("/recipe/{id}", recipePageHandler).Methods("GET")
	r.HandleFunc("/ingredients", ingredientsPageHandler).Methods("GET")
	r.HandleFunc("/ingredients/new", newIngredientPageHandler).Methods("GET")

	// API routes
	r.HandleFunc("/api/register", registerHandler).Methods("POST")
	r.HandleFunc("/api/login", loginHandler).Methods("POST")
	r.HandleFunc("/api/logout", logoutHandler).Methods("POST")
	r.HandleFunc("/api/recipes", createRecipeHandler).Methods("POST")
	r.HandleFunc("/api/recipes/{id}", updateRecipeHandler).Methods("PUT")
	r.HandleFunc("/api/recipes/{id}", deleteRecipeHandler).Methods("DELETE")
	r.HandleFunc("/api/ingredients", createIngredientHandler).Methods("POST")
	r.HandleFunc("/api/ingredients/{id}", deleteIngredientHandler).Methods("DELETE")
	r.HandleFunc("/api/search", searchHandler).Methods("GET")

	// Serve static files
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("./static/"))))

	fmt.Println("🍳 Recipe Book Server starting on :8080")
	fmt.Println("📖 Open http://localhost:8080 in your browser")
	log.Fatal(http.ListenAndServe(":8080", r))
}

func initDB() {
	var err error
	db, err = sql.Open("sqlite", "./recipes.db")
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}

	// Check if we need to migrate the database
	migrateDatabase()

	// Create tables with new schema
	createTables := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	
	CREATE TABLE IF NOT EXISTS ingredients (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL
	);
	
	CREATE TABLE IF NOT EXISTS recipes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		description TEXT,
		instructions TEXT NOT NULL,
		prep_time INTEGER,
		cook_time INTEGER,
		servings INTEGER,
		created_by INTEGER,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users (id)
	);
	
	CREATE TABLE IF NOT EXISTS recipe_ingredients (
		recipe_id INTEGER,
		ingredient_id INTEGER,
		quantity REAL NOT NULL,
		unit TEXT NOT NULL,
		PRIMARY KEY (recipe_id, ingredient_id),
		FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
		FOREIGN KEY (ingredient_id) REFERENCES ingredients (id)
	);`

	_, err = db.Exec(createTables)
	if err != nil {
		log.Fatal("Failed to create tables:", err)
	}

	// Insert default ingredients
	defaultIngredients := []string{
		"Salt", "Pepper", "Sugar", "Flour", "Butter", "Eggs", "Milk", "Oil",
		"Onion", "Garlic", "Tomato", "Cheese", "Rice", "Pasta", "Chicken", "Beef",
		"Olive Oil", "Lemon", "Basil", "Oregano", "Thyme", "Rosemary", "Parsley",
		"Potatoes", "Carrots", "Bell Pepper", "Mushrooms", "Spinach", "Broccoli",
	}

	for _, name := range defaultIngredients {
		db.Exec("INSERT OR IGNORE INTO ingredients (name) VALUES (?)", name)
	}

	fmt.Println("✅ Database initialized successfully")
}

func migrateDatabase() {
	// Check if old schema exists and migrate
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('ingredients') WHERE name='unit'").Scan(&count)
	if err == nil && count > 0 {
		fmt.Println("🔄 Migrating database schema...")

		// Drop old tables to recreate with new schema
		db.Exec("DROP TABLE IF EXISTS recipe_ingredients")
		db.Exec("DROP TABLE IF EXISTS ingredients")

		fmt.Println("✅ Database migration completed")
	}
}

func loadTemplates() {
	funcMap := template.FuncMap{
		"nl2br": func(text string) template.HTML {
			return template.HTML(strings.ReplaceAll(template.HTMLEscapeString(text), "\n", "<br>"))
		},
		"add": func(a, b int) int {
			return a + b
		},
		"sub": func(a, b int) int {
			return a - b
		},
		"lt": func(a, b int) bool {
			return a < b
		},
		"gt": func(a, b int) bool {
			return a > b
		},
		"eq": func(a, b int) bool {
			return a == b
		},
		"streq": func(a, b string) bool {
			return a == b
		},
		"len": func(slice interface{}) int {
			s := reflect.ValueOf(slice)
			return s.Len()
		},
	}

	var err error
	templates, err = template.New("").Funcs(funcMap).ParseGlob("templates/*.html")
	if err != nil {
		log.Fatal("Failed to parse templates:", err)
		return
	}

	// Debug: List all parsed templates
	for _, tmpl := range templates.Templates() {
		fmt.Printf("📄 Loaded template: %s\n", tmpl.Name())
	}
}

func getUserFromToken(r *http.Request) (*User, error) {
	cookie, err := r.Cookie("auth_token")
	if err != nil {
		return nil, err
	}

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(cookie.Value, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})

	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	var user User
	err = db.QueryRow("SELECT id, username, email FROM users WHERE id = ?", claims.UserID).
		Scan(&user.ID, &user.Username, &user.Email)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// Page Handlers
func homeHandler(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/recipes", http.StatusSeeOther)
}

func loginPageHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("🔍 DEBUG: loginPageHandler called")

	data := PageData{Title: "Login"}

	if message := r.URL.Query().Get("message"); message != "" {
		data.Message = message
	}

	fmt.Printf("🔍 DEBUG: Attempting to execute template 'login.html' with data: %+v\n", data)

	if err := templates.ExecuteTemplate(w, "login.html", data); err != nil {
		fmt.Printf("❌ ERROR executing login.html template: %v\n", err)
		http.Error(w, fmt.Sprintf("Template error: %v", err), http.StatusInternalServerError)
		return
	}

	fmt.Println("✅ DEBUG: login.html template executed successfully")
}

func registerPageHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("🔍 DEBUG: registerPageHandler called")

	data := PageData{Title: "Register"}

	fmt.Printf("🔍 DEBUG: Attempting to execute template 'register.html' with data: %+v\n", data)

	if err := templates.ExecuteTemplate(w, "register.html", data); err != nil {
		fmt.Printf("❌ ERROR executing register.html template: %v\n", err)
		http.Error(w, fmt.Sprintf("Template error: %v", err), http.StatusInternalServerError)
		return
	}

	fmt.Println("✅ DEBUG: register.html template executed successfully")
}

func recipesPageHandler(w http.ResponseWriter, r *http.Request) {
	user, _ := getUserFromToken(r)

	query := r.URL.Query().Get("search")
	var recipes []Recipe
	var err error

	if query != "" {
		recipes, err = searchRecipes(query)
	} else {
		recipes, err = getAllRecipes()
	}

	if err != nil {
		log.Printf("Error loading recipes: %v", err)
		recipes = []Recipe{}
	}

	data := PageData{
		Title:      "Recipes",
		User:       user,
		IsLoggedIn: user != nil,
		Recipes:    recipes,
	}

	if err := templates.ExecuteTemplate(w, "recipes.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func recipePageHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	user, _ := getUserFromToken(r)
	recipe, err := getRecipeByID(id)
	if err != nil {
		http.Error(w, "Recipe not found", http.StatusNotFound)
		return
	}

	data := PageData{
		Title:      recipe.Title,
		User:       user,
		IsLoggedIn: user != nil,
		Recipe:     recipe,
	}

	if err := templates.ExecuteTemplate(w, "recipe.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func newRecipePageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	ingredients, err := getAllIngredients()
	if err != nil {
		log.Printf("Error loading ingredients: %v", err)
		ingredients = []Ingredient{}
	}

	data := PageData{
		Title:       "New Recipe",
		User:        user,
		IsLoggedIn:  true,
		Ingredients: ingredients,
	}

	// Execute template
	if err := templates.ExecuteTemplate(w, "recipe-form.html", data); err != nil {
		log.Printf("Error executing template: %v", err)
		// Don't call http.Error here since we might have already started writing
		return
	}
}

func editRecipePageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid recipe ID", http.StatusBadRequest)
		return
	}

	if r.Method == "POST" {
		handleEditRecipeSubmission(w, r, user, id)
		return
	}

	recipe, err := getRecipeByID(id)
	if err != nil {
		http.Error(w, "Recipe not found", http.StatusNotFound)
		return
	}

	if recipe.CreatedBy != user.ID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	ingredients, err := getAllIngredients()
	if err != nil {
		log.Printf("Error loading ingredients: %v", err)
		ingredients = []Ingredient{}
	}

	// Debug logging
	fmt.Printf("🔍 DEBUG: Recipe ingredients count: %d\n", len(recipe.Ingredients))
	for i, ing := range recipe.Ingredients {
		fmt.Printf("🔍 DEBUG: Ingredient %d: ID=%d, Name=%s, Unit=%s, Quantity=%f\n",
			i, ing.IngredientID, ing.Name, ing.Unit, ing.Quantity)
	}

	data := PageData{
		Title:       "Edit Recipe",
		User:        user,
		IsLoggedIn:  true,
		Recipe:      recipe,
		Ingredients: ingredients,
	}

	if err := templates.ExecuteTemplate(w, "recipe-form.html", data); err != nil {
		log.Printf("Error executing template: %v", err)
		// Don't call http.Error since we might have already started writing the response
		return
	}
}

func handleEditRecipeSubmission(w http.ResponseWriter, r *http.Request, user *User, recipeID int) {
	var createdBy int
	err := db.QueryRow("SELECT created_by FROM recipes WHERE id = ?", recipeID).Scan(&createdBy)
	if err != nil || createdBy != user.ID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	title := r.FormValue("title")
	description := r.FormValue("description")
	instructions := r.FormValue("instructions")
	prepTime, _ := strconv.Atoi(r.FormValue("prep_time"))
	cookTime, _ := strconv.Atoi(r.FormValue("cook_time"))
	servings, _ := strconv.Atoi(r.FormValue("servings"))

	if title == "" || instructions == "" {
		recipe, _ := getRecipeByID(recipeID)
		ingredients, _ := getAllIngredients()
		data := PageData{
			Title:       "Edit Recipe",
			User:        user,
			IsLoggedIn:  true,
			Recipe:      recipe,
			Ingredients: ingredients,
			Error:       "Title and instructions are required",
		}
		templates.ExecuteTemplate(w, "recipe-form.html", data)
		return
	}

	_, err = db.Exec(`
		UPDATE recipes SET title = ?, description = ?, instructions = ?, 
		prep_time = ?, cook_time = ?, servings = ? WHERE id = ?
	`, title, description, instructions, prepTime, cookTime, servings, recipeID)

	if err != nil {
		recipe, _ := getRecipeByID(recipeID)
		ingredients, _ := getAllIngredients()
		data := PageData{
			Title:       "Edit Recipe",
			User:        user,
			IsLoggedIn:  true,
			Recipe:      recipe,
			Ingredients: ingredients,
			Error:       "Error updating recipe",
		}
		templates.ExecuteTemplate(w, "recipe-form.html", data)
		return
	}

	// Update ingredients
	db.Exec("DELETE FROM recipe_ingredients WHERE recipe_id = ?", recipeID)
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
						db.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
							recipeID, ingredientID, quantity, unit)
					}
				}
			}
		}
	}

	http.Redirect(w, r, fmt.Sprintf("/recipe/%d", recipeID), http.StatusSeeOther)
}

func ingredientsPageHandler(w http.ResponseWriter, r *http.Request) {
	user, _ := getUserFromToken(r)

	ingredients, err := getAllIngredients()
	if err != nil {
		log.Printf("Error loading ingredients: %v", err)
		ingredients = []Ingredient{}
	}

	data := PageData{
		Title:       "Ingredients",
		User:        user,
		IsLoggedIn:  user != nil,
		Ingredients: ingredients,
	}

	if err := templates.ExecuteTemplate(w, "ingredients.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func newIngredientPageHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	data := PageData{
		Title:      "New Ingredient",
		User:       user,
		IsLoggedIn: true,
	}

	if err := templates.ExecuteTemplate(w, "ingredient-form.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// API Handlers
func registerHandler(w http.ResponseWriter, r *http.Request) {
	username := r.FormValue("username")
	email := r.FormValue("email")
	password := r.FormValue("password")

	if username == "" || email == "" || password == "" {
		data := PageData{Title: "Register", Error: "All fields are required"}
		templates.ExecuteTemplate(w, "register.html", data)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		data := PageData{Title: "Register", Error: "Error processing password"}
		templates.ExecuteTemplate(w, "register.html", data)
		return
	}

	_, err = db.Exec("INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
		username, email, string(hashedPassword))
	if err != nil {
		data := PageData{Title: "Register", Error: "Username or email already exists"}
		templates.ExecuteTemplate(w, "register.html", data)
		return
	}

	http.Redirect(w, r, "/login?message=Registration successful! Please log in.", http.StatusSeeOther)
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	username := r.FormValue("username")
	password := r.FormValue("password")

	if username == "" || password == "" {
		data := PageData{Title: "Login", Error: "Username and password are required"}
		templates.ExecuteTemplate(w, "login.html", data)
		return
	}

	var user User
	var hashedPassword string
	err := db.QueryRow("SELECT id, username, email, password FROM users WHERE username = ?",
		username).Scan(&user.ID, &user.Username, &user.Email, &hashedPassword)
	if err != nil {
		data := PageData{Title: "Login", Error: "Invalid credentials"}
		templates.ExecuteTemplate(w, "login.html", data)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)); err != nil {
		data := PageData{Title: "Login", Error: "Invalid credentials"}
		templates.ExecuteTemplate(w, "login.html", data)
		return
	}

	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID:   user.ID,
		Username: user.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		data := PageData{Title: "Login", Error: "Error creating session"}
		templates.ExecuteTemplate(w, "login.html", data)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    tokenString,
		Expires:  expirationTime,
		HttpOnly: true,
		Path:     "/",
	})

	http.Redirect(w, r, "/recipes", http.StatusSeeOther)
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:    "auth_token",
		Value:   "",
		Expires: time.Now().Add(-time.Hour),
		Path:    "/",
	})

	http.Redirect(w, r, "/recipes", http.StatusSeeOther)
}

func createRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	title := r.FormValue("title")
	description := r.FormValue("description")
	instructions := r.FormValue("instructions")
	prepTime, _ := strconv.Atoi(r.FormValue("prep_time"))
	cookTime, _ := strconv.Atoi(r.FormValue("cook_time"))
	servings, _ := strconv.Atoi(r.FormValue("servings"))

	if title == "" || instructions == "" {
		ingredients, _ := getAllIngredients()
		data := PageData{
			Title:       "New Recipe",
			User:        user,
			IsLoggedIn:  true,
			Ingredients: ingredients,
			Error:       "Title and instructions are required",
		}
		templates.ExecuteTemplate(w, "recipe-form.html", data)
		return
	}

	result, err := db.Exec(`
		INSERT INTO recipes (title, description, instructions, prep_time, cook_time, servings, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, title, description, instructions, prepTime, cookTime, servings, user.ID)

	if err != nil {
		ingredients, _ := getAllIngredients()
		data := PageData{
			Title:       "New Recipe",
			User:        user,
			IsLoggedIn:  true,
			Ingredients: ingredients,
			Error:       "Error creating recipe",
		}
		templates.ExecuteTemplate(w, "recipe-form.html", data)
		return
	}

	recipeID, _ := result.LastInsertId()

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
						db.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
							recipeID, ingredientID, quantity, unit)
					}
				}
			}
		}
	}

	http.Redirect(w, r, fmt.Sprintf("/recipe/%d", recipeID), http.StatusSeeOther)
}

func updateRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromToken(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var createdBy int
	err = db.QueryRow("SELECT created_by FROM recipes WHERE id = ?", id).Scan(&createdBy)
	if err != nil || createdBy != user.ID {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	var recipe Recipe
	if err := json.NewDecoder(r.Body).Decode(&recipe); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	_, err = db.Exec(`
		UPDATE recipes SET title = ?, description = ?, instructions = ?, 
		prep_time = ?, cook_time = ?, servings = ? WHERE id = ?
	`, recipe.Title, recipe.Description, recipe.Instructions,
		recipe.PrepTime, recipe.CookTime, recipe.Servings, id)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	db.Exec("DELETE FROM recipe_ingredients WHERE recipe_id = ?", id)
	for _, ing := range recipe.Ingredients {
		db.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
			id, ing.IngredientID, ing.Quantity, ing.Unit)
	}

	w.WriteHeader(http.StatusOK)
}

func deleteRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromToken(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var createdBy int
	err = db.QueryRow("SELECT created_by FROM recipes WHERE id = ?", id).Scan(&createdBy)
	if err != nil || createdBy != user.ID {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	_, err = db.Exec("DELETE FROM recipes WHERE id = ?", id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func createIngredientHandler(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromToken(r)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	name := r.FormValue("name")

	if name == "" {
		data := PageData{
			Title:      "New Ingredient",
			User:       user,
			IsLoggedIn: true,
			Error:      "Ingredient name is required",
		}
		templates.ExecuteTemplate(w, "ingredient-form.html", data)
		return
	}

	_, err = db.Exec("INSERT INTO ingredients (name) VALUES (?)", name)
	if err != nil {
		data := PageData{
			Title:      "New Ingredient",
			User:       user,
			IsLoggedIn: true,
			Error:      "Ingredient already exists or database error",
		}
		templates.ExecuteTemplate(w, "ingredient-form.html", data)
		return
	}

	http.Redirect(w, r, "/ingredients", http.StatusSeeOther)
}

func deleteIngredientHandler(w http.ResponseWriter, r *http.Request) {
	_, err := getUserFromToken(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	_, err = db.Exec("DELETE FROM ingredients WHERE id = ?", id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func searchHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	recipes, err := searchRecipes(query)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(recipes)
}

// Database helper functions
func getAllRecipes() ([]Recipe, error) {
	rows, err := db.Query(`
		SELECT r.id, r.title, r.description, r.instructions, r.prep_time, r.cook_time, 
		       r.servings, r.created_by, r.created_at, u.username
		FROM recipes r
		JOIN users u ON r.created_by = u.id
		ORDER BY r.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipes []Recipe
	for rows.Next() {
		var recipe Recipe
		err := rows.Scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions,
			&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.CreatedBy,
			&recipe.CreatedAt, &recipe.AuthorName)
		if err != nil {
			continue
		}

		recipe.Ingredients = getRecipeIngredients(recipe.ID)
		recipes = append(recipes, recipe)
	}

	return recipes, nil
}

func getRecipeByID(id int) (*Recipe, error) {
	var recipe Recipe
	err := db.QueryRow(`
		SELECT r.id, r.title, r.description, r.instructions, r.prep_time, r.cook_time, 
		       r.servings, r.created_by, r.created_at, u.username
		FROM recipes r
		JOIN users u ON r.created_by = u.id
		WHERE r.id = ?
	`, id).Scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions,
		&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.CreatedBy,
		&recipe.CreatedAt, &recipe.AuthorName)

	if err != nil {
		return nil, err
	}

	recipe.Ingredients = getRecipeIngredients(recipe.ID)
	return &recipe, nil
}

func searchRecipes(query string) ([]Recipe, error) {
	rows, err := db.Query(`
		SELECT r.id, r.title, r.description, r.instructions, r.prep_time, r.cook_time, 
		       r.servings, r.created_by, r.created_at, u.username
		FROM recipes r
		JOIN users u ON r.created_by = u.id
		WHERE r.title LIKE ? OR r.description LIKE ? OR r.instructions LIKE ?
		ORDER BY r.created_at DESC
	`, "%"+query+"%", "%"+query+"%", "%"+query+"%")

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipes []Recipe
	for rows.Next() {
		var recipe Recipe
		err := rows.Scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions,
			&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.CreatedBy,
			&recipe.CreatedAt, &recipe.AuthorName)
		if err != nil {
			continue
		}

		recipe.Ingredients = getRecipeIngredients(recipe.ID)
		recipes = append(recipes, recipe)
	}

	return recipes, nil
}

func getAllIngredients() ([]Ingredient, error) {
	rows, err := db.Query("SELECT id, name FROM ingredients ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ingredients []Ingredient
	for rows.Next() {
		var ingredient Ingredient
		err := rows.Scan(&ingredient.ID, &ingredient.Name)
		if err != nil {
			continue
		}
		ingredients = append(ingredients, ingredient)
	}

	return ingredients, nil
}

func getRecipeIngredients(recipeID int) []RecipeIngredient {
	rows, err := db.Query(`
		SELECT ri.ingredient_id, i.name, ri.unit, ri.quantity
		FROM recipe_ingredients ri
		JOIN ingredients i ON ri.ingredient_id = i.id
		WHERE ri.recipe_id = ?
		ORDER BY i.name
	`, recipeID)

	if err != nil {
		return []RecipeIngredient{}
	}
	defer rows.Close()

	var ingredients []RecipeIngredient
	for rows.Next() {
		var ing RecipeIngredient
		err := rows.Scan(&ing.IngredientID, &ing.Name, &ing.Unit, &ing.Quantity)
		if err != nil {
			continue
		}
		ingredients = append(ingredients, ing)
	}

	return ingredients
}
