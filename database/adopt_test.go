package database

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

// openTestDB gives each test its own database, schema and all.
func openTestDB(t *testing.T) {
	t.Helper()
	previous := DB
	path := filepath.Join(t.TempDir(), "test.db")
	t.Setenv("DB_PATH", path)

	db, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	DB = db
	createTables()
	t.Cleanup(func() {
		db.Close()
		DB = previous
		os.Remove(path)
	})
}

// The case that made this necessary: a collection translated by hand ends up
// holding "Mléko" and "Milk" as two ingredients meaning one thing. Renaming
// either would collide with the UNIQUE index on name, so they have to merge -
// and the recipes pointing at the Czech row have to come across with it.
func TestAdoptCanonicalMergesADuplicate(t *testing.T) {
	openTestDB(t)

	var czechID, englishID int64
	for name, into := range map[string]*int64{"Mléko": &czechID, "Milk": &englishID} {
		result, err := DB.Exec("INSERT INTO ingredients (name) VALUES (?)", name)
		if err != nil {
			t.Fatalf("seed %s: %v", name, err)
		}
		*into, _ = result.LastInsertId()
	}

	// recipes.created_by is a foreign key, so an author has to exist first.
	author, err := DB.Exec("INSERT INTO users (username, email, password) VALUES ('cook', 'cook@example.com', 'hashed-enough')")
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	authorID, _ := author.LastInsertId()

	recipe, err := DB.Exec("INSERT INTO recipes (prep_time, cook_time, servings, created_by) VALUES (0,0,4,?)", authorID)
	if err != nil {
		t.Fatalf("seed recipe: %v", err)
	}
	recipeID, _ := recipe.LastInsertId()
	if _, err := DB.Exec(
		"INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, 200, 'ml')",
		recipeID, czechID); err != nil {
		t.Fatalf("seed link: %v", err)
	}

	merged, err := AdoptIngredientCanonical(int(czechID), "Milk")
	if err != nil {
		t.Fatalf("adopt: %v", err)
	}
	if !merged {
		t.Fatal("expected a merge, since Milk already existed")
	}

	// The Czech row is gone, the recipe now points at the English one, and the
	// name it used to have survives as the Czech translation.
	var leftover int
	DB.QueryRow("SELECT COUNT(*) FROM ingredients WHERE id = ?", czechID).Scan(&leftover)
	if leftover != 0 {
		t.Error("the duplicate ingredient row survived the merge")
	}

	var pointsAt int64
	if err := DB.QueryRow("SELECT ingredient_id FROM recipe_ingredients WHERE recipe_id = ?", recipeID).Scan(&pointsAt); err != nil {
		t.Fatalf("the recipe lost its ingredient entirely: %v", err)
	}
	if pointsAt != englishID {
		t.Errorf("recipe points at ingredient %d, want %d", pointsAt, englishID)
	}

	var czechName string
	if err := DB.QueryRow(
		"SELECT name FROM ingredient_translations WHERE ingredient_id = ? AND language = 'cs'", englishID,
	).Scan(&czechName); err != nil {
		t.Fatalf("the Czech name was not kept: %v", err)
	}
	if czechName != "Mléko" {
		t.Errorf("Czech name = %q, want %q", czechName, "Mléko")
	}
}

// With nothing to merge into, the row keeps its id and simply turns round: the
// canonical becomes English and what it was called becomes the Czech side.
func TestAdoptCanonicalRenamesInPlace(t *testing.T) {
	openTestDB(t)

	result, err := DB.Exec("INSERT INTO ingredients (name) VALUES (?)", "Krystalový cukr")
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	id, _ := result.LastInsertId()

	merged, err := AdoptIngredientCanonical(int(id), "Granulated Sugar")
	if err != nil {
		t.Fatalf("adopt: %v", err)
	}
	if merged {
		t.Error("nothing existed to merge into, yet a merge was reported")
	}

	var canonical, czech string
	DB.QueryRow("SELECT name FROM ingredients WHERE id = ?", id).Scan(&canonical)
	DB.QueryRow("SELECT name FROM ingredient_translations WHERE ingredient_id = ? AND language = 'cs'", id).Scan(&czech)

	if canonical != "Granulated Sugar" {
		t.Errorf("canonical = %q, want %q", canonical, "Granulated Sugar")
	}
	if czech != "Krystalový cukr" {
		t.Errorf("Czech translation = %q, want %q", czech, "Krystalový cukr")
	}
}

// A model that answers with Czech, or with something the validator refuses,
// must not be allowed to write it into the English canonical - that is the one
// field this whole pass exists to get right.
func TestAdoptCanonicalRefusesBadEnglish(t *testing.T) {
	openTestDB(t)

	result, _ := DB.Exec("INSERT INTO ingredients (name) VALUES (?)", "Mléko")
	id, _ := result.LastInsertId()

	for _, bad := range []string{"Mléko", "Máslo", "", "   "} {
		if _, err := AdoptIngredientCanonical(int(id), bad); err == nil {
			t.Errorf("AdoptIngredientCanonical accepted %q as an English name", bad)
		}
	}

	var unchanged string
	DB.QueryRow("SELECT name FROM ingredients WHERE id = ?", id).Scan(&unchanged)
	if unchanged != "Mléko" {
		t.Errorf("the row was modified despite the refusals: %q", unchanged)
	}
}
