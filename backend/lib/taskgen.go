// Perrin — Auto task-card generation (Phase 4). Turns triage findings into
// actionable volunteer task cards. The LLM does the wording via the Phase 1
// ChatJSON helper; if it fails or returns nothing usable, a deterministic
// mapping guarantees the demo never shows an empty task list.
//
// Findings are deduplicated by location and capped before generation so the
// same spot doesn't spawn near-duplicate cards and the LLM response stays small
// (the free model is slow on long outputs).
//
// Generated cards are meant to land in Sanjey's tasks store via POST /api/tasks.
// That handler is still a stub, so ForwardTasks is best-effort and log-only
// until it ships (see TASKS_SINK_URL).
package lib

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// maxTaskFindings caps how many findings feed task generation, keeping the LLM
// response small enough to return within the request timeout.
const maxTaskFindings = 6

// TaskCard is a unit of volunteer work generated from a triage finding. The
// required fields (title, description, priority, volunteers_needed, crisis_id)
// match plan.md; type/location are extra context for the map and group chat.
type TaskCard struct {
	Title            string `json:"title"`
	Description      string `json:"description"`
	Priority         string `json:"priority"` // high, medium, low
	VolunteersNeeded int    `json:"volunteers_needed"`
	CrisisID         string `json:"crisis_id,omitempty"`
	Type             string `json:"type,omitempty"`     // mirrors the finding type
	Location         string `json:"location,omitempty"`
}

// taskGenSystem instructs the model to convert findings into ready-to-assign
// volunteer tasks. Constrained to a JSON envelope so ChatJSON can parse it, and
// kept short so the (slow, free) model returns promptly.
const taskGenSystem = `You are the task-planning module for BrainySG, Singapore's crisis-response platform. You convert triaged situations into concrete volunteer task cards for community responders (RC/CC members, SCDF CERT teams).

Return ONLY a JSON object (no prose, no markdown fences) of this exact shape:
{
  "tasks": [
    {"title": "<imperative, max 8 words>", "description": "<ONE sentence: what the volunteer does + a safety note>", "priority": "<high|medium|low>", "volunteers_needed": <integer 1-10>, "type": "<crisis type>", "location": "<affected location>"}
  ]
}

Rules:
- Produce EXACTLY ONE task per situation given. Do not merge or add situations.
- Critical situations get "high" priority.
- Tasks must be practical community actions (e.g. "Guide residents to higher ground", "Distribute N95 masks to elderly", "Check void decks for stagnant water"). Do NOT invent emergency-services work (firefighting, rescue) — those go to 995.
- Do NOT invent locations, names, or numbers beyond the situations given.`

// GenerateTaskCards converts a triage report into volunteer task cards. Findings
// are deduplicated by location (most severe kept) and capped, then handed to the
// LLM; if the call fails or yields no tasks, a deterministic mapping over the
// same findings runs so callers always get a usable, demo-ready list.
func GenerateTaskCards(report TriageReport) ([]TaskCard, error) {
	findings := dedupFindings(report.Findings)
	if len(findings) == 0 {
		return nil, nil
	}
	if len(findings) > maxTaskFindings {
		findings = findings[:maxTaskFindings]
	}

	cards, err := generateTaskCardsLLM(findings)
	if err != nil || len(cards) == 0 {
		if err != nil {
			log.Printf("task-gen: LLM path failed (%v), using deterministic fallback", err)
		}
		return fallbackTaskCards(findings), nil
	}
	return cards, nil
}

// dedupFindings collapses findings that target the same location, keeping the
// first (most severe, since the report is severity-sorted). Findings with no
// location are always kept. Order is preserved.
func dedupFindings(findings []TriageFinding) []TriageFinding {
	out := make([]TriageFinding, 0, len(findings))
	seen := make(map[string]bool)
	for _, f := range findings {
		if f.Location == "" {
			out = append(out, f)
			continue
		}
		key := strings.ToLower(f.Location)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, f)
	}
	return out
}

// generateTaskCardsLLM is the LLM path: it summarises the findings and parses
// the model's JSON envelope into task cards.
func generateTaskCardsLLM(findings []TriageFinding) ([]TaskCard, error) {
	var b strings.Builder
	b.WriteString("Generate one volunteer task card for each of these situations:\n")
	for _, f := range findings {
		loc := f.Location
		if loc == "" {
			loc = "unspecified"
		}
		fmt.Fprintf(&b, "- [%s] type=%s location=%q: %s\n", f.Severity, f.Type, loc, f.Detail)
	}

	var envelope struct {
		Tasks []TaskCard `json:"tasks"`
	}
	if err := ChatJSON(taskGenSystem, b.String(), &envelope); err != nil {
		return nil, err
	}
	return sanitiseTaskCards(envelope.Tasks), nil
}

