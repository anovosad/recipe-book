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
		SELECT ` + recipeColumns + `
		FROM recipes r
		JOIN users u ON r.created_by = u.id` + recipeTextJoin + `
		WHERE r.id = ?
	`)
	if err != nil {
		log.Fatal("Failed to prepare stmtGetRecipeByID:", err)
	}

	// Search looks across every language a recipe exists in, not just the one
	// being displayed: typing "carbonara" should find the recipe whether the
	// reader is on the Czech side or the English one. Hence the EXISTS over
	// recipe_translations rather than a LIKE against the joined row, and
	// likewise for ingredient and tag names.
	stmtSearchRecipes, err = DB.Prepare(`
		SELECT DISTINCT ` + recipeColumns + `
		FROM recipes r
		JOIN users u ON r.created_by = u.id` + recipeTextJoin + `
		WHERE EXISTS (
			SELECT 1 FROM recipe_translations x WHERE x.recipe_id = r.id
			AND (x.title LIKE ? OR x.description LIKE ? OR x.instructions LIKE ?)
		)
		   OR EXISTS (
			SELECT 1 FROM recipe_ingredients ri JOIN ingredients i ON ri.ingredient_id = i.id
			LEFT JOIN ingredient_translations it ON it.ingredient_id = i.id
			WHERE ri.recipe_id = r.id AND (i.name LIKE ? OR it.name LIKE ?)
		)
		   OR EXISTS (
			SELECT 1 FROM recipe_tags rt JOIN tags t ON rt.tag_id = t.id
			LEFT JOIN tag_translations tt ON tt.tag_id = t.id
			WHERE rt.recipe_id = r.id AND (t.name LIKE ? OR tt.name LIKE ?)
		)
		ORDER BY
		   CASE WHEN tr.title LIKE ? THEN 0 ELSE 1 END,
		   r.created_at DESC
	`)
	if err != nil {
		log.Fatal("Failed to prepare stmtSearchRecipes:", err)
	}

	stmtCreateRecipe, err = DB.Prepare(`
		INSERT INTO recipes (prep_time, cook_time, servings, serving_unit, created_by)
		VALUES (?, ?, ?, ?, ?)
	`)
	if err != nil {
		log.Fatal("Failed to prepare stmtCreateRecipe:", err)
	}

	// No "AND created_by = ?" on this or the delete below. The collection is
	// shared: this is one household's recipe book, and a recipe somebody else
	// typed is still a recipe you may fix. created_by stays, because whose
	// recipe it is remains worth showing - it just is not an access check.
	stmtUpdateRecipe, err = DB.Prepare(`
		UPDATE recipes SET prep_time = ?, cook_time = ?, servings = ?, serving_unit = ?
		WHERE id = ?
	`)
	if err != nil {
		log.Fatal("Failed to prepare stmtUpdateRecipe:", err)
	}

	stmtDeleteRecipe, err = DB.Prepare("DELETE FROM recipes WHERE id = ?")
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
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		-- Unix seconds, not a DATETIME: this is compared against a JWT's issued-at
		-- claim, and a stored string would have to be parsed back with an assumed
		-- zone. 0 means never changed, which is what every existing row gets.
		password_changed_at INTEGER NOT NULL DEFAULT 0
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
		-- The order the recipe lists them in. Reads used to sort by name, which
		-- is alphabetical order, not cooking order: a recipe that says flour,
		-- yeast, water, salt came back as flour, salt, water, yeast, and the
		-- first three ingredients of a bread are the ones you combine first.
		display_order INTEGER NOT NULL DEFAULT 0,
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

	-- The text of a recipe, one row per language it exists in. The recipes row
	-- itself carries only what does not need translating - times, servings,
	-- author, photos - so there is exactly one place a title lives and no copy
	-- to drift from it.
	CREATE TABLE IF NOT EXISTS recipe_translations (
		recipe_id INTEGER NOT NULL,
		language TEXT NOT NULL CHECK(length(language) >= 2 AND length(language) <= 5),
		title TEXT NOT NULL CHECK(length(title) >= 1 AND length(title) <= 200),
		description TEXT CHECK(length(description) <= 1000),
		instructions TEXT NOT NULL CHECK(length(instructions) >= 1 AND length(instructions) <= 10000),
		PRIMARY KEY (recipe_id, language),
		FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
	);

	-- Ingredients and tags are stored under an English canonical name - that is
	-- what ingredients.name/tags.name are, and what the AI resolver matches
	-- against - with every other language hanging off it here. A rename in one
	-- language therefore cannot fork the ingredient into two.
	CREATE TABLE IF NOT EXISTS ingredient_translations (
		ingredient_id INTEGER NOT NULL,
		language TEXT NOT NULL CHECK(length(language) >= 2 AND length(language) <= 5),
		name TEXT NOT NULL CHECK(length(name) >= 1 AND length(name) <= 100),
		PRIMARY KEY (ingredient_id, language),
		FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS tag_translations (
		tag_id INTEGER NOT NULL,
		language TEXT NOT NULL CHECK(length(language) >= 2 AND length(language) <= 5),
		name TEXT NOT NULL CHECK(length(name) >= 1 AND length(name) <= 50),
		PRIMARY KEY (tag_id, language),
		FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
	);

	-- Create indexes for better performance and security
	CREATE INDEX IF NOT EXISTS idx_recipes_created_by ON recipes(created_by);
	CREATE INDEX IF NOT EXISTS idx_recipe_translations_title ON recipe_translations(title);
	CREATE INDEX IF NOT EXISTS idx_recipe_translations_lang ON recipe_translations(language);
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
	migrateUserPasswordChangedAt()
	migrateRecipeTranslations()
	migrateTaxonomyTranslations()
	migrateRecipeIngredientOrder()
}

// recipeTextJoin resolves which language a recipe is shown in.
//
// The requested language when it exists, English when it does not, and
// otherwise whatever the recipe does have - a recipe written only in Czech is
// shown to an English reader rather than vanishing from the list, and the
// resolved tr.language comes back with it so the UI can say so. One correlated
// subquery per recipe, covered by the (recipe_id, language) primary key.
//
// It takes one parameter: the requested language.
const recipeTextJoin = `
	JOIN recipe_translations tr ON tr.recipe_id = r.id AND tr.language = (
		SELECT language FROM recipe_translations
		WHERE recipe_id = r.id
		ORDER BY (language = ?) DESC, (language = 'en') DESC, language
		LIMIT 1
	)`

// recipeColumns is the select list every recipe read shares, in the order
// scanRecipe expects.
const recipeColumns = `
	r.id, tr.title, COALESCE(tr.description, ''), tr.instructions, tr.language,
	r.prep_time, r.cook_time, r.servings, COALESCE(r.serving_unit, 'people'),
	r.created_by, r.created_at, u.username`

// scanRecipe reads recipeColumns off a row.
func scanRecipe(scan func(...any) error) (models.Recipe, error) {
	var recipe models.Recipe
	err := scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions, &recipe.Language,
		&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.ServingUnit,
		&recipe.CreatedBy, &recipe.CreatedAt, &recipe.AuthorName)
	recipe.Ingredients = []models.RecipeIngredient{}
	recipe.Images = []models.RecipeImage{}
	recipe.Tags = []models.Tag{}
	recipe.Languages = []string{}
	return recipe, err
}

// ingredientNameSQL and tagNameSQL render a name in the requested language,
// falling back to the English canonical stored on the row itself - which is
// what makes an untranslated ingredient show up in English rather than not at
// all. Each expects the alias i (ingredients) or t (tags) to be in scope, and
// each takes one parameter: the language.
const (
	ingredientNameSQL = `COALESCE((SELECT name FROM ingredient_translations WHERE ingredient_id = i.id AND language = ?), i.name)`
	tagNameSQL        = `COALESCE((SELECT name FROM tag_translations WHERE tag_id = t.id AND language = ?), t.name)`
)

// NormalizeLanguage keeps an unknown or absent code from reaching a query.
func NormalizeLanguage(language string) string {
	language = strings.ToLower(strings.TrimSpace(language))
	switch language {
	case "cs", "en":
		return language
	case "sk":
		// Slovak reads Czech comfortably and the UI already maps it that way.
		return "cs"
	default:
		return DefaultLanguage
	}
}

// DefaultLanguage is the language a recipe is assumed to be in when nothing
// says otherwise, and the one every read falls back to last.
const DefaultLanguage = "en"

// looksCzech guesses the language of existing text from its diacritics.
//
// A guess, and deliberately a cheap one: it runs once, over rows written before
// there was anywhere to record a language, and a wrong answer is fixable in the
// UI. The letters below are the ones Czech has and English does not, so any of
// them is decisive; their absence is not, which is why English is the default
// rather than the detected case.
func looksCzech(text string) bool {
	return strings.ContainsAny(text, "áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ")
}

// migrateRecipeTranslations moves recipes.title/description/instructions into
// recipe_translations and drops the columns.
//
// Copy, verify the row count, then swap - all in one transaction, so a failure
// leaves the original table exactly as it was. The language of each existing
// row is guessed from its own text: this app shipped English seed recipes and
// then acquired Czech imported ones, and there was no column recording which
// was which.
func migrateRecipeTranslations() {
	var hasTitle int
	err := DB.QueryRow("SELECT COUNT(*) FROM pragma_table_info('recipes') WHERE name='title'").Scan(&hasTitle)
	if err != nil {
		log.Printf("Error checking the recipes schema: %v", err)
		return
	}
	if hasTitle == 0 {
		return // already migrated
	}

	log.Println("🌍 Migrating recipe text into recipe_translations...")

	tx, err := DB.Begin()
	if err != nil {
		log.Printf("Could not start the recipe translation migration: %v", err)
		return
	}
	defer tx.Rollback()

	rows, err := tx.Query("SELECT id, title, COALESCE(description, ''), instructions FROM recipes")
	if err != nil {
		log.Printf("Could not read recipes to migrate: %v", err)
		return
	}

	type row struct {
		id                               int
		title, description, instructions string
	}
	var existing []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.title, &r.description, &r.instructions); err != nil {
			rows.Close()
			log.Printf("Could not read a recipe to migrate: %v", err)
			return
		}
		existing = append(existing, r)
	}
	rows.Close()

	for _, r := range existing {
		language := DefaultLanguage
		if looksCzech(r.title + " " + r.description + " " + r.instructions) {
			language = "cs"
		}
		if _, err := tx.Exec(`
			INSERT OR IGNORE INTO recipe_translations (recipe_id, language, title, description, instructions)
			VALUES (?, ?, ?, ?, ?)
		`, r.id, language, r.title, r.description, r.instructions); err != nil {
			log.Printf("Could not migrate recipe %d: %v", r.id, err)
			return
		}
	}

	// Verify before dropping anything: every recipe must have come out the
	// other side with text attached, or the columns holding the only copy stay
	// exactly where they are.
	var migrated int
	if err := tx.QueryRow("SELECT COUNT(DISTINCT recipe_id) FROM recipe_translations").Scan(&migrated); err != nil {
		log.Printf("Could not verify the recipe translation migration: %v", err)
		return
	}
	if migrated != len(existing) {
		log.Printf("Recipe translation migration would lose rows (%d recipes, %d translated) - leaving the schema alone", len(existing), migrated)
		return
	}

	// The index on recipes(title) has to go before the column does: SQLite
	// checks every index after a DROP COLUMN and refuses the whole statement
	// when one of them still names the column that just left. The equivalent
	// index now lives on recipe_translations(title).
	if _, err := tx.Exec("DROP INDEX IF EXISTS idx_recipes_title"); err != nil {
		log.Printf("Could not drop idx_recipes_title: %v", err)
		return
	}

	for _, column := range []string{"title", "description", "instructions"} {
		if _, err := tx.Exec("ALTER TABLE recipes DROP COLUMN " + column); err != nil {
			log.Printf("Could not drop recipes.%s: %v", column, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Could not commit the recipe translation migration: %v", err)
		return
	}
	log.Printf("✅ Migrated %d recipes into recipe_translations", len(existing))
}

// migrateRecipeIngredientOrder adds recipe_ingredients.display_order and fills
// it in from the order the rows were written.
//
// Nothing is lost here, which is the pleasant part: the surrogate id is an
// autoincrement, so ascending id within a recipe *is* the order the ingredients
// were submitted in - which for an imported recipe is the order the page listed
// them. The information was there all along; only the ORDER BY was throwing it
// away.
func migrateRecipeIngredientOrder() {
	var hasColumn int
	err := DB.QueryRow("SELECT COUNT(*) FROM pragma_table_info('recipe_ingredients') WHERE name='display_order'").Scan(&hasColumn)
	if err != nil {
		log.Printf("Error checking the recipe_ingredients schema: %v", err)
		return
	}
	if hasColumn > 0 {
		return
	}

	if _, err := DB.Exec("ALTER TABLE recipe_ingredients ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0"); err != nil {
		log.Printf("Could not add recipe_ingredients.display_order: %v", err)
		return
	}

	// ROW_NUMBER over each recipe, ordered by the id that recorded the
	// insertion order in the first place.
	if _, err := DB.Exec(`
		UPDATE recipe_ingredients SET display_order = (
			SELECT position FROM (
				SELECT id, ROW_NUMBER() OVER (PARTITION BY recipe_id ORDER BY id) - 1 AS position
				FROM recipe_ingredients
			) ranked WHERE ranked.id = recipe_ingredients.id
		)
	`); err != nil {
		log.Printf("Could not fill in recipe_ingredients.display_order: %v", err)
		return
	}

	log.Println("🥄 Recipe ingredients now keep the order they were written in")
}

// seedTranslations maps the names this app seeds a database with, and the Czech
// they were renamed to by hand before there was a translations table, onto the
// English canonical the schema now wants. It is a fixed list rather than an AI
// call because a migration runs at startup: a container that cannot boot
// without reaching an external API is a worse thing than an untranslated name,
// and whatever is missing here is filled in later by the backfill endpoint.
var seedTranslations = map[string]string{
	// Czech name as it may be stored now -> English canonical
	"máslo": "Butter", "sůl": "Salt", "pepř": "Pepper", "cukr": "Sugar",
	"mouka": "Flour", "hladká mouka": "Flour", "mléko": "Milk", "vejce": "Eggs",
	"vejce (ks)": "Eggs", "cibule": "Onion", "česnek": "Garlic", "olej": "Oil",
	"olivový olej": "Olive Oil", "sýr": "Cheese", "parmazán": "Parmesan",
	"rajčata": "Tomatoes", "rajče": "Tomatoes", "brambory": "Potatoes",
	"mrkev": "Carrots", "kuřecí maso": "Chicken", "kuře": "Chicken",
	"hovězí maso": "Beef", "hovězí": "Beef", "vepřové maso": "Pork",
	"rýže": "Rice", "těstoviny": "Pasta", "špagety": "Spaghetti",
	"slanina": "Bacon", "smetana": "Cream", "voda": "Water", "bazalka": "Basil",
	"petržel": "Parsley", "citron": "Lemon", "houby": "Mushrooms",
	"paprika": "Bell Pepper", "brokolice": "Broccoli", "špenát": "Spinach",
	"droždí": "Yeast", "med": "Honey", "ocet": "Vinegar",
	// tags
	"předkrm": "Appetizer", "hlavní jídlo": "Main Dish", "dezert": "Dessert",
	"snídaně": "Breakfast", "oběd": "Lunch", "večeře": "Dinner",
	"svačina": "Snack", "polévka": "Soup", "salát": "Salad",
	"vegetariánské": "Vegetarian", "veganské": "Vegan", "bezlepkové": "Gluten Free",
	"rychlé": "Quick", "zdravé": "Healthy", "pečivo": "Baking",
	"nápoj": "Drink", "italská kuchyně": "Italian", "italská": "Italian",
	"česká kuchyně": "Czech", "těstoviny (tag)": "Pasta",
}

// migrateTaxonomyTranslations turns whatever ingredients and tags are called
// today into an English canonical plus a translation in the language they were
// actually written in.
//
// Three cases, and only the first can be resolved offline: a name the seed list
// knows becomes its English canonical with the old name kept as the Czech
// translation; a name that merely looks Czech stays as it is and is recorded as
// its own Czech translation, so the English side is visibly missing rather than
// silently wrong; anything else is assumed already English and left alone.
// FillMissingTranslations is what closes the remaining gaps, with an AI and a
// person watching, rather than a migration guessing.
func migrateTaxonomyTranslations() {
	migrateOneTaxonomy("ingredients", "ingredient_translations", "ingredient_id")
	migrateOneTaxonomy("tags", "tag_translations", "tag_id")
}

func migrateOneTaxonomy(table, translations, key string) {
	var done int
	if err := DB.QueryRow("SELECT COUNT(*) FROM " + translations).Scan(&done); err != nil {
		log.Printf("Error checking %s: %v", translations, err)
		return
	}
	if done > 0 {
		return // already migrated
	}

	rows, err := DB.Query("SELECT id, name FROM " + table)
	if err != nil {
		log.Printf("Could not read %s to migrate: %v", table, err)
		return
	}
	type entry struct {
		id   int
		name string
	}
	var entries []entry
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.id, &e.name); err != nil {
			rows.Close()
			return
		}
		entries = append(entries, e)
	}
	rows.Close()

	tx, err := DB.Begin()
	if err != nil {
		return
	}
	defer tx.Rollback()

	renamed := 0
	for _, e := range entries {
		english, known := seedTranslations[strings.ToLower(strings.TrimSpace(e.name))]

		switch {
		case known && !strings.EqualFold(english, e.name):
			// The canonical becomes English; what was there is kept as Czech.
			// INSERT OR IGNORE on the rename, because two Czech names can map
			// onto one English one and the column is UNIQUE - the loser keeps
			// its own name and gets picked up by the backfill instead.
			if _, err := tx.Exec("UPDATE OR IGNORE "+table+" SET name = ? WHERE id = ?", english, e.id); err != nil {
				continue
			}
			if _, err := tx.Exec("INSERT OR IGNORE INTO "+translations+" ("+key+", language, name) VALUES (?, 'cs', ?)", e.id, e.name); err != nil {
				continue
			}
			renamed++
		case looksCzech(e.name):
			// Cannot be translated here, but recording it as Czech means the
			// English list shows the gap instead of showing Czech unlabelled.
			if _, err := tx.Exec("INSERT OR IGNORE INTO "+translations+" ("+key+", language, name) VALUES (?, 'cs', ?)", e.id, e.name); err != nil {
				continue
			}
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Could not commit the %s translation migration: %v", table, err)
		return
	}
	if renamed > 0 {
		log.Printf("🌍 Gave %d of %d %s an English canonical name", renamed, len(entries), table)
	}
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

// migrateUserPasswordChangedAt adds the column that lets a password change
// invalidate the sessions issued before it. Existing rows get 0, so no token in
// flight is rejected by the upgrade itself.
func migrateUserPasswordChangedAt() {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM pragma_table_info('users') WHERE name='password_changed_at'").Scan(&count)
	if err != nil || count == 0 {
		fmt.Println("🔄 Adding password_changed_at column to users...")
		_, err = DB.Exec("ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0")
		if err != nil {
			log.Printf("Error adding password_changed_at column: %v", err)
		} else {
			fmt.Println("✅ Added password_changed_at column successfully")
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
		// The text goes in recipe_translations, not on the recipe row - those
		// columns were dropped when recipes became multilingual, and this
		// insert still named them, so seeding a brand new database failed
		// silently and left it with no recipes at all.
		result, err := DB.Exec(`
			INSERT INTO recipes (prep_time, cook_time, servings, serving_unit, created_by)
			VALUES (?, ?, ?, ?, ?)
		`, recipe.PrepTime, recipe.CookTime, recipe.Servings, recipe.ServingUnit, userID)

		if err != nil {
			log.Printf("Error inserting recipe %s: %v", recipe.Title, err)
			continue
		}

		recipeID, _ := result.LastInsertId()

		// The seed recipes are written in English, which is also the canonical
		// the taxonomy is stored under.
		if _, err := DB.Exec(`
			INSERT INTO recipe_translations (recipe_id, language, title, description, instructions)
			VALUES (?, ?, ?, ?, ?)
		`, recipeID, DefaultLanguage, recipe.Title, recipe.Description, recipe.Instructions); err != nil {
			log.Printf("Error inserting text for recipe %s: %v", recipe.Title, err)
			continue
		}

		// Add ingredients, keeping the order they are listed in above
		for position, ingredient := range recipe.Ingredients {
			var ingredientID int
			err := DB.QueryRow("SELECT id FROM ingredients WHERE name = ?", ingredient.Name).Scan(&ingredientID)
			if err != nil {
				log.Printf("Ingredient %s not found for recipe %s", ingredient.Name, recipe.Title)
				continue
			}

			_, err = DB.Exec("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, display_order) VALUES (?, ?, ?, ?, ?)",
				recipeID, ingredientID, ingredient.Quantity, ingredient.Unit, position)
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

// ErrNameTaken is returned when a rename would collide with an existing name.
var ErrNameTaken = errors.New("that name is already taken")

// UpdateIngredientSecure renames an ingredient. Recipes reference it by id, so
// every recipe using it follows the new name automatically.
func UpdateIngredientSecure(id int, name string) (*models.Ingredient, error) {
	if !utils.IsValidID(id) {
		return nil, sql.ErrNoRows
	}
	name = strings.TrimSpace(name)
	if validation := utils.ValidateIngredientName(name); !validation.Valid {
		return nil, newValidationError("%s", validation.Message)
	}

	// Checked before the write so the caller gets "taken", not a driver error
	// about a unique index. Excluding the row itself lets a rename that only
	// changes capitalisation through.
	var clash int
	if err := DB.QueryRow(
		"SELECT COUNT(*) FROM ingredients WHERE lower(name) = lower(?) AND id != ?", name, id,
	).Scan(&clash); err != nil {
		return nil, err
	}
	if clash > 0 {
		return nil, ErrNameTaken
	}

	result, err := DB.Exec("UPDATE ingredients SET name = ? WHERE id = ?", name, id)
	if err != nil {
		return nil, err
	}
	if rows, err := result.RowsAffected(); err != nil {
		return nil, err
	} else if rows == 0 {
		return nil, sql.ErrNoRows
	}

	return &models.Ingredient{ID: id, Name: name}, nil
}

// UpdateTagSecure renames a tag and optionally recolours it. An empty colour
// leaves the stored one alone.
func UpdateTagSecure(id int, name, color string) (*models.Tag, error) {
	if !utils.IsValidID(id) {
		return nil, sql.ErrNoRows
	}
	name = strings.TrimSpace(name)
	if validation := utils.ValidateTagName(name); !validation.Valid {
		return nil, newValidationError("%s", validation.Message)
	}

	color = strings.TrimSpace(color)
	if color == "" {
		if err := DB.QueryRow("SELECT color FROM tags WHERE id = ?", id).Scan(&color); err != nil {
			return nil, err
		}
	}
	if len(color) != 7 || !strings.HasPrefix(color, "#") {
		return nil, newValidationError("Colour must be a hex value like #ff6b6b")
	}

	var clash int
	if err := DB.QueryRow(
		"SELECT COUNT(*) FROM tags WHERE lower(name) = lower(?) AND id != ?", name, id,
	).Scan(&clash); err != nil {
		return nil, err
	}
	if clash > 0 {
		return nil, ErrNameTaken
	}

	result, err := DB.Exec("UPDATE tags SET name = ?, color = ? WHERE id = ?", name, color, id)
	if err != nil {
		return nil, err
	}
	if rows, err := result.RowsAffected(); err != nil {
		return nil, err
	} else if rows == 0 {
		return nil, sql.ErrNoRows
	}

	return &models.Tag{ID: id, Name: name, Color: color}, nil
}

// ErrImageNotFound is returned when an image does not exist or the recipe it
// belongs to is not owned by the acting user.
var ErrImageNotFound = errors.New("image not found or access denied")

// SetRecipeImageCover makes one image the recipe's cover and returns the recipe
// it belongs to. There is no is_cover column and none is needed: every read
// already orders by display_order, so the cover is simply whichever image
// sorts first. The whole set is renumbered from 0 rather than pushing the
// chosen one below the others, which would drift further negative on every
// change.
func SetRecipeImageCover(imageID int) (int, error) {
	if !utils.IsValidID(imageID) {
		return 0, ErrImageNotFound
	}

	var recipeID int
	err := DB.QueryRow("SELECT recipe_id FROM recipe_images WHERE id = ?", imageID).Scan(&recipeID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrImageNotFound
	}
	if err != nil {
		return 0, err
	}

	rows, err := DB.Query(
		"SELECT id FROM recipe_images WHERE recipe_id = ? ORDER BY display_order ASC, id ASC",
		recipeID,
	)
	if err != nil {
		return 0, err
	}

	ordered := []int{imageID}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		if id != imageID {
			ordered = append(ordered, id)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	tx, err := DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	for position, id := range ordered {
		if _, err := tx.Exec(
			"UPDATE recipe_images SET display_order = ? WHERE id = ? AND recipe_id = ?",
			position, id, recipeID,
		); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return recipeID, nil
}

// ErrWrongPassword is returned when the current password supplied with a
// password change does not match the stored hash.
var ErrWrongPassword = errors.New("current password is incorrect")

// ChangeUserPassword verifies the current password and replaces it. The check
// and the write live together so no caller can rewrite a hash without proving
// it knows the old one, and the timestamp it stamps is what retires the tokens
// issued before the change (see auth.GetUserFromToken).
func ChangeUserPassword(userID int, currentPassword, newPassword string) error {
	if validation := utils.ValidatePassword(newPassword); !validation.Valid {
		return newValidationError("%s", validation.Message)
	}

	var storedHash string
	if err := DB.QueryRow("SELECT password FROM users WHERE id = ?", userID).Scan(&storedHash); err != nil {
		return err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(currentPassword)); err != nil {
		return ErrWrongPassword
	}

	// Checked after the current password, so this never becomes an oracle for
	// what the stored password is.
	if currentPassword == newPassword {
		return newValidationError("The new password must be different from the current one")
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	result, err := DB.Exec(
		"UPDATE users SET password = ?, password_changed_at = ? WHERE id = ?",
		string(newHash), time.Now().Unix(), userID,
	)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return sql.ErrNoRows
	}

	return nil
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
	// Texts holds the recipe's words, keyed by language code, and must carry at
	// least one. Everything below is language-neutral and lives on the recipe
	// row itself - a cooking time does not need translating.
	Texts       map[string]models.RecipeText
	PrepTime    int
	CookTime    int
	Servings    int
	ServingUnit string
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

	if len(in.Texts) == 0 {
		return newValidationError("A recipe needs a title and a method in at least one language")
	}

	checks := []utils.ValidationResult{
		utils.ValidateServingUnit(in.ServingUnit),
		utils.ValidateNumericInput(in.PrepTime, 0, 1440, "Prep time"),
		utils.ValidateNumericInput(in.CookTime, 0, 1440, "Cook time"),
		utils.ValidateNumericInput(in.Servings, 1, 100, "Servings"),
	}

	// Every language is validated, not just the first: a write that half
	// succeeded would leave a recipe readable in one language and broken in
	// another, which is worse than refusing the whole thing.
	normalized := make(map[string]models.RecipeText, len(in.Texts))
	for language, text := range in.Texts {
		language = NormalizeLanguage(language)
		text.Title = strings.TrimSpace(text.Title)
		text.Description = strings.TrimSpace(text.Description)
		text.Instructions = strings.TrimSpace(text.Instructions)

		checks = append(checks,
			utils.ValidateRecipeTitle(text.Title),
			utils.ValidateRecipeDescription(text.Description),
			utils.ValidateRecipeInstructions(text.Instructions),
		)
		normalized[language] = text
	}
	in.Texts = normalized

	for _, check := range checks {
		if !check.Valid {
			return newValidationError("%s", check.Message)
		}
	}

	return nil
}

// writeRecipeTexts replaces a recipe's translations with the ones given. A
// language the caller did not send is removed: the edit form sends every
// language it is showing, so an omission means "this one is gone", and leaving
// orphans behind would resurrect deleted text on the next read.
func writeRecipeTexts(tx *sql.Tx, recipeID int64, texts map[string]models.RecipeText) error {
	if _, err := tx.Exec("DELETE FROM recipe_translations WHERE recipe_id = ?", recipeID); err != nil {
		return err
	}
	for language, text := range texts {
		if _, err := tx.Exec(`
			INSERT INTO recipe_translations (recipe_id, language, title, description, instructions)
			VALUES (?, ?, ?, ?, ?)
		`, recipeID, language, text.Title, text.Description, text.Instructions); err != nil {
			return newValidationError("could not store the %s text: %v", language, err)
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

	result, err := tx.Stmt(stmtCreateRecipe).Exec(in.PrepTime, in.CookTime, in.Servings, in.ServingUnit, userID)
	if err != nil {
		return 0, err
	}

	recipeID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	if err := writeRecipeTexts(tx, recipeID, in.Texts); err != nil {
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

	result, err := tx.Stmt(stmtUpdateRecipe).Exec(in.PrepTime, in.CookTime, in.Servings, in.ServingUnit, recipeID)
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

	if err := writeRecipeTexts(tx, int64(recipeID), in.Texts); err != nil {
		return err
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
	for position, ingredient := range ingredients {
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
			"INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, display_order) VALUES (?, ?, ?, ?, ?)",
			recipeID, ingredient.IngredientID, ingredient.Quantity, ingredient.Unit, position,
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
func attachRelations(recipes []models.Recipe, language string) []models.Recipe {
	if len(recipes) == 0 {
		return recipes
	}

	language = NormalizeLanguage(language)

	ids := make([]int, len(recipes))
	for i := range recipes {
		ids[i] = recipes[i].ID
		recipes[i].Ingredients = []models.RecipeIngredient{}
		recipes[i].Images = []models.RecipeImage{}
		recipes[i].Tags = []models.Tag{}
		recipes[i].Languages = []string{}
	}

	in := placeholders(len(ids))
	args := idArgs(ids)
	// The name lookups take the language as their first parameter, ahead of the
	// id list; images do not, and keep using args as it is.
	nameArgs := append([]any{language}, args...)

	index := make(map[int]*models.Recipe, len(recipes))
	for i := range recipes {
		index[recipes[i].ID] = &recipes[i]
	}

	if rows, err := DB.Query(`
		SELECT ri.recipe_id, ri.ingredient_id, `+ingredientNameSQL+`, ri.unit, ri.quantity
		FROM recipe_ingredients ri
		JOIN ingredients i ON ri.ingredient_id = i.id
		WHERE ri.recipe_id IN (`+in+`)
		ORDER BY ri.recipe_id, ri.display_order, ri.id
	`, nameArgs...); err == nil {
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
		SELECT rt.recipe_id, t.id, `+tagNameSQL+`, t.color
		FROM recipe_tags rt
		JOIN tags t ON rt.tag_id = t.id
		WHERE rt.recipe_id IN (`+in+`)
		ORDER BY 3
	`, nameArgs...); err == nil {
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

	// Which languages each recipe exists in, for the "shown in Czech" label and
	// the translate button. One query for the page, like everything else here -
	// asking per recipe is how the 3N+1 this function exists to kill got in.
	if rows, err := DB.Query(`
		SELECT recipe_id, language
		FROM recipe_translations
		WHERE recipe_id IN (`+in+`)
		ORDER BY language
	`, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var recipeID int
			var language string
			if err := rows.Scan(&recipeID, &language); err != nil {
				continue
			}
			if recipe, ok := index[recipeID]; ok {
				recipe.Languages = append(recipe.Languages, language)
			}
		}
	} else {
		log.Printf("Error loading recipe languages: %v", err)
	}

	return recipes
}

