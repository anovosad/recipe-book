package utils

import (
	"strings"
	"testing"
)

// The collection is kept in Czech as well as English, and the name validators
// used to be ASCII-only classes - every tag and ingredient with a diacritic was
// rejected outright, which made "use Czech" impossible rather than merely ugly.
func TestNamesAcceptNonASCIILetters(t *testing.T) {
	tags := []string{"Předkrm", "Hlavní jídlo", "Bezlepkové", "Rychlé & snadné", "Dezert"}
	for _, name := range tags {
		if result := ValidateTagName(name); !result.Valid {
			t.Errorf("tag %q rejected: %s", name, result.Message)
		}
	}

	ingredients := []string{"Máslo", "Žampiony", "Česnek", "Mouka hladká", "Kuřecí prsa", "Sůl"}
	for _, name := range ingredients {
		if result := ValidateIngredientName(name); !result.Valid {
			t.Errorf("ingredient %q rejected: %s", name, result.Message)
		}
	}

	if result := ValidateRecipeTitle("Šúľance s makom"); !result.Valid {
		t.Errorf("recipe title rejected: %s", result.Message)
	}

	if result := ValidateSearchQuery("žampiony"); !result.Valid {
		t.Errorf("search query rejected: %s", result.Message)
	}
}

// The limits are on characters, and len() counts bytes: a Czech tag hit "too
// long (maximum 50)" at 25 visible characters.
func TestNameLimitsCountCharactersNotBytes(t *testing.T) {
	fifty := strings.Repeat("á", 50)
	if result := ValidateTagName(fifty); !result.Valid {
		t.Errorf("50-character tag rejected: %s", result.Message)
	}
	if result := ValidateTagName(fifty + "á"); result.Valid {
		t.Error("51-character tag accepted")
	}

	hundred := strings.Repeat("ě", 100)
	if result := ValidateIngredientName(hundred); !result.Valid {
		t.Errorf("100-character ingredient rejected: %s", result.Message)
	}
	if result := ValidateIngredientName(hundred + "ě"); result.Valid {
		t.Error("101-character ingredient accepted")
	}
}

// Widening the letter class must not have widened anything else.
func TestNamesStillRejectMarkup(t *testing.T) {
	for _, name := range []string{"<script>", "Dezert<br>", "a\"b", "a;b"} {
		if result := ValidateTagName(name); result.Valid {
			t.Errorf("tag %q accepted", name)
		}
	}
	for _, name := range []string{"<script>", "Máslo<img>", "a{b}"} {
		if result := ValidateIngredientName(name); result.Valid {
			t.Errorf("ingredient %q accepted", name)
		}
	}
}
