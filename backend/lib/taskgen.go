// Perrin — Auto task-card generation (Phase 4). Turns triage findings into
// actionable volunteer task cards. The LLM does the wording via the Phase 1
// ChatJSON helper; if it fails or returns nothing usable, a deterministic
// mapping guarantees the demo never shows an empty task list.
//
// Findings are deduplicated by location and capped before generation so the
// same spot doesn't spawn near-duplicate cards and the LLM response stays small.
//
// Generated cards land in Sanjey's tasks store via lib.DB (the same store behind
// POST /api/tasks). A task row needs a real crisis_id FK, so ForwardTasks only
// writes cards that carry one (i.e. findings derived from live crises — cascade
// findings and mock-data runs have none). Writes are gated behind FORWARD_TASKS=1
// and default to log-only so repeated demo calls don't spam the shared DB.
package lib

import (
	"fmt"
	"log"
	"os"
	"strings"
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
	Type             string `json:"type,omitempty"` // mirrors the finding type
	Location         string `json:"location,omitempty"`
}

// taskGenSystem instructs the model to convert findings into ready-to-assign
// volunteer tasks. Constrained to a JSON envelope so ChatJSON can parse it, and
// kept short so the (slow, free) model returns promptly.
const taskGenSystem = `You are the task-planning module for BrainySG, Singapore's crisis-response platform. You convert ONE triaged situation into concrete volunteer task cards for community responders (RC/CC members, SCDF CERT teams).

Return ONLY a JSON object (no prose, no markdown fences) of this exact shape:
{
  "tasks": [
    {"title": "<imperative, max 8 words>", "description": "<ONE sentence: what the volunteer does + a safety note>", "priority": "<high|medium|low>", "volunteers_needed": <integer 1-10>, "type": "<crisis type>", "location": "<affected location>"}
  ]
}

Rules:
- You are given ONE situation and a target number of tasks. Generate close to that many DISTINCT, non-overlapping volunteer tasks for it — each a different concrete action (e.g. for a flood: guide residents to higher ground, stage sandbags, check on elderly, set up safe-route wayfinding). More severe situations warrant more tasks.
- Do NOT merge, add, or invent other situations, locations, names, or numbers beyond the one given.
- Critical situations get "high" priority; warnings "medium"; low "low".
- Tasks must be practical community actions. Do NOT invent emergency-services work (firefighting, rescue) — those go to 995.`

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

	// One generation per finding: the model returns several distinct tasks for
	// that single situation, and we stamp the finding's crisis_id on all of them.
	// Generating per-finding (rather than one batched call) keeps crisis_id
	// attribution exact — no fragile index alignment between cards and findings.
	var out []TaskCard
	for _, f := range findings {
		out = append(out, generateCardsForFinding(f)...)
	}
	return out, nil
}

// generateCardsForFinding produces several volunteer tasks for a single finding,
// scaled by severity (tasksForSeverity). The LLM writes the cards; on failure or
// an empty response a deterministic template set runs instead. Either way every
// returned card carries the finding's crisis_id/type/location so the per-crisis
// view and ForwardTasks can attribute it correctly.
func generateCardsForFinding(f TriageFinding) []TaskCard {
	n := tasksForSeverity(f.Severity)

	cards, err := generateTaskCardsLLM(f, n)
	if err != nil || len(cards) == 0 {
		if err != nil {
			log.Printf("task-gen: LLM path failed (%v), using deterministic fallback", err)
		}
		cards = fallbackTaskCards(f, n)
	}

	stampFinding(cards, f)
	return cards
}

// stampFinding tags every card with its source finding's crisis_id (and fills in
// type/location when the LLM dropped them) so the per-crisis view and
// ForwardTasks can attribute the task to the right crisis row.
func stampFinding(cards []TaskCard, f TriageFinding) {
	for i := range cards {
		cards[i].CrisisID = f.CrisisID
		if cards[i].Type == "" {
			cards[i].Type = f.Type
		}
		if cards[i].Location == "" {
			cards[i].Location = f.Location
		}
	}
}

