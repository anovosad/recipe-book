#!/bin/bash

# Recipe Book Frontend Build Fix Script
echo "🔧 Fixing Recipe Book Frontend Build Issues"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Navigate to frontend directory
cd frontend || { print_error "Frontend directory not found!"; exit 1; }

print_status "Current directory: $(pwd)"

# Clean previous builds and dependencies
print_status "Cleaning previous builds..."
rm -rf node_modules package-lock.json dist .vite

# Install dependencies
print_status "Installing dependencies..."
npm install

# Add missing dependencies if needed
print_status "Adding missing dependencies..."
npm install --save-dev @types/node

# Type check first
print_status "Running TypeScript type check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    print_warning "TypeScript errors detected, but continuing with build..."
fi

# Build the project
print_status "Building the frontend..."
npm run build

if [ $? -eq 0 ]; then
    print_success "Frontend build completed successfully!"
    print_status "Build output is in: frontend/dist/"
    print_status "Files will be copied to: static/dist/"
    
    # Copy built files to static directory
    print_status "Copying files to static directory..."
    cd ..
    mkdir -p static/dist
    cp -r frontend/dist/* static/dist/
    
    print_success "🎉 Build and deployment completed!"
    echo ""
    echo "📁 Build artifacts:"
    echo "   - Frontend build: ./frontend/dist/"
    echo "   - Backend static: ./static/dist/"
    echo ""
    echo "🚀 To run the application:"
    echo "   ./recipe-book"
    echo "   or"
    echo "   go run main.go"
    
else
    print_error "Build failed! Check the errors above."
    
    print_status "Trying to fix common issues..."
    
    # Common fixes
    echo ""
    print_status "Common TypeScript fixes:"
    echo "1. Check for missing React imports in JSX files"
    echo "2. Verify all import paths are correct"
    echo "3. Check for unused variables/imports"
    echo "4. Ensure all components are properly exported"
    
    echo ""
    print_status "If build still fails, try:"
    echo "cd frontend"
    echo "npm install --force"
    echo "npm run type-check"
    echo "npm run build -- --mode development"
    
    exit 1
fi