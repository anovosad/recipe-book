package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"

	"recipe-book/auth"
	"recipe-book/database"
	"recipe-book/models"
	"recipe-book/utils"
)

// Account management, for the people who are allowed to hand out accounts.
//
// It exists because registration is closed: the collection is shared, so an
// account carries the right to edit and delete anything in it, and leaving an
// open signup form on a public address hands that to whoever finds it. Somebody
// still has to be able to add the rest of the family, and doing it by editing
// an environment variable means a restart, which means the site goes down to
// add a cousin.
//
// is_admin is not a general privilege level. It answers one question - who may
// manage accounts - and nothing else in the app consults it.

// requireAdmin resolves the session and refuses anyone who cannot manage
// accounts. It answers 403 rather than 404 on purpose: the endpoint's existence
// is not a secret, and "you are not allowed" is the useful thing to be told.
func requireAdmin(w http.ResponseWriter, r *http.Request) (*models.User, bool) {
	user, err := auth.GetUserFromToken(r)
	if err != nil {
		sendJSONError(w, http.StatusUnauthorized, "Authentication required")
		return nil, false
	}
	if !user.IsAdmin {
		utils.LogSecurityEvent("ADMIN_ENDPOINT_REFUSED", getClientIP(r),
			fmt.Sprintf("User:%s, Path:%s", user.Username, r.URL.Path))
		sendJSONError(w, http.StatusForbidden, "Only an account administrator can do that")
		return nil, false
	}
	return user, true
}

// ListUsersHandler returns every account.
func ListUsersHandler(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireAdmin(w, r); !ok {
		return
	}

	users, err := database.ListUsers()
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Failed to list accounts")
		return
	}
	sendJSONData(w, http.StatusOK, users)
}

type createUserRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	IsAdmin  bool   `json:"is_admin"`
}

// CreateUserHandler adds an account, without a restart and without opening
// registration to the internet.
func CreateUserHandler(w http.ResponseWriter, r *http.Request) {
	admin, ok := requireAdmin(w, r)
	if !ok {
		return
	}
	clientIP := getClientIP(r)

	var req createUserRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)

	// The same validators the registration form uses; an account made here is
	// not a lesser account and must not be held to a lesser standard.
	for _, check := range []utils.ValidationResult{
		utils.ValidateUsername(req.Username),
		utils.ValidateEmail(req.Email),
		utils.ValidatePassword(req.Password),
	} {
		if !check.Valid {
			sendJSONError(w, http.StatusBadRequest, check.Message)
			return
		}
	}

	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	hashed := string(hashedBytes)
	if err != nil {
		sendJSONError(w, http.StatusInternalServerError, "Failed to create the account")
		return
	}

	if err := database.CreateUserWithRole(req.Username, req.Email, hashed, req.IsAdmin); err != nil {
		// UNIQUE on username and email, so a clash is the likely failure and
		// worth naming rather than reporting as a server fault.
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			sendJSONError(w, http.StatusConflict, "That username or email is already taken")
			return
		}
		sendJSONError(w, http.StatusInternalServerError, "Failed to create the account")
		return
	}

	utils.LogSecurityEvent("USER_CREATED", clientIP,
		fmt.Sprintf("New:%s, Admin:%t, By:%s", req.Username, req.IsAdmin, admin.Username))

	sendJSONCreated(w, "/api/users", "Account created", map[string]any{
		"username": req.Username,
		"email":    req.Email,
		"is_admin": req.IsAdmin,
	})
}

type setAdminRequest struct {
	IsAdmin bool `json:"is_admin"`
}

// SetUserAdminHandler grants or withdraws account administration.
func SetUserAdminHandler(w http.ResponseWriter, r *http.Request) {
	admin, ok := requireAdmin(w, r)
	if !ok {
		return
	}

	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil || !utils.IsValidID(id) {
		sendJSONError(w, http.StatusBadRequest, "Invalid account ID")
		return
	}

	var req setAdminRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		sendJSONError(w, http.StatusBadRequest, "Invalid JSON data")
		return
	}

	if err := database.SetUserAdmin(id, req.IsAdmin); err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			sendJSONError(w, http.StatusNotFound, "No such account")
		case database.IsValidationError(err):
			sendJSONError(w, http.StatusConflict, err.Error())
		default:
			sendJSONError(w, http.StatusInternalServerError, "Failed to change the account")
		}
		return
	}

	utils.LogSecurityEvent("USER_ADMIN_CHANGED", getClientIP(r),
		fmt.Sprintf("AccountID:%d, Admin:%t, By:%s", id, req.IsAdmin, admin.Username))

	users, _ := database.ListUsers()
	sendJSONSuccess(w, "Account updated", users)
}

// DeleteUserHandler removes an account. Its recipes are kept and reassigned to
// whoever did the deleting - see database.DeleteUser.
func DeleteUserHandler(w http.ResponseWriter, r *http.Request) {
	admin, ok := requireAdmin(w, r)
	if !ok {
		return
	}

	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil || !utils.IsValidID(id) {
		sendJSONError(w, http.StatusBadRequest, "Invalid account ID")
		return
	}
	if id == admin.ID {
		sendJSONError(w, http.StatusConflict, "You cannot delete the account you are signed in with")
		return
	}

	if err := database.DeleteUser(id, admin.ID); err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			sendJSONError(w, http.StatusNotFound, "No such account")
		case database.IsValidationError(err):
			sendJSONError(w, http.StatusConflict, err.Error())
		default:
			sendJSONError(w, http.StatusInternalServerError, "Failed to delete the account")
		}
		return
	}

	utils.LogSecurityEvent("USER_DELETED", getClientIP(r),
		fmt.Sprintf("AccountID:%d, RecipesMovedTo:%s", id, admin.Username))

	users, _ := database.ListUsers()
	sendJSONSuccess(w, "Account deleted; its recipes were kept", users)
}
