package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"recipe-book/database"
	"recipe-book/handlers"
	"recipe-book/middleware"
	"recipe-book/utils"

	"github.com/gorilla/mux"
)

func main() {
	// Check for health check flag
	if len(os.Args) > 1 && os.Args[1] == "--health-check" {
		healthCheck()
		return
	}

	// Initialize components
	database.InitDB()
	utils.LoadTemplates()

	// Initialize security manager
	securityConfig := middleware.DefaultRateLimitConfig()
	securityManager := middleware.NewSecurityManager(securityConfig)

	// Create router
	r := mux.NewRouter()

	// Apply global middleware (order matters!)
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.RequestLogging())
	r.Use(securityManager.AddSecurityContext())
	r.Use(middleware.SQLInjectionProtection())
	r.Use(securityManager.GeneralRateLimit(securityConfig))

	// Health check endpoint
	r.HandleFunc("/health", healthCheckHandler).Methods("GET")

	// Page routes with specific security middleware
	r.HandleFunc("/", handlers.HomeHandler).Methods("GET")

	// Login page - no extra rate limiting on GET
	r.HandleFunc("/login", handlers.LoginPageHandler).Methods("GET")

	// Registration page - no extra rate limiting on GET
	r.HandleFunc("/register", handlers.RegisterPageHandler).Methods("GET")

	// Protected form routes
	r.HandleFunc("/recipe/new", handlers.NewRecipePageHandler).Methods("GET")
	r.HandleFunc("/recipe/{id}/edit", handlers.EditRecipePageHandler).Methods("GET", "POST")

	// Public recipe viewing routes
	r.HandleFunc("/recipes", handlers.RecipesPageHandler).Methods("GET")
	r.HandleFunc("/recipe/{id}", handlers.RecipePageHandler).Methods("GET")
	r.HandleFunc("/ingredients", handlers.IngredientsPageHandler).Methods("GET")
	r.HandleFunc("/ingredients/new", handlers.NewIngredientPageHandler).Methods("GET")

	// Tag routes
	r.HandleFunc("/tags", handlers.TagsPageHandler).Methods("GET")
	r.HandleFunc("/tags/new", handlers.NewTagPageHandler).Methods("GET")

	// API routes with specific rate limiting

	// Authentication API routes (with stricter rate limiting)
	loginRouter := r.PathPrefix("/api").Subrouter()
	loginRouter.Use(securityManager.LoginRateLimit(securityConfig))
	loginRouter.HandleFunc("/login", handlers.LoginHandler).Methods("POST")

	registerRouter := r.PathPrefix("/api").Subrouter()
	registerRouter.Use(securityManager.RegisterRateLimit(securityConfig))
	registerRouter.HandleFunc("/register", handlers.RegisterHandler).Methods("POST")

	// Search API (with search-specific rate limiting)
	searchRouter := r.PathPrefix("/api").Subrouter()
	searchRouter.Use(securityManager.SearchRateLimit(securityConfig))
	searchRouter.HandleFunc("/search", handlers.SearchHandler).Methods("GET")

	// Other API routes (protected by general rate limiting)
	r.HandleFunc("/api/logout", handlers.LogoutHandler).Methods("POST")
	r.HandleFunc("/api/recipes", handlers.CreateRecipeHandler).Methods("POST")
	r.HandleFunc("/api/recipes/{id}", handlers.UpdateRecipeHandler).Methods("PUT")
	r.HandleFunc("/api/recipes/{id}", handlers.DeleteRecipeHandler).Methods("DELETE")
	r.HandleFunc("/api/ingredients", handlers.CreateIngredientHandler).Methods("POST")
	r.HandleFunc("/api/ingredients/{id}", handlers.DeleteIngredientHandler).Methods("DELETE")

	// Tag API routes
	r.HandleFunc("/api/tags", handlers.CreateTagHandler).Methods("POST")
	r.HandleFunc("/api/tags/{id}", handlers.DeleteTagHandler).Methods("DELETE")

	// Image routes
	r.HandleFunc("/api/images/{id}", handlers.DeleteImageHandler).Methods("DELETE")

	// Serve static files (with some protection)
	staticHandler := http.StripPrefix("/static/", http.FileServer(http.Dir("./static/")))
	r.PathPrefix("/static/").Handler(staticHandler)

	// Serve uploaded images (with some protection)
	uploadsHandler := http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads/")))
	r.PathPrefix("/uploads/").Handler(uploadsHandler)

	fmt.Println("🍳 Recipe Book Server starting on :8080")
	fmt.Println("🔒 Security middleware enabled:")
	fmt.Println("   - Rate limiting: Login, Registration, Search, General")
	fmt.Println("   - SQL injection protection")
	fmt.Println("   - Security headers")
	fmt.Println("   - Request logging")
	fmt.Println("📖 Open http://localhost:8080 in your browser")

	log.Fatal(http.ListenAndServe(":8080", r))
}

// Health check function for Docker health checks
func healthCheck() {
	resp, err := http.Get("http://localhost:8080/health")
	if err != nil {
		fmt.Printf("Health check failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Health check failed with status: %d\n", resp.StatusCode)
		os.Exit(1)
	}

	fmt.Println("Health check passed")
	os.Exit(0)
}

// Health check handler
func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	// Basic health check - you can add database connectivity check here
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"healthy","service":"recipe-book"}`))
}
