// File: middleware/security.go
package middleware

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"regexp"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"time"

	"recipe-book/apiresp"

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
	importLimiters   map[string]*RateLimiter
	generalLimiters  map[string]*RateLimiter

	// Blocked IPs
	blockedIPs map[string]time.Time

	// Rate-limit violations per IP, counted towards a block
	violations map[string]*violationRecord

	// Mutex for thread safety
	mu sync.RWMutex

	// Cleanup ticker
	cleanup *time.Ticker

	// The limits this manager was built with. It used to be accepted by the
	// constructor, defaulted when nil and then thrown away, while every limiter
	// took a config argument of its own - so a manager could be built with one
	// set of limits and enforce another.
	config *RateLimitConfig
}

// violationRecord counts how often one IP has tripped a rate limit recently.
type violationRecord struct {
	count     int
	firstSeen time.Time
	lastCount time.Time
}

const (
	// violationsBeforeBlock is how many rate-limit violations inside
	// violationWindow earn an IP a temporary block.
	violationsBeforeBlock = 5
	violationWindow       = 5 * time.Minute

	// violationCooldown collapses one burst of denied requests into a single
	// counted violation. The general limiter runs on every matched route, so a
	// page load that overruns the burst produces a dozen denials in the same
	// second; counting each of them would turn one overload into an instant
	// block. A block should mean "kept hammering after being told to slow down",
	// which is what a gap of at least this long between counted violations
	// expresses.
	violationCooldown = 30 * time.Second
)

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

	// Recipe imports: each one fetches somebody else's page and pays an AI to
	// read it, so this is the tightest budget here that still lets a person
	// import a few recipes in one sitting.
	ImportRate   rate.Limit
	ImportBurst  int
	ImportWindow time.Duration

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

		// Recipe import: 8 at once, then one every 2 minutes
		ImportRate:   rate.Every(2 * time.Minute),
		ImportBurst:  8,
		ImportWindow: 15 * time.Minute,

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
		config:           config,
		loginLimiters:    make(map[string]*RateLimiter),
		registerLimiters: make(map[string]*RateLimiter),
		searchLimiters:   make(map[string]*RateLimiter),
		importLimiters:   make(map[string]*RateLimiter),
		generalLimiters:  make(map[string]*RateLimiter),
		blockedIPs:       make(map[string]time.Time),
		violations:       make(map[string]*violationRecord),
		cleanup:          time.NewTicker(5 * time.Minute), // Cleanup every 5 minutes
	}

	// Start cleanup goroutine
	go sm.cleanupRoutine()

	return sm
}

// trustedProxies lists the peers that are allowed to speak for a client through
// X-Forwarded-For / X-Real-IP.
//
// Those headers are just request headers: anyone can send them. Honouring them
// unconditionally - which is what this used to do, taking the leftmost entry -
// made every rate limit here optional, because a client could put a fresh
// address in X-Forwarded-For on each request and get a fresh bucket, and could
// equally put someone else's address there to have that address blocked.
// nginx appends to any header the client sent ($proxy_add_x_forwarded_for), so
// the leftmost entry is attacker-controlled even in the intended deployment.
//
// TRUSTED_PROXIES overrides the list (comma-separated IPs or CIDRs); the value
// "none" turns header handling off entirely and always uses the peer address.
// The default covers loopback and the private ranges a reverse proxy on a Docker
// network lands in - note that docker-compose.yml uses 172.32.0.0/16, which is
// outside RFC1918, so it sets TRUSTED_PROXIES explicitly.
var trustedProxies = loadTrustedProxies()

func loadTrustedProxies() []*net.IPNet {
	raw := strings.TrimSpace(os.Getenv("TRUSTED_PROXIES"))
	if strings.EqualFold(raw, "none") {
		return nil
	}
	if raw == "" {
		raw = "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"
	}

	var nets []*net.IPNet
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if !strings.Contains(entry, "/") {
			ip := net.ParseIP(entry)
			if ip == nil {
				// Not an address - allow a hostname, which is how a proxy on a
				// container network is usually named (TRUSTED_PROXIES=nginx).
				resolved, err := net.LookupIP(entry)
				if err != nil || len(resolved) == 0 {
					log.Printf("⚠️  Ignoring TRUSTED_PROXIES entry %q: not an IP, CIDR or resolvable host (%v)", entry, err)
					continue
				}
				for _, r := range resolved {
					nets = append(nets, hostNetwork(r))
				}
				continue
			}
			nets = append(nets, hostNetwork(ip))
			continue
		}
		_, network, err := net.ParseCIDR(entry)
		if err != nil {
			log.Printf("⚠️  Ignoring invalid TRUSTED_PROXIES entry %q: %v", entry, err)
			continue
		}
		nets = append(nets, network)
	}
	return nets
}

