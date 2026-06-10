// Perrin — receive messages, return AI responses from Brainy, and manage the
// per-user chat sessions that back the "previous chats" sidebar.
package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

// defaultChatTitle is the placeholder a session carries until the first user
// message gives it a real, human-readable title.
const defaultChatTitle = "New chat"

type chatReq struct {
	Message   string  `json:"message" binding:"required"`
	SessionID string  `json:"session_id"`
	Lat       float64 `json:"lat"` // optional: caller's geolocation, for personalisation
	Lng       float64 `json:"lng"`
	Lang      string  `json:"lang"` // optional: preferred reply language code (e.g. "zh")
}

// userContext builds the personalisation passed to Brainy: the caller's first
// name (from the users table), a rough area derived from optional lat/lng, and
// the preferred reply language. Any piece we can't resolve is left blank.
func userContext(userID string, lat, lng float64, lang string) lib.UserContext {
	uc := lib.UserContext{Area: lib.LocationLabel(lat, lng), Lang: lang}
	if u, err := lib.DB.GetUserByID(userID); err == nil && u != nil {
		uc.Name = firstName(u.Name)
		// Fall back to the saved account preference when the request omits one,
		// so Brainy honours the stored language even on entrypoints that don't
		// pass it explicitly.
		if uc.Lang == "" {
			uc.Lang = u.Language
		}
	}
	return uc
}

// firstName returns the leading token of a full name (Brainy addresses users by
// first name), or the trimmed input when there is no space.
func firstName(name string) string {
	name = strings.TrimSpace(name)
	if i := strings.IndexByte(name, ' '); i > 0 {
		return name[:i]
	}
	return name
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

	clean, err := lib.ValidateUserInput(req.Message)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Message = clean

	userID := c.GetString("userID")
	session, err := resolveSession(userID, req.SessionID, deriveTitle(req.Message))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "chat session not found"})
		return
	}

	reply, updated, err := lib.ChatTurn(session.Messages, req.Message, userContext(userID, req.Lat, req.Lng, req.Lang))
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

// ChatStream is the streaming counterpart of Chat: it answers over Server-Sent
// Events, pushing each token as it is generated so the UI renders the reply as
// it streams instead of waiting for the whole completion. It emits three event
// types — "token" {text}, "error" {error}, and a final "done" {reply,
// session_id, title} — then persists the full turn just like Chat. Request
// validation and session resolution happen before any SSE bytes are written, so
// those failures can still return a normal JSON error.
func ChatStream(c *gin.Context) {
	var req chatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate before opening the SSE stream so injection/length errors come
	// back as plain JSON (not mid-stream SSE events).
	clean, err := lib.ValidateUserInput(req.Message)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Message = clean

	userID := c.GetString("userID")
	session, err := resolveSession(userID, req.SessionID, deriveTitle(req.Message))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "chat session not found"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // tell proxies not to buffer the stream

	onToken := func(tok string) {
		c.SSEvent("token", gin.H{"text": tok})
		c.Writer.Flush()
	}

	reply, updated, err := lib.ChatTurnStream(session.Messages, req.Message, userContext(userID, req.Lat, req.Lng, req.Lang), onToken)
	if err != nil {
		c.SSEvent("error", gin.H{"error": err.Error()})
		c.Writer.Flush()
		return
	}

	// Give an untitled session a title from its first message.
	title := session.Title
	if title == "" || title == defaultChatTitle {
		title = deriveTitle(req.Message)
	}
	if err := lib.DB.SaveChatMessages(session.ID, updated, title); err != nil {
		c.SSEvent("error", gin.H{"error": err.Error()})
		c.Writer.Flush()
		return
	}

	c.SSEvent("done", gin.H{"reply": reply, "session_id": session.ID, "title": title})
	c.Writer.Flush()
}

// crisisChatReq is the Crisis Detail drawer's payload: a question plus the
// recent on-screen conversation for continuity. Stateless — not persisted.
type crisisChatReq struct {
	Message string             `json:"message" binding:"required"`
	History []lib.ChatTurnLite `json:"history"`
}

// CrisisChat answers a question on a specific crisis's detail page, grounded in
// that crisis's data, sensors, volunteer tasks and the live triage snapshot.
// Public (the crisis detail page is a public read) and stateless.
func CrisisChat(c *gin.Context) {
	id := c.Param("id")
	crisis, err := lib.DB.GetCrisisByID(id)
	if err != nil || crisis == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "crisis not found"})
		return
	}

	var req crisisChatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	clean, err := lib.ValidateUserInput(req.Message)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Message = clean

	reply, err := lib.GenerateBrainyCrisisReply(crisis, req.History, req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"reply": reply})
}

// CrisisChatPhoto answers a photo sent in the Crisis Detail drawer, grounded in
// that crisis. Multipart: image (required), caption, history (JSON string).
// Auth-gated (vision is costly); stateless — nothing is persisted.
func CrisisChatPhoto(c *gin.Context) {
	id := c.Param("id")
	crisis, err := lib.DB.GetCrisisByID(id)
	if err != nil || crisis == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "crisis not found"})
		return
	}

	dataURL, ok := readImageDataURL(c)
	if !ok {
		return // readImageDataURL already wrote the error
	}

	// History arrives as a JSON-encoded string (multipart can't nest arrays).
	var history []lib.ChatTurnLite
	if raw := c.PostForm("history"); raw != "" {
		_ = json.Unmarshal([]byte(raw), &history)
	}

	caption := c.PostForm("caption")
	if caption != "" {
		if caption, err = lib.ValidateUserInput(caption); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	reply, err := lib.GenerateBrainyCrisisPhotoReply(crisis, history, caption, dataURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"reply": reply})
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
		msgs = append(msgs, gin.H{"id": i + 1, "role": role, "text": m.Content, "imageUrl": m.ImageURL})
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
