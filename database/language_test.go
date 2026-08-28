package database

import "testing"

// The language a stored recipe was written in had to be guessed once, at
// migration time, because nothing recorded it. The guess is decided by Czech's
// own letters: their presence is conclusive, their absence is not, which is why
// English is the default rather than the detected case.
func TestLooksCzech(t *testing.T) {
	czech := []string{
		"Špagety carbonara",
		"Uvařte těstoviny",
		"Klasické italské jídlo",
		"Máslo",
		"Předkrm",
	}
	for _, text := range czech {
		if !looksCzech(text) {
			t.Errorf("looksCzech(%q) = false, want true", text)
		}
	}

	english := []string{
		"Classic Margherita Pizza",
		"Fluffy Buttermilk Pancakes",
		"Butter",
		"Cook the pasta until al dente",
	}
	for _, text := range english {
		if looksCzech(text) {
			t.Errorf("looksCzech(%q) = true, want false", text)
		}
	}
}

// Every read takes a language straight from a query string, so an unknown one
// must land somewhere safe rather than reaching a query and matching nothing -
// which would leave a recipe with no title at all.
func TestNormalizeLanguage(t *testing.T) {
	cases := map[string]string{
		"cs":      "cs",
		"CS":      "cs",
		"  cs  ":  "cs",
		"en":      "en",
		"sk":      "cs", // Slovak reads Czech far more comfortably than English
		"de":      DefaultLanguage,
		"":        DefaultLanguage,
		"'; DROP": DefaultLanguage,
	}
	for given, want := range cases {
		if got := NormalizeLanguage(given); got != want {
			t.Errorf("NormalizeLanguage(%q) = %q, want %q", given, got, want)
		}
	}
}

// The seed dictionary is what lets the migration rename a hand-translated
// collection back onto an English canonical without an API call. A duplicate
// English target is fine (two Czech names can mean one thing), but a key that
// is not lowercase can never match, since lookup lowercases the stored name.
func TestSeedTranslationsAreLookupReady(t *testing.T) {
	for czech, english := range seedTranslations {
		if czech != lower(czech) {
			t.Errorf("seedTranslations key %q is not lowercase, so it can never match", czech)
		}
		if english == "" {
			t.Errorf("seedTranslations[%q] is empty", czech)
		}
		if looksCzech(english) {
			t.Errorf("seedTranslations[%q] = %q, which is not English", czech, english)
		}
	}
}

func lower(s string) string {
	out := []rune(s)
	for i, r := range out {
		if r >= 'A' && r <= 'Z' {
			out[i] = r + 32
		}
	}
	return string(out)
}
