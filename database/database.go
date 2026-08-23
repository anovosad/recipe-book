// File: database/database.go
package database

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"recipe-book/models"
	"recipe-book/utils"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

var DB *sql.DB

var (
	stmtGetUser          *sql.Stmt
	stmtCreateUser       *sql.Stmt
	stmtGetRecipeByID    *sql.Stmt
	stmtSearchRecipes    *sql.Stmt
	stmtCreateRecipe     *sql.Stmt
	stmtUpdateRecipe     *sql.Stmt
	stmtDeleteRecipe     *sql.Stmt
	stmtCreateIngredient *sql.Stmt
	stmtDeleteIngredient *sql.Stmt
	stmtCreateTag        *sql.Stmt
	stmtDeleteTag        *sql.Stmt
)

// openDatabase opens the SQLite file and applies the pragmas.
//
// SQLite applies most pragmas per connection and database/sql hands out a pool of
// them, so the previous code - one Exec of the pragmas after Open - configured
// whichever single connection happened to serve that call and left every other
// one on the defaults. foreign_keys defaults to OFF, which means ON DELETE CASCADE
// quietly never fired and deleting a recipe could leave its ingredient, tag and
// image rows behind. Passing the pragmas in the DSN makes the driver apply them to
// every connection it opens; busy_timeout is what turns "database is locked"
// errors into a short wait.
//
// The bool reports whether the DSN form was accepted. If this build of the driver
// does not understand _pragma the function falls back to a plain path rather than
// refusing to start, and the caller then pins the pool to a single connection.
func openDatabase(dbPath string) (*sql.DB, bool, error) {
	dsn := dbPath + "?" + strings.Join([]string{
		"_pragma=foreign_keys(1)",
		"_pragma=busy_timeout(10000)",
		"_pragma=journal_mode(WAL)",
		"_pragma=synchronous(NORMAL)",
		"_pragma=cache_size(-8000)",
		"_pragma=temp_store(memory)",
	}, "&")

	db, err := sql.Open("sqlite", dsn)
	if err == nil {
		if err = db.Ping(); err == nil {
			return db, true, nil
		}
		db.Close()
	}

	log.Printf("⚠️  Could not open the database with DSN pragmas (%v) - falling back to a plain path", err)

	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, false, err
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, false, err
	}

	if _, err := db.Exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA synchronous = NORMAL;
		PRAGMA busy_timeout = 10000;
		PRAGMA cache_size = -8000;
		PRAGMA temp_store = memory;
		PRAGMA foreign_keys = ON;
	`); err != nil {
		log.Printf("Warning: Failed to set some database pragmas: %v", err)
	}

	return db, false, nil
}

func InitDB() {
	var err error
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./recipes.db"
	}

	log.Print("🔌 Opening database at:", dbPath)

	// Check if database already exists
	dbExists := true
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		dbExists = false
	}

	// Ensure the directory exists and is writable (only if DB doesn't exist)
	if !dbExists {
		dbDir := filepath.Dir(dbPath)
		// 0750: the database is only ever read by this process, and nothing else
		// on the host has a reason to be able to open it.
		if err := os.MkdirAll(dbDir, 0750); err != nil {
			log.Printf("Warning: Could not create database directory %s: %v", dbDir, err)
		}
	}

	var perConnectionPragmas bool
	DB, perConnectionPragmas, err = openDatabase(dbPath)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}

	if perConnectionPragmas {
		DB.SetMaxOpenConns(10)
		DB.SetMaxIdleConns(5)
		// Safe to recycle: the DSN reapplies every pragma to each new connection.
		DB.SetConnMaxLifetime(5 * time.Minute)
	} else {
		// Without per-connection pragmas the settings below only hold on the one
		// connection they were executed on, so the pool is capped at that single
		// connection to keep foreign keys and WAL consistent. SQLite serialises
		// writes anyway, so the cost is modest.
		//
		// The lifetime has to stay unlimited here as well: retiring that single
		// connection would have database/sql open a fresh, pragma-less one, and
		// foreign_keys would silently go back to OFF a few minutes after startup -
		// the exact failure the DSN form exists to prevent.
		DB.SetMaxOpenConns(1)
		DB.SetMaxIdleConns(1)
		DB.SetConnMaxLifetime(0)
	}

	// Read the pragma back rather than assuming it was applied: silently running
	// without foreign keys is exactly the failure this is guarding against.
	var foreignKeys int
	if err := DB.QueryRow("PRAGMA foreign_keys").Scan(&foreignKeys); err != nil {
		log.Printf("Warning: could not read the foreign_keys pragma: %v", err)
	} else if foreignKeys != 1 {
		log.Println("⚠️  foreign_keys is OFF - ON DELETE CASCADE will not fire")
	}

	// Only run heavy initialization if database is new
	if !dbExists {
		log.Println("📊 Setting up new database...")
		migrateDatabase()
		createTables()
		insertDefaultIngredients()
		insertDefaultTags()
		insertDefaultRecipes()
		fmt.Println("✅ New database initialized successfully")
	} else {
		log.Println("📊 Using existing database...")
		// Just ensure tables exist and run critical migrations
		createTables()        // This is idempotent
		migrateServingUnits() // Run any necessary migrations
	}

	// The upload directory was previously created only on a fresh database, so an
	// existing deployment with a missing ./uploads silently failed every upload.
	// Uploaded images are served by this process, not by nginx reading the
	// directory directly, so it does not need to be world-readable either.
	if err := os.MkdirAll("./uploads", 0750); err != nil {
		log.Printf("Warning: Could not create uploads directory: %v", err)
	}

	// Prepare statements after database is ready
	prepareStatements()

	fmt.Println("🚀 Database ready for connections")
}

func prepareStatements() {
	var err error

	// User-related statements
	stmtGetUser, err = DB.Prepare("SELECT id, username, email, password FROM users WHERE username = ?")
	if err != nil {
		log.Fatal("Failed to prepare stmtGetUser:", err)
	}

	stmtCreateUser, err = DB.Prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)")
	if err != nil {
		log.Fatal("Failed to prepare stmtCreateUser:", err)
	}

	// Recipe-related statements
	stmtGetRecipeByID, err = DB.Prepare(`
		SELECT r.id, r.title, r.description, r.instructions, r.prep_time, r.cook_time, 
		       r.servings, COALESCE(r.serving_unit, 'people'), r.created_by, r.created_at, u.username
		FROM recipes r
		JOIN users u ON r.created_by = u.id
		WHERE r.id = ?
	`)
	if err != nil {
		log.Fatal("Failed to prepare stmtGetRecipeByID:", err)
	}

	stmtSearchRecipes, err = DB.Prepare(`
		SELECT DISTINCT r.id, r.title, r.description, r.instructions, r.prep_time, r.cook_time, 
		       r.servings, COALESCE(r.serving_unit, 'people'), r.created_by, r.created_at, u.username
		FROM recipes r
		JOIN users u ON r.created_by = u.id
		LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
		LEFT JOIN ingredients i ON ri.ingredient_id = i.id
		LEFT JOIN recipe_tags rt ON r.id = rt.recipe_id
		LEFT JOIN tags t ON rt.tag_id = t.id
		WHERE r.title LIKE ? 
		   OR r.description LIKE ? 
		   OR r.instructions LIKE ?
		   OR i.name LIKE ?
		   OR t.name LIKE ?
		ORDER BY 
		   CASE WHEN r.title LIKE ? THEN 0 ELSE 1 END,
		   r.created_at DESC
	`)
	if err != nil {
		log.Fatal("Failed to prepare stmtSearchRecipes:", err)
	}

	stmtCreateRecipe, err = DB.Prepare(`
		INSERT INTO recipes (title, description, instructions, prep_time, cook_time, servings, serving_unit, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		log.Fatal("Failed to prepare stmtCreateRecipe:", err)
	}

	stmtUpdateRecipe, err = DB.Prepare(`
		UPDATE recipes SET title = ?, description = ?, instructions = ?, 
		prep_time = ?, cook_time = ?, servings = ?, serving_unit = ? WHERE id = ? AND created_by = ?
	`)
	if err != nil {
		log.Fatal("Failed to prepare stmtUpdateRecipe:", err)
	}

	stmtDeleteRecipe, err = DB.Prepare("DELETE FROM recipes WHERE id = ? AND created_by = ?")
	if err != nil {
		log.Fatal("Failed to prepare stmtDeleteRecipe:", err)
	}

	// Ingredient statements
	stmtCreateIngredient, err = DB.Prepare("INSERT INTO ingredients (name) VALUES (?)")
	if err != nil {
		log.Fatal("Failed to prepare stmtCreateIngredient:", err)
	}

	stmtDeleteIngredient, err = DB.Prepare("DELETE FROM ingredients WHERE id = ?")
	if err != nil {
		log.Fatal("Failed to prepare stmtDeleteIngredient:", err)
	}

	// Tag statements
	stmtCreateTag, err = DB.Prepare("INSERT INTO tags (name, color) VALUES (?, ?)")
	if err != nil {
		log.Fatal("Failed to prepare stmtCreateTag:", err)
	}

	stmtDeleteTag, err = DB.Prepare("DELETE FROM tags WHERE id = ?")
	if err != nil {
		log.Fatal("Failed to prepare stmtDeleteTag:", err)
	}
}

