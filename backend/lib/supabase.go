package lib

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// ─── Domain types ─────────────────────────────────────────────────────────────

type Crisis struct {
	ID           string    `json:"id,omitempty"`
	ExternalID   string    `json:"external_id,omitempty"`
	Title        string    `json:"title"`
	Description  string    `json:"description"`
	Type         string    `json:"type"`
	Severity     string    `json:"severity"`
	Status       string    `json:"status,omitempty"`
	Lat          float64   `json:"lat"`
	Lng          float64   `json:"lng"`
	LocationName string    `json:"location_name"`
	Source       string    `json:"source,omitempty"`
	AISummary    string    `json:"ai_summary,omitempty"`
	CreatedAt    time.Time `json:"created_at,omitempty"`
	UpdatedAt    time.Time `json:"updated_at,omitempty"`
}

type CrisisWithTasks struct {
	Crisis
	Tasks []Task `json:"tasks"`
}

type Task struct {
	ID          string    `json:"id,omitempty"`
	CrisisID    string    `json:"crisis_id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Status      string    `json:"status,omitempty"`
	AssignedTo  *string   `json:"assigned_to"`
	CreatedBy   *string   `json:"created_by"`
	CreatedAt   time.Time `json:"created_at,omitempty"`
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
}

type User struct {
	ID           string    `json:"id,omitempty"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"password_hash,omitempty"`
	Name         string    `json:"name"`
	Role         string    `json:"role,omitempty"`
	CreatedAt    time.Time `json:"created_at,omitempty"`
}

// ─── Client ──────────────────────────────────────────────────────────────────

type Client struct {
	baseURL    string
	serviceKey string
	http       *http.Client
}

// DB is the global Supabase client. Call Init() once at startup.
var DB *Client

func Init() {
	DB = &Client{
		baseURL:    os.Getenv("SUPABASE_URL"),
		serviceKey: os.Getenv("SUPABASE_SECRET_KEY"),
		http:       &http.Client{Timeout: 10 * time.Second},
	}
}

// req is the internal HTTP helper. path is everything after /rest/v1/.
func (c *Client) req(method, path string, body interface{}, extra map[string]string) ([]byte, error) {
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		r = bytes.NewReader(b)
	}

	request, err := http.NewRequest(method, c.baseURL+"/rest/v1/"+path, r)
	if err != nil {
		return nil, err
	}
	request.Header.Set("apikey", c.serviceKey)
	request.Header.Set("Authorization", "Bearer "+c.serviceKey)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Prefer", "return=representation")
	}
	for k, v := range extra {
		request.Header.Set(k, v)
	}

	resp, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("supabase %s %s → %d: %s", method, path, resp.StatusCode, data)
	}
	return data, nil
}

// ─── Crises ──────────────────────────────────────────────────────────────────

func (c *Client) GetCrises() ([]Crisis, error) {
	data, err := c.req("GET", "crises?status=eq.active&select=*&order=created_at.desc", nil, nil)
	if err != nil {
		return nil, err
	}
	var out []Crisis
	return out, json.Unmarshal(data, &out)
}

func (c *Client) GetCrisesPaged(limit, offset int) ([]Crisis, error) {
	path := fmt.Sprintf("crises?status=eq.active&select=*&order=created_at.desc&limit=%d&offset=%d", limit, offset)
	data, err := c.req("GET", path, nil, nil)
	if err != nil {
		return nil, err
	}
	var out []Crisis
	return out, json.Unmarshal(data, &out)
}

func (c *Client) GetCrisisByID(id string) (*CrisisWithTasks, error) {
	// PostgREST resource embedding: select crisis + related tasks in one call.
	data, err := c.req("GET", "crises?id=eq."+id+"&select=*,tasks(*)", nil, nil)
	if err != nil {
		return nil, err
	}
	var rows []CrisisWithTasks
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("crisis not found")
	}
	return &rows[0], nil
}

// UpsertCrisis inserts or updates based on external_id (used by ingestion scripts).
func (c *Client) UpsertCrisis(crisis Crisis) error {
	_, err := c.req("POST", "crises?on_conflict=external_id", crisis, map[string]string{
		"Prefer": "resolution=merge-duplicates,return=representation",
	})
	return err
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

func (c *Client) GetTasks(crisisID string) ([]Task, error) {
	path := "tasks?select=*&order=created_at.desc"
	if crisisID != "" {
		path = "tasks?crisis_id=eq." + crisisID + "&select=*&order=created_at.asc"
	}
	data, err := c.req("GET", path, nil, nil)
	if err != nil {
		return nil, err
	}
	var out []Task
	return out, json.Unmarshal(data, &out)
}

func (c *Client) CreateTask(task Task) (*Task, error) {
	data, err := c.req("POST", "tasks", task, nil)
	if err != nil {
		return nil, err
	}
	var rows []Task
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("create task failed")
	}
	return &rows[0], nil
}

func (c *Client) UpdateTask(id string, updates map[string]interface{}) (*Task, error) {
	data, err := c.req("PATCH", "tasks?id=eq."+id, updates, nil)
	if err != nil {
		return nil, err
	}
	var rows []Task
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("task not found")
	}
	return &rows[0], nil
}

func (c *Client) GetTaskByID(id string) (*Task, error) {
	data, err := c.req("GET", "tasks?id=eq."+id+"&select=*", nil, nil)
	if err != nil {
		return nil, err
	}
	var rows []Task
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("task not found")
	}
	return &rows[0], nil
}

func (c *Client) DeleteTask(id string) error {
	_, err := c.req("DELETE", "tasks?id=eq."+id, nil, nil)
	return err
}

// ─── Users ───────────────────────────────────────────────────────────────────

func (c *Client) GetUserByEmail(email string) (*User, error) {
	data, err := c.req("GET", "users?email=eq."+email+"&select=*", nil, nil)
	if err != nil {
		return nil, err
	}
	var rows []User
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("user not found")
	}
	return &rows[0], nil
}

func (c *Client) CreateUser(user User) (*User, error) {
	data, err := c.req("POST", "users", user, nil)
	if err != nil {
		return nil, err
	}
	var rows []User
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("create user failed")
	}
	return &rows[0], nil
}

// ─── Chat sessions ───────────────────────────────────────────────────────────

// ChatSession is one persisted conversation. Messages holds the full transcript
// ([]Message) and maps to the JSONB column. Listing endpoints omit Messages
// (via select) so the sidebar payload stays small.
type ChatSession struct {
	ID        string    `json:"id,omitempty"`
	UserID    string    `json:"user_id,omitempty"`
	Title     string    `json:"title,omitempty"`
	Messages  []Message `json:"messages,omitempty"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// CreateChatSession starts a new conversation owned by userID.
func (c *Client) CreateChatSession(userID, title string) (*ChatSession, error) {
	body := map[string]interface{}{
		"user_id":  userID,
		"title":    title,
		"messages": []Message{},
	}
	data, err := c.req("POST", "chat_sessions", body, nil)
	if err != nil {
		return nil, err
	}
	var rows []ChatSession
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("create chat session failed")
	}
	return &rows[0], nil
}

