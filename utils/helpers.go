// utils/templates.go - Remove since we're using templ now
// This file can be deleted as we no longer need html/template functionality

// utils/helpers.go - Keep utility functions but remove template-related code
package utils

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"unicode"
)

// Security event logging
func LogSecurityEvent(eventType, clientIP, details string) {
	log.Printf("[SECURITY] %s from %s: %s", eventType, clientIP, details)
}

// Input sanitization
func SanitizeInput(input string) string {
	// Remove control characters except newlines and tabs
	result := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && r != '\n' && r != '\t' {
			return -1
		}
		return r
	}, input)

	// Trim whitespace
	return strings.TrimSpace(result)
}

// Validation structures
type ValidationResult struct {
	Valid   bool
	Message string
}

// Username validation
func ValidateUsername(username string) ValidationResult {
	if len(username) < 3 {
		return ValidationResult{false, "Username must be at least 3 characters long"}
	}
	if len(username) > 50 {
		return ValidationResult{false, "Username must be no more than 50 characters long"}
	}

	// Only allow alphanumeric characters and underscores
	matched, _ := regexp.MatchString("^[a-zA-Z0-9_]+$", username)
	if !matched {
		return ValidationResult{false, "Username can only contain letters, numbers, and underscores"}
	}

	return ValidationResult{true, ""}
}

// Email validation
func ValidateEmail(email string) ValidationResult {
	if len(email) == 0 {
		return ValidationResult{false, "Email is required"}
	}
	if len(email) > 254 {
		return ValidationResult{false, "Email is too long"}
	}

	// Basic email regex
	emailRegex := `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
	matched, _ := regexp.MatchString(emailRegex, email)
	if !matched {
		return ValidationResult{false, "Please enter a valid email address"}
	}

	return ValidationResult{true, ""}
}

// Password validation
func ValidatePassword(password string) ValidationResult {
	if len(password) < 6 {
		return ValidationResult{false, "Password must be at least 6 characters long"}
	}
	if len(password) > 128 {
		return ValidationResult{false, "Password is too long"}
	}

	return ValidationResult{true, ""}
}

// Recipe title validation
func ValidateRecipeTitle(title string) ValidationResult {
	title = strings.TrimSpace(title)
	if len(title) == 0 {
		return ValidationResult{false, "Recipe title is required"}
	}
	if len(title) < 3 {
		return ValidationResult{false, "Recipe title must be at least 3 characters long"}
	}
	if len(title) > 200 {
		return ValidationResult{false, "Recipe title must be no more than 200 characters long"}
	}

	return ValidationResult{true, ""}
}

// Recipe description validation
func ValidateRecipeDescription(description string) ValidationResult {
	if len(description) > 1000 {
		return ValidationResult{false, "Recipe description must be no more than 1000 characters long"}
	}

	return ValidationResult{true, ""}
}

// Recipe instructions validation
func ValidateRecipeInstructions(instructions string) ValidationResult {
	instructions = strings.TrimSpace(instructions)
	if len(instructions) == 0 {
		return ValidationResult{false, "Cooking instructions are required"}
	}
	if len(instructions) < 10 {
		return ValidationResult{false, "Cooking instructions must be at least 10 characters long"}
	}
	if len(instructions) > 5000 {
		return ValidationResult{false, "Cooking instructions must be no more than 5000 characters long"}
	}

	return ValidationResult{true, ""}
}

// Serving unit validation
func ValidateServingUnit(unit string) ValidationResult {
	if len(unit) > 50 {
		return ValidationResult{false, "Serving unit must be no more than 50 characters long"}
	}

	// Allow alphanumeric characters, spaces, and basic punctuation
	matched, _ := regexp.MatchString("^[a-zA-Z0-9 .-]+$", unit)
	if !matched {
		return ValidationResult{false, "Serving unit contains invalid characters"}
	}

	return ValidationResult{true, ""}
}

// Numeric input validation
func ValidateNumericInput(value, min, max int, fieldName string) ValidationResult {
	if value < min {
		return ValidationResult{false, fmt.Sprintf("%s must be at least %d", fieldName, min)}
	}
	if value > max {
		return ValidationResult{false, fmt.Sprintf("%s must be no more than %d", fieldName, max)}
	}

	return ValidationResult{true, ""}
}

// Ingredient name validation
func ValidateIngredientName(name string) ValidationResult {
	name = strings.TrimSpace(name)
	if len(name) == 0 {
		return ValidationResult{false, "Ingredient name is required"}
	}
	if len(name) < 2 {
		return ValidationResult{false, "Ingredient name must be at least 2 characters long"}
	}
	if len(name) > 100 {
		return ValidationResult{false, "Ingredient name must be no more than 100 characters long"}
	}

	return ValidationResult{true, ""}
}

// Tag name validation
func ValidateTagName(name string) ValidationResult {
	name = strings.TrimSpace(name)
	if len(name) == 0 {
		return ValidationResult{false, "Tag name is required"}
	}
	if len(name) < 2 {
		return ValidationResult{false, "Tag name must be at least 2 characters long"}
	}
	if len(name) > 50 {
		return ValidationResult{false, "Tag name must be no more than 50 characters long"}
	}

	return ValidationResult{true, ""}
}

// Quantity validation
func ValidateQuantity(quantity float64) ValidationResult {
	if quantity <= 0 {
		return ValidationResult{false, "Quantity must be greater than 0"}
	}
	if quantity > 1000 {
		return ValidationResult{false, "Quantity is too large"}
	}

	return ValidationResult{true, ""}
}

// Unit validation
func ValidateUnit(unit string) ValidationResult {
	if len(unit) == 0 {
		return ValidationResult{false, "Unit is required"}
	}
	if len(unit) > 20 {
		return ValidationResult{false, "Unit name is too long"}
	}

	// List of valid units
	validUnits := []string{
		"tsp", "tbsp", "cup", "ml", "l", "fl oz",
		"g", "kg", "oz", "lb",
		"piece", "clove", "slice", "can", "package",
		"pinch", "dash", "to taste",
	}

	for _, validUnit := range validUnits {
		if unit == validUnit {
			return ValidationResult{true, ""}
		}
	}

	return ValidationResult{false, "Invalid unit"}
}

// Search query validation
func ValidateSearchQuery(query string) ValidationResult {
	if len(query) > 100 {
		return ValidationResult{false, "Search query is too long"}
	}

	// Basic sanitization - remove potential SQL injection patterns
	dangerous := []string{"'", "\"", ";", "--", "/*", "*/", "xp_", "sp_"}
	for _, pattern := range dangerous {
		if strings.Contains(strings.ToLower(query), pattern) {
			return ValidationResult{false, "Search query contains invalid characters"}
		}
	}

	return ValidationResult{true, ""}
}

// ID validation
func IsValidID(id int) bool {
	return id > 0 && id < 2147483647 // Max int32
}

// Rate limiting helpers
func GetRateLimitKey(clientIP, endpoint string) string {
	return fmt.Sprintf("%s:%s", clientIP, endpoint)
}

// Time formatting
func FormatTime(minutes int) string {
	if minutes == 0 {
		return "Not specified"
	}

	if minutes < 60 {
		return fmt.Sprintf("%d minutes", minutes)
	}

	hours := minutes / 60
	remainingMinutes := minutes % 60

	if remainingMinutes == 0 {
		if hours == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", hours)
	}

	if hours == 1 {
		return fmt.Sprintf("1 hour %d minutes", remainingMinutes)
	}
	return fmt.Sprintf("%d hours %d minutes", hours, remainingMinutes)
}