// tasksForSeverity is the target number of volunteer tasks per situation — more
// severe situations warrant more hands. The LLM treats it as guidance; the
// deterministic fallback produces exactly this many (capped by template count).
func tasksForSeverity(s string) int {
	switch s {
	case SeverityCritical:
		return 4
	case SeverityWarning:
		return 3
	default:
		return 2
	}
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

// generateTaskCardsLLM is the LLM path: it describes a single finding and asks
// for about n distinct task cards, then parses the model's JSON envelope.
func generateTaskCardsLLM(f TriageFinding, n int) ([]TaskCard, error) {
	loc := f.Location
	if loc == "" {
		loc = "unspecified"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Situation [%s] type=%s location=%q: %s\n\n", f.Severity, f.Type, loc, f.Detail)
	fmt.Fprintf(&b, "Generate about %d distinct volunteer task cards for this single situation. Each must be a different concrete action — do not repeat or merge.", n)

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

// fallbackTaskCards maps a single finding to up to n task cards deterministically
// — no LLM. It draws from a per-type bank of distinct community actions so the
// offline path still produces a fleshed-out, demo-ready list scaled by severity.
func fallbackTaskCards(f TriageFinding, n int) []TaskCard {
	templates := taskTemplatesFor(f)
	if len(templates) == 0 {
		templates = [][2]string{{f.Title, f.Detail}}
	}
	if n < 1 {
		n = 1
	}
	if n > len(templates) {
		n = len(templates)
	}
	out := make([]TaskCard, 0, n)
	for _, tpl := range templates[:n] {
		out = append(out, TaskCard{
			Title:            tpl[0],
			Description:      tpl[1],
			Priority:         priorityForSeverity(f.Severity),
			VolunteersNeeded: volunteersForSeverity(f.Severity),
			Type:             f.Type,
			Location:         f.Location,
		})
	}
	return out
}

// taskTemplatesFor returns a bank of distinct {title, description} actions for a
// finding's crisis type, most important first. fallbackTaskCards takes the first
// n. Cascade findings are routed by a keyword in their title since they carry no
// single primitive type.
func taskTemplatesFor(f TriageFinding) [][2]string {
	loc := f.Location
	if loc == "" {
		loc = "the affected area"
	}
	switch f.Type {
	case "flood":
		return [][2]string{
			{"Guide residents to higher ground — " + loc, "Help residents near " + loc + " move to higher ground and away from rising water; never enter fast-moving floodwater — call 995 for rescues."},
			{"Stage sandbags and barriers — " + loc, "Position sandbags at entrances and low-lying access points around " + loc + "; work in pairs and keep clear of drains."},
			{"Check on elderly and vulnerable — " + loc, "Door-knock elderly and mobility-impaired residents near " + loc + " and help them relocate early if needed."},
			{"Set up safe-route wayfinding — " + loc, "Mark and direct people along dry, safe routes around " + loc + ", away from flooded underpasses."},
			{"Monitor water levels and report — " + loc, "Watch canal and drain levels near " + loc + " and report rapid rises to coordinators; do not wade in."},
		}
	case "haze":
		return [][2]string{
			{"Distribute N95 masks — " + loc, "Hand out N95 masks to residents in " + loc + ", prioritising elderly, children and those with breathing conditions."},
			{"Check on vulnerable residents — " + loc, "Visit elderly and unwell residents indoors near " + loc + " and ensure they have clean air and water."},
			{"Set up clean-air rest points — " + loc, "Open and staff air-conditioned community spaces near " + loc + " as haze shelters."},
			{"Share haze health advisories — " + loc, "Spread NEA health advice and PSI updates to residents around " + loc + "."},
		}
	case "dengue":
		return [][2]string{
			{"Mozzie Wipeout sweep — " + loc, "Clear stagnant water in common areas near " + loc + " and remind residents to apply repellent."},
			{"Inspect void decks and drains — " + loc, "Check void decks, drains and planters around " + loc + " for breeding spots and clear them."},
			{"Distribute repellent and advisories — " + loc, "Hand out insect repellent and NEA dengue advisories to households in " + loc + "."},
			{"Door-knock breeding-source checks — " + loc, "Remind residents in " + loc + " to overturn pails and change vase water; report persistent sources."},
		}
	case "transport":
		return [][2]string{
			{"Help commuters reroute — " + loc, "Direct affected commuters near " + loc + " to alternative routes and assist those with mobility needs."},
			{"Direct crowds to bridging buses — " + loc, "Guide commuters to free bridging buses near " + loc + " and keep boarding queues orderly."},
			{"Assist mobility-impaired commuters — " + loc, "Help elderly, wheelchair and pram users near " + loc + " navigate the disruption safely."},
			{"Relay live service updates — " + loc, "Share official restoration estimates and route changes with commuters around " + loc + "."},
		}
	case "cascade":
		lt := strings.ToLower(f.Title)
		switch {
		case strings.Contains(lt, "flash-flood"):
			return [][2]string{
				{"Pre-position for flash flooding — " + loc, "Stage sandbags and warn residents near " + loc + " of imminent flash flooding; keep clear of underpasses and drains."},
				{"Warn and evacuate low-lying units — " + loc, "Alert ground-floor and basement occupants near " + loc + " to move belongings and people up early."},
				{"Cordon flood-prone underpasses — " + loc, "Block access to underpasses and drains around " + loc + " and redirect pedestrians and traffic."},
			}
		case strings.Contains(lt, "transport"):
			return [][2]string{
				{"Brief commuters on disruption — " + loc, "Alert commuters near " + loc + " to likely service slowdowns and help them plan alternate routes."},
				{"Staff key interchange points — " + loc, "Position volunteers at busy stops near " + loc + " to direct crowds and answer queries."},
			}
		case strings.Contains(lt, "health"):
			return [][2]string{
				{"Combined haze + dengue check — " + loc, "Check on residents in " + loc + ": hand out masks for haze and clear indoor stagnant water for dengue."},
				{"Protect vulnerable households — " + loc, "Visit elderly and unwell residents near " + loc + " with masks, repellent and health advice."},
			}
		}
	}
	// Unknown type — fall back to the finding's own wording.
	return [][2]string{{f.Title, f.Detail}}
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

// TriageForCrisis runs triage and returns only the findings — and the task cards
// derived from them — that belong to the given crisis row. This backs the
// per-crisis map-click flow: tap a crisis circle, see its triage + tasks. A
// crisis with no matching findings (e.g. it has gone quiet) yields an empty
// report and no tasks, not an error.
func TriageForCrisis(crisisID string) (TriageReport, []TaskCard, error) {
	scoped, err := TriageFindingsForCrisis(crisisID)
	if err != nil {
		return TriageReport{}, nil, err
	}
	if len(scoped.Findings) == 0 {
		return scoped, nil, nil
	}

	cards, err := GenerateTaskCards(scoped)
	if err != nil {
		return scoped, nil, err
	}
	return scoped, cards, nil
}

// TriageFindingsForCrisis returns just the findings scoped to one crisis (the
// Situation assessment), skipping the slower LLM task-card generation. Used by
// the crisis-triage handler when the crisis already has persisted task rows, so
// reloading the page doesn't re-run task generation.
func TriageFindingsForCrisis(crisisID string) (TriageReport, error) {
	report, err := RunTriage()
	if err != nil {
		return TriageReport{}, err
	}
	scoped := TriageReport{GeneratedAt: report.GeneratedAt}
	for _, f := range report.Findings {
		if f.CrisisID == crisisID {
			scoped.Findings = append(scoped.Findings, f)
		}
	}
	return scoped, nil
}

// ForwardTasks writes generated cards into the shared tasks store via lib.DB so
// they show up alongside coordinator-created tasks. Only cards tied to a real
// crisis row are written (a task needs a valid crisis_id FK); cascade findings
// and mock-data runs carry none and are skipped. Writes are gated behind
// FORWARD_TASKS=1 and default to log-only so repeated /api/triage/tasks calls
// during a demo don't pile duplicate rows into the DB. Errors are logged and
// swallowed — the caller still has the generated cards to return to the UI.
func ForwardTasks(cards []TaskCard) {
	if os.Getenv("FORWARD_TASKS") != "1" {
		log.Printf("task-gen: %d task(s) generated; FORWARD_TASKS!=1, not writing to tasks store (log-only)", len(cards))
		return
	}
	if DB == nil {
		log.Printf("task-gen: FORWARD_TASKS=1 but lib.DB is not initialised; skipping writes")
		return
	}

	var created, skipped int
	for _, t := range cards {
		if t.CrisisID == "" {
			skipped++ // no real crisis FK — would violate the tasks.crisis_id constraint
			continue
		}
		if _, err := DB.CreateTask(Task{
			CrisisID:    t.CrisisID,
			Title:       t.Title,
			Description: t.Description,
			Status:      "pending",
		}); err != nil {
			log.Printf("task-gen: create task %q for crisis %s: %v", t.Title, t.CrisisID, err)
			continue
		}
		created++
	}
	log.Printf("task-gen: wrote %d task(s) to store, skipped %d without a crisis_id", created, skipped)
}
