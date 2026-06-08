package lib

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

// ─── Domain types ─────────────────────────────────────────────────────────────

type Crisis struct {
	ID           string  `json:"id,omitempty"`
	ExternalID   string  `json:"external_id,omitempty"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	Type         string  `json:"type"`
	Severity     string  `json:"severity"`
	Status       string  `json:"status,omitempty"`
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
	LocationName string  `json:"location_name"`
	Source       string  `json:"source,omitempty"`
	// ApprovalStatus gates feed/map visibility: 'pending' | 'approved' | 'rejected'.
	// omitempty so ingestion (which leaves it blank) falls back to the DB default.
	ApprovalStatus string  `json:"approval_status,omitempty"`
	ReportedBy     *string `json:"reported_by,omitempty"`
	ApprovedBy     *string `json:"approved_by,omitempty"`
	AISummary      string  `json:"ai_summary,omitempty"`
	// Sensors is a jsonb passthrough of the per-crisis live-sensor snapshot the
	// CrisisDetail "Live data sources" cards render (nea_rain_mm, pub_drain_pct,
	// lta_eta_min, moh_beds_avail). Raw so we don't pin a schema here; omitempty
	// so rows without a snapshot serialise as no field (cards show "No data").
	Sensors   json.RawMessage `json:"sensors,omitempty"`
	CreatedAt time.Time       `json:"created_at,omitempty"`
	UpdatedAt time.Time       `json:"updated_at,omitempty"`
}

type CrisisWithTasks struct {
	Crisis
	Tasks []Task `json:"tasks"`
}

type Task struct {
	ID               string    `json:"id,omitempty"`
	CrisisID         string    `json:"crisis_id"`
	Title            string    `json:"title"`
	Description      string    `json:"description"`
	Status           string    `json:"status,omitempty"`
	Priority         string    `json:"priority,omitempty"`
	VolunteersNeeded int       `json:"volunteers_needed,omitempty"`
	SkillsNeeded     []string  `json:"skills_needed,omitempty"`
	AssignedTo       *string   `json:"assigned_to"`
	CreatedBy        *string   `json:"created_by"`
	CreatedAt        time.Time `json:"created_at,omitempty"`
	UpdatedAt        time.Time `json:"updated_at,omitempty"`
}

type User struct {
	ID           string    `json:"id,omitempty"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"password_hash,omitempty"`
	Name         string    `json:"name"`
	Role         string    `json:"role,omitempty"`
	CreatedAt    time.Time `json:"created_at,omitempty"`
}

type GroupChatMessage struct {
	ID           string    `json:"id"`
	SenderUserID string    `json:"sender_user_id"`
	SenderName   string    `json:"sender_name"`
	SenderRole   string    `json:"sender_role"`
	MessageType  string    `json:"message_type"`
	MessageText  string    `json:"message_text"`
	Transcript   string    `json:"transcript,omitempty"`
	ImageURL     string    `json:"image_url,omitempty"`
	AudioURL     string    `json:"audio_url,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type GroupChatSession struct {
	ID        string             `json:"id,omitempty"`
	UserID    string             `json:"user_id,omitempty"`
	Title     string             `json:"title,omitempty"`
	Messages  []GroupChatMessage `json:"messages,omitempty"`
	CreatedAt time.Time          `json:"created_at,omitempty"`
	UpdatedAt time.Time          `json:"updated_at,omitempty"`
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

// GetCrises returns active, coordinator-approved crises (the public feed/map
// set). Pending and rejected citizen reports are excluded.
func (c *Client) GetCrises() ([]Crisis, error) {
	data, err := c.req("GET", "crises?status=eq.active&approval_status=eq.approved&select=*&order=created_at.desc", nil, nil)
	if err != nil {
		return nil, err
	}
	var out []Crisis
	return out, json.Unmarshal(data, &out)
}

// GetCrisesPaged backs the feed. Unlike GetCrises (map/triage) it includes
// resolved crises too — the feed keeps them as history (sorted to the end by
// the handler), while the map shows only active ones.
func (c *Client) GetCrisesPaged(limit, offset int) ([]Crisis, error) {
	path := fmt.Sprintf("crises?approval_status=eq.approved&select=*&order=created_at.desc&limit=%d&offset=%d", limit, offset)
	data, err := c.req("GET", path, nil, nil)
	if err != nil {
		return nil, err
	}
	var out []Crisis
	return out, json.Unmarshal(data, &out)
}

// GetPendingCrises returns citizen reports awaiting coordinator review.
func (c *Client) GetPendingCrises() ([]Crisis, error) {
	data, err := c.req("GET", "crises?approval_status=eq.pending&select=*&order=created_at.desc", nil, nil)
	if err != nil {
		return nil, err
	}
	out := []Crisis{}
	return out, json.Unmarshal(data, &out)
}

// GetCrisesByReporter returns every crisis a given user filed, newest-first,
// regardless of approval status (so they can track their own pending reports).
func (c *Client) GetCrisesByReporter(userID string) ([]Crisis, error) {
	data, err := c.req("GET", "crises?reported_by=eq."+userID+"&select=*&order=created_at.desc", nil, nil)
	if err != nil {
		return nil, err
	}
	out := []Crisis{}
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

// crisisInsertBody builds the JSON body for inserting a crisis, deliberately
// omitting id/created_at/updated_at so the database defaults apply. Sending the
// struct directly would serialise the zero time.Time as "0001-01-01T00:00:00Z"
// (omitempty doesn't work on a struct), overriding created_at's DEFAULT NOW().
func crisisInsertBody(cr Crisis) map[string]interface{} {
	body := map[string]interface{}{
		"title":         cr.Title,
		"description":   cr.Description,
		"type":          cr.Type,
		"severity":      cr.Severity,
		"lat":           cr.Lat,
		"lng":           cr.Lng,
		"location_name": cr.LocationName,
	}
	// Optional columns: omit when empty so the DB default takes over.
	if cr.ExternalID != "" {
		body["external_id"] = cr.ExternalID
	}
	if cr.Status != "" {
		body["status"] = cr.Status
	}
	if cr.Source != "" {
		body["source"] = cr.Source
	}
	if cr.AISummary != "" {
		body["ai_summary"] = cr.AISummary
	}
	if cr.ApprovalStatus != "" {
		body["approval_status"] = cr.ApprovalStatus
	}
	if cr.ReportedBy != nil {
		body["reported_by"] = *cr.ReportedBy
	}
	if cr.ApprovedBy != nil {
		body["approved_by"] = *cr.ApprovedBy
	}
	return body
}

// UpsertCrisis inserts or updates based on external_id (used by ingestion scripts).
func (c *Client) UpsertCrisis(crisis Crisis) error {
	_, err := c.req("POST", "crises?on_conflict=external_id", crisisInsertBody(crisis), map[string]string{
		"Prefer": "resolution=merge-duplicates,return=representation",
	})
	return err
}

// CreateCrisis inserts a single crisis row (citizen report path) and returns it
// with its generated id. Unlike UpsertCrisis it does not dedupe on external_id.
func (c *Client) CreateCrisis(crisis Crisis) (*Crisis, error) {
	data, err := c.req("POST", "crises", crisisInsertBody(crisis), map[string]string{
		"Prefer": "return=representation",
	})
	if err != nil {
		return nil, err
	}
	var rows []Crisis
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("create crisis failed")
	}
	return &rows[0], nil
}

// UpdateCrisis applies a partial update to a crisis row and returns it.
func (c *Client) UpdateCrisis(id string, updates map[string]interface{}) (*Crisis, error) {
	data, err := c.req("PATCH", "crises?id=eq."+id, updates, map[string]string{
		"Prefer": "return=representation",
	})
	if err != nil {
		return nil, err
	}
	var rows []Crisis
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("crisis not found")
	}
	return &rows[0], nil
}

