// Perrin — receive messages, return AI responses from Brainy (gpt-oss-120b)
package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

type chatReq struct {
	Message   string `json:"message" binding:"required"`
	SessionID string `json:"session_id"`
}

func Chat(c *gin.Context) {
	var req chatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.SessionID == "" {
		req.SessionID = newSessionID()
	}

	reply, err := lib.ChatLLM(req.SessionID, req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"reply":      reply,
		"session_id": req.SessionID,
	})
}

func newSessionID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
