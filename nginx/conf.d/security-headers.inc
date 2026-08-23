# Strict-Transport-Security is deliberately not here: it belongs to the HTTPS
# server alone. A browser ignores it over plain HTTP, and promising HTTPS from a
# deployment that is not serving it locks people out.
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
