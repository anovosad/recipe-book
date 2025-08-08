package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/time/rate"
)

// CacheHeaders middleware adds appropriate cache headers
func CacheHeaders() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Set cache headers based on content type and path
			path := r.URL.Path

			if strings.HasPrefix(path, "/api/") {
				// API responses - no cache or short cache
				w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
				w.Header().Set("Pragma", "no-cache")
				w.Header().Set("Expires", "0")
			} else if strings.Contains(path, ".") {
				// Static assets - long cache
				ext := path[strings.LastIndex(path, "."):]
				switch ext {
				case ".js", ".css", ".woff", ".woff2", ".ttf", ".eot":
					w.Header().Set("Cache-Control", "public, max-age=31536000") // 1 year
				case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg":
					w.Header().Set("Cache-Control", "public, max-age=86400") // 1 day
				default:
					w.Header().Set("Cache-Control", "public, max-age=3600") // 1 hour
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

// CompressionMiddleware adds gzip compression
func CompressionMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Check if client accepts gzip
			if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
				next.ServeHTTP(w, r)
				return
			}

			// Don't compress images or already compressed content
			contentType := r.Header.Get("Content-Type")
			if strings.Contains(contentType, "image/") ||
				strings.Contains(contentType, "video/") ||
				strings.Contains(r.URL.Path, ".jpg") ||
				strings.Contains(r.URL.Path, ".jpeg") ||
				strings.Contains(r.URL.Path, ".png") ||
				strings.Contains(r.URL.Path, ".gif") ||
				strings.Contains(r.URL.Path, ".webp") {
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Set("Vary", "Accept-Encoding")

			gz := gzip.NewWriter(w)
			defer gz.Close()

			gzw := &gzipResponseWriter{
				ResponseWriter: w,
				Writer:         gz,
			}

			next.ServeHTTP(gzw, r)
		})
	}
}

type gzipResponseWriter struct {
	http.ResponseWriter
	io.Writer
}

func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	return w.Writer.Write(b)
}

// LightRateLimitConfig returns a lighter rate limiting config for faster startup
func LightRateLimitConfig() *RateLimitConfig {
	return &RateLimitConfig{
		// Login: More lenient during startup
		LoginRate:   rate.Every(2 * time.Minute),
		LoginBurst:  8,
		LoginWindow: 15 * time.Minute,

		// Registration: More lenient
		RegisterRate:   rate.Every(15 * time.Minute),
		RegisterBurst:  5,
		RegisterWindow: time.Hour,

		// Search: Higher limits
		SearchRate:   rate.Every(1 * time.Second),
		SearchBurst:  50,
		SearchWindow: time.Minute,

		// General: Higher limits
		GeneralRate:   rate.Every(300 * time.Millisecond),
		GeneralBurst:  200,
		GeneralWindow: time.Minute,

		// Shorter block duration
		BlockDuration: 10 * time.Minute,
	}
}
