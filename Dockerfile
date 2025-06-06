# File: Dockerfile (Security Enhanced)
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

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download && go mod verify

# Copy source code
COPY . .

# Change ownership to builder user
RUN chown -R builder:builder /app
USER builder

# Build the application with security flags
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build \
    -a -installsuffix cgo \
    -ldflags '-w -s -extldflags "-static"' \
    -tags netgo \
    -o main .

# Create necessary directories during the build stage
RUN mkdir -p /app/data
RUN mkdir -p /app/uploads

# Final stage - use distroless for security
FROM gcr.io/distroless/static-debian12:nonroot-$TARGETARCH

# Set working directory
WORKDIR /app

# Copy binary from builder stage
COPY --from=builder /app/main .

# Copy templates, static files, and pre-created directories
COPY --from=builder /app/templates/ ./templates/
COPY --from=builder /app/static/ ./static/
COPY --from=builder --chown=nonroot:nonroot --chmod=755 /app/data/ ./data/
COPY --from=builder --chown=nonroot:nonroot --chmod=755 /app/uploads/ ./uploads/

# Use non-root user
USER nonroot:nonroot

# Expose port
EXPOSE 8080

# Set environment variables
ENV DB_PATH=/app/data/recipes.db
ENV GIN_MODE=release
ENV ENVIRONMENT=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/app/main", "-health-check"] || exit 1

# Run the application
ENTRYPOINT ["/app/main"]