func migrateDatabase() {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM pragma_table_info('ingredients') WHERE name='unit'").Scan(&count)
	if err == nil && count > 0 {
		fmt.Println("🔄 Migrating database schema...")
		DB.Exec("DROP TABLE IF EXISTS recipe_ingredients")
		DB.Exec("DROP TABLE IF EXISTS ingredients")
		fmt.Println("✅ Database migration completed")
	}
}

func createTables() {
	createTables := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL CHECK(length(username) >= 3 AND length(username) <= 30),
		email TEXT UNIQUE NOT NULL CHECK(length(email) <= 254),
		password TEXT NOT NULL CHECK(length(password) >= 6),
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	
	CREATE TABLE IF NOT EXISTS ingredients (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL CHECK(length(name) >= 1 AND length(name) <= 100)
	);

	CREATE TABLE IF NOT EXISTS tags (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL CHECK(length(name) >= 1 AND length(name) <= 50),
		color TEXT DEFAULT '#ff6b6b' CHECK(length(color) = 7 AND color LIKE '#%'),
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	
	CREATE TABLE IF NOT EXISTS recipes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL CHECK(length(title) >= 1 AND length(title) <= 200),
		description TEXT CHECK(length(description) <= 1000),
		instructions TEXT NOT NULL CHECK(length(instructions) >= 1 AND length(instructions) <= 10000),
		prep_time INTEGER CHECK(prep_time >= 0 AND prep_time <= 1440),
		cook_time INTEGER CHECK(cook_time >= 0 AND cook_time <= 1440),
		servings INTEGER CHECK(servings >= 1 AND servings <= 100),
		serving_unit TEXT DEFAULT 'people' CHECK(length(serving_unit) <= 20),
		created_by INTEGER NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
	);
	
	-- A surrogate key, not (recipe_id, ingredient_id): a recipe may legitimately
	-- list the same ingredient in two units, e.g. butter 100 g for the dough and
	-- 2 tbsp for the pan. The UNIQUE constraint still rejects an exact repeat.
	CREATE TABLE IF NOT EXISTS recipe_ingredients (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		recipe_id INTEGER NOT NULL,
		ingredient_id INTEGER NOT NULL,
		quantity REAL NOT NULL CHECK(quantity > 0 AND quantity <= 10000),
		unit TEXT NOT NULL CHECK(length(unit) >= 1 AND length(unit) <= 20),
		UNIQUE (recipe_id, ingredient_id, unit),
		FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
		FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS recipe_tags (
		recipe_id INTEGER,
		tag_id INTEGER,
		PRIMARY KEY (recipe_id, tag_id),
		FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
		FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS recipe_images (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		recipe_id INTEGER NOT NULL,
		filename TEXT NOT NULL CHECK(length(filename) <= 255),
		caption TEXT CHECK(length(caption) <= 200),
		display_order INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
	);

	-- Create indexes for better performance and security
	CREATE INDEX IF NOT EXISTS idx_recipes_created_by ON recipes(created_by);
	CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title);
	CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
	CREATE INDEX IF NOT EXISTS idx_recipe_tags_recipe_id ON recipe_tags(recipe_id);
	CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`

	_, err := DB.Exec(createTables)
	if err != nil {
		log.Fatal("Failed to create tables:", err)
	}

	migrateServingUnits()
	migrateRecipeIngredientsKey()
}

// migrateRecipeIngredientsKey rebuilds recipe_ingredients so its primary key is a
// surrogate id instead of (recipe_id, ingredient_id). SQLite cannot alter a
// primary key in place, so the table is copied, dropped and renamed - all inside
// one transaction, so a failure leaves the original table untouched.
func migrateRecipeIngredientsKey() {
	var hasSurrogateKey int
	err := DB.QueryRow("SELECT COUNT(*) FROM pragma_table_info('recipe_ingredients') WHERE name='id'").Scan(&hasSurrogateKey)
	if err != nil {
		log.Printf("Error checking the recipe_ingredients schema: %v", err)
		return
	}
	if hasSurrogateKey > 0 {
		return
	}

	fmt.Println("🔄 Rebuilding recipe_ingredients to allow one ingredient in several units...")

	var before int
	if err := DB.QueryRow("SELECT COUNT(*) FROM recipe_ingredients").Scan(&before); err != nil {
		log.Printf("Error counting recipe_ingredients: %v", err)
		return
	}

	tx, err := DB.Begin()
	if err != nil {
		log.Printf("Error starting the recipe_ingredients migration: %v", err)
		return
	}
	defer tx.Rollback()

	steps := []string{
		`CREATE TABLE recipe_ingredients_migrated (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			recipe_id INTEGER NOT NULL,
			ingredient_id INTEGER NOT NULL,
			quantity REAL NOT NULL CHECK(quantity > 0 AND quantity <= 10000),
			unit TEXT NOT NULL CHECK(length(unit) >= 1 AND length(unit) <= 20),
			UNIQUE (recipe_id, ingredient_id, unit),
			FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
			FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE CASCADE
		)`,
		`INSERT INTO recipe_ingredients_migrated (recipe_id, ingredient_id, quantity, unit)
			SELECT recipe_id, ingredient_id, quantity, unit FROM recipe_ingredients`,
		`DROP TABLE recipe_ingredients`,
		`ALTER TABLE recipe_ingredients_migrated RENAME TO recipe_ingredients`,
		`CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id)`,
	}

	for _, step := range steps {
		if _, err := tx.Exec(step); err != nil {
			log.Printf("recipe_ingredients migration failed, keeping the original table: %v", err)
			return
		}
	}

	var after int
	if err := tx.QueryRow("SELECT COUNT(*) FROM recipe_ingredients").Scan(&after); err != nil {
		log.Printf("Error verifying the migrated recipe_ingredients: %v", err)
		return
	}

	// Refuse to commit a copy that lost rows.
	if after != before {
		log.Printf("recipe_ingredients migration would change %d rows into %d - rolling back", before, after)
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Error committing the recipe_ingredients migration: %v", err)
		return
	}

	fmt.Printf("✅ recipe_ingredients rebuilt (%d rows preserved)\n", after)
}

func migrateServingUnits() {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM pragma_table_info('recipes') WHERE name='serving_unit'").Scan(&count)
	if err != nil || count == 0 {
		fmt.Println("🔄 Adding serving_unit column to recipes...")
		_, err = DB.Exec("ALTER TABLE recipes ADD COLUMN serving_unit TEXT DEFAULT 'people'")
		if err != nil {
			log.Printf("Error adding serving_unit column: %v", err)
		} else {
			fmt.Println("✅ Added serving_unit column successfully")
		}
	}
}

func insertDefaultIngredients() {
	defaultIngredients := []string{
		"Salt", "Pepper", "Sugar", "Flour", "Butter", "Eggs", "Milk", "Oil",
		"Onion", "Garlic", "Tomato", "Cheese", "Rice", "Pasta", "Chicken", "Beef",
		"Olive Oil", "Lemon", "Basil", "Oregano", "Thyme", "Rosemary", "Parsley",
		"Potatoes", "Carrots", "Bell Pepper", "Mushrooms", "Spinach", "Broccoli",
	}

	for _, name := range defaultIngredients {
		// Validate each ingredient name before inserting
		if validation := utils.ValidateIngredientName(name); validation.Valid {
			DB.Exec("INSERT OR IGNORE INTO ingredients (name) VALUES (?)", name)
		}
	}
}

func insertDefaultTags() {
	defaultTags := []struct {
		Name  string
		Color string
	}{
		{"Main Dish", "#ff6b6b"},
		{"Soup", "#4ecdc4"},
		{"Dessert", "#ff8e53"},
		{"Appetizer", "#a8e6cf"},
		{"Breakfast", "#ffd93d"},
		{"Lunch", "#74c0fc"},
		{"Dinner", "#ff8787"},
		{"Vegetarian", "#51cf66"},
		{"Vegan", "#40c057"},
		{"Gluten-Free", "#fab005"},
		{"Dairy-Free", "#fd7e14"},
		{"Quick & Easy", "#9775fa"},
		{"Comfort Food", "#f06292"},
		{"Healthy", "#69db7c"},
		{"Spicy", "#ff5722"},
	}

	for _, tag := range defaultTags {
		// Validate each tag before inserting
		if validation := utils.ValidateTagName(tag.Name); validation.Valid {
			DB.Exec("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)", tag.Name, tag.Color)
		}
	}
}

// initialAdminPassword returns the password for the seeded admin account. It
// comes from ADMIN_PASSWORD when set, otherwise it is random and printed once.
// The bool reports whether it was generated.
func initialAdminPassword() (string, bool, error) {
	if password := os.Getenv("ADMIN_PASSWORD"); password != "" {
		if validation := utils.ValidatePassword(password); !validation.Valid {
			return "", false, fmt.Errorf("ADMIN_PASSWORD is not acceptable: %s", validation.Message)
		}
		return password, false, nil
	}

	buf := make([]byte, 18)
	if _, err := rand.Read(buf); err != nil {
		return "", false, err
	}

	// base64url keeps it copy-pasteable, and the suffix guarantees the digit and
	// letter that ValidatePassword requires of every other account.
	return base64.RawURLEncoding.EncodeToString(buf) + "a1", true, nil
}

func adminEmail() string {
	if email := os.Getenv("ADMIN_EMAIL"); email != "" {
		if validation := utils.ValidateEmail(email); validation.Valid {
			return email
		}
		log.Printf("Ignoring ADMIN_EMAIL: not a valid address")
	}
	return "admin@recipebook.com"
}

func insertDefaultRecipes() {
	var userID int
	err := DB.QueryRow("SELECT id FROM users WHERE username = 'admin'").Scan(&userID)
	if err != nil {
		password, generated, err := initialAdminPassword()
		if err != nil {
			log.Printf("Could not prepare the admin password: %v", err)
			return
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Could not hash the admin password: %v", err)
			return
		}

		result, err := DB.Exec("INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
			"admin", adminEmail(), string(hashedPassword))
		if err != nil {
			log.Printf("Could not create admin user: %v", err)
			return
		}
		id, _ := result.LastInsertId()
		userID = int(id)

		if generated {
			// Printed once, on the run that creates the database. The old build
			// shipped a fixed admin123, which is a published password on every
			// deployment that never changed it.
			log.Printf("🔑 Created the 'admin' user with a generated password: %s", password)
			log.Println("🔑 Store it now - it is not shown again. Set ADMIN_PASSWORD to choose your own.")
		} else {
			log.Println("🔑 Created the 'admin' user with the password from ADMIN_PASSWORD")
		}
	}

	var recipeCount int
	DB.QueryRow("SELECT COUNT(*) FROM recipes").Scan(&recipeCount)
	if recipeCount > 0 {
		return
	}

	defaultRecipes := []struct {
		Title        string
		Description  string
		Instructions string
		PrepTime     int
		CookTime     int
		Servings     int
		ServingUnit  string
		Tags         []string // Tag names to assign
		Ingredients  []struct {
			Name     string
			Quantity float64
			Unit     string
		}
	}{
		{
			Title:       "Classic Margherita Pizza",
			Description: "A simple and delicious pizza with fresh mozzarella, tomatoes, and basil",
			Instructions: `1. Preheat your oven to 475°F (245°C).

2. Roll out the pizza dough on a floured surface to your desired thickness.

3. Transfer the dough to a pizza stone or baking sheet.

4. Spread the pizza sauce evenly over the dough, leaving a 1-inch border for the crust.

5. Distribute the mozzarella cheese evenly over the sauce.

6. Arrange the sliced tomatoes on top of the cheese.

7. Drizzle with olive oil and season with salt and pepper.

8. Bake for 12-15 minutes until the crust is golden brown and the cheese is bubbly.

9. Remove from oven and immediately top with fresh basil leaves.

10. Let cool for 2-3 minutes, then slice and serve hot.`,
			PrepTime:    20,
			CookTime:    15,
			Servings:    4,
			ServingUnit: "people",
			Tags:        []string{"Main Dish", "Vegetarian", "Dinner"},
			Ingredients: []struct {
				Name     string
				Quantity float64
				Unit     string
			}{
				{"Flour", 2, "cup"},
				{"Tomato", 2, "piece"},
				{"Cheese", 200, "g"},
				{"Basil", 10, "piece"},
				{"Olive Oil", 2, "tbsp"},
				{"Salt", 1, "tsp"},
				{"Pepper", 0.5, "tsp"},
			},
		},
		{
			Title:       "Creamy Chicken Alfredo Pasta",
			Description: "Rich and creamy pasta dish with tender chicken and parmesan cheese",
			Instructions: `1. Cook the pasta according to package directions until al dente. Drain and set aside.

2. Season chicken breasts with salt and pepper, then cut into bite-sized pieces.

3. Heat olive oil in a large skillet over medium-high heat.

4. Add chicken pieces and cook for 6-8 minutes until golden brown and cooked through.

5. Remove chicken and set aside.

6. In the same skillet, melt butter over medium heat.

7. Add minced garlic and cook for 1 minute until fragrant.

8. Pour in the heavy cream and bring to a gentle simmer.

9. Add grated parmesan cheese and whisk until smooth and melted.

10. Season with salt, pepper, and a pinch of nutmeg.

11. Return chicken to the skillet and add the cooked pasta.

12. Toss everything together until well coated with the sauce.

13. Garnish with fresh parsley and serve immediately.`,
			PrepTime:    15,
			CookTime:    20,
			Servings:    4,
			ServingUnit: "servings",
			Tags:        []string{"Main Dish", "Comfort Food", "Dinner"},
			Ingredients: []struct {
				Name     string
				Quantity float64
				Unit     string
			}{
				{"Pasta", 400, "g"},
				{"Chicken", 500, "g"},
				{"Cheese", 100, "g"},
				{"Butter", 50, "g"},
				{"Garlic", 3, "clove"},
				{"Milk", 300, "ml"},
				{"Parsley", 2, "tbsp"},
				{"Salt", 1, "tsp"},
				{"Pepper", 0.5, "tsp"},
				{"Olive Oil", 2, "tbsp"},
			},
		},
		{
			Title:       "Fluffy Buttermilk Pancakes",
			Description: "Light, fluffy pancakes perfect for weekend breakfast",
			Instructions: `1. In a large bowl, whisk together flour, sugar, baking powder, baking soda, and salt.

2. In another bowl, whisk together buttermilk, eggs, and melted butter.

3. Pour the wet ingredients into the dry ingredients and gently stir until just combined. Don't overmix - a few lumps are okay.

4. Let the batter rest for 5 minutes.

5. Heat a griddle or large skillet over medium heat and lightly grease with butter.

6. Pour 1/4 cup of batter for each pancake onto the griddle.

7. Cook until bubbles form on the surface and the edges look set, about 2-3 minutes.

8. Flip and cook for another 1-2 minutes until golden brown.

9. Serve hot with butter and maple syrup.

10. Keep cooked pancakes warm in a 200°F oven if making a large batch.`,
			PrepTime:    10,
			CookTime:    15,
			Servings:    8,
			ServingUnit: "pancakes",
			Tags:        []string{"Breakfast", "Quick & Easy", "Vegetarian"},
			Ingredients: []struct {
				Name     string
				Quantity float64
				Unit     string
			}{
				{"Flour", 2, "cup"},
				{"Sugar", 2, "tbsp"},
				{"Eggs", 2, "piece"},
				{"Milk", 1.5, "cup"},
				{"Butter", 4, "tbsp"},
				{"Salt", 1, "tsp"},
			},
		},
	}

	fmt.Println("🍳 Adding default recipes...")

	for _, recipe := range defaultRecipes {
		result, err := DB.Exec(`
			INSERT INTO recipes (title, description, instructions, prep_time, cook_time, servings, serving_unit, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, recipe.Title, recipe.Description, recipe.Instructions, recipe.PrepTime, recipe.CookTime, recipe.Servings, recipe.ServingUnit, userID)

		if err != nil {
			log.Printf("Error inserting recipe %s: %v", recipe.Title, err)
			continue
		}

		recipeID, _ := result.LastInsertId()

		// Add ingredients
		for _, ingredient := range recipe.Ingredients {
			var ingredientID int
			err := DB.QueryRow("SELECT id FROM ingredients WHERE name = ?", ingredient.Name).Scan(&ingredientID)
			if err != nil {
				log.Printf("Ingredient %s not found for recipe %s", ingredient.Name, recipe.Title)
				continue
			}

			_, err = DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
				recipeID, ingredientID, ingredient.Quantity, ingredient.Unit)
			if err != nil {
				log.Printf("Error inserting ingredient %s for recipe %s: %v", ingredient.Name, recipe.Title, err)
			}
		}

		// Add tags
		for _, tagName := range recipe.Tags {
			var tagID int
			err := DB.QueryRow("SELECT id FROM tags WHERE name = ?", tagName).Scan(&tagID)
			if err != nil {
				log.Printf("Tag %s not found for recipe %s", tagName, recipe.Title)
				continue
			}

			_, err = DB.Exec("INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)", recipeID, tagID)
			if err != nil {
				log.Printf("Error inserting tag %s for recipe %s: %v", tagName, recipe.Title, err)
			}
		}

		fmt.Printf("✅ Added recipe: %s\n", recipe.Title)
	}

	fmt.Println("🎉 Default recipes loaded successfully!")
}

