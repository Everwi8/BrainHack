package handler

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"log"
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
	ImageURL    string `json:"image_url"`
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

	entry, verr := prepareGroupMessage(req, user)
	if verr != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": verr})
		return
	}

	session, err := lib.DB.GetOrCreateGroupChatSession(crisisID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not open group chat session"})
		return
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

// UploadGroupChatImage stores one image and returns its public URL for use in a
// subsequent /groupchat/:crisisID/messages POST.
func UploadGroupChatImage(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user identity"})
		return
	}

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

	mime := http.DetectContentType(data)
	if !strings.HasPrefix(mime, "image/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "uploaded file is not a recognised image"})
		return
	}

	imageURL, err := lib.DB.UploadChatImage(userID, data, mime)
	if err != nil {
		log.Printf("[groupchat/image] image upload failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not upload image"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"image_url": imageURL})
}

func newGroupMessageID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// prepareGroupMessage validates + normalises an incoming chat message and builds
// the stored entry for the given sender. Shared by the per-crisis and per-task
// thread handlers. Returns a non-empty error string on invalid input.
func prepareGroupMessage(req postGroupChatReq, user *lib.User) (lib.GroupChatMessage, string) {
	req.MessageType = strings.TrimSpace(strings.ToLower(req.MessageType))
	req.MessageText = strings.TrimSpace(req.MessageText)
	req.Transcript = strings.TrimSpace(req.Transcript)
	req.ImageURL = strings.TrimSpace(req.ImageURL)
	req.AudioURL = strings.TrimSpace(req.AudioURL)

	if req.MessageType == "" {
		if req.ImageURL != "" {
			req.MessageType = "image"
		} else if req.Transcript != "" || req.AudioURL != "" {
			req.MessageType = "voice"
		} else {
			req.MessageType = "text"
		}
	}
	if req.MessageType != "text" && req.MessageType != "voice" && req.MessageType != "image" {
		return lib.GroupChatMessage{}, "message_type must be text, voice, or image"
	}
	if req.MessageText == "" && req.Transcript == "" && req.ImageURL == "" && req.AudioURL == "" {
		return lib.GroupChatMessage{}, "message cannot be empty"
	}

	// Validate text fields that may reach the LLM (injection guard + length cap).
	if req.MessageText != "" {
		clean, verr := lib.ValidateUserInput(req.MessageText)
		if verr != nil {
			return lib.GroupChatMessage{}, verr.Error()
		}
		req.MessageText = clean
	}
	if req.Transcript != "" {
		clean, verr := lib.ValidateUserInput(req.Transcript)
		if verr != nil {
			return lib.GroupChatMessage{}, verr.Error()
		}
		req.Transcript = clean
	}

	return lib.GroupChatMessage{
		ID:           newGroupMessageID(),
		SenderUserID: user.ID,
		SenderName:   user.Name,
		SenderRole:   user.Role,
		MessageType:  req.MessageType,
		MessageText:  req.MessageText,
		Transcript:   req.Transcript,
		ImageURL:     req.ImageURL,
		AudioURL:     req.AudioURL,
		CreatedAt:    time.Now().UTC(),
	}, ""
}

// GetTaskChatMessages returns the message history for one task's group chat.
// Access is gated on membership: only users who have joined the task (POST
// /api/tasks/:id/join) can read it.
func GetTaskChatMessages(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("taskID"))
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing task id"})
		return
	}

	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user identity"})
		return
	}

	member, err := lib.DB.IsTaskMember(taskID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not check membership"})
		return
	}
	if !member {
		c.JSON(http.StatusForbidden, gin.H{"error": "join this task to access its group chat"})
		return
	}

	session, err := lib.DB.GetGroupChatSessionByTaskID(taskID)
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

// PostTaskChatMessage appends one message to a task's group chat. Membership is
// required (same gate as reads).
func PostTaskChatMessage(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("taskID"))
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing task id"})
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

	member, err := lib.DB.IsTaskMember(taskID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not check membership"})
		return
	}
	if !member {
		c.JSON(http.StatusForbidden, gin.H{"error": "join this task to access its group chat"})
		return
	}

	var req postGroupChatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	entry, verr := prepareGroupMessage(req, user)
	if verr != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": verr})
		return
	}

	session, err := lib.DB.GetOrCreateTaskChatSession(taskID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not open group chat session"})
		return
	}

	updated := append(session.Messages, entry)
	if len(updated) > 500 {
		updated = updated[len(updated)-500:]
	}
	if err := lib.DB.SaveGroupChatMessages(session.ID, updated); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save message"})
		return
	}

	// If the message is addressed to Brainy, generate its reply in the background
	// and append it to the thread; the client's poll picks it up moments later.
	if lib.AddressesBrainy(entry.MessageText) || lib.AddressesBrainy(entry.Transcript) {
		go replyAsBrainyInTask(taskID, entry)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":    entry,
		"session_id": session.ID,
	})
}

// replyAsBrainyInTask generates Brainy's answer to a question in a task chat and
// appends it to the thread. Runs in a goroutine off the POST path so the sender
// isn't blocked on the LLM call. Best-effort: any failure is logged and dropped.
func replyAsBrainyInTask(taskID string, trigger lib.GroupChatMessage) {
	task, err := lib.DB.GetTaskByID(taskID)
	if err != nil {
		log.Printf("[taskchat/brainy] load task %s: %v", taskID, err)
		return
	}
	session, err := lib.DB.GetGroupChatSessionByTaskID(taskID)
	if err != nil || session == nil {
		log.Printf("[taskchat/brainy] load session %s: %v", taskID, err)
		return
	}

	question := strings.TrimSpace(trigger.MessageText)
	if question == "" {
		question = strings.TrimSpace(trigger.Transcript)
	}
	recent := session.Messages
	if len(recent) > 12 {
		recent = recent[len(recent)-12:]
	}

	reply, err := lib.GenerateBrainyTaskReply(*task, recent, question)
	if err != nil || strings.TrimSpace(reply) == "" {
		log.Printf("[taskchat/brainy] generate reply %s: %v", taskID, err)
		return
	}

	updated := append(session.Messages, lib.NewBrainyMessage(strings.TrimSpace(reply)))
	if len(updated) > 500 {
		updated = updated[len(updated)-500:]
	}
	if err := lib.DB.SaveGroupChatMessages(session.ID, updated); err != nil {
		log.Printf("[taskchat/brainy] save reply %s: %v", taskID, err)
	}
}
