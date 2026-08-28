package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"recipe-book/database"
	"recipe-book/handlers"
	"recipe-book/importer"
	"recipe-book/mcp"
	"recipe-book/middleware"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

func main() {
	// Check for health check flag. Both spellings are accepted because the
	// Dockerfile HEALTHCHECK passes the single-dash form; with only the double-dash
	// form recognised the probe fell through to starting a second server, which
	// failed to bind :8080 and reported the container unhealthy.
	if len(os.Args) > 1 && (os.Args[1] == "--health-check" || os.Args[1] == "-health-check") {
		healthCheck()
		return
	}

	// Initialise the database before accepting requests. Doing this in a goroutine
	// while the server was already listening meant any request arriving first
	// dereferenced a nil database.DB and nil prepared statements, and raced with
	// the goroutine writing them.
	database.InitDB()
	log.Println("✅ Database initialization completed")

	// Create router
	r := mux.NewRouter()

	// Apply global middleware (order matters!)
	r.Use(middleware.Recovery())
	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CacheHeaders())          // Add caching middleware
	r.Use(middleware.CompressionMiddleware()) // Add compression
	r.Use(middleware.RequestLogging())

	// Initialize security manager with lighter config for startup
	securityConfig := middleware.LightRateLimitConfig() // Use lighter config
	securityManager := middleware.NewSecurityManager(securityConfig)
	r.Use(middleware.SQLInjectionProtection())
	r.Use(securityManager.GeneralRateLimit())

	// Health check endpoint (no database dependency)
	r.HandleFunc("/health", quickHealthCheckHandler).Methods("GET")

	// Importing a recipe from a URL needs a key to reach the AI with. Without
	// one the route is left unmounted and the frontend hides the field, rather
	// than offering something that answers with the same failure every time.
	if service, enabled := importer.New(); enabled {
		handlers.EnableRecipeImport(service)
	}

	// API routes with specific rate limiting
	setupAPIRoutes(r, securityManager)

	// The Model Context Protocol endpoint, so an AI client can read and write
	// recipes directly. Mounted only when MCP_TOKEN is set - it writes to the
	// database and is reachable by anything that can reach the site.
	if handler, enabled := mcp.Handler(); enabled {
		r.Handle("/mcp", handler)
	}

	// Static file serving with caching
	setupStaticRoutes(r)

	// SPA fallback, plus the 405 mux can now reach because the fallback is no
	// longer a route that matches every path.
	setupSPAFallback(r)
	r.MethodNotAllowedHandler = http.HandlerFunc(handlers.MethodNotAllowedHandler)

	// Timeouts are what keep a slow or idle client from holding a connection open
	// indefinitely; the zero-value server has none.
	srv := &http.Server{
		Addr:              ":8080",
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	fmt.Println("🚀 Recipe Book Server starting on :8080")
	log.Fatal(srv.ListenAndServe())
}

