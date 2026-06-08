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

func ListVolunteers(c *gin.Context) {}

// SkillCatalog returns the canonical skill options for the volunteer profile
// form (slug + display label). Public — the form needs it before login completes.
func SkillCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"skills": lib.VolunteerSkillCatalog})
}

type volunteerProfileReq struct {
	Skills    []string `json:"skills"`
	Lat       *float64 `json:"lat"`
	Lng       *float64 `json:"lng"`
	Available *bool    `json:"available"`
}

// GetMyVolunteer returns the caller's volunteer profile (skills, availability,
// location). `configured` is false until they've saved at least one skill, which
// the "find my match" flow uses to decide whether to prompt the skills form.
func GetMyVolunteer(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user identity"})
		return
	}
	v, err := lib.DB.GetVolunteerByUser(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch profile"})
		return
	}
	if v == nil {
		c.JSON(http.StatusOK, gin.H{"skills": []string{}, "available": true, "configured": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"skills":     v.Skills,
		"available":  v.Available,
		"lat":        v.Lat,
		"lng":        v.Lng,
		"configured": len(v.Skills) > 0,
	})
}

// RegisterVolunteer creates or updates the caller's volunteer profile (skills +
// optional location/availability) — the data the match flow scores tasks against.
func RegisterVolunteer(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user identity"})
		return
	}
	var req volunteerProfileReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	available := true
	if req.Available != nil {
		available = *req.Available
	}
	v, err := lib.DB.UpsertVolunteer(lib.Volunteer{
		UserID:    userID,
		Skills:    lib.NormaliseSkills(req.Skills),
		Lat:       req.Lat,
		Lng:       req.Lng,
		Available: available,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save profile"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"skills": v.Skills, "available": v.Available, "configured": len(v.Skills) > 0})
}

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