// Secure user creation with prepared statements
func CreateUserSecure(username, email, hashedPassword string) error {
	// Validate inputs
	if validation := utils.ValidateUsername(username); !validation.Valid {
		return fmt.Errorf("invalid username: %s", validation.Message)
	}

	if validation := utils.ValidateEmail(email); !validation.Valid {
		return fmt.Errorf("invalid email: %s", validation.Message)
	}

	_, err := stmtCreateUser.Exec(username, email, hashedPassword)
	return err
}

// Secure user lookup with prepared statements
func GetUserByUsernameSecure(username string) (*models.User, string, error) {
	// Validate username
	if validation := utils.ValidateUsername(username); !validation.Valid {
		return nil, "", fmt.Errorf("invalid username format")
	}

	var user models.User
	var hashedPassword string

	err := stmtGetUser.QueryRow(username).Scan(&user.ID, &user.Username, &user.Email, &hashedPassword)
	if err != nil {
		return nil, "", err
	}

	return &user, hashedPassword, nil
}

// ErrRecipeNotFound is returned when a recipe does not exist or is not owned by
// the acting user - the two cases are deliberately indistinguishable to callers.
var ErrRecipeNotFound = errors.New("recipe not found or access denied")

// ValidationError marks a failure caused by the caller's input rather than by the
// database. Handlers use it to decide what is safe to echo back: a validation
// message is meant for the user, a driver error is not.
type ValidationError struct {
	msg string
}

