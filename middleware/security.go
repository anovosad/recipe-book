// File: middleware/security.go
package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimiter represents different types of rate limits
type RateLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// SecurityManager handles all security-related middleware
type SecurityManager struct {
	// Rate limiters by IP and type
	loginLimiters    map[string]*RateLimiter
	registerLimiters map[string]*RateLimiter
	searchLimiters   map[string]*RateLimiter
	generalLimiters  map[string]*RateLimiter

	// Blocked IPs
	blockedIPs map[string]time.Time

	// Mutex for thread safety
	mu sync.RWMutex

	// Cleanup ticker
	cleanup *time.Ticker
}

// Configuration for rate limits
type RateLimitConfig struct {
	// Login attempts: 5 attempts per 15 minutes
	LoginRate   rate.Limit
	LoginBurst  int
	LoginWindow time.Duration

	// Registration: 3 registrations per hour
	RegisterRate   rate.Limit
	RegisterBurst  int
	RegisterWindow time.Duration

	// Search requests: 30 per minute
	SearchRate   rate.Limit
	SearchBurst  int
	SearchWindow time.Duration

	// General requests: 100 per minute
	GeneralRate   rate.Limit
	GeneralBurst  int
	GeneralWindow time.Duration

	// Block duration for repeated violations
	BlockDuration time.Duration
}

// Default configuration
func DefaultRateLimitConfig() *RateLimitConfig {
	return &RateLimitConfig{
		// Login: 5 attempts per 15 minutes
		LoginRate:   rate.Every(3 * time.Minute), // 1 request every 3 minutes
		LoginBurst:  5,
		LoginWindow: 15 * time.Minute,

		// Registration: 3 per hour
		RegisterRate:   rate.Every(20 * time.Minute), // 1 request every 20 minutes
		RegisterBurst:  3,
		RegisterWindow: time.Hour,

		// Search: 30 per minute
		SearchRate:   rate.Every(2 * time.Second), // 1 request every 2 seconds
		SearchBurst:  30,
		SearchWindow: time.Minute,

		// General: 100 per minute
		GeneralRate:   rate.Every(600 * time.Millisecond), // 1 request every 600ms
		GeneralBurst:  100,
		GeneralWindow: time.Minute,

		// Block for 30 minutes after repeated violations
		BlockDuration: 30 * time.Minute,
	}
}

// NewSecurityManager creates a new security manager
func NewSecurityManager(config *RateLimitConfig) *SecurityManager {
	if config == nil {
		config = DefaultRateLimitConfig()
	}

	sm := &SecurityManager{
		loginLimiters:    make(map[string]*RateLimiter),
		registerLimiters: make(map[string]*RateLimiter),
		searchLimiters:   make(map[string]*RateLimiter),
		generalLimiters:  make(map[string]*RateLimiter),
		blockedIPs:       make(map[string]time.Time),
		cleanup:          time.NewTicker(5 * time.Minute), // Cleanup every 5 minutes
	}

	// Start cleanup goroutine
	go sm.cleanupRoutine()

	return sm
}