// ListChatSessions returns the user's conversations newest-first, without the
// (potentially large) message transcripts — just enough for a sidebar.
func (c *Client) ListChatSessions(userID string) ([]ChatSession, error) {
	path := "chat_sessions?user_id=eq." + userID +
		"&select=id,title,created_at,updated_at&order=updated_at.desc"
	data, err := c.req("GET", path, nil, nil)
	if err != nil {
		return nil, err
	}
	out := []ChatSession{}
	return out, json.Unmarshal(data, &out)
}

// GetChatSession loads one conversation, scoped to its owner. Filtering on
// user_id (not just id) is the access check: another user's id returns no rows.
func (c *Client) GetChatSession(id, userID string) (*ChatSession, error) {
	path := "chat_sessions?id=eq." + id + "&user_id=eq." + userID + "&select=*"
	data, err := c.req("GET", path, nil, nil)
	if err != nil {
		return nil, err
	}
	var rows []ChatSession
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("chat session not found")
	}
	return &rows[0], nil
}

// SaveChatMessages overwrites the transcript (the whole JSONB blob) and, if
// title is non-empty, updates the title too. The updated_at trigger bumps the
// timestamp so the sidebar re-sorts.
func (c *Client) SaveChatMessages(id string, messages []Message, title string) error {
	updates := map[string]interface{}{"messages": messages}
	if title != "" {
		updates["title"] = title
	}
	_, err := c.req("PATCH", "chat_sessions?id=eq."+id, updates, nil)
	return err
}

// DeleteChatSession removes a conversation, scoped to its owner.
func (c *Client) DeleteChatSession(id, userID string) error {
	_, err := c.req("DELETE", "chat_sessions?id=eq."+id+"&user_id=eq."+userID, nil, nil)
	return err
}

// ─── Storage (chat images) ────────────────────────────────────────────────────

// chatImageBucket is the public Storage bucket chat photos are uploaded to.
const chatImageBucket = "chat-images"

// extFromMime maps an image MIME type to a file extension for the object key.
func extFromMime(mime string) string {
	switch mime {
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	default:
		return "jpg"
	}
}

// EnsureChatBucket creates the public chat-images bucket if it doesn't exist.
// Best-effort: a 400 (already exists) is fine. Called once at startup. The
// service key has storage-admin rights, so this needs no manual dashboard step.
func (c *Client) EnsureChatBucket() error {
	body, _ := json.Marshal(map[string]any{
		"id": chatImageBucket, "name": chatImageBucket, "public": true,
	})
	req, err := http.NewRequest("POST", c.baseURL+"/storage/v1/bucket", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return nil
}

// UploadChatImage stores image bytes in the chat-images bucket under the user's
// folder and returns the public URL. Object key: <userID>/<nanos>.<ext>.
func (c *Client) UploadChatImage(userID string, data []byte, mime string) (string, error) {
	objectPath := fmt.Sprintf("%s/%d.%s", userID, time.Now().UnixNano(), extFromMime(mime))
	uploadURL := c.baseURL + "/storage/v1/object/" + chatImageBucket + "/" + objectPath

	req, err := http.NewRequest("POST", uploadURL, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	req.Header.Set("Content-Type", mime)
	req.Header.Set("x-upsert", "true")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("storage upload %d: %s", resp.StatusCode, b)
	}

	return c.baseURL + "/storage/v1/object/public/" + chatImageBucket + "/" + objectPath, nil
}
