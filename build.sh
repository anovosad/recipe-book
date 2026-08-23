#!/bin/bash

# Recipe Book Application Build Script
echo "🍳 Recipe Book Application - Build Script"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Go
    if ! command -v go &> /dev/null; then
        print_error "Go is not installed. Please install Go 1.24.3 or later."
        exit 1
    fi
    
    GO_VERSION=$(go version | awk '{print $3}')
    print_success "Go found: $GO_VERSION"
    
    # Check Node.js. Vite 8 requires ^20.19.0 || >=22.12.0 - an older Node
    # fails deep inside the bundler with an unhelpful error, so reject it here.
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 20.19+ or 22.12+ and npm."
        exit 1
    fi
    
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo "${NODE_VERSION#v}" | cut -d. -f1)
    NODE_MINOR=$(echo "${NODE_VERSION#v}" | cut -d. -f2)
    if [ "$NODE_MAJOR" -lt 20 ] || \
       { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; } || \
       { [ "$NODE_MAJOR" -eq 21 ]; } || \
       { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 12 ]; }; then
        print_error "Node.js $NODE_VERSION is too old for Vite 8. Install 20.19+ or 22.12+."
        exit 1
    fi
    print_success "Node.js found: $NODE_VERSION"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm."
        exit 1
    fi
    
    NPM_VERSION=$(npm --version)
    print_success "npm found: v$NPM_VERSION"
}

# Setup directories
setup_directories() {
    print_status "Setting up directories..."
    
    # Create necessary directories
    mkdir -p uploads
    mkdir -p static/dist
    mkdir -p data
    
    # Set permissions
    chmod 750 uploads
    chmod 755 static/dist
    chmod 750 data
    
    print_success "Directories created and permissions set"
}

# Install Go dependencies
install_go_deps() {
    print_status "Installing Go dependencies..."
    
    go mod download
    if [ $? -ne 0 ]; then
        print_error "Failed to download Go dependencies"
        exit 1
    fi
    
    go mod tidy
    if [ $? -ne 0 ]; then
        print_error "Failed to tidy Go modules"
        exit 1
    fi
    
    print_success "Go dependencies installed"
}

# Build frontend
build_frontend() {
    print_status "Building React frontend..."
    
    # Check if frontend directory exists
    if [ ! -d "frontend" ]; then
        print_error "Frontend directory not found"
        exit 1
    fi
    
    cd frontend
    
    # Install npm dependencies
    print_status "Installing npm dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        print_error "Failed to install npm dependencies"
        exit 1
    fi
    
    # Build frontend
    print_status "Building frontend with Vite..."
    npm run build
    if [ $? -ne 0 ]; then
        print_error "Failed to build frontend"
        exit 1
    fi
    
    cd ..
    print_success "Frontend built successfully"
}

# Build backend
build_backend() {
    print_status "Building Go backend..."
    
    # Build for current platform
    CGO_ENABLED=0 go build -o recipe-book .
    if [ $? -ne 0 ]; then
        print_error "Failed to build backend"
        exit 1
    fi
    
    print_success "Backend built successfully"
}

# Verify build
verify_build() {
    print_status "Verifying build..."
    
    # Check if binary exists
    if [ ! -f "recipe-book" ]; then
        print_error "Backend binary not found"
        exit 1
    fi
    
    # Check if frontend files exist
    if [ ! -f "static/dist/index.html" ]; then
        print_error "Frontend build files not found"
        exit 1
    fi
    
    print_success "Build verification completed"
}

# Main build process
main() {
    echo ""
    check_prerequisites
    echo ""
    setup_directories
    echo ""
    install_go_deps
    echo ""
    build_frontend
    echo ""
    build_backend
    echo ""
    verify_build
    echo ""
    
    print_success "🎉 Build completed successfully!"
    echo ""
    echo "📁 Build artifacts:"
    echo "   - Backend binary: ./recipe-book"
    echo "   - Frontend files: ./static/dist/"
    echo "   - Upload directory: ./uploads/"
    echo "   - Data directory: ./data/"
    echo ""
    echo "🚀 To run the application:"
    echo "   ./recipe-book"
    echo ""
    echo "🌐 Then open your browser to:"
    echo "   http://localhost:8080"
    echo ""
    echo "👤 Admin account:"
    echo "   Username: admin"
    echo "   Password: set ADMIN_PASSWORD before the first run, or read the"
    echo "             generated one from the server log on first startup."
}

# Handle script arguments
case "${1:-build}" in
    "clean")
        print_status "Cleaning build artifacts..."
        rm -f recipe-book
        rm -rf static/dist/*
        rm -rf frontend/node_modules
        rm -rf frontend/dist
        print_success "Clean completed"
        ;;
    "frontend")
        build_frontend
        ;;
    "backend")
        build_backend
        ;;
    "dev")
        print_status "Starting development servers..."
        echo ""
        print_status "Building frontend once..."
        build_frontend
        echo ""
        print_status "Starting backend server..."
        echo "Frontend dev server: http://localhost:3000"
        echo "Backend API server: http://localhost:8080"
        echo ""
        print_warning "Run 'cd frontend && npm run dev' in another terminal for frontend hot reload"
        echo ""
        go run main.go
        ;;
    "build"|*)
        main
        ;;
esac