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