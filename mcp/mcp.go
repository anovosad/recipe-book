// Package mcp exposes the recipe collection over the Model Context Protocol, so
// an AI client can read and write recipes directly.
//
// Transport is Streamable HTTP at POST /mcp, answering with plain JSON rather
// than an SSE stream - every tool here is a straightforward request/response,
// and a client that asks for a stream is told so.
//
// It is off unless MCP_TOKEN is set. There is no anonymous mode: the tools
// write to the database, and the endpoint is reachable by anything that can
// reach the site.
package mcp

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"

	"recipe-book/database"
	"recipe-book/models"
)

const (
	serverName      = "recipe-book"
	serverVersion   = "1.0.0"
	defaultProtocol = "2025-06-18"
)

// Versions we know how to speak. A client asking for one of these gets it back;
// anything else is answered with our default and left to decide.
var supportedProtocols = map[string]bool{
	"2024-11-05": true,
	"2025-03-26": true,
	"2025-06-18": true,
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type toolDefinition struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

type server struct {
	token    []byte
	username string
}

// Handler returns the /mcp handler and whether it should be mounted at all.
func Handler() (http.Handler, bool) {
	token := strings.TrimSpace(os.Getenv("MCP_TOKEN"))
	if token == "" {
		return nil, false
	}
	if len(token) < 24 {
		log.Println("⚠️  MCP_TOKEN is shorter than 24 characters - it is the only thing standing between the internet and your recipe database")
	}

	username := strings.TrimSpace(os.Getenv("MCP_USER"))
	if username == "" {
		username = "admin"
	}

	log.Printf("🔌 MCP endpoint enabled at /mcp, writing as %q", username)
	// Hashed so the comparison is over a fixed length whatever the token is.
	sum := sha256.Sum256([]byte(token))
	return &server{token: sum[:], username: username}, true
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		// handled below
	case http.MethodDelete:
		// Session teardown. This server keeps no session, so there is nothing
		// to tear down, but saying so is friendlier than a 405.
		w.WriteHeader(http.StatusNoContent)
		return
	default:
		// No server-initiated stream is offered, which the spec allows a server
		// to decline outright.
		w.Header().Set("Allow", "POST, DELETE")
		http.Error(w, "This MCP endpoint only accepts POST", http.StatusMethodNotAllowed)
		return
	}

	if !s.authorized(r) {
		w.Header().Set("WWW-Authenticate", `Bearer realm="recipe-book"`)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req rpcRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeRPC(w, rpcResponse{JSONRPC: "2.0", Error: &rpcError{Code: -32700, Message: "Parse error: " + err.Error()}})
		return
	}

	// A notification carries no id and expects no response body.
	if len(req.ID) == 0 {
		w.WriteHeader(http.StatusAccepted)
		return
	}

	result, rpcErr := s.dispatch(req)
	if rpcErr != nil {
		writeRPC(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: rpcErr})
		return
	}
	writeRPC(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: result})
}

func (s *server) authorized(r *http.Request) bool {
	header := r.Header.Get("Authorization")
	presented, found := strings.CutPrefix(header, "Bearer ")
	if !found {
		return false
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(presented)))
	return subtle.ConstantTimeCompare(sum[:], s.token) == 1
}

func (s *server) dispatch(req rpcRequest) (any, *rpcError) {
	switch req.Method {
	case "initialize":
		var params struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(req.Params, &params)

		protocol := defaultProtocol
		if supportedProtocols[params.ProtocolVersion] {
			protocol = params.ProtocolVersion
		}

		return map[string]any{
			"protocolVersion": protocol,
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
			"serverInfo":      map[string]any{"name": serverName, "version": serverVersion},
			"instructions": "Recipes for one household. Read what is already there before adding, " +
				"so the same dish is not stored twice. create_recipe takes ingredient and tag " +
				"names rather than ids and creates any that are missing, so a recipe read off a " +
				"web page can be handed over as-is.",
		}, nil

	case "ping":
		return map[string]any{}, nil

	case "tools/list":
		return map[string]any{"tools": toolDefinitions()}, nil

	case "tools/call":
		return s.callTool(req.Params)
	}

	return nil, &rpcError{Code: -32601, Message: "Unknown method: " + req.Method}
}

func (s *server) callTool(raw json.RawMessage) (any, *rpcError) {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, &rpcError{Code: -32602, Message: "Invalid params: " + err.Error()}
	}

	handler, known := s.tools()[params.Name]
	if !known {
		return nil, &rpcError{Code: -32602, Message: "Unknown tool: " + params.Name}
	}

	// A tool that fails comes back as a successful call carrying isError, not as
	// a protocol error: the model is meant to read the reason and try again.
	value, err := handler(params.Arguments)
	if err != nil {
		return toolResult(map[string]any{"error": err.Error()}, true), nil
	}
	return toolResult(value, false), nil
}

// toolResult carries the payload twice: as text, which every protocol version
// understands, and as structuredContent for the ones that read it.
func toolResult(value any, isError bool) map[string]any {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		encoded = []byte(fmt.Sprintf("%v", value))
	}

	result := map[string]any{
		"content": []map[string]any{{"type": "text", "text": string(encoded)}},
		"isError": isError,
	}
	if structured, ok := value.(map[string]any); ok {
		result["structuredContent"] = structured
	}
	return result
}

func writeRPC(w http.ResponseWriter, response rpcResponse) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("mcp: failed to write response: %v", err)
	}
}

func (s *server) actingUser() (*models.User, error) {
	user, _, err := database.GetUserByUsernameSecure(s.username)
	if err != nil {
		return nil, fmt.Errorf("MCP_USER %q does not exist; set it to an account that does", s.username)
	}
	return user, nil
}

func recipeSummary(recipe models.Recipe) map[string]any {
	return map[string]any{
		"id":          recipe.ID,
		"title":       recipe.Title,
		"description": recipe.Description,
		"servings":    recipe.Servings,
		"prep_time":   recipe.PrepTime,
		"cook_time":   recipe.CookTime,
		"tags":        tagNames(recipe.Tags),
	}
}

func recipeDetail(recipe *models.Recipe) map[string]any {
	ingredients := make([]map[string]any, 0, len(recipe.Ingredients))
	for _, ingredient := range recipe.Ingredients {
		ingredients = append(ingredients, map[string]any{
			"name":     ingredient.Name,
			"quantity": ingredient.Quantity,
			"unit":     ingredient.Unit,
		})
	}

	return map[string]any{
		"id":           recipe.ID,
		"title":        recipe.Title,
		"description":  recipe.Description,
		"instructions": recipe.Instructions,
		"prep_time":    recipe.PrepTime,
		"cook_time":    recipe.CookTime,
		"servings":     recipe.Servings,
		"serving_unit": recipe.ServingUnit,
		"ingredients":  ingredients,
		"tags":         tagNames(recipe.Tags),
		"author":       recipe.AuthorName,
	}
}

func tagNames(tags []models.Tag) []string {
	names := make([]string, 0, len(tags))
	for _, tag := range tags {
		names = append(names, tag.Name)
	}
	sort.Strings(names)
	return names
}