// Get client IP address
func (sm *SecurityManager) getClientIP(r *http.Request) string {
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

// Check if IP is blocked
func (sm *SecurityManager) isBlocked(ip string) (bool, time.Duration) {
	sm.mu.RLock()
	blockedUntil, exists := sm.blockedIPs[ip]
	sm.mu.RUnlock()

	if !exists {
		return false, 0
	}

	if time.Now().After(blockedUntil) {
		// Block has expired, remove it
		sm.mu.Lock()
		delete(sm.blockedIPs, ip)
		sm.mu.Unlock()
		return false, 0
	}

	return true, time.Until(blockedUntil)
}

// Block an IP address
func (sm *SecurityManager) blockIP(ip string, duration time.Duration) {
	sm.mu.Lock()
	sm.blockedIPs[ip] = time.Now().Add(duration)
	sm.mu.Unlock()
	log.Printf("🚫 Blocked IP %s for %v due to rate limit violations", ip, duration)
}

// Get or create rate limiter for specific type and IP
func (sm *SecurityManager) getRateLimiter(limiters map[string]*RateLimiter, ip string, rateLimit rate.Limit, burst int) *rate.Limiter {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	limiter, exists := limiters[ip]
	if !exists {
		limiters[ip] = &RateLimiter{
			limiter:  rate.NewLimiter(rateLimit, burst),
			lastSeen: time.Now(),
		}
		return limiters[ip].limiter
	}

	limiter.lastSeen = time.Now()
	return limiter.limiter
}

// Cleanup routine to remove old rate limiters
func (sm *SecurityManager) cleanupRoutine() {
	for range sm.cleanup.C {
		sm.mu.Lock()

		cutoff := time.Now().Add(-30 * time.Minute)

		// Clean up old limiters
		for ip, limiter := range sm.loginLimiters {
			if limiter.lastSeen.Before(cutoff) {
				delete(sm.loginLimiters, ip)
			}
		}

		for ip, limiter := range sm.registerLimiters {
			if limiter.lastSeen.Before(cutoff) {
				delete(sm.registerLimiters, ip)
			}
		}

		for ip, limiter := range sm.searchLimiters {
			if limiter.lastSeen.Before(cutoff) {
				delete(sm.searchLimiters, ip)
			}
		}

		for ip, limiter := range sm.generalLimiters {
			if limiter.lastSeen.Before(cutoff) {
				delete(sm.generalLimiters, ip)
			}
		}

		// Clean up expired blocks
		now := time.Now()
		for ip, blockedUntil := range sm.blockedIPs {
			if now.After(blockedUntil) {
				delete(sm.blockedIPs, ip)
			}
		}

		sm.mu.Unlock()
	}
}

// Middleware for general rate limiting
func (sm *SecurityManager) GeneralRateLimit(config *RateLimitConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := sm.getClientIP(r)

			// Check if IP is blocked
			if blocked, remaining := sm.isBlocked(ip); blocked {
				w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())))
				http.Error(w, fmt.Sprintf("Rate limit exceeded. Try again in %v", remaining.Round(time.Second)), http.StatusTooManyRequests)
				log.Printf("⚠️  Blocked request from %s (blocked for %v more)", ip, remaining.Round(time.Second))
				return
			}

			// Get rate limiter for this IP
			limiter := sm.getRateLimiter(sm.generalLimiters, ip, config.GeneralRate, config.GeneralBurst)

			if !limiter.Allow() {
				// Count violations and potentially block IP
				sm.handleRateViolation(ip, "general", config.BlockDuration)

				w.Header().Set("Retry-After", "60")
				http.Error(w, "Rate limit exceeded. Please slow down.", http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Middleware for login rate limiting
func (sm *SecurityManager) LoginRateLimit(config *RateLimitConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := sm.getClientIP(r)

			// Check if IP is blocked
			if blocked, remaining := sm.isBlocked(ip); blocked {
				w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())))
				sm.respondWithError(w, fmt.Sprintf("Too many login attempts. Try again in %v", remaining.Round(time.Second)), "login.html")
				return
			}

			// Get rate limiter for this IP
			limiter := sm.getRateLimiter(sm.loginLimiters, ip, config.LoginRate, config.LoginBurst)

			if !limiter.Allow() {
				// Block IP after repeated login violations
				sm.blockIP(ip, config.BlockDuration)

				sm.respondWithError(w, "Too many login attempts. Your IP has been temporarily blocked.", "login.html")
				log.Printf("🚨 Blocked IP %s due to excessive login attempts", ip)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Middleware for registration rate limiting
func (sm *SecurityManager) RegisterRateLimit(config *RateLimitConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := sm.getClientIP(r)

			// Check if IP is blocked
			if blocked, remaining := sm.isBlocked(ip); blocked {
				w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())))
				sm.respondWithError(w, fmt.Sprintf("Rate limit exceeded. Try again in %v", remaining.Round(time.Second)), "register.html")
				return
			}

			// Get rate limiter for this IP
			limiter := sm.getRateLimiter(sm.registerLimiters, ip, config.RegisterRate, config.RegisterBurst)

			if !limiter.Allow() {
				sm.respondWithError(w, "Too many registration attempts. Please try again later.", "register.html")
				log.Printf("⚠️  Registration rate limit exceeded for IP %s", ip)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Middleware for search rate limiting
func (sm *SecurityManager) SearchRateLimit(config *RateLimitConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := sm.getClientIP(r)

			// Get rate limiter for this IP
			limiter := sm.getRateLimiter(sm.searchLimiters, ip, config.SearchRate, config.SearchBurst)

			if !limiter.Allow() {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Search rate limit exceeded. Please slow down.",
				})
				log.Printf("⚠️  Search rate limit exceeded for IP %s", ip)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Handle rate limit violations
func (sm *SecurityManager) handleRateViolation(ip, violationType string, blockDuration time.Duration) {
	// For now, we just log the violation
	// In a more sophisticated system, you might track violation counts
	log.Printf("⚠️  Rate limit violation from IP %s for %s requests", ip, violationType)
}

// Respond with error for HTML pages
func (sm *SecurityManager) respondWithError(w http.ResponseWriter, message, template string) {
	// For now, just return a simple error
	// In your actual implementation, you might want to render the template with the error
	http.Error(w, message, http.StatusTooManyRequests)
}

// Security headers middleware
func SecurityHeaders() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Security headers
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("X-XSS-Protection", "1; mode=block")
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
			w.Header().Set("Content-Security-Policy",
				"default-src 'self'; "+
					"script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; "+
					"style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; "+
					"img-src 'self' data:; "+
					"font-src 'self' cdnjs.cloudflare.com; "+
					"object-src 'none'; "+
					"base-uri 'self';")

			// HSTS header for HTTPS (only add if using HTTPS)
			if r.TLS != nil {
				w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Logging middleware
func RequestLogging() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			// Create a wrapper to capture the status code
			wrapper := &responseWrapper{ResponseWriter: w, statusCode: http.StatusOK}

			next.ServeHTTP(wrapper, r)

			duration := time.Since(start)

			// Log the request
			log.Printf("%s %s %s %d %v %s",
				r.Method,
				r.RequestURI,
				r.RemoteAddr,
				wrapper.statusCode,
				duration,
				r.UserAgent(),
			)
		})
	}
}

