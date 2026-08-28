# Strict-Transport-Security is deliberately not here: it belongs to the HTTPS
# server alone. A browser ignores it over plain HTTP, and promising HTTPS from a
# deployment that is not serving it locks people out.
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
# 0, not "1; mode=block". The header is dead in every current browser, and the
# blocking mode it asks for was itself exploitable in the ones that still honour
# it - a filter that rewrites a page to "protect" it can be steered into
# breaking a safe one. CSP below is what actually does this job.
add_header X-XSS-Protection "0" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Defence in depth behind the validators, which already refuse markup in every
# name field, and React, which escapes what it renders. 'unsafe-inline' for
# styles is Tailwind's runtime-injected style element; scripts get no such
# licence, so an injected <script> has nothing to execute under. connect-src is
# same-origin because the API is same-origin. frame-ancestors repeats
# X-Frame-Options for browsers that prefer CSP, and form-action stops a planted
# form posting credentials somewhere else.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