func (e *ValidationError) Error() string {
	return e.msg
}

func newValidationError(format string, args ...interface{}) error {
	return &ValidationError{msg: fmt.Sprintf(format, args...)}
}

// IsValidationError reports whether err came from validating caller input.
func IsValidationError(err error) bool {
	var validationErr *ValidationError
	return errors.As(err, &validationErr)
}

// RecipeInput carries the scalar fields of a recipe write.
type RecipeInput struct {
	Title        string
	Description  string
	Instructions string
	PrepTime     int
	CookTime     int
	Servings     int
	ServingUnit  string
}

// RecipeIngredientInput is one ingredient row of a recipe write.
type RecipeIngredientInput struct {
	IngredientID int
	Quantity     float64
	Unit         string
}

func validateRecipeInput(in *RecipeInput) error {
	if in.ServingUnit == "" {
		in.ServingUnit = "people"
	}

	checks := []utils.ValidationResult{
		utils.ValidateRecipeTitle(in.Title),
		utils.ValidateRecipeDescription(in.Description),
		utils.ValidateRecipeInstructions(in.Instructions),
		utils.ValidateServingUnit(in.ServingUnit),
		utils.ValidateNumericInput(in.PrepTime, 0, 1440, "Prep time"),
		utils.ValidateNumericInput(in.CookTime, 0, 1440, "Cook time"),
		utils.ValidateNumericInput(in.Servings, 1, 100, "Servings"),
	}

	for _, check := range checks {
		if !check.Valid {
			return newValidationError("%s", check.Message)
		}
	}

	return nil
}