// hostNetwork turns a single address into the /32 or /128 that contains only it.
func hostNetwork(ip net.IP) *net.IPNet {
	if v4 := ip.To4(); v4 != nil {
		return &net.IPNet{IP: v4, Mask: net.CIDRMask(32, 32)}
	}
	return &net.IPNet{IP: ip, Mask: net.CIDRMask(128, 128)}
}

func isTrustedProxy(ip net.IP) bool {
	if ip == nil {
		return false
	}
	for _, network := range trustedProxies {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

// ForwardedProto reports the scheme the client actually used: r.TLS when the
// connection is direct, and X-Forwarded-Proto only when the peer is a trusted
// proxy. Anything else is "" - an untrusted client must not be able to talk the
// server into believing its plain request arrived over TLS.
func ForwardedProto(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}

	peer := r.RemoteAddr
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		peer = host
	}
	if !isTrustedProxy(net.ParseIP(peer)) {
		return ""
	}

	// A chain of proxies appends, so the leftmost entry is the original scheme.
	proto := r.Header.Get("X-Forwarded-Proto")
	if comma := strings.Index(proto, ","); comma >= 0 {
		proto = proto[:comma]
	}
	return strings.ToLower(strings.TrimSpace(proto))
}

// getClientIP resolves the address a rate limit should be keyed on.
func (sm *SecurityManager) getClientIP(r *http.Request) string {
	return ClientIP(r)
}

// ClientIP is the exported form, so the handlers log the same address the rate
// limiter counts rather than keeping their own copy of this logic.
func ClientIP(r *http.Request) string {
	peer := r.RemoteAddr
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		peer = host
	}

	// Only a trusted peer gets to override the address it connected from.
	if !isTrustedProxy(net.ParseIP(peer)) {
		return peer
	}

	// Walk X-Forwarded-For from the right, skipping the proxies we trust: the
	// rightmost entry was written by our own proxy, everything further left was
	// written by whoever came before it and stops being trustworthy as soon as
	// one entry is not a proxy of ours.
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			ip := net.ParseIP(strings.TrimSpace(parts[i]))
			if ip == nil {
				break
			}
			if isTrustedProxy(ip) {
				continue
			}
			return ip.String()
		}
	}

	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		if ip := net.ParseIP(xri); ip != nil {
			return ip.String()
		}
	}

	return peer
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

		for ip, limiter := range sm.importLimiters {
			if limiter.lastSeen.Before(cutoff) {
				delete(sm.importLimiters, ip)
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

		// Forget violation counters whose window has passed
		for ip, record := range sm.violations {
			if now.Sub(record.firstSeen) > violationWindow {
				delete(sm.violations, ip)
			}
		}

		sm.mu.Unlock()
	}
}

