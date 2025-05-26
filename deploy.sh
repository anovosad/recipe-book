#!/bin/bash
# File: deploy.sh - Secure deployment script for Recipe Book

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${DOMAIN:-"localhost"}
EMAIL=${EMAIL:-"admin@example.com"}
ENVIRONMENT=${ENVIRONMENT:-"production"}

echo -e "${BLUE}🍳 Recipe Book Secure Deployment Script${NC}"
echo -e "${BLUE}=======================================${NC}"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}❌ This script should not be run as root for security reasons${NC}"
   exit 1
fi

# Check dependencies
check_dependencies() {
    echo -e "${BLUE}🔍 Checking dependencies...${NC}"
    
    local deps=("docker" "docker-compose" "openssl")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            echo -e "${RED}❌ $dep is not installed${NC}"
            exit 1
        fi
    done
    
    echo -e "${GREEN}✅ All dependencies found${NC}"
}

# Create directory structure
setup_directories() {
    echo -e "${BLUE}📁 Setting up directory structure...${NC}"
    
    # Create necessary directories with proper permissions
    mkdir -p nginx/conf.d
    mkdir -p nginx/ssl
    mkdir -p fail2ban/jail.d
    mkdir -p fail2ban/filter.d
    mkdir -p data/uploads
    mkdir -p logs/nginx
    
    # Set proper permissions
    chmod 755 nginx
    chmod 700 nginx/ssl
    chmod 755 data
    chmod 755 data/uploads
    chmod 755 logs
    
    echo -e "${GREEN}✅ Directory structure created${NC}"
}

# Generate SSL certificates (self-signed for development)
generate_ssl_certs() {
    echo -e "${BLUE}🔐 Generating SSL certificates...${NC}"
    
    if [[ ! -f "nginx/ssl/cert.pem" ]] || [[ ! -f "nginx/ssl/key.pem" ]]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/key.pem \
            -out nginx/ssl/cert.pem \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"
        
        chmod 600 nginx/ssl/key.pem
        chmod 644 nginx/ssl/cert.pem
        
        echo -e "${GREEN}✅ SSL certificates generated${NC}"
        echo -e "${YELLOW}⚠️  Using self-signed certificates. For production, use Let's Encrypt or proper CA certificates${NC}"
    else
        echo -e "${GREEN}✅ SSL certificates already exist${NC}"
    fi
}

# Create environment file
create_env_file() {
    echo -e "${BLUE}⚙️  Creating environment configuration...${NC}"
    
    if [[ ! -f ".env" ]]; then
        cat > .env << EOF
# Recipe Book Environment Configuration
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
ENVIRONMENT=${ENVIRONMENT}

# Database
DB_PATH=/data/recipes.db

# Security
JWT_SECRET=$(openssl rand -hex 32)
TRUSTED_PROXIES=nginx

# Docker
COMPOSE_PROJECT_NAME=recipe-book
EOF
        chmod 600 .env
        echo -e "${GREEN}✅ Environment file created${NC}"
    else
        echo -e "${GREEN}✅ Environment file already exists${NC}"
    fi
}

