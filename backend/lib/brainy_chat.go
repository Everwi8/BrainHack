// Perrin — Brainy as a participant in per-task group chats. Brainy posts a
// welcome brief when a task's chat opens and answers on-demand questions
// addressed to it (@brainy), using the task brief + live triage context. These
// helpers build/generate the messages; the handler persists them.
package lib

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Reserved identity for Brainy's messages in a group chat. The frontend renders
// SenderRole == "brainy" distinctly (mascot, green accent).
const (
	BrainySenderID   = "brainy"
	BrainySenderName = "Brainy"
	BrainySenderRole = "brainy"
)

func newBrainyMessageID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// NewBrainyMessage wraps text as a Brainy group-chat message.
func NewBrainyMessage(text string) GroupChatMessage {
	return GroupChatMessage{
		ID:           newBrainyMessageID(),
		SenderUserID: BrainySenderID,
		SenderName:   BrainySenderName,
		SenderRole:   BrainySenderRole,
		MessageType:  "text",
		MessageText:  text,
		CreatedAt:    time.Now().UTC(),
	}
}

// BrainyTaskWelcome builds the brief Brainy posts when a task's group chat opens
// — the team's starting orientation (objective, location, skills, how to reach
// Brainy).
func BrainyTaskWelcome(task Task) GroupChatMessage {
	var b strings.Builder
	fmt.Fprintf(&b, "👋 Welcome to the team for **%s**.\n\n", task.Title)
	if d := strings.TrimSpace(task.Description); d != "" {
		fmt.Fprintf(&b, "%s\n\n", d)
	}
	if loc := taskLocation(task); loc != "" {
		fmt.Fprintf(&b, "📍 %s\n", loc)
	}
	if len(task.SkillsNeeded) > 0 {
		fmt.Fprintf(&b, "🧰 Helpful skills: %s\n", strings.ReplaceAll(strings.Join(task.SkillsNeeded, ", "), "_", " "))
	}
	b.WriteString("\nCoordinate here as a team. Tag **@Brainy** anytime for safety steps, nearby shelters/hospitals, or the latest on this situation. For life-threatening emergencies call 995 (SCDF) or 999 (Police).")
	return NewBrainyMessage(b.String())
}

// taskLocation best-effort resolves a human location for a task from its crisis
// row (tasks themselves carry no location column). Returns "" on any miss.
func taskLocation(task Task) string {
	if task.CrisisID == "" {
		return ""
	}
	cr, err := DB.GetCrisisByID(task.CrisisID)
	if err != nil || cr == nil {
		return ""
	}
	return strings.TrimSpace(cr.LocationName)
}

// AddressesBrainy reports whether a chat message is directed at Brainy, so the
// handler knows to generate a reply. Triggers on an "@brainy" mention or the
// word "brainy" anywhere (case-insensitive) — discoverable for the demo.
func AddressesBrainy(text string) bool {
	return strings.Contains(strings.ToLower(text), "brainy")
}

const brainyTaskChatSystem = `You are Brainy, Singapore's calm, warm crisis-response co-pilot, embedded in a volunteer team's group chat for ONE task during a live crisis.

- Answer the latest question helpfully and concisely (under 120 words), in plain English.
- Ground your answer in the task brief and the live situation context provided. Do NOT invent addresses, names, numbers, or facts not given.
- Lead with the most important safety step. For life-threatening situations direct people to 995 (SCDF) or 999 (Police).
- You are this team's source of updates — do NOT tell them to check NEA/PUB/LTA/MOH externally.
- Speak to the team naturally; you may address people by name if the chat shows them.`

