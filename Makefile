.PHONY: build run clean docker-build docker-run docker-compose-up docker-compose-down test

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod
BINARY_NAME=recipe-book
BINARY_UNIX=$(BINARY_NAME)_unix

# Build the application
build:
	$(GOBUILD) -o $(BINARY_NAME) -v ./...

# Run the application
run:
	$(GOCMD) run main.go

# Clean build artifacts
clean:
	$(GOCLEAN)
	rm -f $(BINARY_NAME)
	rm -f $(BINARY_UNIX)

# Test the application
test:
	$(GOTEST) -v ./...

# Download dependencies
deps:
	$(GOMOD) download
	$(GOMOD) tidy

# Build for Linux
build-linux:
	CGO_ENABLED=1 GOOS=linux GOARCH=amd64 $(GOBUILD) -o $(BINARY_UNIX) -v

# Docker commands
docker-build:
	docker build -t recipe-book:latest .

docker-run:
	docker run -p 8080:8080 -v recipe_data:/data recipe-book:latest

# Docker Compose commands
docker-compose-up:
	docker-compose up --build

docker-compose-down:
	docker-compose down

docker-compose-logs:
	docker-compose logs -f

# Development helpers
dev-setup: deps
	@echo "Setting up development environment..."
	@mkdir -p static
	@echo "Development environment ready!"

# Database operations
db-reset:
	rm -f recipes.db
	@echo "Database reset. Restart the application to recreate."

# Help
help:
	@echo "Available commands:"
	@echo "  build              - Build the application"
	@echo "  run                - Run the application"
	@echo "  clean              - Clean build artifacts"
	@echo "  test               - Run tests"
	@echo "  deps               - Download and tidy dependencies"
	@echo "  build-linux        - Build for Linux"
	@echo "  docker-build       - Build Docker image"
	@echo "  docker-run         - Run Docker container"
	@echo "  docker-compose-up  - Start with Docker Compose"
	@echo "  docker-compose-down - Stop Docker Compose"
	@echo "  docker-compose-logs - View Docker Compose logs"
	@echo "  dev-setup          - Setup development environment"
	@echo "  db-reset           - Reset the database"
	@echo "  help               - Show this help message"
	