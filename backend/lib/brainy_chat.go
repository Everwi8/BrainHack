// Perrin — Brainy as a participant in per-task group chats. Brainy posts a
// welcome brief when a task's chat opens and answers on-demand questions
// addressed to it (@brainy), using the task brief + live triage context. These
// helpers build/generate the messages; the handler persists them.
package lib

import (
	"crypto/rand"
	"encoding/hex"
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
