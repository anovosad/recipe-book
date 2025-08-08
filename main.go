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
	"time"

	"github.com/gorilla/mux"
)

func main() {
	// Check for health check flag
	if len(os.Args) > 1 && os.Args[1] == "--health-check" {
		healthCheck()
		return
	}

	// Initialize database in background
	go func() {
		database.InitDB()
		log.Println("✅ Database initialization completed")
	}()

	// Create router immediately
	r := mux.NewRouter()

	// Apply global middleware (order matters!)
	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CacheHeaders())          // Add caching middleware
	r.Use(middleware.CompressionMiddleware()) // Add compression
	r.Use(middleware.RequestLogging())

	// Initialize security manager with lighter config for startup
	securityConfig := middleware.LightRateLimitConfig() // Use lighter config
	securityManager := middleware.NewSecurityManager(securityConfig)
	r.Use(securityManager.AddSecurityContext())
	r.Use(middleware.SQLInjectionProtection())
	r.Use(securityManager.GeneralRateLimit(securityConfig))

	// Health check endpoint (no database dependency)
	r.HandleFunc("/health", quickHealthCheckHandler).Methods("GET")

	// API routes with specific rate limiting
	setupAPIRoutes(r, securityManager, securityConfig)

	// Static file serving with caching
	setupStaticRoutes(r)

	// SPA fallback
	setupSPAFallback(r)

	fmt.Println("🚀 Recipe Book Server starting on :8080 (Fast Mode)")
	fmt.Println("📦 Database initializing in background...")
	log.Fatal(http.ListenAndServe(":8080", r))
}

func setupAPIRoutes(r *mux.Router, sm *middleware.SecurityManager, config *middleware.RateLimitConfig) {
	// Authentication API routes
	loginRouter := r.PathPrefix("/api").Subrouter()
	loginRouter.Use(sm.LoginRateLimit(config))
	loginRouter.HandleFunc("/login", handlers.LoginHandler).Methods("POST")

	registerRouter := r.PathPrefix("/api").Subrouter()
	registerRouter.Use(sm.RegisterRateLimit(config))
	registerRouter.HandleFunc("/register", handlers.RegisterHandler).Methods("POST")

	// Search API
	searchRouter := r.PathPrefix("/api").Subrouter()
	searchRouter.Use(sm.SearchRateLimit(config))
	searchRouter.HandleFunc("/search", handlers.SearchHandler).Methods("GET")

	// Other API routes
	r.HandleFunc("/api/logout", handlers.LogoutHandler).Methods("POST")
	r.HandleFunc("/api/auth/check", handlers.CheckAuthHandler).Methods("GET")

	// Recipe API routes
	r.HandleFunc("/api/recipes", handlers.GetRecipesHandler).Methods("GET")
	r.HandleFunc("/api/recipes", handlers.CreateRecipeHandler).Methods("POST")
	r.HandleFunc("/api/recipes/{id:[0-9]+}", handlers.GetRecipeHandler).Methods("GET")
	r.HandleFunc("/api/recipes/{id:[0-9]+}", handlers.UpdateRecipeHandler).Methods("PUT")
	r.HandleFunc("/api/recipes/{id:[0-9]+}", handlers.DeleteRecipeHandler).Methods("DELETE")

	// Recipe Image API routes
	r.HandleFunc("/api/recipes/{id:[0-9]+}/images", handlers.UploadRecipeImagesHandler).Methods("POST")
	r.HandleFunc("/api/images/{id:[0-9]+}", handlers.DeleteImageHandler).Methods("DELETE")

	// Ingredient API routes
	r.HandleFunc("/api/ingredients", handlers.GetIngredientsHandler).Methods("GET")
	r.HandleFunc("/api/ingredients", handlers.CreateIngredientHandler).Methods("POST")
	r.HandleFunc("/api/ingredients/{id:[0-9]+}", handlers.DeleteIngredientHandler).Methods("DELETE")

	// Tag API routes
	r.HandleFunc("/api/tags", handlers.GetTagsHandler).Methods("GET")
	r.HandleFunc("/api/tags", handlers.CreateTagHandler).Methods("POST")
	r.HandleFunc("/api/tags/{id:[0-9]+}", handlers.DeleteTagHandler).Methods("DELETE")
}

func setupStaticRoutes(r *mux.Router) {
	// Serve uploaded images with cache headers
	uploadsHandler := http.StripPrefix("/uploads/", addCacheHeaders(http.FileServer(http.Dir("./uploads/")), 86400)) // 1 day
	r.PathPrefix("/uploads/").Handler(uploadsHandler)

	// Serve static files from React build with aggressive caching
	staticDir := "./static/dist/"

	// Check if static files exist
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		log.Printf("⚠️  Static files not found at %s", staticDir)
	}

	// Serve static assets with long cache
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", addCacheHeaders(http.FileServer(http.Dir(staticDir)), 31536000)))           // 1 year
	r.PathPrefix("/assets/").Handler(http.StripPrefix("/assets/", addCacheHeaders(http.FileServer(http.Dir(staticDir+"assets/")), 31536000))) // 1 year
}

func setupSPAFallback(r *mux.Router) {
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

		staticDir := "./static/dist/"
		indexPath := filepath.Join(staticDir, "index.html")
		if _, err := os.Stat(indexPath); os.IsNotExist(err) {
			http.Error(w, "Frontend not built. Please run 'cd frontend && npm run build'", http.StatusServiceUnavailable)
			return
		}

		// Add cache headers for HTML (short cache)
		w.Header().Set("Cache-Control", "public, max-age=300") // 5 minutes
		http.ServeFile(w, r, indexPath)
	})
}

// Helper function to add cache headers
func addCacheHeaders(h http.Handler, maxAge int) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", maxAge))
		w.Header().Set("Expires", time.Now().Add(time.Duration(maxAge)*time.Second).UTC().Format(http.TimeFormat))
		h.ServeHTTP(w, r)
	})
}

// Quick health check that doesn't depend on database
func quickHealthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"healthy","service":"recipe-book","timestamp":"` + time.Now().UTC().Format(time.RFC3339) + `"}`))
}

// Regular health check function for Docker
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
