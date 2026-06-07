package lib

import "testing"

// TestFallbackTaskCards checks the deterministic path produces several DISTINCT
// cards per finding, scaled by severity, mapping severity to priority/headcount
// sensibly (no LLM involved).
func TestFallbackTaskCards(t *testing.T) {
	// Critical → several cards, all high priority / 4 volunteers, distinct titles.
	crit := TriageFinding{Type: "flood", Severity: SeverityCritical, Title: "Flash flood: X", Detail: "details", Location: "X"}
	cards := fallbackTaskCards(crit, tasksForSeverity(crit.Severity))
	if len(cards) != 4 {
		t.Fatalf("critical → expected 4 cards, got %d", len(cards))
	}
	seen := map[string]bool{}
	for _, c := range cards {
		if c.Priority != "high" || c.VolunteersNeeded != 4 {
			t.Errorf("critical card → priority %q / %d volunteers", c.Priority, c.VolunteersNeeded)
		}
		if seen[c.Title] {
			t.Errorf("duplicate card title %q", c.Title)
		}
		seen[c.Title] = true
	}

	// Lower severity → fewer cards.
	low := TriageFinding{Type: "dengue", Severity: SeverityLow, Title: "Dengue: Y", Detail: "details", Location: "Y"}
	lc := fallbackTaskCards(low, tasksForSeverity(low.Severity))
	if len(lc) != 2 {
		t.Fatalf("low → expected 2 cards, got %d", len(lc))
	}
	if lc[0].Priority != "low" || lc[0].VolunteersNeeded != 1 {
		t.Errorf("low finding → got priority %q / %d volunteers", lc[0].Priority, lc[0].VolunteersNeeded)
	}

	// Requested count is capped by the available template bank (unknown type has
	// just the finding's own wording).
	unk := TriageFinding{Type: "other", Severity: SeverityCritical, Title: "t", Detail: "dd"}
	uc := fallbackTaskCards(unk, tasksForSeverity(unk.Severity))
	if len(uc) != 1 {
		t.Fatalf("unknown type → expected 1 card, got %d", len(uc))
	}
}

// TestSanitiseTaskCards checks empty cards are dropped and headcount/priority
// are clamped to safe values.
func TestSanitiseTaskCards(t *testing.T) {
	in := []TaskCard{
		{Title: "", Description: "drop me"},
		{Title: "Keep", Priority: "URGENT", VolunteersNeeded: 99},
		{Title: "Keep2", Priority: "", VolunteersNeeded: 0},
	}
	out := sanitiseTaskCards(in)
	if len(out) != 2 {
		t.Fatalf("expected 2 cards after sanitise, got %d", len(out))
	}
	if out[0].Priority != "high" || out[0].VolunteersNeeded != 10 {
		t.Errorf("clamp failed: priority %q, volunteers %d", out[0].Priority, out[0].VolunteersNeeded)
	}
	if out[1].Priority != "medium" || out[1].VolunteersNeeded != 1 {
		t.Errorf("defaults failed: priority %q, volunteers %d", out[1].Priority, out[1].VolunteersNeeded)
	}
}

// TestDedupFindings checks same-location findings collapse to the first (most
// severe) while empty-location findings are all kept.
func TestDedupFindings(t *testing.T) {
	in := []TriageFinding{
		{Type: "cascade", Severity: SeverityCritical, Title: "Flash-flood cascade: A", Location: "A"},
		{Type: "flood", Severity: SeverityWarning, Title: "Rising water: A", Location: "A"},
		{Type: "haze", Severity: SeverityWarning, Title: "Haze", Location: "West"},
		{Type: "other", Severity: SeverityLow, Title: "No location 1", Location: ""},
		{Type: "other", Severity: SeverityLow, Title: "No location 2", Location: ""},
	}
	out := dedupFindings(in)
	if len(out) != 4 {
		t.Fatalf("expected 4 findings after dedup, got %d", len(out))
	}
	if out[0].Severity != SeverityCritical || out[0].Location != "A" {
		t.Errorf("expected the critical A finding kept first, got %q @ %q", out[0].Severity, out[0].Location)
	}
}

// TestGenerateTaskCardsEmpty verifies no findings → no tasks, no error.
func TestGenerateTaskCardsEmpty(t *testing.T) {
	cards, err := GenerateTaskCards(TriageReport{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cards) != 0 {
		t.Fatalf("expected 0 cards, got %d", len(cards))
	}
}