// SetCrisisApproval transitions a report to 'approved' or 'rejected' and records
// the actioning coordinator. Returns the updated row.
func (c *Client) SetCrisisApproval(id, status, approverID string) (*Crisis, error) {
	updates := map[string]interface{}{
		"approval_status": status,
		"approved_by":     approverID,
	}
	data, err := c.req("PATCH", "crises?id=eq."+id, updates, map[string]string{
		"Prefer": "return=representation",
	})
	if err != nil {
		return nil, err
	}
	var rows []Crisis
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("crisis not found")
	}
	return &rows[0], nil
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

// ─── Task membership ─────────────────────────────────────────────────────────
// Joining a task gates access to that task's group chat. The per-crisis cap for
// non-coordinators is enforced in handler/tasks.go (JoinTask) — these helpers are
// the raw storage operations.

type TaskMember struct {
	ID        string    `json:"id,omitempty"`
	TaskID    string    `json:"task_id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at,omitempty"`
}

// IsTaskMember reports whether userID has joined taskID.
func (c *Client) IsTaskMember(taskID, userID string) (bool, error) {
	path := "task_members?task_id=eq." + taskID + "&user_id=eq." + userID + "&select=id&limit=1"
	data, err := c.req("GET", path, nil, nil)
	if err != nil {
		return false, err
	}
	var rows []TaskMember
	if err := json.Unmarshal(data, &rows); err != nil {
		return false, err
	}
	return len(rows) > 0, nil
}

