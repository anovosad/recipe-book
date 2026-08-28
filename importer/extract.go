package importer

import (
	"encoding/json"
	htmlstd "html"
	"strings"
	"unicode/utf8"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// maxDocumentRunes caps what is handed to the model. A recipe sits near the top
// of a page; the rest is comments and cross-promotion.
const maxDocumentRunes = 40000

// document is what the model is shown, and how it was obtained.
//
// Structured is the interesting bit: when a page carries schema.org Recipe data
// - and most recipe sites do - the ingredients, the steps and the times are
// already labelled, so the model translates and converts rather than guessing
// which paragraph was a step. It is both cheaper and markedly more accurate,
// which is why the JSON-LD path is tried first and the stripped page text is
// only the fallback.
type document struct {
	Text       string
	Structured bool
}

func extract(page string) document {
	if block, ok := extractJSONLD(page); ok {
		return document{Text: truncateRunes(block, maxDocumentRunes), Structured: true}
	}
	return document{Text: truncateRunes(pageText(page), maxDocumentRunes), Structured: false}
}

// ---------------------------------------------------------------- JSON-LD ---

// extractJSONLD looks for a schema.org Recipe in the page's ld+json blocks and
// renders it as a labelled block. Sites bury the recipe at every depth - inside
// an @graph, inside a top-level array, inside another entity - so the search is
// a plain recursive walk rather than an assumption about shape.
func extractJSONLD(page string) (string, bool) {
	for _, script := range scriptsOfType(page, "application/ld+json") {
		var parsed any
		if err := json.Unmarshal([]byte(script), &parsed); err != nil {
			continue
		}
		if recipe, ok := findRecipe(parsed); ok {
			if rendered := renderRecipe(recipe); rendered != "" {
				return rendered, true
			}
		}
	}
	return "", false
}

func findRecipe(node any) (map[string]any, bool) {
	switch value := node.(type) {
	case map[string]any:
		if hasType(value["@type"], "Recipe") {
			return value, true
		}
		for _, child := range value {
			if found, ok := findRecipe(child); ok {
				return found, true
			}
		}
	case []any:
		for _, child := range value {
			if found, ok := findRecipe(child); ok {
				return found, true
			}
		}
	}
	return nil, false
}

func hasType(node any, want string) bool {
	switch value := node.(type) {
	case string:
		return strings.EqualFold(value, want)
	case []any:
		for _, item := range value {
			if hasType(item, want) {
				return true
			}
		}
	}
	return false
}

func renderRecipe(recipe map[string]any) string {
	var out strings.Builder

	label := func(name string, value string) {
		if value = strings.TrimSpace(value); value != "" {
			out.WriteString(name + ": " + value + "\n")
		}
	}

	label("TITLE", plainString(recipe["name"]))
	label("DESCRIPTION", plainString(recipe["description"]))
	label("YIELD", plainString(recipe["recipeYield"]))
	// ISO-8601 durations, passed through as written. The model reads PT1H30M
	// perfectly well and this keeps one less parser in the path.
	label("PREP TIME", plainString(recipe["prepTime"]))
	label("COOK TIME", plainString(recipe["cookTime"]))
	label("TOTAL TIME", plainString(recipe["totalTime"]))
	label("CATEGORY", plainString(recipe["recipeCategory"]))
	label("CUISINE", plainString(recipe["recipeCuisine"]))
	label("KEYWORDS", plainString(recipe["keywords"]))

	ingredients := flattenStrings(recipe["recipeIngredient"])
	if len(ingredients) == 0 {
		// Without ingredients this is not usable as structured data, and the
		// page text will do better.
		return ""
	}
	out.WriteString("\nINGREDIENTS:\n")
	for _, line := range ingredients {
		out.WriteString("- " + line + "\n")
	}

	steps := flattenInstructions(recipe["recipeInstructions"])
	if len(steps) == 0 {
		return ""
	}
	out.WriteString("\nINSTRUCTIONS:\n")
	for _, step := range steps {
		out.WriteString("- " + step + "\n")
	}

	return out.String()
}

// flattenInstructions copes with every shape the schema allows: a single block
// of prose, a list of strings, a list of HowToStep objects, or HowToSections
// each holding their own list of steps.
func flattenInstructions(node any) []string {
	switch value := node.(type) {
	case string:
		return splitLines(stripTags(value))
	case []any:
		var steps []string
		for _, item := range value {
			steps = append(steps, flattenInstructions(item)...)
		}
		return steps
	case map[string]any:
		if nested, ok := value["itemListElement"]; ok {
			var steps []string
			if name := plainString(value["name"]); name != "" {
				steps = append(steps, name+":")
			}
			return append(steps, flattenInstructions(nested)...)
		}
		for _, key := range []string{"text", "name", "description"} {
			if text := plainString(value[key]); text != "" {
				return []string{text}
			}
		}
	}
	return nil
}

func flattenStrings(node any) []string {
	switch value := node.(type) {
	case string:
		if text := plainString(value); text != "" {
			return []string{text}
		}
	case []any:
		var all []string
		for _, item := range value {
			all = append(all, flattenStrings(item)...)
		}
		return all
	case map[string]any:
		if text := plainString(value["name"]); text != "" {
			return []string{text}
		}
	}
	return nil
}

// plainString renders a JSON-LD value as one line of text. Numbers show up in
// recipeYield, arrays in keywords, and objects wherever a site has been clever.
func plainString(node any) string {
	switch value := node.(type) {
	case string:
		return strings.Join(strings.Fields(stripTags(value)), " ")
	case float64:
		// json.Marshal already writes the shortest form: 4, 40, 1.5.
		return formatFloat(value)
	case bool:
		return ""
	case []any:
		var parts []string
		for _, item := range value {
			if text := plainString(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, ", ")
	case map[string]any:
		return plainString(value["name"])
	}
	return ""
}

// ------------------------------------------------------------- page text ---

// pageText strips a page down to what a reader would see. The tags carrying
// navigation, scripts and styling are dropped whole - their text is noise that
// costs tokens and gives the model more chances to mistake a menu item for an
// ingredient.
func pageText(page string) string {
	skipped := map[atom.Atom]bool{
		atom.Script: true, atom.Style: true, atom.Noscript: true,
		atom.Nav: true, atom.Header: true, atom.Footer: true,
		atom.Aside: true, atom.Form: true, atom.Svg: true,
		atom.Iframe: true, atom.Template: true, atom.Select: true,
	}
	breaks := map[atom.Atom]bool{
		atom.P: true, atom.Div: true, atom.Li: true, atom.Br: true,
		atom.Tr: true, atom.Section: true, atom.Article: true,
		atom.H1: true, atom.H2: true, atom.H3: true, atom.H4: true,
		atom.H5: true, atom.H6: true, atom.Ul: true, atom.Ol: true,
		atom.Table: true, atom.Dt: true, atom.Dd: true, atom.Blockquote: true,
	}

	var out strings.Builder
	depth := 0 // how many skipped elements we are inside
	tokenizer := html.NewTokenizer(strings.NewReader(page))

	for {
		switch tokenizer.Next() {
		case html.ErrorToken:
			return collapseBlankLines(out.String())

		case html.StartTagToken:
			name, _ := tokenizer.TagName()
			tag := atom.Lookup(name)
			if skipped[tag] {
				depth++
			} else if breaks[tag] {
				out.WriteByte('\n')
			}

		case html.EndTagToken:
			name, _ := tokenizer.TagName()
			tag := atom.Lookup(name)
			if skipped[tag] {
				if depth > 0 {
					depth--
				}
			} else if breaks[tag] {
				out.WriteByte('\n')
			}

		case html.SelfClosingTagToken:
			name, _ := tokenizer.TagName()
			if breaks[atom.Lookup(name)] {
				out.WriteByte('\n')
			}

		case html.TextToken:
			if depth > 0 {
				continue
			}
			// Text() has already resolved entities.
			if text := strings.Join(strings.Fields(string(tokenizer.Text())), " "); text != "" {
				out.WriteString(text)
				out.WriteByte(' ')
			}
		}
	}
}

// scriptsOfType returns the bodies of every <script> whose type attribute
// matches, using the tokenizer rather than a regex so that a `</script>` inside
// a JSON string cannot end the block early.
func scriptsOfType(page, wantType string) []string {
	var found []string
	tokenizer := html.NewTokenizer(strings.NewReader(page))

	for {
		switch tokenizer.Next() {
		case html.ErrorToken:
			return found

		case html.StartTagToken:
			name, hasAttr := tokenizer.TagName()
			if atom.Lookup(name) != atom.Script {
				continue
			}
			matches := false
			for hasAttr {
				var key, value []byte
				key, value, hasAttr = tokenizer.TagAttr()
				if string(key) == "type" &&
					strings.EqualFold(strings.TrimSpace(string(value)), wantType) {
					matches = true
				}
			}
			if !matches {
				continue
			}
			if tokenizer.Next() == html.TextToken {
				found = append(found, string(tokenizer.Text()))
			}
		}
	}
}

// ---------------------------------------------------------------- helpers ---

// stripTags removes markup from a value that is meant to be text. Sites put
// <p> and <br> inside JSON-LD description and instruction strings routinely.
func stripTags(value string) string {
	if !strings.Contains(value, "<") {
		return htmlstd.UnescapeString(value)
	}

	var out strings.Builder
	tokenizer := html.NewTokenizer(strings.NewReader(value))
	for {
		switch tokenizer.Next() {
		case html.ErrorToken:
			return strings.TrimSpace(out.String())
		case html.TextToken:
			out.Write(tokenizer.Text())
		case html.StartTagToken, html.EndTagToken, html.SelfClosingTagToken:
			out.WriteByte(' ')
		}
	}
}

func splitLines(text string) []string {
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		if trimmed := strings.Join(strings.Fields(line), " "); trimmed != "" {
			lines = append(lines, trimmed)
		}
	}
	return lines
}

func collapseBlankLines(text string) string {
	var kept []string
	blank := false
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			if blank {
				continue
			}
			blank = true
		} else {
			blank = false
		}
		kept = append(kept, line)
	}
	return strings.TrimSpace(strings.Join(kept, "\n"))
}

func truncateRunes(text string, limit int) string {
	if utf8.RuneCountInString(text) <= limit {
		return text
	}
	count := 0
	for index := range text {
		if count == limit {
			return text[:index]
		}
		count++
	}
	return text
}

func formatFloat(value float64) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(encoded)
}
