package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"recipe-book/apiresp"
	"recipe-book/middleware"
)

const (
	// maxJSONBodyBytes caps request bodies for the JSON endpoints. The largest
	// legitimate payload is a recipe (instructions are capped at 10k characters),
	// so 1MB leaves generous room while keeping an endless body out of memory.
	maxJSONBodyBytes = 1 << 20

	// maxUploadBytes caps a whole multipart upload: 5 images x 5MB plus overhead.
	maxUploadBytes = 32 << 20

	// maxImagesPerUpload is how many images one request may attach to a recipe.
	maxImagesPerUpload = 5
)

// decodeJSONBody caps the body before decoding it. Without the limit a client
// could stream an unbounded body straight into the decoder.
func decodeJSONBody(w http.ResponseWriter, r *http.Request, dst interface{}) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	return json.NewDecoder(r.Body).Decode(dst)
}

// getClientIP defers to the middleware, which only honours X-Forwarded-For and
// X-Real-IP from a trusted proxy. This used to be a second, credulous copy of
// that logic, so any client could choose the address written to the security log.
func getClientIP(r *http.Request) string {
	return middleware.ClientIP(r)
}

// The /api response contract lives in package apiresp, because the middleware
// answers requests too - a rate limit or a rejected body never reaches a
// handler - and handlers already imports middleware. These wrappers keep the
// call sites short.

func sendJSONData(w http.ResponseWriter, statusCode int, data interface{}) {
	apiresp.Data(w, statusCode, data)
}

func sendJSONMeta(w http.ResponseWriter, statusCode int, data, meta interface{}) {
	apiresp.Meta(w, statusCode, data, meta)
}

func sendJSONCreated(w http.ResponseWriter, location, message string, data interface{}) {
	apiresp.Created(w, location, message, data)
}

func sendJSONSuccess(w http.ResponseWriter, message string, data interface{}) {
	apiresp.Success(w, message, data)
}

func sendJSONError(w http.ResponseWriter, statusCode int, message string) {
	apiresp.Error(w, statusCode, message)
}

func sendJSONErrorDetails(w http.ResponseWriter, statusCode int, message string, details interface{}) {
	apiresp.ErrorDetails(w, statusCode, message, details)
}

// NotFoundHandler and MethodNotAllowedHandler keep the two responses the router
// generates itself in the same shape as everything else; mux answers with plain
// text otherwise, which a JSON client cannot read.
func NotFoundHandler(w http.ResponseWriter, r *http.Request) {
	sendJSONError(w, http.StatusNotFound, "Endpoint not found")
}

func MethodNotAllowedHandler(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sendJSONError(w, http.StatusMethodNotAllowed, "Method not allowed for this endpoint")
}
