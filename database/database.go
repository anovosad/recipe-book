// File: database/database.go
package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"recipe-book/models"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB() {
	var err error
	DB, err = sql.Open("sqlite", "./recipes.db")
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}

	migrateDatabase()
	createTables()
	insertDefaultIngredients()
	insertDefaultTags()
	os.MkdirAll("./uploads", 0755)
	insertDefaultRecipes()

	fmt.Println("✅ Database initialized successfully")
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
		username TEXT UNIQUE NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	
	CREATE TABLE IF NOT EXISTS ingredients (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL
	);

	CREATE TABLE IF NOT EXISTS tags (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL,
		color TEXT DEFAULT '#ff6b6b',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	
	CREATE TABLE IF NOT EXISTS recipes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		description TEXT,
		instructions TEXT NOT NULL,
		prep_time INTEGER,
		cook_time INTEGER,
		servings INTEGER,
		serving_unit TEXT DEFAULT 'people',
		created_by INTEGER,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users (id)
	);
	
	CREATE TABLE IF NOT EXISTS recipe_ingredients (
		recipe_id INTEGER,
		ingredient_id INTEGER,
		quantity REAL NOT NULL,
		unit TEXT NOT NULL,
		PRIMARY KEY (recipe_id, ingredient_id),
		FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
		FOREIGN KEY (ingredient_id) REFERENCES ingredients (id)
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
		filename TEXT NOT NULL,
		caption TEXT,
		display_order INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
	);`

	_, err := DB.Exec(createTables)
	if err != nil {
		log.Fatal("Failed to create tables:", err)
	}

	// Migrate existing recipes to have serving_unit
	migrateServingUnits()
}

func migrateServingUnits() {
	// Check if serving_unit column exists
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
		DB.Exec("INSERT OR IGNORE INTO ingredients (name) VALUES (?)", name)
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
		DB.Exec("INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)", tag.Name, tag.Color)
	}
}

func insertDefaultRecipes() {
	var userID int
	err := DB.QueryRow("SELECT id FROM users WHERE username = 'admin'").Scan(&userID)
	if err != nil {
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		result, err := DB.Exec("INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
			"admin", "admin@recipebook.com", string(hashedPassword))
		if err != nil {
			log.Printf("Could not create admin user: %v", err)
			return
		}
		id, _ := result.LastInsertId()
		userID = int(id)
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

	var recipes []models.Recipe
	for rows.Next() {
		var recipe models.Recipe
		err := rows.Scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions,
			&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.ServingUnit, &recipe.CreatedBy,
			&recipe.CreatedAt, &recipe.AuthorName)
		if err != nil {
			continue
		}

		recipe.Ingredients = GetRecipeIngredients(recipe.ID)
		recipe.Images = GetRecipeImages(recipe.ID)
		recipe.Tags = GetRecipeTags(recipe.ID)
		recipes = append(recipes, recipe)
	}

	return recipes, nil
}

func GetRecipeByID(id int) (*models.Recipe, error) {
	var recipe models.Recipe
	err := DB.QueryRow(`
		SELECT r.id, r.title, r.description, r.instructions, r.prep_time, r.cook_time, 
		       r.servings, COALESCE(r.serving_unit, 'people'), r.created_by, r.created_at, u.username
		FROM recipes r
		JOIN users u ON r.created_by = u.id
		WHERE r.id = ?
	`, id).Scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions,
		&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.ServingUnit, &recipe.CreatedBy,
		&recipe.CreatedAt, &recipe.AuthorName)

	if err != nil {
		return nil, err
	}

	recipe.Ingredients = GetRecipeIngredients(recipe.ID)
	recipe.Images = GetRecipeImages(recipe.ID)
	recipe.Tags = GetRecipeTags(recipe.ID)
	return &recipe, nil
}

func SearchRecipes(query string) ([]models.Recipe, error) {
	rows, err := DB.Query(`
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
	`, "%"+query+"%", "%"+query+"%", "%"+query+"%", "%"+query+"%", "%"+query+"%", "%"+query+"%")

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipes []models.Recipe
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

		recipe.Ingredients = GetRecipeIngredients(recipe.ID)
		recipe.Images = GetRecipeImages(recipe.ID)
		recipe.Tags = GetRecipeTags(recipe.ID)
		recipes = append(recipes, recipe)
		seenRecipes[recipe.ID] = true
	}

	return recipes, nil
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

	var recipes []models.Recipe
	for rows.Next() {
		var recipe models.Recipe
		err := rows.Scan(&recipe.ID, &recipe.Title, &recipe.Description, &recipe.Instructions,
			&recipe.PrepTime, &recipe.CookTime, &recipe.Servings, &recipe.ServingUnit, &recipe.CreatedBy,
			&recipe.CreatedAt, &recipe.AuthorName)
		if err != nil {
			continue
		}

		recipe.Ingredients = GetRecipeIngredients(recipe.ID)
		recipe.Images = GetRecipeImages(recipe.ID)
		recipe.Tags = GetRecipeTags(recipe.ID)
		recipes = append(recipes, recipe)
	}

	return recipes, nil
}

func GetAllIngredients() ([]models.Ingredient, error) {
	rows, err := DB.Query("SELECT id, name FROM ingredients ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ingredients []models.Ingredient
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

	var tags []models.Tag
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

	var ingredients []models.RecipeIngredient
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

	var tags []models.Tag
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

	var images []models.RecipeImage
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
