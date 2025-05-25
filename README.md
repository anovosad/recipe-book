# Recipe Book Application

A modern, responsive recipe management web application with separate pages for each view, built with Go backend and server-side rendered HTML templates.

## Features

- **Multi-Page Architecture**: Separate pages for login, register, recipe list, single recipe view, ingredient management
- **User Authentication**: Register and login system with JWT tokens stored in HTTP-only cookies
- **Recipe Management**: Add, edit, delete, and view recipes with dedicated pages
- **Search Functionality**: Search recipes by title, description, or instructions
- **Ingredient Management**: Separate ingredient management with dedicated pages
- **Responsive Design**: Modern, mobile-friendly interface with glass morphism effects
- **User Permissions**: Only recipe creators can edit/delete their recipes
- **CGO-Free**: Uses modernc.org/sqlite for pure Go SQLite implementation

## Tech Stack

- **Backend**: Go with Gorilla Mux router and HTML templates
- **Database**: SQLite3 (CGO-free with modernc.org/sqlite)
- **Frontend**: Server-side rendered HTML templates with vanilla CSS/JavaScript
- **Authentication**: JWT tokens with HTTP-only cookies
- **Styling**: Modern CSS with gradients and glass morphism effects

## Pages Structure

### Public Pages
- `/` - Redirects to recipes list
- `/recipes` - Recipe listing with search functionality
- `/recipe/{id}` - Individual recipe view
- `/ingredients` - Ingredients listing
- `/login` - User login page
- `/register` - User registration page

### Protected Pages (Login Required)
- `/recipe/new` - Add new recipe form
- `/recipe/{id}/edit` - Edit existing recipe form
- `/ingredients/new` - Add new ingredient form

## Quick Start with Docker

1. **Create the project structure**:
```
recipe-book/
├── main.go
├── go.mod
├── Dockerfile
├── docker-compose.yml
├── templates/
│   ├── base.html
│   ├── login.html
│   ├── register.html
│   ├── recipes.html
│   ├── recipe.html
│   ├── recipe-form.html
│   ├── ingredients.html
│   └── ingredient-form.html
├── static/
│   ├── style.css
│   └── app.js
└── README.md
```

2. **Run with Docker Compose**:
```bash
docker-compose up --build
```

3. **Access the application**:
   - Open your browser to `http://localhost:8080`

## Manual Setup

### Prerequisites

- Go 1.21 or higher
- No CGO dependencies needed!

### Installation

1. **Initialize Go module**:
```bash
go mod init recipe-book
go mod tidy
```

2. **Install dependencies**:
```bash
go get github.com/gorilla/mux
go get github.com/golang-jwt/jwt/v5
go get modernc.org/sqlite
go get golang.org/x/crypto
```

3. **Create directory structure**:
```bash
mkdir templates static
# Copy all template files to templates/
# Copy CSS and JS files to static/
```

4. **Run the application**:
```bash
go run main.go
```

5. **Access the application**:
   - Open `http://localhost:8080` in your browser

## Project Structure

```
recipe-book/
├── main.go                    # Go backend server with page handlers
├── go.mod                     # Go module dependencies (CGO-free)
├── Dockerfile                 # Docker build instructions
├── docker-compose.yml         # Docker Compose configuration
├── Makefile                   # Development commands
├── templates/                 # HTML templates
│   ├── base.html             # Base template with navigation
│   ├── login.html            # Login page
│   ├── register.html         # Registration page  
│   ├── recipes.html          # Recipes listing page
│   ├── recipe.html           # Single recipe view page
│   ├── recipe-form.html      # Recipe add/edit form page
│   ├── ingredients.html      # Ingredients listing page
│   └── ingredient-form.html  # Ingredient add form page
├── static/                   # Static assets
│   ├── style.css            # Main stylesheet
│   └── app.js               # JavaScript functionality
└── recipes.db               # SQLite database (auto-created)
```

## Page Routes

