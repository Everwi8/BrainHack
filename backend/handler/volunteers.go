// James — volunteer registration, matching, group chat, voice/STT
package handler

import (
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

const maxVoiceBytes = 12 << 20 // 12 MB

func ListVolunteers(c *gin.Context)    {}
func RegisterVolunteer(c *gin.Context) {}

func Voice(c *gin.Context) {
	fileHeader, err := c.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "audio file is required (multipart field 'audio')"})
		return
	}
	if fileHeader.Size > maxVoiceBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "audio too large (max 12 MB)"})
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "could not read uploaded audio"})
		return
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, maxVoiceBytes))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "could not read uploaded audio"})
		return
	}

	// Validate by sniffing bytes; browsers sometimes send generic octet-stream
	// for webm, and many recorder pipelines label audio notes as video/webm or
	// video/mp4 containers. Accept those when the extension is audio-like.
	mime := http.DetectContentType(data)
	filename := fileHeader.Filename
	if !isAcceptedAudioUpload(mime, filename) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "uploaded file is not a recognised audio format"})
		return
	}

	transcript, err := lib.TranscribeAudio(filename, mime, data)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(transcript) == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "transcription was empty"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"transcript": transcript,
		"reply":      "",
		"session_id": c.PostForm("session_id"),
	})
}

func hasAudioExtension(filename string) bool {
	name := strings.ToLower(filename)
	return strings.HasSuffix(name, ".webm") ||
		strings.HasSuffix(name, ".wav") ||
		strings.HasSuffix(name, ".mp3") ||
		strings.HasSuffix(name, ".m4a") ||
		strings.HasSuffix(name, ".ogg") ||
		strings.HasSuffix(name, ".mp4")
}

func isAcceptedAudioUpload(mime, filename string) bool {
	if strings.HasPrefix(mime, "audio/") {
		return true
	}

	// Common recorder container labels for audio-only recordings.
	if mime == "video/webm" || mime == "video/mp4" {
		return hasAudioExtension(filename)
	}

	// Some browsers/proxies strip the specific content type.
	if mime == "application/octet-stream" || mime == "application/ogg" {
		return hasAudioExtension(filename)
	}

	return false
}
