package handlers

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"strings"
)

// Helper function to get client IP with proper header checking
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header (for reverse proxies)
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	// Check X-Real-IP header
	xri := r.Header.Get("X-Real-IP")
	if xri != "" {
		return strings.TrimSpace(xri)
	}

	// Fall back to RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// Helper function to send JSON response
func sendJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}

// Helper function to send JSON error response
func sendJSONError(w http.ResponseWriter, statusCode int, message string) {
	sendJSONResponse(w, statusCode, map[string]string{"error": message})
}

// Helper function to send JSON success response
func sendJSONSuccess(w http.ResponseWriter, message string, data interface{}) {
	response := map[string]interface{}{
		"success": true,
		"message": message,
	}
	if data != nil {
		response["data"] = data
	}
	sendJSONResponse(w, http.StatusOK, response)
}
