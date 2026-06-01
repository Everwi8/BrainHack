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
	"strconv"
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

// maxTokens caps each completion. It bounds worst-case latency while leaving
// ample room for Brainy's short replies and the task JSON envelope.
const maxTokens = 2048

// reasoningParam disables a model's chain-of-thought via OpenRouter's unified
// reasoning control. Nemotron is a reasoning model: left on, it spends the
// token budget thinking (returned in a separate field) and truncates the actual
// content, and the long generation makes the body read time out. We never
// surface reasoning, so it is disabled on every request.
type reasoningParam struct {
	Enabled bool `json:"enabled"`
}

var reasoningOff = reasoningParam{Enabled: false}

type llmRequest struct {
	Model     string         `json:"model"`
	Messages  []Message      `json:"messages"`
	MaxTokens int            `json:"max_tokens"`
	Reasoning reasoningParam `json:"reasoning"`
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
	// Seed a new session with the persona plus a live triage snapshot so
	// Brainy's answers reflect the current situation. The triage block is
	// empty (and skipped) if the data layer is unavailable or quiet.
	msgs := []Message{{Role: "system", Content: brainySystem}}
	if ctx := currentTriageContext(); ctx != "" {
		msgs = append(msgs, Message{Role: "system", Content: ctx})
	}
	return msgs
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
	maxRetries        = 3
	baseRetryDelay    = 500 * time.Millisecond
	defaultTimeoutSec = 60
)