// CreateRecipeTx inserts a recipe together with its tags and ingredients inside a
// single transaction. The previous version inserted the relations with fire-and-
// forget Exec calls, so a rejected ingredient (unknown id, duplicate, bad unit)
// was dropped silently and the caller still saw a success response.
func CreateRecipeTx(in RecipeInput, userID int, tagIDs []int, ingredients []RecipeIngredientInput) (int64, error) {
	if err := validateRecipeInput(&in); err != nil {
		return 0, err
	}

	tx, err := DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	result, err := tx.Stmt(stmtCreateRecipe).Exec(in.Title, in.Description, in.Instructions,
		in.PrepTime, in.CookTime, in.Servings, in.ServingUnit, userID)
	if err != nil {
		return 0, err
	}

	recipeID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	if err := replaceRecipeRelations(tx, recipeID, tagIDs, ingredients); err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return recipeID, nil
}

// UpdateRecipeTx rewrites a recipe and its relations atomically. Ownership is
// enforced in the UPDATE itself, so a caller that is not the owner changes nothing.
func UpdateRecipeTx(recipeID, userID int, in RecipeInput, tagIDs []int, ingredients []RecipeIngredientInput) error {
	if !utils.IsValidID(recipeID) || !utils.IsValidID(userID) {
		return ErrRecipeNotFound
	}

	if err := validateRecipeInput(&in); err != nil {
		return err
	}

	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	result, err := tx.Stmt(stmtUpdateRecipe).Exec(in.Title, in.Description, in.Instructions,
		in.PrepTime, in.CookTime, in.Servings, in.ServingUnit, recipeID, userID)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrRecipeNotFound
	}

	if err := replaceRecipeRelations(tx, int64(recipeID), tagIDs, ingredients); err != nil {
		return err
	}

	return tx.Commit()
}

