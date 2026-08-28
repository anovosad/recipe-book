// File: utils/security.go
package utils

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Input validation patterns
var (
	// Username: 3-30 chars, alphanumeric and underscore
	UsernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{3,30}$`)

	// Email validation (basic)
	EmailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

	// Recipe title: 1-200 chars, allow most characters but not HTML
	RecipeTitleRegex = regexp.MustCompile(`^[^<>]{1,200}$`)

	// Tag name: 1-50 characters, letters, numbers, spaces, hyphens.
	// \p{L} rather than a-zA-Z: the collection is used in Czech, and an ASCII
	// class rejects "Předkrm" and "Hlavní jídlo" outright.
	// '&' is allowed because the app seeds "Quick & Easy" itself; without it that
	// default tag failed its own validator and was silently dropped, leaving the
	// sample recipe that references it untagged.
	TagNameRegex = regexp.MustCompile(`^[\p{L}\p{N}\s\-&]{1,50}$`)

	// Ingredient name: 1-100 characters, letters, numbers, spaces, basic
	// punctuation. \p{L} for the same reason as tags - "Máslo" and "Žampiony"
	// are ordinary ingredient names.
	IngredientNameRegex = regexp.MustCompile(`^[\p{L}\p{N}\s\-'.,()]{1,100}$`)

	// SQL injection patterns (more comprehensive)
	SQLInjectionPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)(\bunion\s+(all\s+)?select)`),
		regexp.MustCompile(`(?i)(\bdrop\s+table)`),
		regexp.MustCompile(`(?i)(\binsert\s+into)`),
		regexp.MustCompile(`(?i)(\bdelete\s+from)`),
		regexp.MustCompile(`(?i)(\bupdate\s+.+\bset)`),
		regexp.MustCompile(`(?i)(\bexec\s*\()`),
		regexp.MustCompile(`(?i)(\bexecute\s*\()`),
		regexp.MustCompile(`(?i)(\bselect\s+.+\bfrom)`),
		regexp.MustCompile(`(?i)(;\s*drop\s+table)`),
		regexp.MustCompile(`(?i)(;\s*delete\s+from)`),
		regexp.MustCompile(`(?i)('.*--)`),
		regexp.MustCompile(`(?i)('.*#)`),
		regexp.MustCompile(`(?i)(\/\*.*\*\/)`),
		regexp.MustCompile(`(?i)(\bor\s+1\s*=\s*1)`),
		regexp.MustCompile(`(?i)(\band\s+1\s*=\s*1)`),
		regexp.MustCompile(`(?i)(\bor\s+'.*'\s*=\s*'.*')`),
		regexp.MustCompile(`(?i)(\band\s+'.*'\s*=\s*'.*')`),
	}

	// XSS patterns
	XSSPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)<script[^>]*>.*?</script>`),
		regexp.MustCompile(`(?i)<script[^>]*>`),
		regexp.MustCompile(`(?i)</script>`),
		regexp.MustCompile(`(?i)javascript:`),
		regexp.MustCompile(`(?i)vbscript:`),
		regexp.MustCompile(`(?i)onload\s*=`),
		regexp.MustCompile(`(?i)onerror\s*=`),
		regexp.MustCompile(`(?i)onclick\s*=`),
		regexp.MustCompile(`(?i)onmouseover\s*=`),
		regexp.MustCompile(`(?i)<iframe[^>]*>`),
		regexp.MustCompile(`(?i)<object[^>]*>`),
		regexp.MustCompile(`(?i)<embed[^>]*>`),
		regexp.MustCompile(`(?i)<link[^>]*>`),
		regexp.MustCompile(`(?i)<meta[^>]*>`),
	}
)

// ValidationResult represents the result of input validation
type ValidationResult struct {
	Valid   bool
	Message string
	Field   string
}

// ValidateUsername validates username input
func ValidateUsername(username string) ValidationResult {
	username = strings.TrimSpace(username)

	if len(username) == 0 {
		return ValidationResult{false, "Username is required", "username"}
	}

	if len(username) < 3 {
		return ValidationResult{false, "Username must be at least 3 characters long", "username"}
	}

	if len(username) > 30 {
		return ValidationResult{false, "Username must be no more than 30 characters long", "username"}
	}

	if !UsernameRegex.MatchString(username) {
		return ValidationResult{false, "Username can only contain letters, numbers, and underscores", "username"}
	}

	// Check for suspicious patterns
	if ContainsSQLInjection(username) {
		return ValidationResult{false, "Invalid characters in username", "username"}
	}

	return ValidationResult{true, "", "username"}
}

// ValidateEmail validates email input
func ValidateEmail(email string) ValidationResult {
	email = strings.TrimSpace(email)

	if len(email) == 0 {
		return ValidationResult{false, "Email is required", "email"}
	}

	if len(email) > 254 {
		return ValidationResult{false, "Email address is too long", "email"}
	}

	if !EmailRegex.MatchString(email) {
		return ValidationResult{false, "Please enter a valid email address", "email"}
	}

	// Check for suspicious patterns
	if ContainsSQLInjection(email) || ContainsXSS(email) {
		return ValidationResult{false, "Invalid characters in email", "email"}
	}

	return ValidationResult{true, "", "email"}
}

// ValidatePassword validates password strength
func ValidatePassword(password string) ValidationResult {
	if len(password) == 0 {
		return ValidationResult{false, "Password is required", "password"}
	}

	if len(password) < 6 {
		return ValidationResult{false, "Password must be at least 6 characters long", "password"}
	}

	if len(password) > 128 {
		return ValidationResult{false, "Password is too long", "password"}
	}

	// Check for at least one letter and one number (basic strength)
	hasLetter := false
	hasNumber := false

	for _, char := range password {
		if unicode.IsLetter(char) {
			hasLetter = true
		}
		if unicode.IsNumber(char) {
			hasNumber = true
		}
	}

	if !hasLetter || !hasNumber {
		return ValidationResult{false, "Password must contain at least one letter and one number", "password"}
	}

	return ValidationResult{true, "", "password"}
}

// ValidateRecipeTitle validates recipe title
func ValidateRecipeTitle(title string) ValidationResult {
	title = strings.TrimSpace(title)

	if utf8.RuneCountInString(title) == 0 {
		return ValidationResult{false, "Recipe title is required", "title"}
	}

	if utf8.RuneCountInString(title) > 200 {
		return ValidationResult{false, "Recipe title is too long (maximum 200 characters)", "title"}
	}

	// Only XSS patterns are checked on free-text recipe fields. Every query in the
	// database package is parameterised, so pattern-matching for SQL adds nothing
	// here while rejecting ordinary cooking prose: "Select 3 tomatoes from the
	// basket" matches the \bselect .+ \bfrom rule.
	if ContainsXSS(title) {
		return ValidationResult{false, "Invalid characters in recipe title", "title"}
	}

	if !RecipeTitleRegex.MatchString(title) {
		return ValidationResult{false, "Recipe title contains invalid characters", "title"}
	}

	return ValidationResult{true, "", "title"}
}

// ValidateRecipeDescription validates recipe description
func ValidateRecipeDescription(description string) ValidationResult {
	description = strings.TrimSpace(description)

	if utf8.RuneCountInString(description) > 1000 {
		return ValidationResult{false, "Recipe description is too long (maximum 1000 characters)", "description"}
	}

	// See ValidateRecipeTitle: XSS only, SQL is handled by parameterised queries.
	if ContainsXSS(description) {
		return ValidationResult{false, "Invalid characters in recipe description", "description"}
	}

	return ValidationResult{true, "", "description"}
}

// ValidateRecipeInstructions validates recipe instructions
func ValidateRecipeInstructions(instructions string) ValidationResult {
	instructions = strings.TrimSpace(instructions)

	if utf8.RuneCountInString(instructions) == 0 {
		return ValidationResult{false, "Recipe instructions are required", "instructions"}
	}

	if utf8.RuneCountInString(instructions) > 10000 {
		return ValidationResult{false, "Recipe instructions are too long (maximum 10,000 characters)", "instructions"}
	}

	// See ValidateRecipeTitle: XSS only, SQL is handled by parameterised queries.
	if ContainsXSS(instructions) {
		return ValidationResult{false, "Invalid characters in recipe instructions", "instructions"}
	}

	return ValidationResult{true, "", "instructions"}
}

// ValidateTagName validates tag name
func ValidateTagName(name string) ValidationResult {
	name = strings.TrimSpace(name)

	if utf8.RuneCountInString(name) == 0 {
		return ValidationResult{false, "Tag name is required", "name"}
	}

	if utf8.RuneCountInString(name) > 50 {
		return ValidationResult{false, "Tag name is too long (maximum 50 characters)", "name"}
	}

	if ContainsSQLInjection(name) || ContainsXSS(name) {
		return ValidationResult{false, "Invalid characters in tag name", "name"}
	}

	if !TagNameRegex.MatchString(name) {
		return ValidationResult{false, "Tag name can only contain letters, numbers, spaces, hyphens and &", "name"}
	}

	return ValidationResult{true, "", "name"}
}

// ValidateIngredientName validates ingredient name
func ValidateIngredientName(name string) ValidationResult {
	name = strings.TrimSpace(name)

	if utf8.RuneCountInString(name) == 0 {
		return ValidationResult{false, "Ingredient name is required", "name"}
	}

	if utf8.RuneCountInString(name) > 100 {
		return ValidationResult{false, "Ingredient name is too long (maximum 100 characters)", "name"}
	}

	if ContainsSQLInjection(name) || ContainsXSS(name) {
		return ValidationResult{false, "Invalid characters in ingredient name", "name"}
	}

	if !IngredientNameRegex.MatchString(name) {
		return ValidationResult{false, "Ingredient name contains invalid characters", "name"}
	}

	return ValidationResult{true, "", "name"}
}

// ValidateSearchQuery validates search input
func ValidateSearchQuery(query string) ValidationResult {
	query = strings.TrimSpace(query)

	if utf8.RuneCountInString(query) > 200 {
		return ValidationResult{false, "Search query is too long", "search"}
	}

	if ContainsSQLInjection(query) || ContainsXSS(query) {
		return ValidationResult{false, "Invalid characters in search query", "search"}
	}

	return ValidationResult{true, "", "search"}
}

// ContainsSQLInjection checks if input contains SQL injection patterns
func ContainsSQLInjection(input string) bool {
	for _, pattern := range SQLInjectionPatterns {
		if pattern.MatchString(input) {
			return true
		}
	}
	return false
}

// ContainsXSS checks if input contains XSS patterns
func ContainsXSS(input string) bool {
	for _, pattern := range XSSPatterns {
		if pattern.MatchString(input) {
			return true
		}
	}
	return false
}

// ValidateFileUpload validates uploaded files
func ValidateFileUpload(filename string, size int64) ValidationResult {
	if size > maxUploadFileBytes {
		return ValidationResult{false, "File is too large (maximum 5MB)", "file"}
	}

	// Check file extension
	allowedExtensions := []string{".jpg", ".jpeg", ".png", ".gif", ".webp"}
	ext := strings.ToLower(GetFileExtension(filename))

	allowed := false
	for _, allowedExt := range allowedExtensions {
		if ext == allowedExt {
			allowed = true
			break
		}
	}

	if !allowed {
		return ValidationResult{false, "Invalid file type. Only images are allowed (JPG, PNG, GIF, WebP)", "file"}
	}

	// Check filename for path traversal
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return ValidationResult{false, "Invalid filename", "file"}
	}

	return ValidationResult{true, "", "file"}
}

// GetFileExtension safely extracts file extension
func GetFileExtension(filename string) string {
	// Remove path components first
	filename = strings.Replace(filename, "\\", "/", -1)
	parts := strings.Split(filename, "/")
	filename = parts[len(parts)-1]

	// Get extension
	if dotIndex := strings.LastIndex(filename, "."); dotIndex != -1 {
		return filename[dotIndex:]
	}
	return ""
}

// ValidateNumericInput validates numeric inputs with bounds
func ValidateNumericInput(value, min, max int, fieldName string) ValidationResult {
	if value < min {
		return ValidationResult{false, fmt.Sprintf("%s must be at least %d", fieldName, min), strings.ToLower(fieldName)}
	}

	if value > max {
		return ValidationResult{false, fmt.Sprintf("%s must be no more than %d", fieldName, max), strings.ToLower(fieldName)}
	}

	return ValidationResult{true, "", strings.ToLower(fieldName)}
}

// ValidateQuantity validates recipe ingredient quantities
func ValidateQuantity(quantity float64) ValidationResult {
	if quantity <= 0 {
		return ValidationResult{false, "Quantity must be greater than 0", "quantity"}
	}

	if quantity > 10000 {
		return ValidationResult{false, "Quantity is too large", "quantity"}
	}

	return ValidationResult{true, "", "quantity"}
}

// AllowedUnits is every measurement unit a recipe line may carry, and
// AllowedServingUnits every unit a serving may be counted in. They are exported
// because the importer puts them in the JSON schema it hands the model as an
// enum - constraining the answer at the source beats correcting it afterwards -
// and a second copy of the list would drift from the one that validates.
// The frontend's MEASUREMENT_UNITS/SERVING_UNITS mirror them.
var (
	AllowedUnits = []string{
		// Volume
		"tsp", "tbsp", "cup", "ml", "l", "fl oz",
		// Weight
		"g", "kg", "oz", "lb",
		// Count
		"piece", "clove", "slice", "can", "package",
		// Other
		"pinch", "dash", "to taste",
	}

	AllowedServingUnits = []string{
		"people", "servings", "portions", "pieces", "slices", "cups", "bowls",
		"glasses", "liters", "ml", "kg", "g", "dozen", "cookies", "muffins", "pancakes",
	}
)

// ValidateUnit validates measurement units
func ValidateUnit(unit string) ValidationResult {
	unit = strings.TrimSpace(unit)

	if len(unit) == 0 {
		return ValidationResult{false, "Unit is required", "unit"}
	}

	for _, allowed := range AllowedUnits {
		if strings.EqualFold(unit, allowed) {
			return ValidationResult{true, "", "unit"}
		}
	}

	return ValidationResult{false, "Invalid unit", "unit"}
}

// ValidateServingUnit validates serving units
func ValidateServingUnit(unit string) ValidationResult {
	unit = strings.TrimSpace(unit)

	if len(unit) == 0 {
		unit = "people" // Default
	}

	for _, allowed := range AllowedServingUnits {
		if strings.EqualFold(unit, allowed) {
			return ValidationResult{true, "", "serving_unit"}
		}
	}

	return ValidationResult{false, "Invalid serving unit", "serving_unit"}
}

// LogSecurityEvent logs security-related events
func LogSecurityEvent(event, ip, details string) {
	log.Printf("🔒 SECURITY: %s from IP %s - %s", event, ip, details)
}

// IsValidID validates that an ID is a positive integer
func IsValidID(id int) bool {
	return id > 0
}
