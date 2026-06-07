// Perrin — receive messages, return AI responses from Brainy, and manage the
// per-user chat sessions that back the "previous chats" sidebar.
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

// defaultChatTitle is the placeholder a session carries until the first user
// message gives it a real, human-readable title.
const defaultChatTitle = "New chat"

type chatReq struct {
	Message   string `json:"message" binding:"required"`
	SessionID string `json:"session_id"`
}

// deriveTitle turns the first user message into a short session title.
func deriveTitle(msg string) string {
	const maxLen = 48
	title := ""
	for _, r := range msg {
		if r == '\n' || r == '\r' {
			break
		}
		title += string(r)
	}
	if len([]rune(title)) > maxLen {
		title = string([]rune(title)[:maxLen]) + "…"
	}
	if title == "" {
		return defaultChatTitle
	}
	return title
}

// resolveSession returns the session named by sessionID (verifying it belongs to
// userID), or creates a fresh one when sessionID is empty. The ownership check
// in GetChatSession is what stops a user from addressing another's chat.
func resolveSession(userID, sessionID, newTitle string) (*lib.ChatSession, error) {
	if sessionID == "" {
		return lib.DB.CreateChatSession(userID, newTitle)
	}
	return lib.DB.GetChatSession(sessionID, userID)
}

func Chat(c *gin.Context) {
	var req chatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")
	session, err := resolveSession(userID, req.SessionID, deriveTitle(req.Message))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "chat session not found"})
		return
	}

	reply, updated, err := lib.ChatTurn(session.Messages, req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Give an untitled session a title from its first message.
	title := session.Title
	if title == "" || title == defaultChatTitle {
		title = deriveTitle(req.Message)
	}
	if err := lib.DB.SaveChatMessages(session.ID, updated, title); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"reply":      reply,
		"session_id": session.ID,
		"title":      title,
	})
}

// ListChatSessions returns the authenticated user's conversations (no transcripts).
func ListChatSessions(c *gin.Context) {
	sessions, err := lib.DB.ListChatSessions(c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

// CreateChatSession opens a fresh empty conversation for the user.
func CreateChatSession(c *gin.Context) {
	session, err := lib.DB.CreateChatSession(c.GetString("userID"), defaultChatTitle)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": session.ID, "title": session.Title})
}

// GetChatSession returns one conversation's transcript, mapped to the shape the
// chat UI renders (role "user"/"bot", text). Ownership is enforced in the query.
func GetChatSession(c *gin.Context) {
	session, err := lib.DB.GetChatSession(c.Param("id"), c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "chat session not found"})
		return
	}

	msgs := make([]gin.H, 0, len(session.Messages))
	for i, m := range session.Messages {
		role := "bot"
		if m.Role == "user" {
			role = "user"
		}
		msgs = append(msgs, gin.H{"id": i + 1, "role": role, "text": m.Content})
	}

	c.JSON(http.StatusOK, gin.H{
		"id":       session.ID,
		"title":    session.Title,
		"messages": msgs,
	})
}

// DeleteChatSession removes one of the user's conversations.
func DeleteChatSession(c *gin.Context) {
	if err := lib.DB.DeleteChatSession(c.Param("id"), c.GetString("userID")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
