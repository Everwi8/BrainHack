package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

type postGroupChatReq struct {
	MessageType string `json:"message_type"`
	MessageText string `json:"message_text"`
	Transcript  string `json:"transcript"`
	AudioURL    string `json:"audio_url"`
}

// GetGroupChatMessages returns full message history for one crisis thread.
func GetGroupChatMessages(c *gin.Context) {
	crisisID := strings.TrimSpace(c.Param("crisisID"))
	if crisisID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing crisis id"})
		return
	}

	session, err := lib.DB.GetGroupChatSessionByCrisisID(crisisID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch group chat messages"})
		return
	}
	if session == nil {
		c.JSON(http.StatusOK, gin.H{"messages": []lib.GroupChatMessage{}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"messages": session.Messages})
}

// PostGroupChatMessage appends one message to the crisis thread and persists it.
// The sender identity is always taken from the authenticated JWT user.
func PostGroupChatMessage(c *gin.Context) {
	crisisID := strings.TrimSpace(c.Param("crisisID"))
	if crisisID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing crisis id"})
		return
	}

	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user identity"})
		return
	}

	user, err := lib.DB.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	var req postGroupChatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.MessageType = strings.TrimSpace(strings.ToLower(req.MessageType))
	req.MessageText = strings.TrimSpace(req.MessageText)
	req.Transcript = strings.TrimSpace(req.Transcript)
	req.AudioURL = strings.TrimSpace(req.AudioURL)

	if req.MessageType == "" {
		if req.Transcript != "" || req.AudioURL != "" {
			req.MessageType = "voice"
		} else {
			req.MessageType = "text"
		}
	}
	if req.MessageType != "text" && req.MessageType != "voice" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message_type must be text or voice"})
		return
	}
	if req.MessageText == "" && req.Transcript == "" && req.AudioURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message cannot be empty"})
		return
	}

	session, err := lib.DB.GetOrCreateGroupChatSession(crisisID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not open group chat session"})
		return
	}

	entry := lib.GroupChatMessage{
		ID:           newGroupMessageID(),
		SenderUserID: user.ID,
		SenderName:   user.Name,
		SenderRole:   user.Role,
		MessageType:  req.MessageType,
		MessageText:  req.MessageText,
		Transcript:   req.Transcript,
		AudioURL:     req.AudioURL,
		CreatedAt:    time.Now().UTC(),
	}

	updated := append(session.Messages, entry)
	if len(updated) > 500 {
		updated = updated[len(updated)-500:]
	}
	if err := lib.DB.SaveGroupChatMessages(session.ID, updated); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save message"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":    entry,
		"session_id": session.ID,
	})
}

func newGroupMessageID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