func setupAPIRoutes(r *mux.Router, sm *middleware.SecurityManager) {
	// Authentication API routes
	loginRouter := r.PathPrefix("/api").Subrouter()
	loginRouter.Use(sm.LoginRateLimit())
	loginRouter.HandleFunc("/login", handlers.LoginHandler).Methods("POST")

	registerRouter := r.PathPrefix("/api").Subrouter()
	registerRouter.Use(sm.RegisterRateLimit())
	registerRouter.HandleFunc("/register", handlers.RegisterHandler).Methods("POST")

	// Search API
	searchRouter := r.PathPrefix("/api").Subrouter()
	searchRouter.Use(sm.SearchRateLimit())
	searchRouter.HandleFunc("/search", handlers.SearchHandler).Methods("GET")

	// The rest of the API lives on its own subrouter so that mux can answer 404
	// and 405 itself. Registered on the root router, an /api request with the
	// wrong method matched no route and fell through to the SPA catch-all, which
	// could only call it a 404. The three subrouters above stay separate because
	// they carry their own rate limits; a PathPrefix subrouter that matches no
	// inner route lets mux continue to the next route, which is what makes this
	// ordering work.
	api := r.PathPrefix("/api").Subrouter()
	// Both, and the same handler for both: there are two routes to a 405 - mux
	// spotting the mismatch itself, or the request falling through to the
	// NotFoundHandler - and only the probing one knows which methods to name in
	// Allow. Wiring the plain handler to the first left /api/tags/{id} answering
	// 405 with no Allow at all, depending on nothing more than which route
	// happened to be registered last.
	api.NotFoundHandler = apiNotFoundHandler(api)
	api.MethodNotAllowedHandler = apiNotFoundHandler(api)

	// Other API routes
	api.HandleFunc("/logout", handlers.LogoutHandler).Methods("POST")
	api.HandleFunc("/auth/check", handlers.CheckAuthHandler).Methods("GET")

	// What this deployment can do. The frontend asks so it can hide the recipe
	// import where no API key is configured and the route below is unmounted.
	api.HandleFunc("/features", handlers.FeaturesHandler).Methods("GET")

	// Wrapped in the login limiter rather than registered on loginRouter: the
	// body carries a password guess and deserves that tighter budget, but a
	// route on one of the rate-limit subrouters is invisible to
	// apiNotFoundHandler, which probes `api` alone - so the wrong method on it
	// would come back 404 instead of 405.
	api.Handle("/auth/password",
		sm.LoginRateLimit()(http.HandlerFunc(handlers.ChangePasswordHandler))).Methods("PUT")

	// One route serves the collection and its filtered forms (?q=, ?tag=), which
	// GetRecipesHandler dispatches. A search is a filtered recipe collection, so
	// /api/recipes?q= is the REST spelling of /api/search and is wrapped in the
	// same, tighter rate limit - but only when a query is actually present.
	api.Handle("/recipes",
		sm.SearchRateLimitIfQuery()(http.HandlerFunc(handlers.GetRecipesHandler))).Methods("GET")
	api.HandleFunc("/recipes", handlers.CreateRecipeHandler).Methods("POST")

	// Reading a page with an AI costs money and pulls on somebody else's
	// server, so it carries the tightest budget there is rather than the
	// general one. Wrapped on `api` for the same reason /auth/password is:
	// apiNotFoundHandler probes this subrouter alone, so a route parked on one
	// of the rate-limit subrouters answers 404 to the wrong method instead of
	// 405. Registered only when there is a key to use, so that GET /api/import
	// and friends stay a plain 404 on a server that cannot do it at all.
	if handlers.RecipeImportAvailable() {
		api.Handle("/recipes/import",
			sm.ImportRateLimit()(http.HandlerFunc(handlers.ImportRecipeHandler))).Methods("POST")
	}
	// Translating an existing recipe, and filling in the ingredient and tag
	// names a migration could not. Both call the AI, so both sit behind the
	// import limiter and are only mounted when there is a key to call it with.
	if handlers.RecipeImportAvailable() {
		api.Handle("/recipes/{id:[0-9]+}/translate",
			sm.ImportRateLimit()(http.HandlerFunc(handlers.TranslateRecipeHandler))).Methods("POST")
		api.Handle("/translations/backfill",
			sm.ImportRateLimit()(http.HandlerFunc(handlers.BackfillTranslationsHandler))).Methods("POST")
	}

	api.HandleFunc("/recipes/tag/{id:[0-9]+}", handlers.GetRecipesByTagHandler).Methods("GET")
	api.HandleFunc("/recipes/{id:[0-9]+}", handlers.GetRecipeHandler).Methods("GET")
	api.HandleFunc("/recipes/{id:[0-9]+}", handlers.UpdateRecipeHandler).Methods("PUT")
	api.HandleFunc("/recipes/{id:[0-9]+}", handlers.DeleteRecipeHandler).Methods("DELETE")

	// Recipe Image API routes
	api.HandleFunc("/recipes/{id:[0-9]+}/images", handlers.UploadRecipeImagesHandler).Methods("POST")
	api.HandleFunc("/images/{id:[0-9]+}", handlers.DeleteImageHandler).Methods("DELETE")
	api.HandleFunc("/images/{id:[0-9]+}/cover", handlers.SetImageCoverHandler).Methods("PUT")

	// Ingredient API routes
	api.HandleFunc("/ingredients", handlers.GetIngredientsHandler).Methods("GET")
	api.HandleFunc("/ingredients", handlers.CreateIngredientHandler).Methods("POST")
	api.HandleFunc("/ingredients/{id:[0-9]+}", handlers.UpdateIngredientHandler).Methods("PUT")
	api.HandleFunc("/ingredients/{id:[0-9]+}", handlers.DeleteIngredientHandler).Methods("DELETE")

	// Tag API routes
	api.HandleFunc("/tags", handlers.GetTagsHandler).Methods("GET")
	api.HandleFunc("/tags", handlers.CreateTagHandler).Methods("POST")
	api.HandleFunc("/tags/{id:[0-9]+}", handlers.UpdateTagHandler).Methods("PUT")
	api.HandleFunc("/tags/{id:[0-9]+}", handlers.DeleteTagHandler).Methods("DELETE")
}

// apiNotFoundHandler separates "no such endpoint" from "wrong method for this
// endpoint" by asking the router which other methods would have matched.
//
// mux cannot be relied on for this: it records a method mismatch while matching,
// but any route registered afterwards whose path does not match clears that
// record, so MethodNotAllowedHandler only ever fires when the mismatched route
// happens to be the last one registered. Probing also gives us the Allow header,
// which a 405 is required to carry.
func apiNotFoundHandler(router *mux.Router) http.HandlerFunc {
	methods := []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete}

	return func(w http.ResponseWriter, r *http.Request) {
		var allowed []string
		for _, method := range methods {
			if method == r.Method {
				continue
			}

			probe := r.Clone(r.Context())
			probe.Method = method

			var match mux.RouteMatch
			if router.Match(probe, &match) && match.MatchErr == nil && match.Route != nil {
				allowed = append(allowed, method)
			}
		}

		if len(allowed) > 0 {
			w.Header().Set("Allow", strings.Join(allowed, ", "))
			handlers.MethodNotAllowedHandler(w, r)
			return
		}

		handlers.NotFoundHandler(w, r)
	}
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

// setupSPAFallback installs the SPA handler as the router's NotFoundHandler
// rather than as a PathPrefix("/") route. As a route it matched everything,
// including an /api request whose path was right but whose method was wrong, so
// mux never got to answer 405 - the fallback saw the path and could only call it
// a 404. As NotFoundHandler it runs only once mux has decided nothing matches.
func setupSPAFallback(r *mux.Router) {
	r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// An unmatched /api path is an API request that found no route: it gets the
		// same JSON error shape as every other API failure, not net/http's plain
		// "404 page not found".
		if strings.HasPrefix(r.URL.Path, "/api/") {
			handlers.NotFoundHandler(w, r)
			return
		}

		// Don't serve index.html for specific file requests
		if strings.HasPrefix(r.URL.Path, "/uploads/") ||
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