### Page Routes (HTML)
- `GET /` - Home (redirects to recipes)
- `GET /login` - Login page
- `GET /register` - Registration page
- `GET /recipes` - Recipes listing with search
- `GET /recipe/{id}` - Single recipe view
- `GET /recipe/new` - New recipe form (auth required)
- `GET /recipe/{id}/edit` - Edit recipe form (auth required, owner only)
- `GET /ingredients` - Ingredients listing
- `GET /ingredients/new` - New ingredient form (auth required)

### API Routes (Form Processing)
- `POST /api/register` - Process registration
- `POST /api/login` - Process login
- `POST /api/logout` - Process logout
- `POST /api/recipes` - Create new recipe (auth required)
- `PUT /api/recipes/{id}` - Update recipe (auth required, owner only)
- `DELETE /api/recipes/{id}` - Delete recipe (auth required, owner only)
- `POST /api/ingredients` - Create new ingredient (auth required)
- `DELETE /api/ingredients/{id}` - Delete ingredient (auth required)
- `GET /api/search` - Search recipes API

## Template System

The application uses Go's `html/template` package with a base template system:

### Base Template (`templates/base.html`)
- Contains navigation, alerts, and common layout
- Defines `{{template "content" .}}` block for page-specific content
- Handles authentication state display

### Page Templates
Each page extends the base template and defines its content block:
```go
{{define "content"}}
<!-- Page-specific content here -->
{{end}}

{{template "base.html" .}}
```

### Template Data Structure
```go
type PageData struct {
    User        *User
    IsLoggedIn  bool
    Recipe      *Recipe
    Recipes     []Recipe
    Ingredients []Ingredient
    Title       string
    Message     string
    Error       string
}
```

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - User login

### Recipes
- `GET /api/recipes` - Get all recipes
- `POST /api/recipes` - Create new recipe (auth required)
- `GET /api/recipes/{id}` - Get specific recipe
- `PUT /api/recipes/{id}` - Update recipe (auth required, owner only)
- `DELETE /api/recipes/{id}` - Delete recipe (auth required, owner only)
- `GET /api/recipes/search?q={query}` - Search recipes

### Ingredients
- `GET /api/ingredients` - Get all ingredients
- `POST /api/ingredients` - Create new ingredient (auth required)

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Ingredients Table
```sql
CREATE TABLE ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    unit TEXT NOT NULL
);
```

### Recipes Table
```sql
CREATE TABLE recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT NOT NULL,
    prep_time INTEGER,
    cook_time INTEGER,
    servings INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users (id)
);
```

### Recipe Ingredients Junction Table
```sql
CREATE TABLE recipe_ingredients (
    recipe_id INTEGER,
    ingredient_id INTEGER,
    quantity REAL NOT NULL,
    PRIMARY KEY (recipe_id, ingredient_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients (id)
);
```

## Features Overview

### Authentication System
- Secure password hashing with bcrypt
- JWT token-based authentication
- User session management in frontend

### Recipe Management
- Create recipes with multiple ingredients
- Edit existing recipes (owner only)
- Delete recipes (owner only)
- View recipe details in modal

### Search & Discovery
- Real-time search across recipe titles, descriptions, and instructions
- Responsive recipe grid layout
- Empty state handling

### Modern UI/UX
- Glass morphism design with backdrop filters
- Gradient backgrounds and hover effects
- Responsive design for mobile and desktop
- Loading states and user feedback
- Modal-based forms and views

### Ingredient System
- Pre-populated common ingredients
- Ability to add custom ingredients
- Unit tracking for measurements
- Dynamic ingredient selection in recipes

## Usage Guide

### Getting Started
1. **Register an Account**: Click "Register" and create your account
2. **Login**: Use your credentials to log in
3. **Add Your First Recipe**: Click "Add Recipe" and fill in the details
4. **Search Recipes**: Use the search bar to find specific recipes
5. **Manage Your Recipes**: Edit or delete recipes you've created

### Adding Recipes
1. Click the "Add Recipe" button (login required)
2. Fill in recipe details:
   - **Title**: Give your recipe a descriptive name
   - **Description**: Brief description of the dish
   - **Instructions**: Step-by-step cooking instructions
   - **Times**: Preparation and cooking times in minutes
   - **Servings**: Number of people the recipe serves
   - **Ingredients**: Add ingredients with quantities

