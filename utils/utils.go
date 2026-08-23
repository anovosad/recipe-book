// File: utils/utils.go
package utils

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
)

// maxUploadFileBytes is the per-file upload ceiling, mirrored by
// ValidateFileUpload so both the check and the copy agree on the limit.
const maxUploadFileBytes = 5 * 1024 * 1024

// GenerateUniqueFilename builds a random storage name, keeping the original
// extension. The randomness is what keeps two uploads from landing on the same
// path, so a failed read has to be an error rather than an all-zero name.
func GenerateUniqueFilename(originalFilename string) (string, error) {
	ext := filepath.Ext(originalFilename)

	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("could not generate a filename: %w", err)
	}

	return hex.EncodeToString(bytes) + ext, nil
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

	if header.Size > maxUploadFileBytes {
		return "", fmt.Errorf("file too large")
	}

	filename, err := GenerateUniqueFilename(header.Filename)
	if err != nil {
		return "", err
	}

	destination := filepath.Join("uploads", filename)

	dst, err := os.Create(destination)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	// Bound the copy by the declared size instead of trusting the stream to end.
	if _, err := io.Copy(dst, io.LimitReader(file, maxUploadFileBytes)); err != nil {
		os.Remove(destination)
		return "", err
	}

	return filename, nil
}
