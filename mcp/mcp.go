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

// Colours new tags cycle through, matching the palette the app seeds with, so a
// tag created from here does not stand out as the one grey chip.
var tagPalette = []string{
	"#ff6b6b", "#ff8e53", "#fab005", "#ffd93d",
	"#69db7c", "#4ecdc4", "#a8e6cf", "#74c0fc",
	"#9775fa", "#f06292", "#ff5722", "#9aa1ae",
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

// resolver turns the names a model has read off a page into the ids the
// database wants, creating whatever is missing. Names are matched case- and
// space-insensitively, so "olive oil" finds the seeded "Olive Oil" instead of
// creating a duplicate.
type resolver struct {
	ingredients map[string]int
	tags        map[string]int
	tagCount    int
}

func normalizeName(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(name), " "))
}

func newResolver() (*resolver, error) {
	r := &resolver{ingredients: map[string]int{}, tags: map[string]int{}}

	existingIngredients, err := database.GetAllIngredients()
	if err != nil {
		return nil, err
	}
	for _, ingredient := range existingIngredients {
		r.ingredients[normalizeName(ingredient.Name)] = ingredient.ID
	}

	existingTags, err := database.GetAllTags()
	if err != nil {
		return nil, err
	}
	for _, tag := range existingTags {
		r.tags[normalizeName(tag.Name)] = tag.ID
	}
	r.tagCount = len(existingTags)

	return r, nil
}

func (r *resolver) ingredientID(name string) (int, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, fmt.Errorf("ingredient name is empty")
	}
	if id, ok := r.ingredients[normalizeName(name)]; ok {
		return id, nil
	}

	created, err := database.CreateIngredientSecure(name)
	if err != nil {
		return 0, fmt.Errorf("could not add ingredient %q: %w", name, err)
	}
	r.ingredients[normalizeName(name)] = created.ID
	return created.ID, nil
}

func (r *resolver) tagID(name string) (int, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, fmt.Errorf("tag name is empty")
	}
	if id, ok := r.tags[normalizeName(name)]; ok {
		return id, nil
	}

	colour := tagPalette[r.tagCount%len(tagPalette)]
	created, err := database.CreateTagSecure(name, colour)
	if err != nil {
		return 0, fmt.Errorf("could not add tag %q: %w", name, err)
	}
	r.tags[normalizeName(name)] = created.ID
	r.tagCount++
	return created.ID, nil
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