### Managing Ingredients
- The system comes with common ingredients pre-loaded
- You can add new ingredients when creating recipes
- Each ingredient has a name and unit of measurement
- Quantities are specified per recipe

## Configuration

### Environment Variables
- `DB_PATH`: Path to SQLite database file (default: `./recipes.db`)
- `JWT_SECRET`: Secret key for JWT tokens (default: built-in key)
- `PORT`: Server port (default: `8080`)

### Security Considerations
- Change the JWT secret key in production
- Use HTTPS in production environments
- Consider rate limiting for API endpoints
- Implement proper CORS policies for production

## Development

### Running in Development Mode
```bash
# Start the server with auto-reload (requires air or similar)
go run main.go

# Or use air for hot reloading
air
```

### Adding New Features
1. **Backend**: Add new routes in `main.go`
2. **Frontend**: Update `static/index.html`
3. **Database**: Modify schema in `initDB()` function

### Testing the API
```bash
# Register a user
curl -X POST http://localhost:8080/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'

# Get recipes
curl http://localhost:8080/api/recipes

# Create a recipe (with auth token)
curl -X POST http://localhost:8080/api/recipes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"title":"Test Recipe","description":"A test recipe","instructions":"Mix and cook","prep_time":15,"cook_time":30,"servings":4,"ingredients":[{"ingredient_id":1,"quantity":2}]}'
```

## Docker Deployment

### Building the Image
```bash
docker build -t recipe-book .
```

### Running with Docker
```bash
docker run -p 8080:8080 -v recipe_data:/data recipe-book
```

### Using Docker Compose
```bash
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Rebuild and start
docker-compose up --build
```

## Production Deployment

### Recommended Setup
1. **Reverse Proxy**: Use Nginx or Traefik
2. **SSL/TLS**: Implement HTTPS certificates
3. **Database**: Consider PostgreSQL for larger deployments
4. **Monitoring**: Add health checks and logging
5. **Backup**: Regular database backups

### Example Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Troubleshooting

### Common Issues

1. **Database locked error**:
   - Ensure only one instance is running
   - Check file permissions

2. **JWT token invalid**:
   - Check if token has expired
   - Verify JWT secret key consistency

3. **CORS issues**:
   - Check if frontend and backend are on same origin
   - Verify CORS middleware configuration

4. **Build failures**:
   - Ensure Go version 1.21+
   - Run `go mod tidy` to fix dependencies

### Database Management
```bash
# View database contents
sqlite3 recipes.db ".tables"
sqlite3 recipes.db "SELECT * FROM users;"
sqlite3 recipes.db "SELECT * FROM recipes;"

# Reset database (delete file)
rm recipes.db
# Restart application to recreate
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Support

For issues or questions:
1. Check this README for common solutions
2. Review the code comments for technical details
3. Create an issue with detailed information about your problem

# Recipe Book Application - Security Enhanced

A secure, modern recipe management web application with comprehensive protection against DDOS attacks, SQL injection, and other security threats. Built with Go backend, server-side rendered HTML templates, and enterprise-grade security middleware.

## 🔒 Security Features

### Rate Limiting & DDOS Protection
- **Login Attempts**: 5 attempts per 15 minutes per IP
- **Registration**: 3 registrations per hour per IP  
- **Search Requests**: 30 per minute per IP
- **General Requests**: 100 per minute per IP
- **Automatic IP blocking** for repeated violations (30-minute blocks)
- **Nginx-level rate limiting** as additional protection layer

### SQL Injection Protection
- **Prepared statements** for all database operations
- **Input validation** using comprehensive regex patterns
- **Parameter sanitization** for all user inputs
- **Database constraints** to prevent invalid data

### Input Validation & Sanitization
- **Username**: 3-30 chars, alphanumeric + underscore only
- **Email**: Proper email format validation
- **Passwords**: Minimum 6 chars with letter + number requirement
- **Recipe content**: Length limits and dangerous character filtering
- **File uploads**: Type validation, size limits (5MB), filename sanitization

### Security Headers & Protection
- **HSTS** (HTTP Strict Transport Security)
- **X-Frame-Options**: DENY (prevents clickjacking)
- **X-Content-Type-Options**: nosniff  
- **X-XSS-Protection**: enabled with blocking
- **Content Security Policy** with strict rules
- **Referrer Policy**: strict-origin-when-cross-origin

### Authentication & Authorization
- **JWT tokens** with HTTP-only cookies
- **Bcrypt password hashing** with proper cost factor
- **Session management** with secure token generation
- **User ownership validation** for all operations

### Infrastructure Security
- **Non-root containers** with distroless base images
- **Resource limits** (CPU: 2 cores, Memory: 1GB)
- **Read-only filesystem** where possible
- **Security-first Docker configuration**
- **Fail2ban integration** for automated IP blocking
- **Comprehensive logging** of security events

## 🚀 Quick Deployment

### Prerequisites
- Docker & Docker Compose
- OpenSSL (for SSL certificate generation)
- 2GB+ RAM recommended
- Domain name (optional, works with localhost)

### One-Command Deployment
```bash
# Clone the repository
git clone <repository-url>
cd recipe-book

