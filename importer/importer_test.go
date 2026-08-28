package importer

import (
	"net"
	"strings"
	"testing"
)

// The address check is the whole SSRF defence: the URL comes from a user and
// the server is the one connecting. Every address here has been used to reach
// something a recipe importer has no business reaching.
func TestBlockedIPCoversPrivateSpace(t *testing.T) {
	blocked := []string{
		"127.0.0.1",           // loopback
		"::1",                 // loopback, v6
		"::ffff:127.0.0.1",    // loopback wearing a v6 address
		"0.0.0.0",             // unspecified
		"10.1.2.3",            // RFC1918
		"172.16.0.5",          // RFC1918
		"192.168.1.10",        // RFC1918 - the LAN this app is deployed on
		"169.254.169.254",     // cloud instance metadata
		"fd00::1",             // unique local
		"fe80::1",             // link-local
		"100.64.0.1",          // carrier-grade NAT
		"::ffff:192.168.1.10", // RFC1918 wearing a v6 address
		"64:ff9b::7f00:1",     // NAT64, which maps onto 127.0.0.1
		"224.0.0.1",           // multicast
	}
	for _, address := range blocked {
		if !blockedIP(net.ParseIP(address)) {
			t.Errorf("blockedIP(%s) = false, want true", address)
		}
	}

	allowed := []string{"1.1.1.1", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"}
	for _, address := range allowed {
		if blockedIP(net.ParseIP(address)) {
			t.Errorf("blockedIP(%s) = true, want false", address)
		}
	}
}

func TestParsePublicURL(t *testing.T) {
	// A bare hostname is what someone pastes; reading it as https is the only
	// useful interpretation.
	parsed, err := parsePublicURL("example.com/recipes/1")
	if err != nil {
		t.Fatalf("bare hostname rejected: %v", err)
	}
	if parsed.Scheme != "https" {
		t.Errorf("scheme = %q, want https", parsed.Scheme)
	}

	// Credentials would be forwarded to whatever the page redirects to.
	parsed, err = parsePublicURL("https://user:secret@example.com/r")
	if err != nil {
		t.Fatalf("credentialled URL rejected outright: %v", err)
	}
	if parsed.User != nil {
		t.Errorf("credentials survived: %q", parsed.String())
	}

	for _, bad := range []string{
		"", "   ",
		"file:///etc/passwd",
		"gopher://example.com/",
		"javascript:alert(1)",
		"http://127.0.0.1:8080/admin",
		"http://169.254.169.254/latest/meta-data/",
	} {
		if _, err := parsePublicURL(bad); err == nil {
			t.Errorf("parsePublicURL(%q) accepted it", bad)
		} else if !isInputError(err) {
			t.Errorf("parsePublicURL(%q) failed with a non-input error: %v", bad, err)
		}
	}
}

// Most recipe sites publish schema.org data, and reading it is what keeps the
// model translating rather than guessing which paragraph was a step. The shapes
// below are all in the wild: an @graph wrapper, HowToStep objects, and steps
// grouped into HowToSections.
func TestExtractReadsJSONLD(t *testing.T) {
	page := `<html><head>
	<script type="application/ld+json">
	{"@context":"https://schema.org","@graph":[
	  {"@type":"WebSite","name":"Some Blog"},
	  {"@type":["Recipe","Thing"],
	   "name":"Pancakes",
	   "description":"<p>Fluffy &amp; quick</p>",
	   "prepTime":"PT10M","cookTime":"PT15M","recipeYield":4,
	   "keywords":["breakfast","easy"],
	   "recipeIngredient":["2 cups flour","1 lb butter"],
	   "recipeInstructions":[
	     {"@type":"HowToSection","name":"Batter","itemListElement":[
	        {"@type":"HowToStep","text":"Whisk the flour."}]},
	     {"@type":"HowToStep","text":"Fry until golden."}]}
	]}
	</script></head><body><nav>Home About</nav><p>ignored</p></body></html>`

	doc := extract(page)
	if !doc.Structured {
		t.Fatalf("structured data was not found; text was:\n%s", doc.Text)
	}

	for _, want := range []string{
		"TITLE: Pancakes",
		"Fluffy & quick", // entities decoded, markup stripped
		"PREP TIME: PT10M",
		"YIELD: 4", // a JSON number, not a string
		"KEYWORDS: breakfast, easy",
		"- 2 cups flour",
		"- 1 lb butter",
		"- Batter:",          // the section heading survives
		"- Whisk the flour.", // nested inside the section
		"- Fry until golden.",
	} {
		if !strings.Contains(doc.Text, want) {
			t.Errorf("rendered block is missing %q; got:\n%s", want, doc.Text)
		}
	}
	if strings.Contains(doc.Text, "Home About") {
		t.Error("page navigation leaked into the structured block")
	}
}

// A JSON-LD block with no ingredients is not usable, and the page text does
// better than half a record.
func TestExtractFallsBackToPageText(t *testing.T) {
	page := `<html><head>
	<script type="application/ld+json">{"@type":"Recipe","name":"Nothing"}</script>
	<style>.a{color:red}</style></head>
	<body><nav>Home | About</nav>
	<h1>Guláš</h1><p>500 g hovězího</p>
	<script>var tracker = "</script> not really the end";</script>
	<footer>Copyright</footer></body></html>`

	doc := extract(page)
	if doc.Structured {
		t.Fatal("an ingredient-less Recipe block was treated as usable")
	}
	if !strings.Contains(doc.Text, "Guláš") || !strings.Contains(doc.Text, "500 g hovězího") {
		t.Errorf("the recipe text was lost; got:\n%s", doc.Text)
	}
	for _, unwanted := range []string{"color:red", "Home | About", "Copyright", "tracker"} {
		if strings.Contains(doc.Text, unwanted) {
			t.Errorf("%q survived the strip; got:\n%s", unwanted, doc.Text)
		}
	}
}

// A refusal should say which kind it is. Plenty of recipe sites sit behind bot
// protection, and "there is no page at that address" would send someone
// re-checking a URL that was right all along.
func TestDescribeStatus(t *testing.T) {
	cases := map[int]string{
		404: "no page at that address",
		410: "no page at that address",
		403: "refuses automated readers",
		401: "refuses automated readers",
		429: "slow down",
		503: "trouble of its own",
		402: "answered 402",
	}
	for code, want := range cases {
		err := describeStatus(code)
		if !isInputError(err) {
			t.Errorf("describeStatus(%d) is not an input error", code)
		}
		if !strings.Contains(err.Error(), want) {
			t.Errorf("describeStatus(%d) = %q, want it to mention %q", code, err, want)
		}
	}
}

// A name the validator would refuse loses the offending character rather than
// the whole ingredient - and a Czech name must survive intact, which is the
// property the \p{L} classes exist for.
func TestSanitizeName(t *testing.T) {
	cases := []struct {
		in      string
		allowed func(rune) bool
		limit   int
		want    string
	}{
		{"Mouka: hladká", ingredientRune, 100, "Mouka hladká"},
		{"Máslo (změklé)", ingredientRune, 100, "Máslo (změklé)"},
		{"Sůl / pepř", ingredientRune, 100, "Sůl pepř"},
		{"Hlavní jídlo", tagRune, 50, "Hlavní jídlo"},
		{"Maso & ryby", tagRune, 50, "Maso & ryby"},
		{"Dezert (sladký)", tagRune, 50, "Dezert sladký"}, // parens are not tag-legal
		{"Sůl a pepř", ingredientRune, 100, "Sůl a pepř"}, // non-breaking spaces
	}
	for _, c := range cases {
		if got := sanitizeName(c.in, c.allowed, c.limit); got != c.want {
			t.Errorf("sanitizeName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// Lengths are counted in runes because the database counts characters: a Czech
// name cut at a byte boundary is both wrong and invalid UTF-8.
func TestTruncateRunesCountsCharacters(t *testing.T) {
	if got := truncateRunes("ěščřžýáíé", 4); got != "ěščř" {
		t.Errorf("truncateRunes = %q, want %q", got, "ěščř")
	}
	if got := truncateRunes("short", 50); got != "short" {
		t.Errorf("truncateRunes shortened a string under the limit: %q", got)
	}
}
