package middleware

import (
	"compress/gzip"
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

// CompressionMiddleware adds gzip compression.
//
// The decision to compress has to happen once the handler has set its response
// headers, not before: the previous version announced Content-Encoding: gzip up
// front and picked its exceptions from the *request* Content-Type, so a static
// file served by http.ServeFile kept the Content-Length of the uncompressed body
// while the body itself was compressed - a malformed response.
func CompressionMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Announce the negotiation to caches whether or not we end up compressing.
			w.Header().Add("Vary", "Accept-Encoding")

			if !acceptsGzip(r) {
				next.ServeHTTP(w, r)
				return
			}

			gz := gzip.NewWriter(w)
			gzw := &gzipResponseWriter{ResponseWriter: w, gz: gz}

			// Closing an unused gzip.Writer would emit an empty gzip stream into a
			// response we decided not to compress, so only close when it was used.
			defer func() {
				if gzw.useGzip {
					gz.Close()
				}
			}()

			next.ServeHTTP(gzw, r)
		})
	}
}

func acceptsGzip(r *http.Request) bool {
	for _, encoding := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		if strings.EqualFold(strings.TrimSpace(strings.Split(encoding, ";")[0]), "gzip") {
			return true
		}
	}
	return false
}

// isCompressible reports whether a response body is worth compressing. Images,
// video and archives are already compressed and only lose time here.
func isCompressible(contentType string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))

	if strings.HasPrefix(mediaType, "text/") {
		return true
	}

	switch mediaType {
	case "application/json", "application/javascript", "application/x-javascript",
		"application/xml", "application/xhtml+xml", "application/wasm",
		"application/manifest+json", "image/svg+xml":
		return true
	}

	return false
}

type gzipResponseWriter struct {
	http.ResponseWriter
	gz          *gzip.Writer
	wroteHeader bool
	useGzip     bool
}

// Unwrap lets http.ResponseController reach the underlying writer; see the note
// on responseWrapper.Unwrap in security.go.
func (w *gzipResponseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *gzipResponseWriter) WriteHeader(code int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true

	// 1xx, 204 and 304 carry no body, and a handler that already set its own
	// Content-Encoding is left alone.
	hasBody := code >= 200 && code != http.StatusNoContent && code != http.StatusNotModified
	if hasBody && w.Header().Get("Content-Encoding") == "" && isCompressible(w.Header().Get("Content-Type")) {
		w.useGzip = true
		w.Header().Set("Content-Encoding", "gzip")
		// The handler's Content-Length describes the uncompressed body.
		w.Header().Del("Content-Length")
		w.Header().Del("Accept-Ranges")
	}

	w.ResponseWriter.WriteHeader(code)
}

func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		// Mirror net/http: without an explicit Content-Type the type is sniffed
		// from the first bytes, and our decision must see the same value.
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", http.DetectContentType(b))
		}
		w.WriteHeader(http.StatusOK)
	}

	if w.useGzip {
		return w.gz.Write(b)
	}

	return w.ResponseWriter.Write(b)
}

func (w *gzipResponseWriter) Flush() {
	if w.useGzip {
		w.gz.Flush()
	}
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
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

		// Recipe import: 10 at once, then one a minute. Tight enough that a
		// stolen session cannot run up a bill, loose enough that an evening
		// spent filing recipes does not hit it - and note that a rejected URL
		// costs a token too, so a few typos must not exhaust it.
		ImportRate:   rate.Every(1 * time.Minute),
		ImportBurst:  10,
		ImportWindow: 15 * time.Minute,

		// General: Higher limits
		GeneralRate:   rate.Every(300 * time.Millisecond),
		GeneralBurst:  200,
		GeneralWindow: time.Minute,

		// Shorter block duration
		BlockDuration: 10 * time.Minute,
	}
}