// Response wrapper to capture status code
type responseWrapper struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWrapper) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// SQL Injection protection middleware
func SQLInjectionProtection() func(http.Handler) http.Handler {
	// Common SQL injection patterns
	sqlPatterns := []string{
		"'.*--",
		"'.*#",
		"';.*--",
		"';.*#",
		"union.*select",
		"drop.*table",
		"insert.*into",
		"delete.*from",
		"update.*set",
		"exec.*(",
		"execute.*(",
		"script.*>",
		"<.*script",
		"javascript:",
		"vbscript:",
		"onload.*=",
		"onerror.*=",
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Check URL parameters
			for _, values := range r.URL.Query() {
				for _, value := range values {
					if containsSQLInjection(strings.ToLower(value), sqlPatterns) {
						log.Printf("🚨 SQL Injection attempt detected from IP %s: %s", r.RemoteAddr, value)
						http.Error(w, "Invalid request", http.StatusBadRequest)
						return
					}
				}
			}

			// Check form values for POST requests
			if r.Method == "POST" {
				r.ParseForm()
				for _, values := range r.PostForm {
					for _, value := range values {
						if containsSQLInjection(strings.ToLower(value), sqlPatterns) {
							log.Printf("🚨 SQL Injection attempt detected from IP %s: %s", r.RemoteAddr, value)
							http.Error(w, "Invalid request", http.StatusBadRequest)
							return
						}
					}
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Check if string contains SQL injection patterns
func containsSQLInjection(input string, patterns []string) bool {
	for _, pattern := range patterns {
		matched, _ := regexp.MatchString(pattern, input)
		if matched {
			return true
		}
	}
	return false
}

// Context key for security info
type contextKey string

const SecurityContextKey contextKey = "security"

// Security info to pass in context
type SecurityInfo struct {
	ClientIP    string
	UserAgent   string
	RequestTime time.Time
}

// Add security info to context
func (sm *SecurityManager) AddSecurityContext() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			secInfo := &SecurityInfo{
				ClientIP:    sm.getClientIP(r),
				UserAgent:   r.UserAgent(),
				RequestTime: time.Now(),
			}

			ctx := context.WithValue(r.Context(), SecurityContextKey, secInfo)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