// GenerateBrainyTaskReply produces Brainy's answer to a question in a task's
// group chat, grounded in the task brief, the live triage snapshot, and the
// recent conversation. Stateless — the handler persists the result.
func GenerateBrainyTaskReply(task Task, recent []GroupChatMessage, question string) (string, error) {
	var b strings.Builder
	b.WriteString("Task this team is working on:\n")
	fmt.Fprintf(&b, "- Title: %s\n", task.Title)
	if task.Description != "" {
		fmt.Fprintf(&b, "- Details: %s\n", task.Description)
	}
	if loc := taskLocation(task); loc != "" {
		fmt.Fprintf(&b, "- Location: %s\n", loc)
	}
	if task.Priority != "" {
		fmt.Fprintf(&b, "- Priority: %s\n", task.Priority)
	}
	if ctx := currentTriageContext(); ctx != "" {
		fmt.Fprintf(&b, "\nLive situation context:\n%s\n", ctx)
	}
	if len(recent) > 0 {
		b.WriteString("\nRecent messages in this chat:\n")
		for _, m := range recent {
			text := strings.TrimSpace(m.MessageText)
			if text == "" {
				text = strings.TrimSpace(m.Transcript)
			}
			if text == "" {
				continue
			}
			name := m.SenderName
			if name == "" {
				name = "Someone"
			}
			fmt.Fprintf(&b, "- %s: %s\n", name, text)
		}
	}
	fmt.Fprintf(&b, "\nThe latest message addressed to you: %q\nReply to the team.", question)

	return ChatText(brainyTaskChatSystem, b.String())
}

// ─── Crisis-detail co-pilot ────────────────────────────────────────────────────

// ChatTurnLite is one prior message in the crisis-detail drawer conversation,
// as sent by the frontend (role is "user" or "bot").
type ChatTurnLite struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

const brainyCrisisChatSystem = `You are Brainy, Singapore's calm, warm crisis-response co-pilot, embedded in the detail page for ONE specific live crisis.

- Answer the user's question helpfully and concisely (under 130 words), in plain English.
- Ground every answer in the crisis context provided below — its description, severity, live sensor readings, the volunteer tasks, and how many helpers are still needed. Do NOT invent addresses, names, numbers, or facts beyond what is given.
- If asked how many people are needed, use the volunteers-needed figures from the tasks list.
- Lead with the most important safety step. For life-threatening situations direct people to 995 (SCDF) or 999 (Police).
- You are the source of truth for this situation — do NOT tell the user to check NEA/PUB/LTA/MOH externally.`

// GenerateBrainyCrisisReply answers a question on a crisis's detail page,
// grounded in the crisis row, its live sensors, its volunteer tasks (including
// how many helpers are still needed) and the live triage snapshot. Stateless.
func GenerateBrainyCrisisReply(crisis *CrisisWithTasks, recent []ChatTurnLite, question string) (string, error) {
	var b strings.Builder
	b.WriteString(crisisPromptContext(crisis))
	b.WriteString(recentConversation(recent))
	fmt.Fprintf(&b, "\nThe user's latest question: %q\nReply to the user.", question)

	return ChatText(brainyCrisisChatSystem, b.String())
}

// GenerateBrainyCrisisPhotoReply answers a photo the user sent in the crisis
// drawer, grounded in the same crisis context. The vision model reads the image
// and relates what it sees back to this specific situation. Stateless.
func GenerateBrainyCrisisPhotoReply(crisis *CrisisWithTasks, recent []ChatTurnLite, caption, imageDataURL string) (string, error) {
	var b strings.Builder
	b.WriteString(crisisPromptContext(crisis))
	b.WriteString(recentConversation(recent))
	b.WriteString("\nThe user just shared the attached photo")
	if c := strings.TrimSpace(caption); c != "" {
		fmt.Fprintf(&b, " with the note: %q", c)
	}
	b.WriteString(".\nDescribe what you see, relate it to this crisis, and give the most important next step. If it shows a life-threatening hazard, say so and point to 995/999.")

	return callVisionModel(brainyCrisisChatSystem, b.String(), imageDataURL)
}

