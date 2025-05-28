// templates/helpers.go
package templates

import (
	"fmt"
	"html/template"
	"strings"
)

// nl2br converts newlines to HTML break tags
func Nl2br(text string) template.HTML {
	return template.HTML(strings.ReplaceAll(template.HTMLEscapeString(text), "\n", "<br>"))
}

// FormatTime formats minutes into a human-readable string
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
