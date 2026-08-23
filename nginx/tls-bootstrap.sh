#!/bin/sh
# Runs from nginx:alpine's /docker-entrypoint.d, before nginx starts.
#
# Nothing in the checked-in config names a domain or a Let's Encrypt path. This
# script looks for a certificate and decides what nginx actually serves:
#
#   no certificate  -> port 80 serves the app, there is no HTTPS server
#   certificate     -> the HTTPS server is enabled
#
# Whether port 80 then *redirects* - and whether HSTS is sent - is a separate
# switch, TLS_REDIRECT. Holding a certificate is not the same as port 443 being
# reachable: forwarding 80 is enough to get a certificate issued, and if 443 is
# still closed at the router then redirecting sends everyone somewhere they
# cannot arrive. HSTS follows the same switch, because pinning a browser to an
# HTTPS that does not answer is the version of this mistake that lasts a year.
#
# So nginx starts either way. The previous config pointed ssl_certificate
# straight at a file that did not exist; nginx crash-looped and took the whole
# site down with it, and that must not be possible again.
#
# It also re-checks periodically, which is what picks up a renewal - and what
# turns HTTPS on by itself the first time certbot succeeds, without a redeploy.
set -eu

CERT_DIR=/etc/nginx/certs
LIVE_ROOT=/etc/letsencrypt/live
GENERATED=/etc/nginx/tls
AVAILABLE=/etc/nginx/tls-available
CHECK_INTERVAL="${TLS_CHECK_INTERVAL:-6h}"

# Prints the directory of a usable certificate, or nothing.
find_live_cert() {
    if [ -n "${DOMAIN:-}" ] && [ -s "$LIVE_ROOT/$DOMAIN/fullchain.pem" ] \
        && [ -s "$LIVE_ROOT/$DOMAIN/privkey.pem" ]; then
        printf '%s' "$LIVE_ROOT/$DOMAIN"
        return
    fi

    # Fall back to whatever certbot has, so a DOMAIN typo does not silently
    # leave a perfectly good certificate unused.
    [ -d "$LIVE_ROOT" ] || return 0
    for dir in "$LIVE_ROOT"/*; do
        if [ -s "$dir/fullchain.pem" ] && [ -s "$dir/privkey.pem" ]; then
            printf '%s' "$dir"
            return
        fi
    done
}

apply() {
    mkdir -p "$CERT_DIR" "$GENERATED"

    live=$(find_live_cert)

    if [ -n "$live" ]; then
        ln -sf "$live/fullchain.pem" "$CERT_DIR/fullchain.pem"
        ln -sf "$live/privkey.pem" "$CERT_DIR/privkey.pem"
        cp "$AVAILABLE/https-server.conf" "$GENERATED/https.conf"

        if [ "${TLS_REDIRECT:-on}" = "off" ]; then
            printf '# TLS_REDIRECT=off: HTTPS is served, but HTTP still serves the app.\n' \
                > "$GENERATED/hsts.inc"
            printf 'include /etc/nginx/conf.d/app.inc;\n' > "$GENERATED/http-mode.inc"
            printf 'https-optional'
        else
            printf 'add_header Strict-Transport-Security "max-age=31536000" always;\n' \
                > "$GENERATED/hsts.inc"
            printf 'location / { return 301 https://$host$request_uri; }\n' \
                > "$GENERATED/http-mode.inc"
            printf 'https'
        fi
    else
        rm -f "$GENERATED/https.conf" "$GENERATED/hsts.inc"
        printf 'include /etc/nginx/conf.d/app.inc;\n' > "$GENERATED/http-mode.inc"
        printf 'http'
    fi
}

mode=$(apply)
case "$mode" in
    https)
        echo "🔒 TLS certificate found - serving HTTPS, redirecting HTTP to it, HSTS on" ;;
    https-optional)
        echo "🔓 TLS certificate found, but TLS_REDIRECT=off - HTTP and HTTPS both serve the app, no HSTS" ;;
    *)
        echo "🌐 No TLS certificate yet - serving HTTP, and /.well-known/acme-challenge/ is ready for certbot" ;;
esac

# Renewal happens in the certbot container, which cannot reach into this one to
# reload nginx. Re-checking here covers both that and the first issuance.
if [ "${TLS_WATCH:-1}" = "1" ]; then
    (
        while :; do
            sleep "$CHECK_INTERVAL"
            previous="$mode"
            mode=$(apply)
            if [ "$mode" != "$previous" ]; then
                echo "🔁 TLS mode changed to $mode - reloading nginx"
            fi
            nginx -s reload 2>/dev/null || true
        done
    ) &
fi
