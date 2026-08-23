// Package apiresp defines the single response contract for /api.
//
// It lives in its own package because both the handlers and the middleware
// answer requests - a rate limit or a rejected body never reaches a handler -
// and handlers already imports middleware, so the shape cannot live in either
// of them without a cycle or a second copy that drifts.
//
// Every response is one of two shapes:
//
//	{"success": true,  "data": <resource|collection|null>, "message": ..., "meta": ...}
//	{"success": false, "error": "human readable", "code": "machine_readable", "details": ...}
package apiresp

import (
	"encoding/json"
	"log"
	"net/http"
)

// Envelope is the JSON body of every /api response.
type Envelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
	Meta    interface{} `json:"meta,omitempty"`
	Error   string      `json:"error,omitempty"`
	Code    string      `json:"code,omitempty"`
	Details interface{} `json:"details,omitempty"`
}

// Write is the only place that touches the response writer.
func Write(w http.ResponseWriter, statusCode int, body Envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}

// Data returns a resource or a collection.
func Data(w http.ResponseWriter, statusCode int, data interface{}) {
	Write(w, statusCode, Envelope{Success: true, Data: data})
}

// Meta returns a collection together with information about the query that
// produced it (the search term and the result count, for instance).
func Meta(w http.ResponseWriter, statusCode int, data, meta interface{}) {
	Write(w, statusCode, Envelope{Success: true, Data: data, Meta: meta})
}

// Created answers a POST that created a resource: 201 plus the Location of the
// thing that now exists.
func Created(w http.ResponseWriter, location, message string, data interface{}) {
	if location != "" {
		w.Header().Set("Location", location)
	}
	Write(w, http.StatusCreated, Envelope{Success: true, Message: message, Data: data})
}

// Success answers a mutation that did not create anything.
func Success(w http.ResponseWriter, message string, data interface{}) {
	Write(w, http.StatusOK, Envelope{Success: true, Message: message, Data: data})
}

// Error reports a failure.
func Error(w http.ResponseWriter, statusCode int, message string) {
	ErrorDetails(w, statusCode, message, nil)
}

// ErrorDetails adds structured context to a failure - which recipes still use
// the ingredient a client tried to delete, how long a block still has to run.
func ErrorDetails(w http.ResponseWriter, statusCode int, message string, details interface{}) {
	Write(w, statusCode, Envelope{
		Success: false,
		Error:   message,
		Code:    Code(statusCode),
		Details: details,
	})
}

// Code maps a status to the machine-readable code carried in the body, so that
// no call site can invent its own vocabulary.
func Code(statusCode int) string {
	switch statusCode {
	case http.StatusBadRequest:
		return "bad_request"
	case http.StatusUnauthorized:
		return "unauthorized"
	case http.StatusForbidden:
		return "forbidden"
	case http.StatusNotFound:
		return "not_found"
	case http.StatusMethodNotAllowed:
		return "method_not_allowed"
	case http.StatusConflict:
		return "conflict"
	case http.StatusRequestEntityTooLarge:
		return "payload_too_large"
	case http.StatusTooManyRequests:
		return "rate_limited"
	case http.StatusServiceUnavailable:
		return "unavailable"
	default:
		if statusCode >= 500 {
			return "internal_error"
		}
		return "error"
	}
}
