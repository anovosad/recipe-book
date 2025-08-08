package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"recipe-book/database"
	"recipe-book/handlers"
	"recipe-book/middleware"
	"strings"

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

	// Initialize security manager
	securityConfig := middleware.DefaultRateLimitConfig()
	securityManager := middleware.NewSecurityManager(securityConfig)

	// Create router
	r := mux.NewRouter()

	// Apply global middleware (order matters!)
	r.Use(middleware.CORSMiddleware()) // Add CORS support
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.RequestLogging())
	r.Use(securityManager.AddSecurityContext())
	r.Use(middleware.SQLInjectionProtection())
	r.Use(securityManager.GeneralRateLimit(securityConfig))

	// Health check endpoint
	r.HandleFunc("/health", healthCheckHandler).Methods("GET")

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
	r.HandleFunc("/api/auth/check", handlers.CheckAuthHandler).Methods("GET")

	// Recipe API routes (JSON only)
	r.HandleFunc("/api/recipes", handlers.GetRecipesHandler).Methods("GET")
	r.HandleFunc("/api/recipes", handlers.CreateRecipeHandler).Methods("POST")
	r.HandleFunc("/api/recipes/{id:[0-9]+}", handlers.GetRecipeHandler).Methods("GET")
	r.HandleFunc("/api/recipes/{id:[0-9]+}", handlers.UpdateRecipeHandler).Methods("PUT")
	r.HandleFunc("/api/recipes/{id:[0-9]+}", handlers.DeleteRecipeHandler).Methods("DELETE")

	// Recipe Image API routes (form-data only)
	r.HandleFunc("/api/recipes/{id:[0-9]+}/images", handlers.UploadRecipeImagesHandler).Methods("POST")
	r.HandleFunc("/api/images/{id:[0-9]+}", handlers.DeleteImageHandler).Methods("DELETE")

	// Ingredient API routes (JSON only)
	r.HandleFunc("/api/ingredients", handlers.GetIngredientsHandler).Methods("GET")
	r.HandleFunc("/api/ingredients", handlers.CreateIngredientHandler).Methods("POST")
	r.HandleFunc("/api/ingredients/{id:[0-9]+}", handlers.DeleteIngredientHandler).Methods("DELETE")

	// Tag API routes (JSON only)
	r.HandleFunc("/api/tags", handlers.GetTagsHandler).Methods("GET")
	r.HandleFunc("/api/tags", handlers.CreateTagHandler).Methods("POST")
	r.HandleFunc("/api/tags/{id:[0-9]+}", handlers.DeleteTagHandler).Methods("DELETE")

	// Serve uploaded images (with some protection)
	uploadsHandler := http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads/")))
	r.PathPrefix("/uploads/").Handler(uploadsHandler)

	// Serve static files from the built React app
	staticDir := "./static/dist/"

	// Check if static files exist
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		log.Printf("⚠️  Static files not found at %s", staticDir)
		log.Printf("🛠️  Please build the frontend first:")
		log.Printf("   cd frontend && npm install && npm run build")
	}

	// Serve static files (JS, CSS, images, etc.)
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))
	r.PathPrefix("/assets/").Handler(http.StripPrefix("/assets/", http.FileServer(http.Dir(staticDir+"assets/"))))

	// SPA fallback: serve index.html for all non-API routes
	r.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Don't serve index.html for API routes or specific file requests
		if strings.HasPrefix(r.URL.Path, "/api/") ||
			strings.HasPrefix(r.URL.Path, "/uploads/") ||
			strings.HasPrefix(r.URL.Path, "/static/") ||
			strings.HasPrefix(r.URL.Path, "/assets/") ||
			r.URL.Path == "/health" ||
			filepath.Ext(r.URL.Path) != "" {
			http.NotFound(w, r)
			return
		}

		indexPath := filepath.Join(staticDir, "index.html")
		if _, err := os.Stat(indexPath); os.IsNotExist(err) {
			http.Error(w, "Frontend not built. Please run 'cd frontend && npm run build'", http.StatusServiceUnavailable)
			return
		}

		http.ServeFile(w, r, indexPath)
	})

	fmt.Println("🍳 Recipe Book Server starting on :8080")
	fmt.Println("🔒 Security middleware enabled:")
	fmt.Println("   - CORS enabled")
	fmt.Println("   - Rate limiting: Login, Registration, Search, General")
	fmt.Println("   - SQL injection protection")
	fmt.Println("   - Security headers")
	fmt.Println("   - Request logging")
	fmt.Println("")
	fmt.Println("📡 API Endpoints:")
	fmt.Println("   JSON APIs:")
	fmt.Println("     - POST   /api/register")
	fmt.Println("     - POST   /api/login")
	fmt.Println("     - POST   /api/logout")
	fmt.Println("     - GET    /api/auth/check")
	fmt.Println("     - GET    /api/recipes")
	fmt.Println("     - POST   /api/recipes")
	fmt.Println("     - GET    /api/recipes/{id}")
	fmt.Println("     - PUT    /api/recipes/{id}")
	fmt.Println("     - DELETE /api/recipes/{id}")
	fmt.Println("     - GET    /api/ingredients")
	fmt.Println("     - POST   /api/ingredients")
	fmt.Println("     - DELETE /api/ingredients/{id}")
	fmt.Println("     - GET    /api/tags")
	fmt.Println("     - POST   /api/tags")
	fmt.Println("     - DELETE /api/tags/{id}")
	fmt.Println("     - GET    /api/search")
	fmt.Println("     - DELETE /api/images/{id}")
	fmt.Println("")
	fmt.Println("   Form-data APIs:")
	fmt.Println("     - POST   /api/recipes/{id}/images")
	fmt.Println("")
	fmt.Println("   Static files:")
	fmt.Println("     - GET    /uploads/{filename}")
	fmt.Println("")
	fmt.Println("📖 Open http://localhost:8080 in your browser")
	fmt.Printf("📁 Serving static files from: %s\n", staticDir)

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
