// Perrin — photo interpretation: accept an image upload, send it to the
// vision model, and return Brainy's situation read + recommended actions.
package handler

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

// maxPhotoBytes caps upload size to keep base64 payloads within model limits.
const maxPhotoBytes = 8 << 20 // 8 MB

func ChatPhoto(c *gin.Context) {
	fileHeader, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required (multipart field 'image')"})
		return
	}
	if fileHeader.Size > maxPhotoBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "image too large (max 8 MB)"})
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "could not read uploaded image"})
		return
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, maxPhotoBytes))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "could not read uploaded image"})
		return
	}

	// Sniff the actual bytes rather than trusting the client-supplied
	// Content-Type, so the data URL's MIME matches the real image format and
	// mislabelled (or non-image) uploads are rejected before hitting the model.
	mime := http.DetectContentType(data)
	if !strings.HasPrefix(mime, "image/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "uploaded file is not a recognised image"})
		return
	}

	dataURL := fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(data))

	caption := c.PostForm("caption")
	userID := c.GetString("userID")

	// Title a photo-started session from the caption, or a sensible default.
	newTitle := deriveTitle(caption)
	if newTitle == defaultChatTitle {
		newTitle = "Photo report"
	}
	session, err := resolveSession(userID, c.PostForm("session_id"), newTitle)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "chat session not found"})
		return
	}

	reply, obs, updated, err := lib.VisionTurn(session.Messages, caption, dataURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	title := session.Title
	if title == "" || title == defaultChatTitle {
		title = newTitle
	}
	if err := lib.DB.SaveChatMessages(session.ID, updated, title); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resp := gin.H{
		"reply":      reply,
		"session_id": session.ID,
		"title":      title,
	}
	if obs != nil {
		if finding, ok := lib.ObservationToFinding(*obs, caption); ok {
			resp["crisis_card"] = finding
		}
	}
	c.JSON(http.StatusOK, resp)
}