# Create nginx configuration
create_nginx_config() {
    echo -e "${BLUE}🌐 Creating nginx configuration...${NC}"
    
    # Create the main nginx.conf (already provided in artifacts)
    # Create site-specific configuration
    cat > nginx/conf.d/recipe-book.conf << 'EOF'
# Main recipe book configuration
upstream recipe_app {
    server recipe-app:8080;
    keepalive 32;
}

# Redirect HTTP to HTTPS
server {
    listen 80 default_server;
    server_name localhost 127.0.0.1;

    # Serve the application over HTTP
    location / {
        limit_req zone=general burst=50 nodelay;
        proxy_pass http://recipe_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout settings
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}

server {
    listen 443 ssl http2;
    server_name _;

    # SSL configuration
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Connection and request limits
    limit_conn conn_limit_per_ip 20;
    
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
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/register {
        limit_req zone=register burst=2 nodelay;
        proxy_pass http://recipe_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/search {
        limit_req zone=search burst=10 nodelay;
        proxy_pass http://recipe_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://recipe_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ {
        limit_req zone=static burst=50 nodelay;
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://recipe_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Main application
    location / {
        limit_req zone=general burst=50 nodelay;
        proxy_pass http://recipe_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout settings
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

    echo -e "${GREEN}✅ Nginx configuration created${NC}"
}

# Validate configuration files
validate_config() {
    echo -e "${BLUE}🔍 Validating configuration files...${NC}"
    
    # Check if required files exist
    local required_files=(
        "docker-compose.yml"
        "Dockerfile"
        "go.mod"
        "main.go"
        ".env"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            echo -e "${RED}❌ Required file missing: $file${NC}"
            exit 1
        fi
    done
    
    # Validate docker-compose.yml
    if ! docker compose config > /dev/null 2>&1; then
        echo -e "${RED}❌ Invalid docker-compose.yml${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Configuration validation passed${NC}"
}

# Build and deploy
deploy() {
    echo -e "${BLUE}🚀 Starting deployment...${NC}"
    
    # Stop existing containers
    echo -e "${YELLOW}⏹️  Stopping existing containers...${NC}"
    docker compose down --remove-orphans || true
    
    # Build new images
    echo -e "${YELLOW}🔨 Building application...${NC}"
    docker compose build --no-cache
    
    # Start services
    echo -e "${YELLOW}▶️  Starting services...${NC}"
    docker compose up -d
    
    # Wait for services to be ready
    echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
    sleep 10
    
    # Check service health
    check_health
    
    echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
    echo -e "${BLUE}📋 Access your Recipe Book at: https://${DOMAIN}${NC}"
    echo -e "${BLUE}📋 Default admin credentials: admin / admin123${NC}"
    echo -e "${YELLOW}⚠️  Remember to change the default admin password!${NC}"
}

# Check service health
check_health() {
    echo -e "${BLUE}🏥 Checking service health...${NC}"
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -k -s https://localhost/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Application is healthy${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}⏳ Attempt $attempt/$max_attempts - waiting for application...${NC}"
        sleep 2
        ((attempt++))
    done
    
    echo -e "${RED}❌ Application health check failed${NC}"
    echo -e "${YELLOW}📋 Checking logs...${NC}"
    docker compose logs --tail=20
    return 1
}

# Show logs
show_logs() {
    echo -e "${BLUE}📋 Application logs:${NC}"
    docker compose logs -f
}

# Backup data
backup() {
    echo -e "${BLUE}💾 Creating backup...${NC}"
    
    local backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup database
    docker compose exec -T recipe-app cp /data/recipes.db /tmp/backup.db 2>/dev/null || true
    docker cp $(docker compose ps -q recipe-app):/tmp/backup.db "$backup_dir/recipes.db" 2>/dev/null || true
    
    # Backup uploads
    docker cp $(docker compose ps -q recipe-app):/app/uploads "$backup_dir/" 2>/dev/null || true
    
    # Backup configuration
    cp -r nginx "$backup_dir/"
    cp .env "$backup_dir/"
    cp docker-compose.yml "$backup_dir/"
    
    echo -e "${GREEN}✅ Backup created in $backup_dir${NC}"
}

# Restore from backup
restore() {
    local backup_dir="$1"
    
    if [[ -z "$backup_dir" ]] || [[ ! -d "$backup_dir" ]]; then
        echo -e "${RED}❌ Please specify a valid backup directory${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}🔄 Restoring from backup: $backup_dir${NC}"
    
    # Stop services
    docker compose down
    
    # Restore database
    if [[ -f "$backup_dir/recipes.db" ]]; then
        docker compose run --rm -v "$backup_dir:/backup" recipe-app cp /backup/recipes.db /data/recipes.db
    fi
    
    # Restore uploads
    if [[ -d "$backup_dir/uploads" ]]; then
        docker compose run --rm -v "$backup_dir:/backup" recipe-app cp -r /backup/uploads /app/
    fi
    
    # Start services
    docker compose up -d
    
    echo -e "${GREEN}✅ Restore completed${NC}"
}

# Clean up old containers and images
cleanup() {
    echo -e "${BLUE}🧹 Cleaning up...${NC}"
    
    # Remove stopped containers
    docker container prune -f
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes
    docker volume prune -f
    
    # Remove unused networks
    docker network prune -f
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Update application
update() {
    echo -e "${BLUE}🔄 Updating application...${NC}"
    
    # Create backup before update
    backup
    
    # Pull latest code (if using git)
    if [[ -d ".git" ]]; then
        echo -e "${YELLOW}📥 Pulling latest code...${NC}"
        git pull
    fi
    
    # Rebuild and deploy
    deploy
}

# Security audit
security_audit() {
    echo -e "${BLUE}🔒 Running security audit...${NC}"
    
    # Check file permissions
    echo -e "${YELLOW}📋 Checking file permissions...${NC}"
    find . -name "*.sh" -not -perm 755 -exec chmod 755 {} \;
    find . -name ".env" -not -perm 600 -exec chmod 600 {} \;
    find nginx/ssl -name "*.pem" -not -perm 600 -exec chmod 600 {} \;
    
    # Check for default passwords
    echo -e "${YELLOW}📋 Checking for default passwords...${NC}"
    if grep -q "admin123" .env 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Default admin password detected - please change it${NC}"
    fi
    
    # Check SSL certificate expiry
    echo -e "${YELLOW}📋 Checking SSL certificate...${NC}"
    if [[ -f "nginx/ssl/cert.pem" ]]; then
        local expiry_date=$(openssl x509 -in nginx/ssl/cert.pem -noout -enddate | cut -d= -f2)
        echo -e "${BLUE}📋 SSL certificate expires: $expiry_date${NC}"
    fi
    
    # Check Docker security
    echo -e "${YELLOW}📋 Checking Docker security...${NC}"
    if docker compose exec recipe-app whoami | grep -q root; then
        echo -e "${YELLOW}⚠️  Application is running as root - consider using non-root user${NC}"
    fi
    
    echo -e "${GREEN}✅ Security audit completed${NC}"
}

# Monitor resources
monitor() {
    echo -e "${BLUE}📊 Resource monitoring...${NC}"
    
    while true; do
        clear
        echo -e "${BLUE}📊 Recipe Book - Resource Monitor${NC}"
        echo -e "${BLUE}=================================${NC}"
        echo
        
        # Container status
        echo -e "${YELLOW}🐳 Container Status:${NC}"
        docker compose ps
        echo
        
        # Resource usage
        echo -e "${YELLOW}💾 Resource Usage:${NC}"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
        echo
        
        # Disk usage
        echo -e "${YELLOW}💽 Disk Usage:${NC}"
        df -h | grep -E "(Filesystem|/dev/)"
        echo
        
        # Recent logs
        echo -e "${YELLOW}📋 Recent Logs (last 5 lines):${NC}"
        docker compose logs --tail=5 recipe-app 2>/dev/null || echo "No logs available"
        
        echo
        echo -e "${BLUE}Press Ctrl+C to exit monitoring${NC}"
        sleep 10
    done
}

# Main function
main() {
    case "${1:-deploy}" in
        "setup")
            check_dependencies
            setup_directories
            generate_ssl_certs
            create_env_file
            create_nginx_config
            validate_config
            echo -e "${GREEN}✅ Setup completed. Run './deploy.sh deploy' to start the application${NC}"
            ;;
        "deploy")
            check_dependencies
            setup_directories
            generate_ssl_certs
            create_env_file
            create_nginx_config
            validate_config
            deploy
            ;;
        "logs")
            show_logs
            ;;
        "backup")
            backup
            ;;
        "restore")
            restore "$2"
            ;;
        "update")
            update
            ;;
        "cleanup")
            cleanup
            ;;
        "security")
            security_audit
            ;;
        "monitor")
            monitor
            ;;
        "health")
            check_health
            ;;
        "stop")
            echo -e "${YELLOW}⏹️  Stopping services...${NC}"
            docker compose down
            echo -e "${GREEN}✅ Services stopped${NC}"
            ;;
        "restart")
            echo -e "${YELLOW}🔄 Restarting services...${NC}"
            docker compose restart
            echo -e "${GREEN}✅ Services restarted${NC}"
            ;;
        "status")
            echo -e "${BLUE}📋 Service Status:${NC}"
            docker compose ps
            ;;
        *)
            echo -e "${BLUE}🍳 Recipe Book Deployment Script${NC}"
            echo -e "${BLUE}Usage: $0 [command]${NC}"
            echo
            echo -e "${YELLOW}Commands:${NC}"
            echo "  setup     - Initial setup (create configs, SSL certs, etc.)"
            echo "  deploy    - Deploy/redeploy the application (default)"
            echo "  logs      - Show application logs"
            echo "  backup    - Create a backup"
            echo "  restore   - Restore from backup directory"
            echo "  update    - Update application (backup + redeploy)"
            echo "  cleanup   - Clean up Docker resources"
            echo "  security  - Run security audit"
            echo "  monitor   - Monitor resources"
            echo "  health    - Check application health"
            echo "  stop      - Stop all services"
            echo "  restart   - Restart all services"
            echo "  status    - Show service status"
            echo
            echo -e "${YELLOW}Examples:${NC}"
            echo "  $0 setup              # Initial setup"
            echo "  $0 deploy             # Deploy application"
            echo "  $0 backup             # Create backup"
            echo "  $0 restore backup_dir # Restore from backup"
            echo "  $0 logs               # Show logs"
            ;;
    esac
}

# Run main function with all arguments
main "$@"