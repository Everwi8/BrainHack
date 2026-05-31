// Perrin — OpenAI-compatible LLM client (gpt-oss-120b via configurable base URL)
package lib

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
)

const (
	defaultModel   = "nvidia/nemotron-3-super-120b-a12b:free"
	defaultBaseURL = "https://openrouter.ai/api/v1"

	brainySystem = `You are Brainy, Singapore's AI crisis-response co-pilot — a calm, warm, and reliable assistant during emergencies.

You help residents navigate floods, haze, dengue outbreaks, MRT disruptions, fires, and health alerts in Singapore.

Personality:
- Reassuring and concise, never alarmist
- Actionable: lead with the most important safety step first
- Local: you know Singapore's agencies (NEA, LTA, PUB, MOH, SCDF), geography, and emergency numbers
- For life-threatening situations always direct to 995 (SCDF) or 999 (Police) first

Response style:
- Under 150 words unless the user asks for detail
- Use plain English accessible to all ages
- For shelter/hospital queries: give name, rough distance, and any available link
- For crisis queries: safety action → context → next steps`
)

// Message is a single chat turn.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type llmRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}

type llmResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// sessionStore holds per-session conversation history (in-memory, MVP).
var sessionStore sync.Map

func getHistory(sessionID string) []Message {
	if v, ok := sessionStore.Load(sessionID); ok {
		return append([]Message{}, v.([]Message)...)
	}
	return []Message{{Role: "system", Content: brainySystem}}
}

func appendHistory(sessionID string, msgs ...Message) {
	history := getHistory(sessionID)
	history = append(history, msgs...)
	// Keep system prompt + last 20 turns to stay within context limits
	if len(history) > 21 {
		history = append(history[:1], history[len(history)-20:]...)
	}
	sessionStore.Store(sessionID, history)
}

// ChatLLM sends a user message and returns Brainy's reply, maintaining history.
func ChatLLM(sessionID, userMessage string) (string, error) {
	apiKey := os.Getenv("LLM_API_KEY")
	baseURL := os.Getenv("LLM_BASE_URL")
	model := os.Getenv("LLM_MODEL")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	if model == "" {
		model = defaultModel
	}

	appendHistory(sessionID, Message{Role: "user", Content: userMessage})
	history := getHistory(sessionID)

	payload, _ := json.Marshal(llmRequest{Model: model, Messages: history})

	req, err := http.NewRequest(http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("HTTP-Referer", "https://brainysg.app")
	req.Header.Set("X-Title", "BrainySG")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("LLM request failed: %w", err)
	}
	defer resp.Body.Close()

	var result llmResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("LLM decode error: %w", err)
	}
	if result.Error != nil {
		return "", fmt.Errorf("LLM API error: %s", result.Error.Message)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("empty response from LLM")
	}

	reply := result.Choices[0].Message.Content
	appendHistory(sessionID, Message{Role: "assistant", Content: reply})
	return reply, nil
}
