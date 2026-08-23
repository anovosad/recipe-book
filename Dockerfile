# Frontend build stage. This used to be missing entirely: the Dockerfile just
# copied whatever ./static happened to contain on the host, so `docker build`
# from a clean checkout produced an image with no frontend - and since static/
# is not in git, that is exactly what a Portainer stack build does. It failed at
# `COPY /app/static/`, which is what took the stack down on 2026-08-23.
FROM node:22-alpine AS frontend

WORKDIR /app/frontend

# Lockfile first, so npm ci is cached until dependencies actually change
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# vite.config.ts points outDir at ../static/dist, so this writes /app/static/dist
RUN npm run build

# Backend build stage
FROM golang:1.24.3-alpine AS builder

# Install security updates and necessary packages
RUN apk update && apk upgrade && \
    apk add --no-cache ca-certificates git && \
    rm -rf /var/cache/apk/*

# Create non-root user for build
RUN adduser -D -s /bin/sh builder

# Set working directory
WORKDIR /app

# Copy go mod files first (for better caching)
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download && go mod verify

# Copy source code
COPY . .

# Change ownership to builder user
RUN chown -R builder:builder /app
USER builder

# Build with optimizations
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build \
    -a -installsuffix cgo \
    -ldflags '-w -s -extldflags "-static"' \
    -tags netgo \
    -trimpath \
    -o main .

# Create directories
RUN mkdir -p /app/data /app/uploads

# Final stage - minimal image
FROM gcr.io/distroless/static-debian12:nonroot-$TARGETARCH

WORKDIR /app

# Copy binary and required files
COPY --from=builder /app/main .
COPY --from=frontend /app/static/ ./static/
COPY --from=builder --chown=nonroot:nonroot --chmod=755 /app/data/ ./data/
COPY --from=builder --chown=nonroot:nonroot --chmod=755 /app/uploads/ ./uploads/

USER nonroot:nonroot

EXPOSE 8080

# Optimized environment variables
ENV DB_PATH=/app/data/recipes.db \
    GIN_MODE=release \
    ENVIRONMENT=production \
    GOGC=100 \
    GOMEMLIMIT=512MiB

# Health check with reduced frequency
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=2 \
    CMD ["/app/main", "--health-check"]

ENTRYPOINT ["/app/main"]