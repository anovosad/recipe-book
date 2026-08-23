package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"recipe-book/handlers"
	"recipe-book/middleware"

	"github.com/gorilla/mux"
)

// buildRouter wires the API routes the way main() does. No handler runs in these
// tests - they only exercise routing - so the database is never touched.
func buildRouter() *mux.Router {
	r := mux.NewRouter()
	setupAPIRoutes(r, middleware.NewSecurityManager(middleware.LightRateLimitConfig()))
	setupStaticRoutes(r)
	setupSPAFallback(r)
	r.MethodNotAllowedHandler = http.HandlerFunc(handlers.MethodNotAllowedHandler)
	return r
}

func request(t *testing.T, r *mux.Router, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(method, target, nil))
	return rec
}

func TestUnknownAPIPathIs404(t *testing.T) {
	rec := request(t, buildRouter(), http.MethodGet, "/api/does-not-exist")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d (%q)", rec.Code, rec.Body.String())
	}
}

// mux clears its own record of a method mismatch as soon as a later route fails
// to match on path, so the router is probed explicitly. Without that, every one
// of these would answer 404.
func TestWrongMethodIs405WithAllow(t *testing.T) {
	cases := []struct {
		method, target, allow string
	}{
		{http.MethodPatch, "/api/recipes", "GET, POST"},
		{http.MethodPut, "/api/tags", "GET, POST"},
		{http.MethodPost, "/api/recipes/1", "GET, PUT, DELETE"},
		// Carries the login rate limit, but is registered on the api subrouter
		// so that apiNotFoundHandler can still see it. Put it on one of the
		// rate-limit subrouters instead and this case comes back 404.
		{http.MethodGet, "/api/auth/password", "PUT"},
	}

	r := buildRouter()
	for _, c := range cases {
		rec := request(t, r, c.method, c.target)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s %s: expected 405, got %d", c.method, c.target, rec.Code)
			continue
		}
		if got := rec.Header().Get("Allow"); got != c.allow {
			t.Errorf("%s %s: expected Allow %q, got %q", c.method, c.target, c.allow, got)
		}
	}
}

func TestSPARouteDoesNotSwallowAPIPaths(t *testing.T) {
	rec := request(t, buildRouter(), http.MethodGet, "/api/nope")
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("an unmatched API path must answer JSON, got %q", got)
	}
}