// replaceRecipeRelations rewrites the tag and ingredient rows of a recipe. Every
// failure is reported rather than skipped, so the caller can reject the whole
// write instead of persisting a partially attached recipe.
func replaceRecipeRelations(tx *sql.Tx, recipeID int64, tagIDs []int, ingredients []RecipeIngredientInput) error {
	if _, err := tx.Exec("DELETE FROM recipe_tags WHERE recipe_id = ?", recipeID); err != nil {
		return err
	}

	if _, err := tx.Exec("DELETE FROM recipe_ingredients WHERE recipe_id = ?", recipeID); err != nil {
		return err
	}

	seenTags := make(map[int]bool)
	for _, tagID := range tagIDs {
		if !utils.IsValidID(tagID) {
			return newValidationError("invalid tag id: %d", tagID)
		}
		if seenTags[tagID] {
			continue
		}
		seenTags[tagID] = true

		if _, err := tx.Exec("INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)", recipeID, tagID); err != nil {
			return newValidationError("tag %d could not be attached (does it exist?)", tagID)
		}
	}

	// One ingredient may appear in several units (butter 100 g and 2 tbsp), but
	// the exact same ingredient-and-unit pair twice is a mistake worth reporting
	// rather than silently collapsing into one row.
	type ingredientKey struct {
		id   int
		unit string
	}

	seenIngredients := make(map[ingredientKey]bool)
	for _, ingredient := range ingredients {
		if !utils.IsValidID(ingredient.IngredientID) {
			return newValidationError("invalid ingredient id: %d", ingredient.IngredientID)
		}

		key := ingredientKey{id: ingredient.IngredientID, unit: strings.ToLower(strings.TrimSpace(ingredient.Unit))}
		if seenIngredients[key] {
			return newValidationError("ingredient %d is listed twice with the same unit", ingredient.IngredientID)
		}
		seenIngredients[key] = true

		if validation := utils.ValidateQuantity(ingredient.Quantity); !validation.Valid {
			return newValidationError("%s", validation.Message)
		}
		if validation := utils.ValidateUnit(ingredient.Unit); !validation.Valid {
			return newValidationError("%s", validation.Message)
		}

		if _, err := tx.Exec(
			"INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)",
			recipeID, ingredient.IngredientID, ingredient.Quantity, ingredient.Unit,
		); err != nil {
			return newValidationError("ingredient %d could not be attached (does it exist?)", ingredient.IngredientID)
		}
	}

	return nil
}

// placeholders builds the "?, ?, ?" list for an IN clause of n values. The values
// themselves are always passed as parameters; only the count is interpolated.
func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

func idArgs(ids []int) []interface{} {
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	return args
}

// attachRelations loads the ingredients, images and tags for a whole page of
// recipes in three queries instead of three per recipe. Listing 50 recipes used
// to cost 151 round trips; it now costs 4.
func attachRelations(recipes []models.Recipe) []models.Recipe {
	if len(recipes) == 0 {
		return recipes
	}

	ids := make([]int, len(recipes))
	for i := range recipes {
		ids[i] = recipes[i].ID
		recipes[i].Ingredients = []models.RecipeIngredient{}
		recipes[i].Images = []models.RecipeImage{}
		recipes[i].Tags = []models.Tag{}
	}

	in := placeholders(len(ids))
	args := idArgs(ids)

	index := make(map[int]*models.Recipe, len(recipes))
	for i := range recipes {
		index[recipes[i].ID] = &recipes[i]
	}

	if rows, err := DB.Query(`
		SELECT ri.recipe_id, ri.ingredient_id, i.name, ri.unit, ri.quantity
		FROM recipe_ingredients ri
		JOIN ingredients i ON ri.ingredient_id = i.id
		WHERE ri.recipe_id IN (`+in+`)
		ORDER BY i.name
	`, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var recipeID int
			var ingredient models.RecipeIngredient
			if err := rows.Scan(&recipeID, &ingredient.IngredientID, &ingredient.Name, &ingredient.Unit, &ingredient.Quantity); err != nil {
				continue
			}
			if recipe, ok := index[recipeID]; ok {
				recipe.Ingredients = append(recipe.Ingredients, ingredient)
			}
		}
	} else {
		log.Printf("Error loading recipe ingredients: %v", err)
	}

	if rows, err := DB.Query(`
		SELECT id, recipe_id, filename, caption, display_order
		FROM recipe_images
		WHERE recipe_id IN (`+in+`)
		ORDER BY display_order ASC, id ASC
	`, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var image models.RecipeImage
			if err := rows.Scan(&image.ID, &image.RecipeID, &image.Filename, &image.Caption, &image.Order); err != nil {
				continue
			}
			if recipe, ok := index[image.RecipeID]; ok {
				recipe.Images = append(recipe.Images, image)
			}
		}
	} else {
		log.Printf("Error loading recipe images: %v", err)
	}

	if rows, err := DB.Query(`
		SELECT rt.recipe_id, t.id, t.name, t.color
		FROM recipe_tags rt
		JOIN tags t ON rt.tag_id = t.id
		WHERE rt.recipe_id IN (`+in+`)
		ORDER BY t.name
	`, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var recipeID int
			var tag models.Tag
			if err := rows.Scan(&recipeID, &tag.ID, &tag.Name, &tag.Color); err != nil {
				continue
			}
			if recipe, ok := index[recipeID]; ok {
				recipe.Tags = append(recipe.Tags, tag)
			}
		}
	} else {
		log.Printf("Error loading recipe tags: %v", err)
	}

	return recipes
}

