// File: main.go
package main

import (
	"fmt"
	"log"
	"net/http"
	"recipe-book/database"
	"recipe-book/handlers"
	"recipe-book/utils"

	"github.com/gorilla/mux"
)

func main() {
	// Initialize components
	database.InitDB()
	utils.LoadTemplates()

	// Create router
	r := mux.NewRouter()

	// Page routes
	r.HandleFunc("/", handlers.HomeHandler).Methods("GET")
	r.HandleFunc("/login", handlers.LoginPageHandler).Methods("GET")
	r.HandleFunc("/register", handlers.RegisterPageHandler).Methods("GET")
	r.HandleFunc("/recipes", handlers.RecipesPageHandler).Methods("GET")
	r.HandleFunc("/recipe/new", handlers.NewRecipePageHandler).Methods("GET")
	r.HandleFunc("/recipe/{id}/edit", handlers.EditRecipePageHandler).Methods("GET", "POST")
	r.HandleFunc("/recipe/{id}", handlers.RecipePageHandler).Methods("GET")
	r.HandleFunc("/ingredients", handlers.IngredientsPageHandler).Methods("GET")
	r.HandleFunc("/ingredients/new", handlers.NewIngredientPageHandler).Methods("GET")

	// API routes
	r.HandleFunc("/api/register", handlers.RegisterHandler).Methods("POST")
	r.HandleFunc("/api/login", handlers.LoginHandler).Methods("POST")
	r.HandleFunc("/api/logout", handlers.LogoutHandler).Methods("POST")
	r.HandleFunc("/api/recipes", handlers.CreateRecipeHandler).Methods("POST")
	r.HandleFunc("/api/recipes/{id}", handlers.UpdateRecipeHandler).Methods("PUT")
	r.HandleFunc("/api/recipes/{id}", handlers.DeleteRecipeHandler).Methods("DELETE")
	r.HandleFunc("/api/ingredients", handlers.CreateIngredientHandler).Methods("POST")
	r.HandleFunc("/api/ingredients/{id}", handlers.DeleteIngredientHandler).Methods("DELETE")
	r.HandleFunc("/api/search", handlers.SearchHandler).Methods("GET")

	// Image routes
	r.HandleFunc("/api/images/{id}", handlers.DeleteImageHandler).Methods("DELETE")

	// Serve static files
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("./static/"))))

	// Serve uploaded images
	r.PathPrefix("/uploads/").Handler(http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads/"))))

	fmt.Println("🍳 Recipe Book Server starting on :8080")
	fmt.Println("📖 Open http://localhost:8080 in your browser")
	log.Fatal(http.ListenAndServe(":8080", r))
}