// JoinTask records membership (idempotent at the storage level via the
// UNIQUE(task_id,user_id) constraint).
func (c *Client) JoinTask(taskID, userID string) error {
	_, err := c.req("POST", "task_members", TaskMember{TaskID: taskID, UserID: userID}, nil)
	return err
}

// LeaveTask removes membership; a no-op if the row doesn't exist.
func (c *Client) LeaveTask(taskID, userID string) error {
	_, err := c.req("DELETE", "task_members?task_id=eq."+taskID+"&user_id=eq."+userID, nil, nil)
	return err
}

// CountTaskMembers returns how many users have joined taskID.
func (c *Client) CountTaskMembers(taskID string) (int, error) {
	data, err := c.req("GET", "task_members?task_id=eq."+taskID+"&select=id", nil, nil)
	if err != nil {
		return 0, err
	}
	var rows []TaskMember
	if err := json.Unmarshal(data, &rows); err != nil {
		return 0, err
	}
	return len(rows), nil
}

// MemberTaskInCrisis returns the id of the task (in crisisID) that userID has
// already joined, or "" if none. Backs the one-task-per-crisis cap and the
// frontend's leave-and-switch flow. Uses an inner-join embed so the crisis
// filter applies to the joined tasks row.
func (c *Client) MemberTaskInCrisis(userID, crisisID string) (string, error) {
	path := "task_members?user_id=eq." + userID +
		"&select=task_id,tasks!inner(id,crisis_id)&tasks.crisis_id=eq." + crisisID + "&limit=1"
	data, err := c.req("GET", path, nil, nil)
	if err != nil {
		return "", err
	}
	var rows []struct {
		TaskID string `json:"task_id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "", nil
	}
	return rows[0].TaskID, nil
}

// ListMemberTasks returns the full task rows userID has joined, newest first.
// Drives the per-task tabs on the Volunteer page.
func (c *Client) ListMemberTasks(userID string) ([]Task, error) {
	path := "task_members?user_id=eq." + userID + "&select=tasks(*)&order=created_at.desc"
	data, err := c.req("GET", path, nil, nil)
	if err != nil {
		return nil, err
	}
	var rows []struct {
		Task *Task `json:"tasks"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	out := make([]Task, 0, len(rows))
	for _, r := range rows {
		if r.Task != nil {
			out = append(out, *r.Task)
		}
	}
	return out, nil
}

// ─── Volunteer profiles ──────────────────────────────────────────────────────
// One row per user: the skills they offer + last-known location, used by the
// "find my match" flow to score open tasks for that volunteer.

type Volunteer struct {
	ID        string    `json:"id,omitempty"`
	UserID    string    `json:"user_id"`
	Skills    []string  `json:"skills"`
	Lat       *float64  `json:"lat,omitempty"`
	Lng       *float64  `json:"lng,omitempty"`
	Available bool      `json:"available"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// GetVolunteerByUser returns the caller's volunteer profile, or nil (no error)
// if they haven't set one up yet.
func (c *Client) GetVolunteerByUser(userID string) (*Volunteer, error) {
	data, err := c.req("GET", "volunteers?user_id=eq."+userID+"&select=*&limit=1", nil, nil)
	if err != nil {
		return nil, err
	}
	var rows []Volunteer
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

// UpsertVolunteer creates or updates the caller's single volunteer profile
// (one row per user, enforced by the unique index on user_id).
func (c *Client) UpsertVolunteer(v Volunteer) (*Volunteer, error) {
	existing, err := c.GetVolunteerByUser(v.UserID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		updates := map[string]interface{}{
			"skills":    v.Skills,
			"available": v.Available,
			"lat":       v.Lat,
			"lng":       v.Lng,
		}
		data, err := c.req("PATCH", "volunteers?user_id=eq."+v.UserID, updates, nil)
		if err != nil {
			return nil, err
		}
		var rows []Volunteer
		if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
			return nil, fmt.Errorf("update volunteer failed")
		}
		return &rows[0], nil
	}
	data, err := c.req("POST", "volunteers", v, nil)
	if err != nil {
		return nil, err
	}
	var rows []Volunteer
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("create volunteer failed")
	}
	return &rows[0], nil
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

func (c *Client) GetUserByID(id string) (*User, error) {
	data, err := c.req("GET", "users?id=eq."+id+"&select=*", nil, nil)
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

// Group chats are stored as chat_sessions rows whose title encodes the thread
// key: "group:<crisisID>" for per-crisis threads, "taskgroup:<taskID>" for the
// per-task threads introduced with task membership. The message array lives in
// the JSONB `messages` column.
const groupChatTitlePrefix = "group:"
const taskChatTitlePrefix = "taskgroup:"

func groupChatTitle(crisisID string) string {
	return groupChatTitlePrefix + crisisID
}

func taskChatTitle(taskID string) string {
	return taskChatTitlePrefix + taskID
}

// getGroupChatSessionByTitle is the shared lookup behind both the crisis- and
// task-keyed threads.
func (c *Client) getGroupChatSessionByTitle(title string) (*GroupChatSession, error) {
	q := url.QueryEscape(title)
	path := "chat_sessions?title=eq." + q + "&select=*&order=created_at.asc&limit=1"
	data, err := c.req("GET", path, nil, nil)
	if err != nil {
		return nil, err
	}
	var rows []GroupChatSession
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

// createGroupChatSession inserts a fresh empty thread under the given title.
func (c *Client) createGroupChatSession(title, ownerUserID string) (*GroupChatSession, error) {
	body := map[string]interface{}{
		"user_id":  ownerUserID,
		"title":    title,
		"messages": []GroupChatMessage{},
	}
	data, err := c.req("POST", "chat_sessions", body, nil)
	if err != nil {
		return nil, err
	}
	var rows []GroupChatSession
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, fmt.Errorf("create group chat session failed")
	}
	return &rows[0], nil
}

func (c *Client) GetGroupChatSessionByCrisisID(crisisID string) (*GroupChatSession, error) {
	return c.getGroupChatSessionByTitle(groupChatTitle(crisisID))
}

func (c *Client) GetOrCreateGroupChatSession(crisisID, ownerUserID string) (*GroupChatSession, error) {
	session, err := c.GetGroupChatSessionByCrisisID(crisisID)
	if err != nil {
		return nil, err
	}
	if session != nil {
		return session, nil
	}
	return c.createGroupChatSession(groupChatTitle(crisisID), ownerUserID)
}

// GetGroupChatSessionByTaskID returns the per-task thread, or nil if none yet.
func (c *Client) GetGroupChatSessionByTaskID(taskID string) (*GroupChatSession, error) {
	return c.getGroupChatSessionByTitle(taskChatTitle(taskID))
}

// GetOrCreateTaskChatSession opens (or lazily creates) the per-task thread.
func (c *Client) GetOrCreateTaskChatSession(taskID, ownerUserID string) (*GroupChatSession, error) {
	session, err := c.GetGroupChatSessionByTaskID(taskID)
	if err != nil {
		return nil, err
	}
	if session != nil {
		return session, nil
	}
	return c.createGroupChatSession(taskChatTitle(taskID), ownerUserID)
}

func (c *Client) SaveGroupChatMessages(sessionID string, messages []GroupChatMessage) error {
	updates := map[string]interface{}{"messages": messages}
	_, err := c.req("PATCH", "chat_sessions?id=eq."+sessionID, updates, nil)
	return err
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
