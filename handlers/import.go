package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"recipe-book/auth"
	"recipe-book/importer"
	"recipe-book/utils"
)

// recipeImporter is nil unless main wired one in, which it only does when the
// service has an API key to work with. The route is not registered in that
// case, so the nil check below is belt and braces.
var recipeImporter *importer.Service

// EnableRecipeImport hands the handler the service main built. The importer is
// optional and configured from the environment, which is the same reason the
// MCP endpoint is mounted conditionally rather than answering with a failure.
func EnableRecipeImport(service *importer.Service) { recipeImporter = service }

// RecipeImportAvailable reports whether the endpoint should be mounted at all.
func RecipeImportAvailable() bool { return recipeImporter != nil }

// FeaturesHandler reports what this deployment can do, so the frontend can
// offer the URL import only where it will work. The import route is not even
// registered without an API key, and a button that answers 404 is worse than no
// button. Public and cheap: it says nothing a visitor could not learn by
// looking at the page.
func FeaturesHandler(w http.ResponseWriter, r *http.Request) {
	sendJSONData(w, http.StatusOK, map[string]bool{
		"recipe_import": RecipeImportAvailable(),
	})
}

const (
	// How long the work may take, and how long the socket is held open for it.
	// The gap is deliberate: the answer to a page that took too long should be
	// a 504 the frontend can show, not a connection cut mid-response.
	importWorkBudget  = 150 * time.Second
	importWriteBudget = 180 * time.Second
)

type importRequest struct {
	URL string `json:"url"`
}

// ImportRecipeHandler reads a recipe off a web page and answers with a draft.
//
// Nothing is saved: the draft goes to the recipe form for the person who asked
// to check before it becomes a recipe. The one exception is the taxonomy - an
// ingredient or tag the draft needs and the collection lacks is created here,
// so the draft can reference it by id like any other.
func ImportRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}
	if recipeImporter == nil {
		sendJSONError(w, http.StatusServiceUnavailable, "Recipe import is not configured on this server")
		return
	}

	clientIP := getClientIP(r)

	var req importRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	req.URL = strings.TrimSpace(req.URL)
	if req.URL == "" {
		sendJSONError(w, http.StatusBadRequest, "A recipe URL is required")
		return
	}
	if utf8.RuneCountInString(req.URL) > 2048 {
		sendJSONError(w, http.StatusBadRequest, "That URL is too long")
		return
	}

	// The server's WriteTimeout is 120s, which every other endpoint fits inside
	// several times over; this one does not, and hitting it would truncate the
	// JSON mid-object rather than fail cleanly. Extending the deadline for this
	// response alone is what ResponseController is for - raising the server's
	// default would hand every other handler the same latitude.
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(importWriteBudget)); err != nil {
		log.Printf("import: could not extend the write deadline: %v", err)
	}

	// The work itself stops sooner than the socket does, so a slow page fails
	// as a 504 rather than as a dropped connection. Tied to the request
	// context, so a client that gives up stops the work too.
	ctx, cancel := context.WithTimeout(r.Context(), importWorkBudget)
	defer cancel()

	draft, err := recipeImporter.Import(ctx, req.URL)
	if err != nil {
		// Same split as the recipe writes: a problem with what the caller gave
		// is echoed back, anything else is ours and stays generic.
		if importer.IsInputError(err) {
			sendJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		if ctx.Err() != nil {
			sendJSONError(w, http.StatusGatewayTimeout, "Reading that page took too long")
			return
		}
		sendJSONError(w, http.StatusInternalServerError, "Failed to import that recipe")
		return
	}

	utils.LogSecurityEvent("RECIPE_IMPORTED", clientIP,
		fmt.Sprintf("URL:%s, Title:%s, User:%s", draft.SourceURL, draft.Recipe.Title, user.Username))

	sendJSONData(w, http.StatusOK, draft)
}
