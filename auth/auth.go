// File: auth/auth.go
package auth

import (
	"crypto/rand"
	"fmt"
	"log"
	"net/http"
	"os"
	"recipe-book/database"
	"recipe-book/models"
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
	err = database.DB.QueryRow("SELECT id, username, email, password_changed_at FROM users WHERE id = ?", claims.UserID).
		Scan(&user.ID, &user.Username, &user.Email, &passwordChangedAt)
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

func SetAuthCookie(w http.ResponseWriter, tokenString string) {
	expirationTime := time.Now().Add(24 * time.Hour)
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    tokenString,
		Expires:  expirationTime,
		HttpOnly: true,
		Secure:   isProduction(),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})
}

func ClearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Expires:  time.Now().Add(-time.Hour),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isProduction(),
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})
}
