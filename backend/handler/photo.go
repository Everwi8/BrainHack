// Perrin — photo interpretation: accept an image upload, send it to the
// vision model, and return Brainy's situation read + recommended actions.
package handler

import (
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
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

	// Persist the image to Supabase Storage so it survives reloads. Best-effort:
	// if the upload fails we still answer (the transcript just won't show the
	// image), rather than failing the whole request.
	imageURL, err := lib.DB.UploadChatImage(userID, data, mime)
	if err != nil {
		log.Printf("[chat/photo] image upload failed: %v", err)
		imageURL = ""
	}

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

	// Optional geolocation (multipart fields) for personalisation.
	lat, _ := strconv.ParseFloat(c.PostForm("lat"), 64)
	lng, _ := strconv.ParseFloat(c.PostForm("lng"), 64)

	reply, obs, updated, err := lib.VisionTurn(session.Messages, caption, dataURL, imageURL, userContext(userID, lat, lng))
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
		"image_url":  imageURL,
	}
	if obs != nil {
		// Surface the structured read so the report form can auto-fill: a factual
		// one-line caption and suggested tags, regardless of whether the photo
		// rises to an actionable crisis card.
		if obs.Description != "" {
			resp["caption"] = obs.Description
		}
		resp["tags"] = suggestPhotoTags(*obs)
		if finding, ok := lib.ObservationToFinding(*obs, caption); ok {
			resp["crisis_card"] = finding
		}
	}
	c.JSON(http.StatusOK, resp)
}

// suggestPhotoTags builds a short hashtag list from the vision observation for
// the report form's "suggested tags". Leads with the detected crisis type, adds
// a help/urgency hint, and always ends with #sg. Capped at four.
func suggestPhotoTags(obs lib.PhotoObservation) []string {
	tags := []string{}
	seen := map[string]bool{}
	add := func(t string) {
		if t != "" && !seen[t] {
			seen[t] = true
			tags = append(tags, t)
		}
	}
	if t := obs.CrisisType; t != "" && t != "none" && t != "other" {
		add("#" + strings.ReplaceAll(t, "_", ""))
	}
	if obs.PeoplePresent || obs.CrisisType == "medical" {
		add("#help")
	}
	if obs.Severity == "high" || obs.Severity == "warning" {
		add("#urgent")
	}
	add("#sg")
	if len(tags) > 4 {
		tags = tags[:4]
	}
	return tags
}
