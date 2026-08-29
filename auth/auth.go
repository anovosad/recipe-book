// File: auth/auth.go
package auth

import (
	"crypto/rand"
	"fmt"
	"log"
	"net/http"
	"os"
	"recipe-book/database"
	"recipe-book/middleware"
	"recipe-book/models"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const signingMethod = "HS256"

var jwtKey = loadJWTKey()

// loadJWTKey reads the signing key from JWT_SECRET. deploy.sh and the compose
// files already generate one; a hardcoded fallback would let anyone holding the
// source forge a token for any user, so in production a missing secret is fatal
// and in development we use a random per-process key instead.
func loadJWTKey() []byte {
	if secret := os.Getenv("JWT_SECRET"); secret != "" {
		if len(secret) < 32 {
			log.Println("⚠️  JWT_SECRET is shorter than 32 characters - use a longer random value")
		}
		return []byte(secret)
	}

	if isProduction() {
		log.Fatal("JWT_SECRET must be set when ENVIRONMENT=production")
	}

	log.Println("⚠️  JWT_SECRET not set - using an ephemeral development key (all sessions end on restart)")
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		log.Fatal("Failed to generate a development JWT key:", err)
	}
	return key
}

func isProduction() bool {
	return os.Getenv("ENVIRONMENT") == "production"
}

type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	// The value of users.password_changed_at at the moment this token was
	// minted. Changing a password bumps that column, so every token still
	// carrying the old value stops matching and is refused. Compared for
	// equality rather than against the issued-at time, which only has
	// second granularity - a token minted in the same second as the change
	// would otherwise survive it.
	PasswordChangedAt int64 `json:"pwd_at"`
	jwt.RegisteredClaims
}

func GetUserFromToken(r *http.Request) (*models.User, error) {
	cookie, err := r.Cookie("auth_token")
	if err != nil {
		return nil, err
	}

	claims := &Claims{}
	// Pinning the accepted algorithm stops an attacker from presenting a token
	// signed with a different method and having the key reinterpreted.
	token, err := jwt.ParseWithClaims(cookie.Value, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	}, jwt.WithValidMethods([]string{signingMethod}))

	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	var user models.User
	var passwordChangedAt int64
	err = database.DB.QueryRow(
		"SELECT id, username, email, password_changed_at, is_admin FROM users WHERE id = ?", claims.UserID).
		Scan(&user.ID, &user.Username, &user.Email, &passwordChangedAt, &user.IsAdmin)
	if err != nil {
		return nil, err
	}

	// A token minted before the last password change is dead. Without this the
	// tokens are stateless for their full 24 hours, so changing a password that
	// someone else already knows would not actually lock them out - which is
	// the one thing changing it is for. Tokens issued before this claim existed
	// carry 0, and so does every row that has never changed its password, so
	// the upgrade itself signs nobody out.
	if claims.PasswordChangedAt != passwordChangedAt {
		return nil, fmt.Errorf("token predates the current password")
	}

	return &user, nil
}

func CreateToken(user *models.User) (string, error) {
	// Stamped into the token so GetUserFromToken can compare it against the
	// row; see the Claims field for why this is not derived from IssuedAt.
	var passwordChangedAt int64
	if err := database.DB.QueryRow("SELECT password_changed_at FROM users WHERE id = ?", user.ID).
		Scan(&passwordChangedAt); err != nil {
		return "", err
	}

	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID:            user.ID,
		Username:          user.Username,
		PasswordChangedAt: passwordChangedAt,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

var warnPlainHTTPOnce sync.Once

// cookieSecure decides whether the session cookie may carry Secure.
//
// This was isProduction(), which broke authentication outright on a production
// deployment served over plain HTTP: a browser refuses to store a Secure cookie
// that arrived over http://, so logging in appeared to work - the API answered
// 200 and the UI believed it - and then every write came back 401. Reads are
// public, so the site looked healthy right up until you tried to save.
//
// Following the connection instead means the flag turns itself on the day TLS
// is put in front. COOKIE_SECURE forces it either way, for a proxy that
// terminates TLS without forwarding X-Forwarded-Proto.
func cookieSecure(r *http.Request) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("COOKIE_SECURE"))) {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	}

	secure := middleware.ForwardedProto(r) == "https"
	if !secure && isProduction() {
		warnPlainHTTPOnce.Do(func() {
			log.Println("⚠️  ENVIRONMENT=production but requests are arriving over plain HTTP - the session cookie is issued without Secure, and passwords cross the network in the clear. Put TLS in front; set COOKIE_SECURE=true once you have.")
		})
	}
	return secure
}

func SetAuthCookie(w http.ResponseWriter, r *http.Request, tokenString string) {
	expirationTime := time.Now().Add(24 * time.Hour)
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    tokenString,
		Expires:  expirationTime,
		HttpOnly: true,
		Secure:   cookieSecure(r),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})
}

func ClearAuthCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Expires:  time.Now().Add(-time.Hour),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   cookieSecure(r),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})
}
