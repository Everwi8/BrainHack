// Perrin — OpenAI LLM client (gpt-4.1-mini for both text and vision, via a
// configurable OpenAI-compatible base URL).
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
	"time"
)

const (
	defaultModel   = "gpt-4.1-mini"
	defaultBaseURL = "https://api.openai.com/v1"

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

// Message is a single chat turn. ImageURL is non-empty only for a persisted
// photo turn — it holds the Supabase Storage URL so the conversation can render
// the image on reload. It is NOT sent to the LLM (assemblePrompt drops it).
type Message struct {
	Role     string `json:"role"`
	Content  string `json:"content"`
	ImageURL string `json:"image_url,omitempty"`
}

// maxTokens caps each completion. It bounds worst-case latency while leaving
// ample room for Brainy's short replies and the task JSON envelope.
const maxTokens = 2048

type llmRequest struct {
	Model     string    `json:"model"`
	Messages  []Message `json:"messages"`
	MaxTokens int       `json:"max_tokens"`
}

type llmResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// maxStoredTurns bounds how many conversation turns we keep (and persist) per
// session, so prompts and the stored JSONB stay within sane limits.
const maxStoredTurns = 40

// assemblePrompt builds the full message list sent to the model: the persona,
// then a live triage snapshot (rebuilt fresh each call so it is never stale),
// then the stored conversation turns. The persona/triage system messages are
// deliberately NOT persisted — only the turns are.
func assemblePrompt(turns []Message) []Message {
	msgs := make([]Message, 0, len(turns)+2)
	msgs = append(msgs, Message{Role: "system", Content: brainySystem})
	if ctx := currentTriageContext(); ctx != "" {
		msgs = append(msgs, Message{Role: "system", Content: ctx})
	}
	// Copy role/content only — never forward ImageURL to the text model.
	for _, t := range turns {
		msgs = append(msgs, Message{Role: t.Role, Content: t.Content})
	}
	return msgs
}

// trimTurns keeps only the most recent maxStoredTurns messages.
func trimTurns(turns []Message) []Message {
	if len(turns) > maxStoredTurns {
		return append([]Message{}, turns[len(turns)-maxStoredTurns:]...)
	}
	return turns
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
// LLM_TIMEOUT_SECONDS so the demo can raise it without touching code.
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
	payload, err := json.Marshal(llmRequest{Model: model, Messages: messages, MaxTokens: maxTokens})
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

// ChatTurn runs one text exchange. It takes the conversation's prior turns,
// appends the user message, asks Brainy, and returns the reply along with the
// updated (trimmed) turns for the caller to persist. It is stateless — storage
// lives in the handler/DB layer, keyed to the authenticated user.
func ChatTurn(turns []Message, userMessage string) (reply string, updated []Message, err error) {
	turns = append(turns, Message{Role: "user", Content: userMessage})

	reply, err = chatCompletion(assemblePrompt(turns))
	if err != nil {
		return "", nil, err
	}

	turns = append(turns, Message{Role: "assistant", Content: reply})
	return reply, trimTurns(turns), nil
}

// ChatJSON sends a system instruction and user prompt expecting a JSON reply
// and unmarshals it into target (a pointer). It is stateless — it does not
// touch session history — and is the shared helper for triage and task-card
// generation. The JSON payload is extracted even if the model wraps it in code
// fences or surrounding prose.
func ChatJSON(systemPrompt, userPrompt string, target any) error {
	messages := []Message{
		{Role: "system", Content: systemPrompt},
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
// facts — no prose, no invented specifics. Constraining it to observable facts
// keeps the model from hallucinating addresses/dates the way it can when asked
// to write the full answer directly.
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

// callVisionModel posts a single image + text prompt to the multimodal model
// and returns the raw reply text, sharing the retry transport. It uses the same
// model as the text path (gpt-4.1-mini is multimodal) — only the request shape
// differs, since vision needs an image_url content part.
func callVisionModel(systemPrompt, userPrompt, imageDataURL string) (string, error) {
	_, baseURL, model := llmConfig()

	messages := []visionMessage{
		{Role: "system", Content: []contentPart{{Type: "text", Text: systemPrompt}}},
		{Role: "user", Content: []contentPart{
			{Type: "text", Text: userPrompt},
			{Type: "image_url", ImageURL: &imageURL{URL: imageDataURL}},
		}},
	}

	payload, err := json.Marshal(visionRequest{Model: model, Messages: messages, MaxTokens: maxTokens})
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

// VisionTurn is the stateless hybrid photo pipeline: the model first extracts a
// structured observation from the image, then turns that (plus the prior turns
// and persona) into Brainy's answer in a text call. It returns the reply, the
// parsed observation (nil on the prose fallback), and the updated turns for the
// caller to persist.
//
// What gets persisted for the user's turn is a short "[Shared a photo]" trace,
// not the verbose machine analysis: the analysis is fed to the model for this
// one call only, so reloading the conversation later shows something readable
// while the assistant's own reply still carries the context forward.
func VisionTurn(turns []Message, caption, imageDataURL, imageURL string) (reply string, obs *PhotoObservation, updated []Message, err error) {
	userTrace := "[Shared a photo]"
	if caption != "" {
		userTrace += " " + caption
	}
	// The persisted user turn carries the stored image URL (if the upload
	// succeeded) so the conversation can render the photo when reloaded.
	userTurn := Message{Role: "user", Content: userTrace, ImageURL: imageURL}

	extracted, extractErr := ExtractPhotoObservation(caption, imageDataURL)
	if extractErr != nil {
		// Fallback: the vision model writes the answer itself in one call.
		userPrompt := visionProseFallback
		if caption != "" {
			userPrompt += "\n\nUser's note about the photo: " + caption
		}
		reply, err = callVisionModel(brainySystem, userPrompt, imageDataURL)
		if err != nil {
			return "", nil, nil, err
		}
		turns = append(turns,
			userTurn,
			Message{Role: "assistant", Content: reply})
		return reply, nil, trimTurns(turns), nil
	}
	obs = &extracted

	// Build the detailed analysis turn used only for this call (not persisted).
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

	promptTurns := append(append([]Message{}, turns...), Message{Role: "user", Content: b.String()})
	reply, err = chatCompletion(assemblePrompt(promptTurns))
	if err != nil {
		return "", nil, nil, err
	}

	turns = append(turns,
		userTurn,
		Message{Role: "assistant", Content: reply})
	return reply, obs, trimTurns(turns), nil
}