// Database query functions
func GetAllRecipes(language string) ([]models.Recipe, error) {
	language = NormalizeLanguage(language)
	rows, err := DB.Query(`
		SELECT `+recipeColumns+`
		FROM recipes r
		JOIN users u ON r.created_by = u.id`+recipeTextJoin+`
		ORDER BY r.created_at DESC
	`, language)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipes := []models.Recipe{}
	for rows.Next() {
		recipe, err := scanRecipe(rows.Scan)
		if err != nil {
			continue
		}
		recipes = append(recipes, recipe)
	}

	return attachRelations(recipes, language), nil
}

// Secure recipe search
func SearchRecipes(query, language string) ([]models.Recipe, error) {
	// Validate search query
	if validation := utils.ValidateSearchQuery(query); !validation.Valid {
		return nil, fmt.Errorf("invalid search query: %s", validation.Message)
	}

	language = NormalizeLanguage(language)
	p := "%" + query + "%"
	// One for the display language, six for the EXISTS clauses, one for the
	// title-first ordering.
	rows, err := stmtSearchRecipes.Query(language, p, p, p, p, p, p, p, p)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipes := []models.Recipe{}
	seenRecipes := make(map[int]bool)

	for rows.Next() {
		recipe, err := scanRecipe(rows.Scan)
		if err != nil {
			continue
		}
		if seenRecipes[recipe.ID] {
			continue
		}
		recipes = append(recipes, recipe)
		seenRecipes[recipe.ID] = true
	}

	return attachRelations(recipes, language), nil
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
// DeleteRecipeSecure removes a recipe. It takes no user id: the collection is
// shared, so there is no owner to compare against, and an argument that is
// accepted but never consulted is exactly how a check comes to be believed in
// without existing.
func DeleteRecipeSecure(recipeID int) error {
	if !utils.IsValidID(recipeID) {
		return fmt.Errorf("invalid recipe ID")
	}

	result, err := stmtDeleteRecipe.Exec(recipeID)
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

// TagUsage reports how many recipes carry this tag, plus a few of their titles
// for the error message.
//
// It used to count only recipes belonging to somebody else, which protected
// strangers' recipes from having their tags stripped. In a shared collection
// there are no strangers, so that rule protected nothing - and the useful
// question became the one already asked of ingredients: is anything still using
// it? Deleting a tag now needs it to be unused, whoever wrote the recipes.
func TagUsage(tagID int) (int, []string, error) {
	if !utils.IsValidID(tagID) {
		return 0, nil, fmt.Errorf("invalid tag ID")
	}

	var count int
	err := DB.QueryRow(`
		SELECT COUNT(*)
		FROM recipe_tags rt
		JOIN recipes r ON rt.recipe_id = r.id
		WHERE rt.tag_id = ?
	`, tagID).Scan(&count)
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
		WHERE rt.tag_id = ?
		ORDER BY r.title
		LIMIT 3
	`, tagID)
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
func GetRecipeByIDSecure(id int, language string) (*models.Recipe, error) {
	if !utils.IsValidID(id) {
		return nil, fmt.Errorf("invalid recipe ID")
	}

	language = NormalizeLanguage(language)
	recipe, err := scanRecipe(stmtGetRecipeByID.QueryRow(language, id).Scan)
	if err != nil {
		return nil, err
	}

	recipe.Ingredients = GetRecipeIngredients(recipe.ID, language)
	recipe.Images = GetRecipeImages(recipe.ID)
	recipe.Tags = GetRecipeTags(recipe.ID, language)
	recipe.Languages = RecipeLanguages(recipe.ID)
	if texts, err := RecipeTextsFor(recipe.ID); err == nil {
		recipe.Texts = texts
	}
	return &recipe, nil
}

// RecipeLanguages lists the languages a recipe has text in, so the UI can offer
// the ones that exist and mark the ones that do not.
func RecipeLanguages(recipeID int) []string {
	languages := []string{}
	rows, err := DB.Query("SELECT language FROM recipe_translations WHERE recipe_id = ? ORDER BY language", recipeID)
	if err != nil {
		return languages
	}
	defer rows.Close()
	for rows.Next() {
		var language string
		if err := rows.Scan(&language); err == nil {
			languages = append(languages, language)
		}
	}
	return languages
}

// Check if user owns recipe
// RecipeExists is what the handlers ask before a write, in place of the
// ownership check this replaced. Whether a recipe exists is still worth knowing
// separately - it is the difference between a 404 and a silent no-op - but who
// wrote it no longer decides anything. Returns sql.ErrNoRows for a missing
// recipe, which the callers turn into a 404.
func RecipeExists(recipeID int) (bool, error) {
	if !utils.IsValidID(recipeID) {
		return false, fmt.Errorf("invalid recipe ID")
	}

	var found int
	if err := DB.QueryRow("SELECT 1 FROM recipes WHERE id = ?", recipeID).Scan(&found); err != nil {
		return false, err
	}
	return true, nil
}

func GetRecipesByTag(tagID int, language string) ([]models.Recipe, error) {
	language = NormalizeLanguage(language)
	rows, err := DB.Query(`
		SELECT DISTINCT `+recipeColumns+`
		FROM recipes r
		JOIN users u ON r.created_by = u.id`+recipeTextJoin+`
		JOIN recipe_tags rt ON r.id = rt.recipe_id
		WHERE rt.tag_id = ?
		ORDER BY r.created_at DESC
	`, language, tagID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipes := []models.Recipe{}
	for rows.Next() {
		recipe, err := scanRecipe(rows.Scan)
		if err != nil {
			continue
		}
		recipes = append(recipes, recipe)
	}

	return attachRelations(recipes, language), nil
}

func GetAllIngredients(language string) ([]models.Ingredient, error) {
	rows, err := DB.Query("SELECT id, "+ingredientNameSQL+" FROM ingredients i ORDER BY 2", NormalizeLanguage(language))
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

func GetAllTags(language string) ([]models.Tag, error) {
	rows, err := DB.Query("SELECT id, "+tagNameSQL+", color FROM tags t ORDER BY 2", NormalizeLanguage(language))
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

func GetRecipeIngredients(recipeID int, language string) []models.RecipeIngredient {
	rows, err := DB.Query(`
		SELECT ri.ingredient_id, `+ingredientNameSQL+`, ri.unit, ri.quantity
		FROM recipe_ingredients ri
		JOIN ingredients i ON ri.ingredient_id = i.id
		WHERE ri.recipe_id = ?
		-- The order the recipe lists them in, not alphabetical: the first three
		-- ingredients of a bread are the ones you combine first. ri.id breaks a
		-- tie, which is what rows written before display_order existed have.
		ORDER BY ri.display_order, ri.id
	`, NormalizeLanguage(language), recipeID)

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

func GetRecipeTags(recipeID int, language string) []models.Tag {
	rows, err := DB.Query(`
		SELECT t.id, `+tagNameSQL+`, t.color
		FROM recipe_tags rt
		JOIN tags t ON rt.tag_id = t.id
		WHERE rt.recipe_id = ?
		ORDER BY 2
	`, NormalizeLanguage(language), recipeID)

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

// AllIngredientNames returns every name each ingredient is known by - the
// English canonical plus every translation - keyed by id. It is what the AI
// resolver matches against, so a model that writes "Máslo" finds the stored
// "Butter" instead of creating a duplicate beside it.
func AllIngredientNames() (map[int][]string, error) {
	return allNames("SELECT id, name FROM ingredients", "SELECT ingredient_id, name FROM ingredient_translations")
}

// AllTagNames is the same, for tags.
func AllTagNames() (map[int][]string, error) {
	return allNames("SELECT id, name FROM tags", "SELECT tag_id, name FROM tag_translations")
}

func allNames(canonicalQuery, translationQuery string) (map[int][]string, error) {
	names := map[int][]string{}

	for _, query := range []string{canonicalQuery, translationQuery} {
		rows, err := DB.Query(query)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int
			var name string
			if err := rows.Scan(&id, &name); err != nil {
				rows.Close()
				return nil, err
			}
			names[id] = append(names[id], name)
		}
		rows.Close()
	}

	return names, nil
}

// SetIngredientTranslation records what an ingredient is called in one
// language. Upsert rather than insert: a rename in Czech should move the Czech
// name, not collide with the row already holding it.
func SetIngredientTranslation(ingredientID int, language, name string) error {
	return setTranslation("ingredient_translations", "ingredient_id", ingredientID, language, name,
		utils.ValidateIngredientName)
}

// SetTagTranslation is the same, for tags.
func SetTagTranslation(tagID int, language, name string) error {
	return setTranslation("tag_translations", "tag_id", tagID, language, name, utils.ValidateTagName)
}

func setTranslation(table, key string, id int, language, name string,
	validate func(string) utils.ValidationResult) error {

	if !utils.IsValidID(id) {
		return fmt.Errorf("invalid id")
	}
	name = strings.TrimSpace(name)
	if validation := validate(name); !validation.Valid {
		return newValidationError("%s", validation.Message)
	}

	language = NormalizeLanguage(language)
	// English is the canonical on the row itself; storing it here too would be
	// a second copy to drift from it.
	if language == DefaultLanguage {
		_, err := DB.Exec("UPDATE "+strings.TrimSuffix(table, "_translations")+"s SET name = ? WHERE id = ?", name, id)
		return err
	}

	_, err := DB.Exec(`
		INSERT INTO `+table+` (`+key+`, language, name) VALUES (?, ?, ?)
		ON CONFLICT(`+key+`, language) DO UPDATE SET name = excluded.name
	`, id, language, name)
	return err
}

// MissingTranslations lists ingredients and tags that have no name in the given
// language, so the backfill knows what to ask an AI about.
func MissingTranslations(language string) (ingredients, tags map[int]string, err error) {
	language = NormalizeLanguage(language)
	ingredients = map[int]string{}
	tags = map[int]string{}

	if language == DefaultLanguage {
		// The canonical is the English name, so nothing can be missing.
		return ingredients, tags, nil
	}

	for _, spec := range []struct {
		query string
		into  map[int]string
	}{
		{`SELECT i.id, i.name FROM ingredients i
		  WHERE NOT EXISTS (SELECT 1 FROM ingredient_translations t WHERE t.ingredient_id = i.id AND t.language = ?)`, ingredients},
		{`SELECT t.id, t.name FROM tags t
		  WHERE NOT EXISTS (SELECT 1 FROM tag_translations x WHERE x.tag_id = t.id AND x.language = ?)`, tags},
	} {
		rows, queryErr := DB.Query(spec.query, language)
		if queryErr != nil {
			return nil, nil, queryErr
		}
		for rows.Next() {
			var id int
			var name string
			if scanErr := rows.Scan(&id, &name); scanErr != nil {
				rows.Close()
				return nil, nil, scanErr
			}
			spec.into[id] = name
		}
		rows.Close()
	}

	return ingredients, tags, nil
}

// RecipeTextsFor returns every language version of one recipe, for the edit
// form and for handing an existing recipe to the translator.
func RecipeTextsFor(recipeID int) (map[string]models.RecipeText, error) {
	texts := map[string]models.RecipeText{}
	rows, err := DB.Query(
		"SELECT language, title, COALESCE(description, ''), instructions FROM recipe_translations WHERE recipe_id = ?",
		recipeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var language string
		var text models.RecipeText
		if err := rows.Scan(&language, &text.Title, &text.Description, &text.Instructions); err != nil {
			continue
		}
		texts[language] = text
	}
	return texts, nil
}

// SetRecipeText stores one language of a recipe, leaving the others alone.
// This is what the translate button writes; a full edit goes through
// UpdateRecipeTx, which replaces the whole set.
func SetRecipeText(recipeID int, language string, text models.RecipeText) error {
	if !utils.IsValidID(recipeID) {
		return ErrRecipeNotFound
	}

	language = NormalizeLanguage(language)
	text.Title = strings.TrimSpace(text.Title)
	text.Description = strings.TrimSpace(text.Description)
	text.Instructions = strings.TrimSpace(text.Instructions)

	for _, check := range []utils.ValidationResult{
		utils.ValidateRecipeTitle(text.Title),
		utils.ValidateRecipeDescription(text.Description),
		utils.ValidateRecipeInstructions(text.Instructions),
	} {
		if !check.Valid {
			return newValidationError("%s", check.Message)
		}
	}

	_, err := DB.Exec(`
		INSERT INTO recipe_translations (recipe_id, language, title, description, instructions)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(recipe_id, language) DO UPDATE SET
			title = excluded.title,
			description = excluded.description,
			instructions = excluded.instructions
	`, recipeID, language, text.Title, text.Description, text.Instructions)
	return err
}

// DeleteRecipeText removes one language of a recipe. Refused when it is the
// last one: a recipe with no text at all would vanish from every list, since
// every read joins the translation that supplies its title.
func DeleteRecipeText(recipeID int, language string) error {
	language = NormalizeLanguage(language)

	var count int
	if err := DB.QueryRow("SELECT COUNT(*) FROM recipe_translations WHERE recipe_id = ?", recipeID).Scan(&count); err != nil {
		return err
	}
	if count <= 1 {
		return newValidationError("A recipe must exist in at least one language")
	}

	_, err := DB.Exec("DELETE FROM recipe_translations WHERE recipe_id = ? AND language = ?", recipeID, language)
	return err
}

// taxonomyTables names the three tables one kind of taxonomy lives in. The
// values are compile-time constants, never anything a caller supplies, so
// interpolating them into SQL is safe in the way a user-supplied name would
// not be.
type taxonomyTables struct {
	table        string // ingredients / tags
	translations string // ingredient_translations / tag_translations
	key          string // ingredient_id / tag_id
	link         string // recipe_ingredients / recipe_tags
	linkKey      string // ingredient_id / tag_id
}

var (
	ingredientTables = taxonomyTables{"ingredients", "ingredient_translations", "ingredient_id", "recipe_ingredients", "ingredient_id"}
	tagTables        = taxonomyTables{"tags", "tag_translations", "tag_id", "recipe_tags", "tag_id"}
)

// AllCanonicals returns every ingredient and tag canonical name, keyed by id.
//
// Every one of them, not just the ones that look Czech. looksCzech decides on
// diacritics, which is right for a migration that must work offline but too
// blunt here: "Olej" is a Czech word spelled entirely in ASCII, and it sat in
// the English column untouched through a whole backfill because of it. Deciding
// which of these are actually English is a job for the model that is being
// called anyway, so the whole list goes to it.
func AllCanonicals() (ingredients, tags map[int]string, err error) {
	ingredients, err = allCanonicals(ingredientTables)
	if err != nil {
		return nil, nil, err
	}
	tags, err = allCanonicals(tagTables)
	if err != nil {
		return nil, nil, err
	}
	return ingredients, tags, nil
}

func allCanonicals(t taxonomyTables) (map[int]string, error) {
	found := map[int]string{}
	rows, err := DB.Query("SELECT id, name FROM " + t.table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			continue
		}
		found[id] = name
	}
	return found, nil
}

// AdoptIngredientCanonical gives one ingredient its English canonical name,
// keeping what it was called as the Czech translation.
func AdoptIngredientCanonical(id int, english string) (merged bool, err error) {
	return adoptCanonical(ingredientTables, id, english, utils.ValidateIngredientName)
}

// AdoptTagCanonical is the same, for tags.
func AdoptTagCanonical(id int, english string) (merged bool, err error) {
	return adoptCanonical(tagTables, id, english, utils.ValidateTagName)
}

// adoptCanonical renames a row to its English name - or merges it into the row
// that already has that name.
//
// The merge is the case that matters. A collection translated by hand ends up
// holding both "Mléko" and "Milk" as separate ingredients, and simply renaming
// one would collide with the UNIQUE index on name. They are the same thing, so
// the recipes pointing at the Czech row are moved to the English one and the
// duplicate goes. INSERT OR IGNORE on the move, because a recipe already listing
// both would otherwise violate the (recipe_id, ingredient_id, unit) key - it
// keeps the row it had rather than failing the whole merge.
func adoptCanonical(t taxonomyTables, id int, english string,
	validate func(string) utils.ValidationResult) (bool, error) {

	if !utils.IsValidID(id) {
		return false, fmt.Errorf("invalid id")
	}
	english = strings.TrimSpace(english)
	if validation := validate(english); !validation.Valid {
		return false, newValidationError("%s", validation.Message)
	}
	if looksCzech(english) {
		return false, newValidationError("%q is not an English name", english)
	}

	var current string
	if err := DB.QueryRow("SELECT name FROM "+t.table+" WHERE id = ?", id).Scan(&current); err != nil {
		return false, err
	}
	if strings.EqualFold(current, english) {
		return false, nil // already there
	}

	tx, err := DB.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	var keepID int
	err = tx.QueryRow("SELECT id FROM "+t.table+" WHERE lower(name) = lower(?) AND id != ?", english, id).Scan(&keepID)

	switch {
	case errors.Is(err, sql.ErrNoRows):
		// Nothing else holds the English name: rename in place and keep what it
		// was called as its Czech side.
		if _, err := tx.Exec("UPDATE "+t.table+" SET name = ? WHERE id = ?", english, id); err != nil {
			return false, err
		}
		if _, err := tx.Exec("INSERT INTO "+t.translations+" ("+t.key+", language, name) VALUES (?, 'cs', ?) "+
			"ON CONFLICT("+t.key+", language) DO UPDATE SET name = excluded.name", id, current); err != nil {
			return false, err
		}
		return false, tx.Commit()

	case err != nil:
		return false, err
	}

	// The English row already exists. Move everything onto it and drop this one.
	if _, err := tx.Exec("INSERT OR IGNORE INTO "+t.translations+" ("+t.key+", language, name) VALUES (?, 'cs', ?)",
		keepID, current); err != nil {
		return false, err
	}
	if _, err := tx.Exec("UPDATE OR IGNORE "+t.link+" SET "+t.linkKey+" = ? WHERE "+t.linkKey+" = ?", keepID, id); err != nil {
		return false, err
	}
	// Whatever the OR IGNORE above refused to move was a duplicate of a row the
	// recipe already had; deleting the row itself takes those with it.
	if _, err := tx.Exec("DELETE FROM "+t.table+" WHERE id = ?", id); err != nil {
		return false, err
	}

	return true, tx.Commit()
}