// Middleware for general rate limiting
func (sm *SecurityManager) GeneralRateLimit() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := sm.getClientIP(r)

			// Check if IP is blocked
			if blocked, remaining := sm.isBlocked(ip); blocked {
				w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())))
				respondError(w, r, http.StatusTooManyRequests,
					fmt.Sprintf("Rate limit exceeded. Try again in %v", remaining.Round(time.Second)), retryDetails(remaining))
				log.Printf("⚠️  Blocked request from %s (blocked for %v more)", ip, remaining.Round(time.Second))
				return
			}

			// Get rate limiter for this IP
			limiter := sm.getRateLimiter(sm.generalLimiters, ip, sm.config.GeneralRate, sm.config.GeneralBurst)

			if !limiter.Allow() {
				// Count violations and potentially block IP
				sm.handleRateViolation(ip, "general", sm.config.BlockDuration)

				w.Header().Set("Retry-After", "60")
				respondError(w, r, http.StatusTooManyRequests, "Rate limit exceeded. Please slow down.", retryDetails(time.Minute))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Middleware for login rate limiting
func (sm *SecurityManager) LoginRateLimit() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := sm.getClientIP(r)

			// Check if IP is blocked
			if blocked, remaining := sm.isBlocked(ip); blocked {
				w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())))
				respondError(w, r, http.StatusTooManyRequests, fmt.Sprintf("Too many login attempts. Try again in %v", remaining.Round(time.Second)), retryDetails(remaining))
				return
			}

			// Get rate limiter for this IP
			limiter := sm.getRateLimiter(sm.loginLimiters, ip, sm.config.LoginRate, sm.config.LoginBurst)

			if !limiter.Allow() {
				// Block IP after repeated login violations
				sm.blockIP(ip, sm.config.BlockDuration)

				respondError(w, r, http.StatusTooManyRequests, "Too many login attempts. Your IP has been temporarily blocked.", retryDetails(sm.config.BlockDuration))
				log.Printf("🚨 Blocked IP %s due to excessive login attempts", ip)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Middleware for registration rate limiting
func (sm *SecurityManager) RegisterRateLimit() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := sm.getClientIP(r)

			// Check if IP is blocked
			if blocked, remaining := sm.isBlocked(ip); blocked {
				w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())))
				respondError(w, r, http.StatusTooManyRequests, fmt.Sprintf("Rate limit exceeded. Try again in %v", remaining.Round(time.Second)), retryDetails(remaining))
				return
			}

			// Get rate limiter for this IP
			limiter := sm.getRateLimiter(sm.registerLimiters, ip, sm.config.RegisterRate, sm.config.RegisterBurst)

			if !limiter.Allow() {
				sm.handleRateViolation(ip, "register", sm.config.BlockDuration)
				respondError(w, r, http.StatusTooManyRequests, "Too many registration attempts. Please try again later.", retryDetails(sm.config.RegisterWindow))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// ImportRateLimit guards importing a recipe from a URL. Every request makes the
// server fetch a third-party page and pay a model to read it, so it gets its
// own budget rather than riding the general one - and a violation is counted
// rather than blocking outright, since overrunning it is what an impatient
// person does, not an attacker.
func (sm *SecurityManager) ImportRateLimit() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := sm.getClientIP(r)

			if blocked, remaining := sm.isBlocked(ip); blocked {
				w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())))
				respondError(w, r, http.StatusTooManyRequests, fmt.Sprintf("Rate limit exceeded. Try again in %v", remaining.Round(time.Second)), retryDetails(remaining))
				return
			}

			limiter := sm.getRateLimiter(sm.importLimiters, ip, sm.config.ImportRate, sm.config.ImportBurst)

			if !limiter.Allow() {
				sm.handleRateViolation(ip, "import", sm.config.BlockDuration)
				respondError(w, r, http.StatusTooManyRequests, "Too many recipe imports. Please try again shortly.", retryDetails(sm.config.ImportWindow))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Middleware for search rate limiting
func (sm *SecurityManager) SearchRateLimit() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := sm.getClientIP(r)

			// Check if IP is blocked
			if blocked, remaining := sm.isBlocked(ip); blocked {
				w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())))
				respondError(w, r, http.StatusTooManyRequests,
					fmt.Sprintf("Rate limit exceeded. Try again in %v", remaining.Round(time.Second)), retryDetails(remaining))
				return
			}

			// Get rate limiter for this IP
			limiter := sm.getRateLimiter(sm.searchLimiters, ip, sm.config.SearchRate, sm.config.SearchBurst)

			if !limiter.Allow() {
				sm.handleRateViolation(ip, "search", sm.config.BlockDuration)

				respondError(w, r, http.StatusTooManyRequests, "Search rate limit exceeded. Please slow down.", retryDetails(time.Minute))
				log.Printf("⚠️  Search rate limit exceeded for IP %s", ip)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// SearchRateLimitIfQuery applies the search limiter only to requests that
// actually run a search (GET /api/recipes?q=...). Listing the collection keeps
// the general limit, which is looser - the list is loaded on nearly every page
// view, while a search is the expensive one worth throttling harder.
//
// It exists as a wrapper rather than a mux Queries() route because a failing
// Queries matcher clears mux's record of a method mismatch, which silently turns
// every 405 on that path into a 404.
func (sm *SecurityManager) SearchRateLimitIfQuery() func(http.Handler) http.Handler {
	limited := sm.SearchRateLimit()
	return func(next http.Handler) http.Handler {
		guarded := limited(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Query().Get("q") != "" {
				guarded.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// handleRateViolation counts a rate-limit violation and blocks the IP once it has
// tripped the limit violationsBeforeBlock times inside violationWindow. This used
// to only log, so the "automatic blocking after repeated violations" the README
// advertises never actually happened for general, search or register traffic.
func (sm *SecurityManager) handleRateViolation(ip, violationType string, blockDuration time.Duration) {
	now := time.Now()

	sm.mu.Lock()
	record, exists := sm.violations[ip]
	if !exists || now.Sub(record.firstSeen) > violationWindow {
		record = &violationRecord{firstSeen: now}
		sm.violations[ip] = record
	} else if now.Sub(record.lastCount) < violationCooldown {
		// Same burst as the violation already counted - the request is still
		// refused by the caller, it just does not move the IP closer to a block.
		sm.mu.Unlock()
		return
	}
	record.count++
	record.lastCount = now
	count := record.count

	shouldBlock := count >= violationsBeforeBlock
	if shouldBlock {
		// Start the count over so the block is not immediately re-triggered.
		delete(sm.violations, ip)
	}
	sm.mu.Unlock()

	log.Printf("⚠️  Rate limit violation %d/%d from IP %s for %s requests",
		count, violationsBeforeBlock, ip, violationType)

	// blockIP takes the same mutex, so it has to be called after the unlock.
	if shouldBlock {
		sm.blockIP(ip, blockDuration)
	}
}

// respondError answers a request the middleware refused before it reached a
// handler. An /api request gets the same envelope every handler produces - the
// three rate limiters used to disagree about it, one writing plain text and one
// writing a bare {"error": ...} - while a rate-limited page load, which is not a
// JSON client, still gets plain text.
func respondError(w http.ResponseWriter, r *http.Request, statusCode int, message string, details interface{}) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		apiresp.ErrorDetails(w, statusCode, message, details)
		return
	}
	http.Error(w, message, statusCode)
}

// retryDetails tells a client how long a block still has to run.
func retryDetails(remaining time.Duration) map[string]interface{} {
	return map[string]interface{}{"retryAfterSeconds": int(remaining.Seconds())}
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
					"script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com cdn.tailwindcss.com; "+
					"style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com fonts.googleapis.com; "+
					"img-src 'self' data:; "+
					"font-src 'self' cdnjs.cloudflare.com fonts.gstatic.com; "+
					"connect-src 'self'; "+
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

// Unwrap is how http.ResponseController reaches the real writer through a
// middleware chain. Without it a handler cannot extend its own deadlines -
// which the recipe import needs, since reading a page with an AI runs past the
// server's write timeout that every other endpoint fits inside comfortably.
func (rw *responseWrapper) Unwrap() http.ResponseWriter { return rw.ResponseWriter }

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
						respondError(w, r, http.StatusBadRequest, "Invalid request", nil)
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
							respondError(w, r, http.StatusBadRequest, "Invalid request", nil)
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

// Recovery turns a panic in any handler into a 500 instead of letting it tear
// down the connection, and records the stack so the cause is recoverable.
func Recovery() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				rec := recover()
				if rec == nil {
					return
				}

				// net/http uses this sentinel to abort a response on purpose.
				if rec == http.ErrAbortHandler {
					panic(rec)
				}

				log.Printf("🔥 PANIC serving %s %s: %v\n%s", r.Method, r.URL.Path, rec, debug.Stack())
				respondError(w, r, http.StatusInternalServerError, "Internal server error", nil)
			}()

			next.ServeHTTP(w, r)
		})
	}
}

