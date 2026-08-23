package apiresp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v (%q)", err, rec.Body.String())
	}
	return body
}

func TestSuccessResponsesCarrySuccessAndData(t *testing.T) {
	rec := httptest.NewRecorder()
	Data(rec, http.StatusOK, []string{"a", "b"})

	body := decode(t, rec)
	if body["success"] != true {
		t.Fatalf("expected success=true, got %v", body["success"])
	}
	if _, ok := body["data"].([]interface{}); !ok {
		t.Fatalf("expected data to hold the collection, got %T", body["data"])
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected a JSON content type, got %q", got)
	}
}

func TestCreatedSetsLocation(t *testing.T) {
	rec := httptest.NewRecorder()
	Created(rec, "/api/tags/7", "Tag created successfully", map[string]int{"id": 7})

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}
	if got := rec.Header().Get("Location"); got != "/api/tags/7" {
		t.Fatalf("expected the Location of the new resource, got %q", got)
	}
}

func TestErrorsCarryACodeAndNoData(t *testing.T) {
	rec := httptest.NewRecorder()
	Error(rec, http.StatusConflict, "Tag already exists")

	body := decode(t, rec)
	if body["success"] != false {
		t.Fatalf("expected success=false, got %v", body["success"])
	}
	if body["code"] != "conflict" {
		t.Fatalf("expected the code to follow the status, got %v", body["code"])
	}
	if _, present := body["data"]; present {
		t.Fatal("an error response must not carry data")
	}
}

func TestDetailsAreNestedNotSprayedOverTheTopLevel(t *testing.T) {
	rec := httptest.NewRecorder()
	ErrorDetails(rec, http.StatusConflict, "still in use", map[string]interface{}{
		"recipeCount": 2,
	})

	body := decode(t, rec)
	if _, present := body["recipeCount"]; present {
		t.Fatal("structured context belongs under details, not next to error")
	}
	details, ok := body["details"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected details to be an object, got %T", body["details"])
	}
	if details["recipeCount"] != float64(2) {
		t.Fatalf("expected the count inside details, got %v", details["recipeCount"])
	}
}

func TestEveryStatusHasACode(t *testing.T) {
	for _, status := range []int{400, 401, 403, 404, 405, 409, 413, 429, 500, 503} {
		if Code(status) == "" {
			t.Fatalf("status %d produced an empty code", status)
		}
	}
}
