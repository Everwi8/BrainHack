// Perrin — OpenAI-compatible LLM client (gpt-oss-120b via configurable base URL)
package lib

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	defaultModel       = "nvidia/nemotron-3-super-120b-a12b:free"
	defaultVisionModel = "nvidia/nemotron-nano-12b-v2-vl:free"
	defaultBaseURL     = "https://openrouter.ai/api/v1"

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

// llmConfig resolves the endpoint settings from the environment, applying
// defaults for anything unset.
func llmConfig() (apiKey, baseURL, model string) {
	apiKey = os.Getenv("LLM_API_KEY")
	baseURL = os.Getenv("LLM_BASE_URL")
	model = os.Getenv("LLM_MODEL")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	if model == "" {
		model = defaultModel
	}
	return
}

const (
	maxRetries     = 3
	baseRetryDelay = 500 * time.Millisecond
)

// chatCompletion is the shared text core: it POSTs the given messages to the
// chat-completions endpoint and returns the assistant reply text. Transient
// failures (network errors, HTTP 429, and 5xx) are retried up to maxRetries
// times with exponential backoff.
func chatCompletion(messages []Message) (string, error) {
	_, baseURL, model := llmConfig()
	payload, err := json.Marshal(llmRequest{Model: model, Messages: messages})
	if err != nil {
		return "", fmt.Errorf("LLM marshal error: %w", err)
	}
	return postCompletion(baseURL, payload)
}

// postCompletion POSTs a pre-marshalled chat-completions payload and returns
// the assistant reply text, retrying transient failures (network errors, HTTP
// 429, and 5xx) up to maxRetries times with exponential backoff. It is the
// shared transport for both text and vision requests.
func postCompletion(baseURL string, payload []byte) (string, error) {
	apiKey := os.Getenv("LLM_API_KEY")
	client := &http.Client{Timeout: 60 * time.Second}
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 500ms, 1s, 2s, ...
			time.Sleep(baseRetryDelay << (attempt - 1))
		}

		req, err := http.NewRequest(http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(payload))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("HTTP-Referer", "https://brainysg.app")
		req.Header.Set("X-Title", "BrainySG")

		resp, err := client.Do(req)
		if err != nil {
			// Network/transport errors are transient — retry.
			lastErr = fmt.Errorf("LLM request failed: %w", err)
			continue
		}

		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("LLM read error: %w", readErr)
			continue
		}

		// Retry on rate limiting and server errors.
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("LLM transient HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
			continue
		}

		var result llmResponse
		if err := json.Unmarshal(body, &result); err != nil {
			return "", fmt.Errorf("LLM decode error: %w (status %d)", err, resp.StatusCode)
		}
		if result.Error != nil {
			return "", fmt.Errorf("LLM API error: %s", result.Error.Message)
		}
		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("LLM HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		}
		if len(result.Choices) == 0 {
			return "", errors.New("empty response from LLM")
		}

		return result.Choices[0].Message.Content, nil
	}

	return "", fmt.Errorf("LLM failed after %d attempts: %w", maxRetries, lastErr)
}

// ChatLLM sends a user message and returns Brainy's reply, maintaining history.
func ChatLLM(sessionID, userMessage string) (string, error) {
	appendHistory(sessionID, Message{Role: "user", Content: userMessage})
	history := getHistory(sessionID)

	reply, err := chatCompletion(history)
	if err != nil {
		return "", err
	}

	appendHistory(sessionID, Message{Role: "assistant", Content: reply})
	return reply, nil
}

// ChatJSON sends a system instruction and user prompt expecting a JSON object
// reply, and unmarshals it into target (a pointer). It is stateless — it does
// not touch session history — and is the shared helper for triage and
// task-card generation. Any markdown code fences around the JSON are stripped
// before parsing.
func ChatJSON(systemPrompt, userPrompt string, target any) error {
	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	reply, err := chatCompletion(messages)
	if err != nil {
		return err
	}

	cleaned := stripJSONFences(reply)
	if err := json.Unmarshal([]byte(cleaned), target); err != nil {
		return fmt.Errorf("LLM JSON parse error: %w (raw: %s)", err, reply)
	}
	return nil
}

// stripJSONFences removes surrounding markdown code fences (```json ... ```)
// that models often wrap structured output in, returning the inner payload.
func stripJSONFences(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	// Drop the opening fence line (``` or ```json).
	if i := strings.IndexByte(s, '\n'); i != -1 {
		s = s[i+1:]
	}
	if i := strings.LastIndex(s, "```"); i != -1 {
		s = s[:i]
	}
	return strings.TrimSpace(s)
}

// Vision request types. The chat-completions API accepts a message whose
// content is an array of typed parts (text + image_url), so vision requests
// need their own message shape distinct from the plain-string Message.
type contentPart struct {
	Type     string    `json:"type"`
	Text     string    `json:"text,omitempty"`
	ImageURL *imageURL `json:"image_url,omitempty"`
}

type imageURL struct {
	URL string `json:"url"`
}

type visionMessage struct {
	Role    string        `json:"role"`
	Content []contentPart `json:"content"`
}

type visionRequest struct {
	Model    string          `json:"model"`
	Messages []visionMessage `json:"messages"`
}

const visionInstruction = `Analyse the attached photo of a possible emergency or hazard in Singapore. Describe what you see, identify the type and severity of any crisis (flood, fire, haze, fallen tree, accident, etc.), and recommend immediate safety actions. If it looks life-threatening, lead with calling 995 (SCDF) or 999 (Police).`

// VisionLLM sends an image (as a base64 data URL) with an optional caption to
// the vision model and returns Brainy's interpretation. A text summary of the
// exchange is appended to the session history so follow-up text chat keeps
// context, but the image itself is not stored (the text model can't see it).
func VisionLLM(sessionID, caption, imageDataURL string) (string, error) {
	baseURL := os.Getenv("LLM_BASE_URL")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	model := os.Getenv("LLM_VISION_MODEL")
	if model == "" {
		model = defaultVisionModel
	}

	prompt := visionInstruction
	if caption != "" {
		prompt += "\n\nUser's note about the photo: " + caption
	}

	parts := []contentPart{
		{Type: "text", Text: prompt},
		{Type: "image_url", ImageURL: &imageURL{URL: imageDataURL}},
	}
	messages := []visionMessage{
		{Role: "system", Content: []contentPart{{Type: "text", Text: brainySystem}}},
		{Role: "user", Content: parts},
	}

	payload, err := json.Marshal(visionRequest{Model: model, Messages: messages})
	if err != nil {
		return "", fmt.Errorf("LLM marshal error: %w", err)
	}

	reply, err := postCompletion(baseURL, payload)
	if err != nil {
		return "", err
	}

	// Record a text-only trace so subsequent /api/chat turns have context.
	userTrace := "[Shared a photo]"
	if caption != "" {
		userTrace += " " + caption
	}
	appendHistory(sessionID, Message{Role: "user", Content: userTrace}, Message{Role: "assistant", Content: reply})

	return reply, nil
}