# Make deployment script executable
chmod +x deploy.sh

# Run complete setup and deployment
./deploy.sh setup
./deploy.sh deploy
```

### Manual Deployment Steps
```bash
# 1. Setup environment
./deploy.sh setup

# 2. Deploy application  
./deploy.sh deploy

# 3. Check status
./deploy.sh status

# 4. View logs
./deploy.sh logs
```

## 📋 Deployment Script Commands

```bash
./deploy.sh setup     # Initial setup (configs, SSL, etc.)
./deploy.sh deploy    # Deploy/redeploy application
./deploy.sh logs      # Show application logs
./deploy.sh backup    # Create backup
./deploy.sh restore   # Restore from backup
./deploy.sh update    # Update application
./deploy.sh security  # Run security audit
./deploy.sh monitor   # Monitor resources
./deploy.sh health    # Check application health
./deploy.sh stop      # Stop all services
./deploy.sh restart   # Restart services
./deploy.sh status    # Show service status
```

## 🏗️ Architecture

### Service Stack
```
┌─────────────────┐
│   Nginx Proxy   │ ← Rate limiting, SSL termination, security headers
├─────────────────┤
│   Recipe App    │ ← Go application with security middleware
├─────────────────┤
│   SQLite DB     │ ← Database with constraints and prepared statements
├─────────────────┤
│   Fail2ban      │ ← Automatic IP blocking based on patterns
└─────────────────┘
```

### Security Middleware Stack
```
Request → Security Headers → Rate Limiting → SQL Injection Protection → Input Validation → Application
```

## ⚙️ Configuration

### Environment Variables
```bash
# .env file (auto-generated)
DOMAIN=your-domain.com
EMAIL=admin@your-domain.com
ENVIRONMENT=production
DB_PATH=/data/recipes.db
JWT_SECRET=<randomly-generated-32-char-hex>
TRUSTED_PROXIES=nginx
```

### Rate Limiting Configuration
Customize in `middleware/security.go`:
```go
// Login: 5 attempts per 15 minutes
LoginRate:    rate.Every(3 * time.Minute),
LoginBurst:   5,

// Registration: 3 per hour  
RegisterRate:   rate.Every(20 * time.Minute),
RegisterBurst:  3,

// Search: 30 per minute
SearchRate:   rate.Every(2 * time.Second),
SearchBurst:  30,

// General: 100 per minute
GeneralRate:   rate.Every(600 * time.Millisecond),
GeneralBurst:  100,
```

### Nginx Rate Limiting
Additional protection at the proxy level:
```nginx
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=register:10m rate=3r/h;
limit_req_zone $binary_remote_addr zone=search:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=general:10m rate=100r/m;
```

## 🔐 SSL/TLS Configuration

### Development (Self-Signed)
The deployment script automatically generates self-signed certificates for development:
```bash
# Generated automatically
nginx/ssl/cert.pem
nginx/ssl/key.pem
```

### Production (Let's Encrypt)
For production, replace with proper certificates:
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificates
sudo certbot --nginx -d your-domain.com

# Copy to nginx directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem

# Restart services
./deploy.sh restart
```

