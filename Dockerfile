# Build stage
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
COPY --from=builder /app/static/ ./static/
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
    CMD ["/app/main", "-health-check"] || exit 1

ENTRYPOINT ["/app/main"]