// Database query functions
func GetAllRecipes() ([]models.Recipe, error) {
	rows, err := DB.Query(`
		SELECT r.id, r.title, r.description, r.instructions, r.prep_time, r.cook_time, 
		       r.servings, COALESCE(r.serving_unit, 'people'), r.created_by, r.created_at, u.username
		FROM recipes r
		JOIN users u ON r.created_by = u.id
		ORDER BY r.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipes := []models.Recipe{}
	for rows.Next() {
		var recipe models.Recipe
		err := rows.Scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions,
			&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.ServingUnit, &recipe.CreatedBy,
			&recipe.CreatedAt, &recipe.AuthorName)
		if err != nil {
			continue
		}

		recipes = append(recipes, recipe)
	}

	return attachRelations(recipes), nil
}

// Secure recipe search
func SearchRecipes(query string) ([]models.Recipe, error) {
	// Validate search query
	if validation := utils.ValidateSearchQuery(query); !validation.Valid {
		return nil, fmt.Errorf("invalid search query: %s", validation.Message)
	}

	searchPattern := "%" + query + "%"
	rows, err := stmtSearchRecipes.Query(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipes := []models.Recipe{}
	seenRecipes := make(map[int]bool)

	for rows.Next() {
		var recipe models.Recipe
		err := rows.Scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions,
			&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.ServingUnit, &recipe.CreatedBy,
			&recipe.CreatedAt, &recipe.AuthorName)
		if err != nil {
			continue
		}

		if seenRecipes[recipe.ID] {
			continue
		}

		recipes = append(recipes, recipe)
		seenRecipes[recipe.ID] = true
	}

	return attachRelations(recipes), nil
}

// Secure ingredient creation
// CreateIngredientSecure returns the new row so the handler can answer 201 with
// the created resource instead of echoing back the name it was given.
func CreateIngredientSecure(name string) (*models.Ingredient, error) {
	if validation := utils.ValidateIngredientName(name); !validation.Valid {
		return nil, fmt.Errorf("invalid ingredient name: %s", validation.Message)
	}

	result, err := stmtCreateIngredient.Exec(name)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &models.Ingredient{ID: int(id), Name: name}, nil
}

// Secure tag creation
// CreateTagSecure returns the new row, including the colour it settled on when
// the caller sent none or sent something unusable.
func CreateTagSecure(name, color string) (*models.Tag, error) {
	if validation := utils.ValidateTagName(name); !validation.Valid {
		return nil, fmt.Errorf("invalid tag name: %s", validation.Message)
	}

	// Basic color validation
	if color == "" || len(color) != 7 || !strings.HasPrefix(color, "#") {
		color = "#ff6b6b"
	}

	result, err := stmtCreateTag.Exec(name, color)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &models.Tag{ID: int(id), Name: name, Color: color}, nil
}

// Secure recipe deletion (with ownership check)
func DeleteRecipeSecure(recipeID, userID int) error {
	if !utils.IsValidID(recipeID) || !utils.IsValidID(userID) {
		return fmt.Errorf("invalid recipe or user ID")
	}

	result, err := stmtDeleteRecipe.Exec(recipeID, userID)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("recipe not found or access denied")
	}

	return nil
}

// Secure ingredient deletion (with usage check)
func DeleteIngredientSecure(ingredientID int) error {
	if !utils.IsValidID(ingredientID) {
		return fmt.Errorf("invalid ingredient ID")
	}

	// Check if ingredient is used in any recipes
	var recipeCount int
	err := DB.QueryRow("SELECT COUNT(DISTINCT recipe_id) FROM recipe_ingredients WHERE ingredient_id = ?", ingredientID).Scan(&recipeCount)
	if err != nil {
		return err
	}

	if recipeCount > 0 {
		return fmt.Errorf("ingredient is used in %d recipe(s) and cannot be deleted", recipeCount)
	}

	_, err = stmtDeleteIngredient.Exec(ingredientID)
	return err
}

// IngredientUsage reports how many distinct recipes use this ingredient, plus a
// few of their titles for the error message. The handler used to recount this
// itself with a plain COUNT(*) over recipe_ingredients, which counted a recipe
// once per row - a recipe listing butter in grams and in tablespoons was
// reported as two recipes, and its title appeared twice in the list.
func IngredientUsage(ingredientID int) (int, []string, error) {
	if !utils.IsValidID(ingredientID) {
		return 0, nil, fmt.Errorf("invalid ingredient ID")
	}

	var count int
	err := DB.QueryRow("SELECT COUNT(DISTINCT recipe_id) FROM recipe_ingredients WHERE ingredient_id = ?", ingredientID).Scan(&count)
	if err != nil {
		return 0, nil, err
	}

	if count == 0 {
		return 0, nil, nil
	}

	rows, err := DB.Query(`
		SELECT DISTINCT r.title
		FROM recipes r
		JOIN recipe_ingredients ri ON r.id = ri.recipe_id
		WHERE ri.ingredient_id = ?
		ORDER BY r.title
		LIMIT 3
	`, ingredientID)
	if err != nil {
		return count, nil, nil
	}
	defer rows.Close()

	titles := []string{}
	for rows.Next() {
		var title string
		if err := rows.Scan(&title); err == nil {
			titles = append(titles, title)
		}
	}
	return count, titles, nil
}

// TagUsageByOthers reports how many recipes belonging to somebody other than
// userID carry this tag, plus a few of their titles for the error message.
func TagUsageByOthers(tagID, userID int) (int, []string, error) {
	if !utils.IsValidID(tagID) || !utils.IsValidID(userID) {
		return 0, nil, fmt.Errorf("invalid tag or user ID")
	}

	var count int
	err := DB.QueryRow(`
		SELECT COUNT(*)
		FROM recipe_tags rt
		JOIN recipes r ON rt.recipe_id = r.id
		WHERE rt.tag_id = ? AND r.created_by != ?
	`, tagID, userID).Scan(&count)
	if err != nil {
		return 0, nil, err
	}

	if count == 0 {
		return 0, nil, nil
	}

	rows, err := DB.Query(`
		SELECT r.title
		FROM recipe_tags rt
		JOIN recipes r ON rt.recipe_id = r.id
		WHERE rt.tag_id = ? AND r.created_by != ?
		ORDER BY r.title
		LIMIT 3
	`, tagID, userID)
	if err != nil {
		return count, nil, nil
	}
	defer rows.Close()

	titles := []string{}
	for rows.Next() {
		var title string
		if err := rows.Scan(&title); err == nil {
			titles = append(titles, title)
		}
	}

	return count, titles, nil
}

// DeleteTagSecure removes a tag. Deleting a tag cascades to recipe_tags and so
// detaches it from every recipe that used it, including other users' recipes.
func DeleteTagSecure(tagID int) error {
	if !utils.IsValidID(tagID) {
		return fmt.Errorf("invalid tag ID")
	}

	result, err := stmtDeleteTag.Exec(tagID)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	return nil
}

// Get recipe by ID with ownership validation
func GetRecipeByIDSecure(id int) (*models.Recipe, error) {
	if !utils.IsValidID(id) {
		return nil, fmt.Errorf("invalid recipe ID")
	}

	var recipe models.Recipe
	err := stmtGetRecipeByID.QueryRow(id).Scan(&recipe.ID, &recipe.Title, &recipe.Description,
		&recipe.Instructions, &recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.ServingUnit,
		&recipe.CreatedBy, &recipe.CreatedAt, &recipe.AuthorName)

	if err != nil {
		return nil, err
	}

	recipe.Ingredients = GetRecipeIngredients(recipe.ID)
	recipe.Images = GetRecipeImages(recipe.ID)
	recipe.Tags = GetRecipeTags(recipe.ID)
	return &recipe, nil
}

// Check if user owns recipe
func UserOwnsRecipe(recipeID, userID int) (bool, error) {
	if !utils.IsValidID(recipeID) || !utils.IsValidID(userID) {
		return false, fmt.Errorf("invalid recipe or user ID")
	}

	var createdBy int
	err := DB.QueryRow("SELECT created_by FROM recipes WHERE id = ?", recipeID).Scan(&createdBy)
	if err != nil {
		return false, err
	}

	return createdBy == userID, nil
}

func GetRecipesByTag(tagID int) ([]models.Recipe, error) {
	rows, err := DB.Query(`
		SELECT DISTINCT r.id, r.title, r.description, r.instructions, r.prep_time, r.cook_time, 
		       r.servings, COALESCE(r.serving_unit, 'people'), r.created_by, r.created_at, u.username
		FROM recipes r
		JOIN users u ON r.created_by = u.id
		JOIN recipe_tags rt ON r.id = rt.recipe_id
		WHERE rt.tag_id = ?
		ORDER BY r.created_at DESC
	`, tagID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipes := []models.Recipe{}
	for rows.Next() {
		var recipe models.Recipe
		err := rows.Scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions,
			&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.ServingUnit, &recipe.CreatedBy,
			&recipe.CreatedAt, &recipe.AuthorName)
		if err != nil {
			continue
		}

		recipes = append(recipes, recipe)
	}

	return attachRelations(recipes), nil
}

func GetAllIngredients() ([]models.Ingredient, error) {
	rows, err := DB.Query("SELECT id, name FROM ingredients ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ingredients := []models.Ingredient{}
	for rows.Next() {
		var ingredient models.Ingredient
		err := rows.Scan(&ingredient.ID, &ingredient.Name)
		if err != nil {
			continue
		}
		ingredients = append(ingredients, ingredient)
	}

	return ingredients, nil
}

func GetAllTags() ([]models.Tag, error) {
	rows, err := DB.Query("SELECT id, name, color FROM tags ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tags := []models.Tag{}
	for rows.Next() {
		var tag models.Tag
		err := rows.Scan(&tag.ID, &tag.Name, &tag.Color)
		if err != nil {
			continue
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

func GetRecipeIngredients(recipeID int) []models.RecipeIngredient {
	rows, err := DB.Query(`
		SELECT ri.ingredient_id, i.name, ri.unit, ri.quantity
		FROM recipe_ingredients ri
		JOIN ingredients i ON ri.ingredient_id = i.id
		WHERE ri.recipe_id = ?
		ORDER BY i.name
	`, recipeID)

	if err != nil {
		return []models.RecipeIngredient{}
	}
	defer rows.Close()

	ingredients := []models.RecipeIngredient{}
	for rows.Next() {
		var ing models.RecipeIngredient
		err := rows.Scan(&ing.IngredientID, &ing.Name, &ing.Unit, &ing.Quantity)
		if err != nil {
			continue
		}
		ingredients = append(ingredients, ing)
	}

	return ingredients
}

func GetRecipeTags(recipeID int) []models.Tag {
	rows, err := DB.Query(`
		SELECT t.id, t.name, t.color
		FROM recipe_tags rt
		JOIN tags t ON rt.tag_id = t.id
		WHERE rt.recipe_id = ?
		ORDER BY t.name
	`, recipeID)

	if err != nil {
		return []models.Tag{}
	}
	defer rows.Close()

	tags := []models.Tag{}
	for rows.Next() {
		var tag models.Tag
		err := rows.Scan(&tag.ID, &tag.Name, &tag.Color)
		if err != nil {
			continue
		}
		tags = append(tags, tag)
	}

	return tags
}

func GetRecipeImages(recipeID int) []models.RecipeImage {
	rows, err := DB.Query(`
		SELECT id, recipe_id, filename, caption, display_order
		FROM recipe_images
		WHERE recipe_id = ?
		ORDER BY display_order ASC, id ASC
	`, recipeID)

	if err != nil {
		return []models.RecipeImage{}
	}
	defer rows.Close()

	images := []models.RecipeImage{}
	for rows.Next() {
		var img models.RecipeImage
		err := rows.Scan(&img.ID, &img.RecipeID, &img.Filename, &img.Caption, &img.Order)
		if err != nil {
			continue
		}
		images = append(images, img)
	}

	return images
}

func GetTagByID(id int) (*models.Tag, error) {
	var tag models.Tag
	err := DB.QueryRow("SELECT id, name, color FROM tags WHERE id = ?", id).
		Scan(&tag.ID, &tag.Name, &tag.Color)
	if err != nil {
		return nil, err
	}
	return &tag, nil
}
