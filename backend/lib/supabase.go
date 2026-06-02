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
