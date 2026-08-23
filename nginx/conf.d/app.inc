# The application itself: shared by the HTTP and HTTPS servers so the two cannot
# drift apart. They already did once - the TLS block held the whole config while
# port 80 served a two-location stub, and the day the stack was recreated nginx
# refused to start and nothing was reachable at all.
#
# Included inside a server block, so the proxy headers below sit at server level
# and every location inherits them. X-Forwarded-Proto is $scheme, which is what
# lets the app decide by itself whether the session cookie may carry Secure.

proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
proxy_connect_timeout 5s;
proxy_send_timeout    60s;
proxy_read_timeout    60s;

# Block common attack patterns
location ~ /\. {
    deny all;
    access_log off;
    log_not_found off;
}

# API endpoints with rate limiting
location /api/login {
    limit_req zone=login burst=3 nodelay;
    proxy_pass http://recipe_app;
}

location /api/register {
    limit_req zone=register burst=2 nodelay;
    proxy_pass http://recipe_app;
}

location /api/search {
    limit_req zone=search burst=10 nodelay;
    proxy_pass http://recipe_app;
}

location /api/ {
    limit_req zone=general burst=20 nodelay;
    proxy_pass http://recipe_app;
}

# Hashed build output, safe to cache forever. add_header in a location replaces
# the ones inherited from the server, so the security headers are repeated here
# rather than silently dropped for every asset.
location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ {
    limit_req zone=static burst=50 nodelay;
    proxy_pass http://recipe_app;
    expires 1y;
    add_header Cache-Control "public, immutable";
    include /etc/nginx/conf.d/security-headers.inc;
}

location / {
    limit_req zone=general burst=50 nodelay;
    proxy_pass http://recipe_app;
}

location /health {
    proxy_pass http://recipe_app;
    access_log off;
}