// sanitiseTaskCards drops empty cards and clamps the fields the model controls
// to safe ranges/values, so downstream consumers can trust them.
func sanitiseTaskCards(cards []TaskCard) []TaskCard {
	out := cards[:0]
	for _, t := range cards {
		if strings.TrimSpace(t.Title) == "" {
			continue
		}
		t.Priority = normalisePriority(t.Priority)
		if t.VolunteersNeeded < 1 {
			t.VolunteersNeeded = 1
		}
		if t.VolunteersNeeded > 10 {
			t.VolunteersNeeded = 10
		}
		out = append(out, t)
	}
	return out
}

func normalisePriority(p string) string {
	switch strings.ToLower(strings.TrimSpace(p)) {
	case "high", "critical", "urgent":
		return "high"
	case "low":
		return "low"
	default:
		return "medium"
	}
}

// fallbackTaskCards maps findings to task cards deterministically — no LLM. It
// produces action-oriented titles per crisis type so the offline path still
// looks demo-ready.
func fallbackTaskCards(findings []TriageFinding) []TaskCard {
	out := make([]TaskCard, 0, len(findings))
	for _, f := range findings {
		title, desc := taskActionFor(f)
		out = append(out, TaskCard{
			Title:            title,
			Description:      desc,
			Priority:         priorityForSeverity(f.Severity),
			VolunteersNeeded: volunteersForSeverity(f.Severity),
			Type:             f.Type,
			Location:         f.Location,
		})
	}
	return out
}

// taskActionFor derives a concrete volunteer action (title + description) for a
// finding based on its crisis type. Cascade findings are routed by a keyword in
// their title since they carry no single primitive type.
func taskActionFor(f TriageFinding) (title, desc string) {
	loc := f.Location
	if loc == "" {
		loc = "the affected area"
	}
	switch f.Type {
	case "flood":
		return "Guide residents to higher ground — " + loc,
			"Help residents near " + loc + " move to higher ground and away from rising water; never enter fast-moving floodwater — call 995 for rescues."
	case "haze":
		return "Distribute N95 masks — " + loc,
			"Hand out N95 masks and check on elderly and vulnerable residents staying indoors in " + loc + "."
	case "dengue":
		return "Mozzie Wipeout sweep — " + loc,
			"Clear stagnant water in common areas and remind residents in " + loc + " to apply repellent."
	case "transport":
		return "Help commuters reroute — " + loc,
			"Direct affected commuters to alternative routes and assist those with mobility needs near " + loc + "."
	case "cascade":
		lt := strings.ToLower(f.Title)
		switch {
		case strings.Contains(lt, "flash-flood"):
			return "Pre-position for flash flooding — " + loc,
				"Stage sandbags and warn residents near " + loc + " of imminent flash flooding; keep clear of underpasses and drains."
		case strings.Contains(lt, "transport"):
			return "Brief commuters on disruption — " + loc,
				"Alert commuters near " + loc + " to likely service slowdowns and help them plan alternate routes."
		case strings.Contains(lt, "health"):
			return "Combined haze + dengue check — " + loc,
				"Check on residents in " + loc + ": hand out masks for haze and clear indoor stagnant water for dengue."
		}
	}
	// Unknown type — fall back to the finding's own wording.
	return f.Title, f.Detail
}

func priorityForSeverity(s string) string {
	switch s {
	case SeverityCritical:
		return "high"
	case SeverityWarning:
		return "medium"
	default:
		return "low"
	}
}

func volunteersForSeverity(s string) int {
	switch s {
	case SeverityCritical:
		return 4
	case SeverityWarning:
		return 2
	default:
		return 1
	}
}

// GenerateTasksFromTriage is the end-to-end convenience: run triage on the
// active data provider, then generate task cards from the report.
func GenerateTasksFromTriage() ([]TaskCard, error) {
	report, err := RunTriage()
	if err != nil {
		return nil, err
	}
	return GenerateTaskCards(report)
}

// ForwardTasks best-effort POSTs each card to the tasks sink so they land in
// Sanjey's store. The sink (POST /api/tasks) is currently a stub, so failures
// are logged and swallowed — the caller still has the generated cards to show.
// Set TASKS_SINK_URL to enable forwarding; unset means log-only.
func ForwardTasks(cards []TaskCard) {
	sink := os.Getenv("TASKS_SINK_URL")
	if sink == "" {
		log.Printf("task-gen: %d task(s) generated; TASKS_SINK_URL unset, not forwarding (tasks endpoint is a stub)", len(cards))
		return
	}
	client := &http.Client{Timeout: 10 * time.Second}
	for _, t := range cards {
		payload, err := json.Marshal(t)
		if err != nil {
			log.Printf("task-gen: marshal task %q: %v", t.Title, err)
			continue
		}
		resp, err := client.Post(sink, "application/json", bytes.NewReader(payload))
		if err != nil {
			log.Printf("task-gen: forward task %q failed: %v", t.Title, err)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			log.Printf("task-gen: forward task %q got HTTP %d", t.Title, resp.StatusCode)
		}
	}
}