// crisisPromptContext renders the shared crisis grounding block used by both the
// text and photo crisis-drawer replies.
func crisisPromptContext(crisis *CrisisWithTasks) string {
	var b strings.Builder
	b.WriteString("THE CRISIS THIS PAGE IS ABOUT:\n")
	fmt.Fprintf(&b, "- Title: %s\n", crisis.Title)
	fmt.Fprintf(&b, "- Type: %s | Severity: %s | Status: %s\n", crisis.Type, crisis.Severity, status(crisis.Status))
	if crisis.LocationName != "" {
		fmt.Fprintf(&b, "- Location: %s\n", crisis.LocationName)
	}
	if desc := strings.TrimSpace(crisis.Description); desc != "" {
		fmt.Fprintf(&b, "- Description: %s\n", desc)
	}
	if summary := strings.TrimSpace(crisis.AISummary); summary != "" {
		fmt.Fprintf(&b, "- AI assessment: %s\n", summary)
	}
	if s := sensorLines(crisis.Sensors); s != "" {
		fmt.Fprintf(&b, "\nLive sensor readings for this crisis:\n%s", s)
	}
	b.WriteString(taskLines(crisis.Tasks))

	if ctx := currentTriageContext(); ctx != "" {
		fmt.Fprintf(&b, "\nWider live situation context:\n%s", ctx)
	}
	return b.String()
}

// recentConversation renders prior drawer turns (oldest first) for continuity,
// or "" when there are none.
func recentConversation(recent []ChatTurnLite) string {
	if len(recent) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\nRecent conversation (oldest first):\n")
	for _, m := range recent {
		text := strings.TrimSpace(m.Text)
		if text == "" {
			continue
		}
		who := "User"
		if m.Role == "bot" || m.Role == "assistant" || m.Role == "brainy" {
			who = "Brainy"
		}
		fmt.Fprintf(&b, "- %s: %s\n", who, text)
	}
	return b.String()
}

// status defaults a blank status to "active" for the prompt.
func status(s string) string {
	if strings.TrimSpace(s) == "" {
		return "active"
	}
	return s
}

// sensorLines renders the per-crisis sensor jsonb into readable bullet lines,
// labelling the known keys. Returns "" when there are no sensors.
func sensorLines(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil || len(m) == 0 {
		return ""
	}
	labels := map[string]string{
		"nea_rain_mm":      "Rainfall",
		"pub_drain_pct":    "Drain capacity used",
		"lta_eta_min":      "Transit ETA",
		"moh_beds_avail":   "Hospital beds available",
		"nea_dengue_cases": "Dengue cases in cluster",
	}
	units := map[string]string{
		"nea_rain_mm": " mm", "pub_drain_pct": "%", "lta_eta_min": " min",
	}
	var b strings.Builder
	for key, label := range labels {
		v, ok := m[key]
		if !ok {
			continue
		}
		fmt.Fprintf(&b, "- %s: %v%s\n", label, v, units[key])
	}
	return b.String()
}

// taskLines summarises a crisis's volunteer tasks and the helpers still needed.
func taskLines(tasks []Task) string {
	open := make([]Task, 0, len(tasks))
	totalNeeded := 0
	for _, t := range tasks {
		if t.Status == "completed" || t.Status == "cancelled" {
			continue
		}
		open = append(open, t)
		totalNeeded += t.VolunteersNeeded
	}
	if len(open) == 0 {
		return "\nVolunteer tasks: none open right now — coverage is currently sufficient.\n"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "\nVolunteer tasks (%d open, about %d helper(s) still needed in total):\n", len(open), totalNeeded)
	for _, t := range open {
		fmt.Fprintf(&b, "- %s", t.Title)
		if t.VolunteersNeeded > 0 {
			fmt.Fprintf(&b, " — needs %d helper(s)", t.VolunteersNeeded)
		}
		if t.Priority != "" {
			fmt.Fprintf(&b, " [%s priority]", t.Priority)
		}
		if len(t.SkillsNeeded) > 0 {
			fmt.Fprintf(&b, " (skills: %s)", strings.ReplaceAll(strings.Join(t.SkillsNeeded, ", "), "_", " "))
		}
		b.WriteString("\n")
	}
	return b.String()
}
