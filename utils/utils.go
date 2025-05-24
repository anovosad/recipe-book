// File: utils/utils.go
package utils

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"html/template"
	"io"
	"log"
	"mime/multipart"
	"os"
	"path/filepath"
	"reflect"
	"strings"
)

var Templates *template.Template

func LoadTemplates() {
	funcMap := template.FuncMap{
		"nl2br": func(text string) template.HTML {
			trimmed := strings.TrimSpace(text)
			return template.HTML(strings.ReplaceAll(template.HTMLEscapeString(trimmed), "\n", "<br>"))
		},
		"trim": func(text string) string {
			return strings.TrimSpace(text)
		},
		"add": func(a, b int) int {
			return a + b
		},
		"sub": func(a, b int) int {
			return a - b
		},
		"lt": func(a, b int) bool {
			return a < b
		},
		"gt": func(a, b int) bool {
			return a > b
		},
		"eq": func(a, b int) bool {
			return a == b
		},
		"streq": func(a, b string) bool {
			return a == b
		},
		"len": func(slice interface{}) int {
			s := reflect.ValueOf(slice)
			return s.Len()
		},
	}

	var err error
	Templates, err = template.New("").Funcs(funcMap).ParseGlob("templates/*.html")
	if err != nil {
		log.Fatal("Failed to parse templates:", err)
		return
	}

	for _, tmpl := range Templates.Templates() {
		fmt.Printf("📄 Loaded template: %s\n", tmpl.Name())
	}
}

func GenerateUniqueFilename(originalFilename string) string {
	ext := filepath.Ext(originalFilename)
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes) + ext
}

func IsValidImageFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	validExts := []string{".jpg", ".jpeg", ".png", ".gif", ".webp"}
	for _, validExt := range validExts {
		if ext == validExt {
			return true
		}
	}
	return false
}

func SaveUploadedFile(file multipart.File, header *multipart.FileHeader) (string, error) {
	if !IsValidImageFile(header.Filename) {
		return "", fmt.Errorf("invalid file type")
	}

	if header.Size > 5*1024*1024 {
		return "", fmt.Errorf("file too large")
	}

	filename := GenerateUniqueFilename(header.Filename)
	filepath := filepath.Join("uploads", filename)

	dst, err := os.Create(filepath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	_, err = io.Copy(dst, file)
	if err != nil {
		return "", err
	}

	return filename, nil
}
