package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gorilla/mux"

	"recipe-book/auth"
	"recipe-book/database"
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
		"registration":  registrationOpen(),
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

	draft, err := recipeImporter.Import(ctx, req.URL, requestLanguage(r))
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

type translateRequest struct {
	Language string `json:"language"`
}

// TranslateRecipeHandler adds one more language to a recipe that already
// exists, and stores it. Unlike the import, this one saves: the recipe was
// reviewed when it was created, and a translation of checked text is not the
// same gamble as reading a strange web page.
func TranslateRecipeHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}
	if recipeImporter == nil {
		sendJSONError(w, http.StatusServiceUnavailable, "Translation is not configured on this server")
		return
	}

	recipeID, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil || !utils.IsValidID(recipeID) {
		sendJSONError(w, http.StatusBadRequest, "Invalid recipe ID")
		return
	}

	var req translateRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}
	target := database.NormalizeLanguage(req.Language)

	texts, err := database.RecipeTextsFor(recipeID)
	if err != nil || len(texts) == 0 {
		sendJSONError(w, http.StatusNotFound, "Recipe not found")
		return
	}
	if _, done := texts[target]; done {
		sendJSONError(w, http.StatusConflict, "That recipe already exists in this language")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), importWorkBudget)
	defer cancel()
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(importWriteBudget)); err != nil {
		log.Printf("translate: could not extend the write deadline: %v", err)
	}

	translated, err := recipeImporter.TranslateRecipe(ctx, texts, target)
	if err != nil {
		if importer.IsInputError(err) {
			sendJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		sendJSONError(w, http.StatusInternalServerError, "Failed to translate that recipe")
		return
	}

	if err := database.SetRecipeText(recipeID, target, translated); err != nil {
		if database.IsValidationError(err) {
			sendJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		sendJSONError(w, http.StatusInternalServerError, "Failed to store the translation")
		return
	}

	utils.LogSecurityEvent("RECIPE_TRANSLATED", getClientIP(r),
		fmt.Sprintf("RecipeID:%d, Language:%s, User:%s", recipeID, target, user.Username))

	recipe, err := database.GetRecipeByIDSecure(recipeID, target)
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Translated, but could not read the recipe back")
		return
	}
	sendJSONSuccess(w, "Recipe translated", recipe)
}

// BackfillTranslationsHandler fills in the ingredient and tag names that have
// no version in one language.
//
// This is the one-off that finishes what the migration could not: the migration
// runs at startup and must not depend on an external API, so it renames what a
// built-in list covers and leaves the rest. This is the rest, run by a person
// who can see the result.
func BackfillTranslationsHandler(w http.ResponseWriter, r *http.Request) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return
	}
	if recipeImporter == nil {
		sendJSONError(w, http.StatusServiceUnavailable, "Translation is not configured on this server")
		return
	}

	var req translateRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}
	target := database.NormalizeLanguage(req.Language)

	missingIngredients, missingTags, err := database.MissingTranslations(target)
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Could not work out what is missing")
		return
	}
	if len(missingIngredients) == 0 && len(missingTags) == 0 {
		sendJSONSuccess(w, "Nothing was missing", map[string]int{"ingredients": 0, "tags": 0})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), importWorkBudget)
	defer cancel()
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(importWriteBudget)); err != nil {
		log.Printf("backfill: could not extend the write deadline: %v", err)
	}

	written := map[string]int{"ingredients": 0, "tags": 0}

	if len(missingIngredients) > 0 {
		names, err := recipeImporter.TranslateNames(ctx, missingIngredients, target, "ingredient")
		if err == nil {
			for id, name := range names {
				if database.SetIngredientTranslation(id, target, name) == nil {
					written["ingredients"]++
				}
			}
		}
	}
	if len(missingTags) > 0 {
		names, err := recipeImporter.TranslateNames(ctx, missingTags, target, "tag")
		if err == nil {
			for id, name := range names {
				if database.SetTagTranslation(id, target, name) == nil {
					written["tags"]++
				}
			}
		}
	}

	utils.LogSecurityEvent("TRANSLATIONS_BACKFILLED", getClientIP(r),
		fmt.Sprintf("Language:%s, Ingredients:%d, Tags:%d, User:%s", target, written["ingredients"], written["tags"], user.Username))

	sendJSONSuccess(w, "Translations filled in", written)
}