// allowedOrigins returns the origins permitted to send credentialed requests.
// ALLOWED_ORIGINS (comma separated) overrides the development defaults.
func allowedOrigins() map[string]bool {
	origins := map[string]bool{}

	if configured := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS")); configured != "" {
		for _, origin := range strings.Split(configured, ",") {
			if origin = strings.TrimSpace(origin); origin != "" {
				origins[origin] = true
			}
		}
		return origins
	}

	if os.Getenv("ENVIRONMENT") == "production" {
		// Same-origin requests carry no Origin header and need no CORS headers,
		// so an empty set is the safe default for a production deployment.
		return origins
	}

	for _, origin := range []string{
		"http://localhost:3000", // Vite dev server
		"http://localhost:5173", // Alternative Vite port
		"http://localhost:8080", // Same origin
		"http://127.0.0.1:8080", // Same origin alternative
	} {
		origins[origin] = true
	}

	return origins
}

// CORS middleware for frontend-backend communication
func CORSMiddleware() func(http.Handler) http.Handler {
	origins := allowedOrigins()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			// The response varies by Origin, so caches must not share it.
			w.Header().Add("Vary", "Origin")

			// A wildcard origin is invalid together with credentials - browsers
			// reject the pair - and same-origin requests need no CORS headers.
			if origin != "" && origins[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
				w.Header().Set("Access-Control-Max-Age", "86400")
			}

			// Handle preflight requests
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