## 📊 Monitoring & Maintenance

### Real-time Monitoring
```bash
# Resource monitoring
./deploy.sh monitor

# Application logs
./deploy.sh logs

# Health check
./deploy.sh health
```

### Security Monitoring
```bash
# Security audit
./deploy.sh security

# Check for blocked IPs
docker-compose exec fail2ban fail2ban-client status

# View security logs
docker-compose logs nginx | grep -E "(429|403|blocked)"
```

### Backup & Restore
```bash
# Create backup
./deploy.sh backup

# Restore from backup
./deploy.sh restore backups/20231215_143022
```

## 🛡️ Security Best Practices

### Default Credentials
⚠️ **Important**: Change default admin credentials immediately:
- Username: `admin`
- Password: `admin123`

### Regular Maintenance
1. **Update dependencies** regularly
2. **Monitor logs** for suspicious activity
3. **Backup data** before updates
4. **Review security settings** periodically
5. **Update SSL certificates** before expiry

### Production Checklist
- [ ] Change default admin password
- [ ] Use proper SSL certificates (not self-signed)
- [ ] Set up proper domain name
- [ ] Configure email notifications for Fail2ban
- [ ] Set up log rotation
- [ ] Configure automated backups
- [ ] Monitor resource usage
- [ ] Review and customize rate limits for your use case

## 🔍 Troubleshooting

### Common Issues

**Rate Limit Exceeded**
```bash
# Check current rate limits
docker-compose logs nginx | grep "429"

# Temporarily adjust limits in nginx config
# Then restart: ./deploy.sh restart
```

**Database Locked**
```bash
# Check for multiple connections
docker-compose exec recipe-app ps aux

# Restart application
./deploy.sh restart
```

**SSL Certificate Issues**
```bash
# Regenerate self-signed certificates
rm nginx/ssl/*.pem
./deploy.sh setup

# Check certificate validity
openssl x509 -in nginx/ssl/cert.pem -text -noout
```

**High Memory Usage**
```bash
# Monitor resources
./deploy.sh monitor

# Check for memory leaks in logs
./deploy.sh logs | grep -i "memory\|leak\|oom"
```

### Security Incident Response

**Suspected Attack**
```bash
# Check blocked IPs
docker-compose exec fail2ban fail2ban-client status recipe-book-login

# Review security logs
docker-compose logs nginx | grep -E "(429|403)" | tail -100

# Manual IP blocking
docker-compose exec fail2ban fail2ban-client set recipe-book-login banip <IP>
```

**Database Compromise**
```bash
# Immediate actions:
1. ./deploy.sh stop          # Stop all services
2. ./deploy.sh backup        # Backup current state
3. Review logs for suspicious activity
4. Change all passwords
5. Update JWT secret in .env
6. ./deploy.sh deploy        # Redeploy with new secrets
```

## 🧪 Testing Security

### Load Testing
```bash
# Install apache bench
sudo apt install apache2-utils

# Test rate limiting
ab -n 100 -c 10 https://localhost/api/search?q=test

# Should see 429 responses after burst limit
```

### SQL Injection Testing
```bash
# These should all be blocked:
curl "https://localhost/api/search?q='; DROP TABLE users; --"
curl "https://localhost/api/search?q=1' OR '1'='1"
curl "https://localhost/api/search?q=<script>alert('xss')</script>"
```

## 📚 Additional Resources

- [Go Security Checklist](https://github.com/Checkmarx/Go-SCP)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Nginx Security Headers](https://securityheaders.com/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

## 🤝 Contributing

Security contributions are especially welcome! Please:
1. Report security issues privately
2. Follow secure coding practices
3. Add tests for security features
4. Update documentation

## 📄 License

This project is open source and available under the MIT License.

---

**⚠️ Security Notice**: This application includes comprehensive security measures, but security is an ongoing process. Regularly update dependencies, monitor logs, and follow security best practices for your deployment environment.