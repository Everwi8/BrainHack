// STT client for voice-note transcription. The volunteers/chat voice flows post
// uploaded audio here; this module forwards bytes to an OpenAI-compatible
// /audio/transcriptions endpoint and returns plain text.
package lib

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultSTTBaseURL = "https://api.openai.com/v1"
	defaultSTTModel   = "whisper-1"
)

type sttJSONResponse struct {
	Text string `json:"text"`
}

// sttConfig resolves API credentials and endpoint defaults from env vars.
func sttConfig() (apiKey, baseURL, model string) {
	apiKey = os.Getenv("STT_API_KEY")
	baseURL = os.Getenv("STT_BASE_URL")
	model = os.Getenv("STT_MODEL")

	if baseURL == "" {
		baseURL = defaultSTTBaseURL
	}
	if model == "" {
		model = defaultSTTModel
	}
	return
}

// sttTimeout is the per-request timeout, overridable for slow links/providers.
func sttTimeout() time.Duration {
	if v := os.Getenv("STT_TIMEOUT_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return 60 * time.Second
}

// TranscribeAudio sends audio bytes to an OpenAI-compatible transcription API.
// It expects a multipart "file" plus "model", and returns the transcript text.
func TranscribeAudio(filename, mime string, data []byte) (string, error) {
	apiKey, baseURL, model := sttConfig()
	if strings.TrimSpace(apiKey) == "" {
		return "", fmt.Errorf("STT is not configured (missing STT_API_KEY)")
	}

	var payload bytes.Buffer
	writer := multipart.NewWriter(&payload)

	fileWriter, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", fmt.Errorf("stt form file: %w", err)
	}
	if _, err := fileWriter.Write(data); err != nil {
		return "", fmt.Errorf("stt form write: %w", err)
	}
	if err := writer.WriteField("model", model); err != nil {
		return "", fmt.Errorf("stt model field: %w", err)
	}
	// Force transcription language to English.
	if err := writer.WriteField("language", "en"); err != nil {
		return "", fmt.Errorf("stt language field: %w", err)
	}
	if strings.HasPrefix(mime, "audio/") {
		_ = writer.WriteField("content_type", mime)
	}
	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("stt form close: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(baseURL, "/")+"/audio/transcriptions", &payload)
	if err != nil {
		return "", fmt.Errorf("stt request build: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: sttTimeout()}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("stt request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("stt read error: %w", err)
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("stt HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	// Some providers return JSON {"text":"..."}, others return plain text.
	var out sttJSONResponse
	if err := json.Unmarshal(body, &out); err == nil && strings.TrimSpace(out.Text) != "" {
		return strings.TrimSpace(out.Text), nil
	}

	text := strings.TrimSpace(string(body))
	if text == "" {
		return "", fmt.Errorf("stt response did not contain transcript text")
	}
	return text, nil
}