// requestTimeout is the per-attempt HTTP timeout, overridable via
// LLM_TIMEOUT_SECONDS. Task generation on the slow free model can need a longer
// budget than chat, so the demo can raise this without touching code.
func requestTimeout() time.Duration {
	if v := os.Getenv("LLM_TIMEOUT_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return defaultTimeoutSec * time.Second
}

// chatCompletion is the shared text core: it POSTs the given messages to the
// chat-completions endpoint and returns the assistant reply text. Transient
// failures (network errors, HTTP 429, and 5xx) are retried up to maxRetries
// times with exponential backoff.
func chatCompletion(messages []Message) (string, error) {
	_, baseURL, model := llmConfig()
	payload, err := json.Marshal(llmRequest{Model: model, Messages: messages, MaxTokens: maxTokens, Reasoning: reasoningOff})
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
	client := &http.Client{Timeout: requestTimeout()}
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

// noThinkDirective disables chain-of-thought on NVIDIA Nemotron models, which
// otherwise stream their entire reasoning into the content field — that both
// blows past the token cap before any JSON appears and makes the call very
// slow. It is the documented Nemotron control token; harmless to other models.
const noThinkDirective = "detailed thinking off"

// ChatJSON sends a system instruction and user prompt expecting a JSON reply
// and unmarshals it into target (a pointer). It is stateless — it does not
// touch session history — and is the shared helper for triage and task-card
// generation. Reasoning is disabled (Nemotron streams its thinking into the
// content otherwise), and the JSON payload is extracted even if the model wraps
// it in code fences or surrounding prose.
func ChatJSON(systemPrompt, userPrompt string, target any) error {
	messages := []Message{
		{Role: "system", Content: noThinkDirective + "\n\n" + systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	reply, err := chatCompletion(messages)
	if err != nil {
		return err
	}

	cleaned := extractJSON(reply)
	if err := json.Unmarshal([]byte(cleaned), target); err != nil {
		return fmt.Errorf("LLM JSON parse error: %w (raw: %s)", err, reply)
	}
	return nil
}

// extractJSON pulls the JSON payload out of a model reply: it strips markdown
// code fences, and if prose still surrounds the value, slices from the first
// opening brace/bracket to the matching last closing one.
func extractJSON(s string) string {
	s = stripJSONFences(s)
	if json.Valid([]byte(s)) {
		return s
	}
	start := strings.IndexAny(s, "{[")
	if start == -1 {
		return s
	}
	closer := byte('}')
	if s[start] == '[' {
		closer = ']'
	}
	if end := strings.LastIndexByte(s, closer); end > start {
		return s[start : end+1]
	}
	return s
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
	Model     string          `json:"model"`
	Messages  []visionMessage `json:"messages"`
	MaxTokens int             `json:"max_tokens"`
	Reasoning reasoningParam  `json:"reasoning"`
}

// PhotoObservation is the structured read of a photo produced by the vision
// model. It is the hand-off between the vision stage and the text stage, and
// is reused by triage (Phase 3) and task-card generation (Phase 4).
type PhotoObservation struct {
	CrisisType    string   `json:"crisis_type"` // flood, fire, haze, fallen_tree, road_accident, building_damage, medical, crowd, none, other
	Severity      string   `json:"severity"`    // none, low, warning, high
	Description   string   `json:"description"` // one factual sentence
	Observations  []string `json:"observations"`
	Hazards       []string `json:"hazards"`
	PeoplePresent bool     `json:"people_present"`
}

// visionExtractSystem instructs the vision model to return only structured
// facts — no prose, no invented specifics. Keeping it to observable facts is
// what stops the 12B model from hallucinating addresses/dates the way it does
// when asked to write the full answer directly.
const visionExtractSystem = `You are a vision analysis system for Singapore emergency response. Look at the photo and return ONLY a JSON object (no prose, no markdown fences) with exactly this shape:
{
  "crisis_type": "<one of: flood, fire, haze, fallen_tree, road_accident, building_damage, medical, crowd, none, other>",
  "severity": "<one of: none, low, warning, high>",
  "description": "<one factual sentence describing what is visibly in the image>",
  "observations": ["<short factual visual details that are actually visible>"],
  "hazards": ["<immediate physical dangers visible in the scene>"],
  "people_present": <true or false>
}
Report ONLY what is visibly present. Do NOT invent or guess locations, place names, road names, building names, dates, addresses, or measurements — if it is not visible, leave it out.`

// visionProseFallback is used only if structured extraction fails to parse, so
// the user still gets a useful answer (degrades to the old direct-vision path).
const visionProseFallback = `Analyse the attached photo of a possible emergency in Singapore. Describe only what is visibly present (do not invent locations, names, or dates), identify the crisis type and severity, and give immediate safety actions. For life-threatening situations lead with calling 995 (SCDF) or 999 (Police).`

// callVisionModel posts a single image + text prompt to the vision model and
// returns the raw reply text, sharing the retry transport.
func callVisionModel(systemPrompt, userPrompt, imageDataURL string) (string, error) {
	baseURL := os.Getenv("LLM_BASE_URL")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	model := os.Getenv("LLM_VISION_MODEL")
	if model == "" {
		model = defaultVisionModel
	}

	messages := []visionMessage{
		{Role: "system", Content: []contentPart{{Type: "text", Text: systemPrompt}}},
		{Role: "user", Content: []contentPart{
			{Type: "text", Text: userPrompt},
			{Type: "image_url", ImageURL: &imageURL{URL: imageDataURL}},
		}},
	}

	payload, err := json.Marshal(visionRequest{Model: model, Messages: messages, MaxTokens: maxTokens, Reasoning: reasoningOff})
	if err != nil {
		return "", fmt.Errorf("LLM marshal error: %w", err)
	}
	return postCompletion(baseURL, payload)
}

// ExtractPhotoObservation runs the vision model in structured-extraction mode
// and returns the parsed observation. Exposed for triage/task-card reuse.
func ExtractPhotoObservation(caption, imageDataURL string) (PhotoObservation, error) {
	userPrompt := "Analyse this photo."
	if caption != "" {
		userPrompt += " The user's note about it: " + caption
	}

	raw, err := callVisionModel(visionExtractSystem, userPrompt, imageDataURL)
	if err != nil {
		return PhotoObservation{}, err
	}

	var obs PhotoObservation
	if err := json.Unmarshal([]byte(stripJSONFences(raw)), &obs); err != nil {
		return PhotoObservation{}, fmt.Errorf("vision JSON parse error: %w (raw: %s)", err, raw)
	}
	return obs, nil
}

// VisionLLM is the hybrid photo pipeline: the vision model extracts a
// structured observation, then the stronger text model turns that into
// Brainy's user-facing answer (with full session context and persona). The
// exchange is recorded in session history so follow-up text chat keeps the
// photo context. If structured extraction fails, it degrades gracefully to a
// single direct-vision prose call.
func VisionLLM(sessionID, caption, imageDataURL string) (string, error) {
	obs, err := ExtractPhotoObservation(caption, imageDataURL)
	if err != nil {
		return visionProseDirect(sessionID, caption, imageDataURL)
	}

	// Hand the structured facts to the text model as a user turn. Storing this
	// in history (rather than the raw image) gives later text turns context.
	var b strings.Builder
	b.WriteString("The user shared a photo. An automated vision system analysed it:\n")
	fmt.Fprintf(&b, "- Type: %s\n- Severity: %s\n", obs.CrisisType, obs.Severity)
	if obs.Description != "" {
		fmt.Fprintf(&b, "- Description: %s\n", obs.Description)
	}
	if len(obs.Observations) > 0 {
		fmt.Fprintf(&b, "- Observations: %s\n", strings.Join(obs.Observations, "; "))
	}
	if len(obs.Hazards) > 0 {
		fmt.Fprintf(&b, "- Hazards: %s\n", strings.Join(obs.Hazards, "; "))
	}
	fmt.Fprintf(&b, "- People visible in frame: %t\n", obs.PeoplePresent)
	if caption != "" {
		fmt.Fprintf(&b, "\nThe user's note with the photo: %q\n", caption)
	}
	b.WriteString("\nRespond to the user about this photo: briefly describe the situation based only on these findings (do not invent details), then give the most important safety actions.")

	appendHistory(sessionID, Message{Role: "user", Content: b.String()})
	reply, err := chatCompletion(getHistory(sessionID))
	if err != nil {
		return "", err
	}
	appendHistory(sessionID, Message{Role: "assistant", Content: reply})
	return reply, nil
}

// visionProseDirect is the fallback single-call path (vision model writes the
// answer itself) used when structured extraction can't be parsed.
func visionProseDirect(sessionID, caption, imageDataURL string) (string, error) {
	userPrompt := visionProseFallback
	if caption != "" {
		userPrompt += "\n\nUser's note about the photo: " + caption
	}
	reply, err := callVisionModel(brainySystem, userPrompt, imageDataURL)
	if err != nil {
		return "", err
	}

	userTrace := "[Shared a photo]"
	if caption != "" {
		userTrace += " " + caption
	}
	appendHistory(sessionID, Message{Role: "user", Content: userTrace}, Message{Role: "assistant", Content: reply})
	return reply, nil
}
