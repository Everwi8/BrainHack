package lib

import "testing"

// TestFallbackTaskCards checks the deterministic mapping covers every finding
// and maps severity to priority/headcount sensibly (no LLM involved).
func TestFallbackTaskCards(t *testing.T) {
	findings := []TriageFinding{
		{Type: "flood", Severity: SeverityCritical, Title: "Flash flood: X", Detail: "details", Location: "X"},
		{Type: "haze", Severity: SeverityWarning, Title: "Haze: West", Detail: "details", Location: "West"},
		{Type: "dengue", Severity: SeverityLow, Title: "Dengue: Y", Detail: "details", Location: "Y"},
	}

	cards := fallbackTaskCards(findings)
	if len(cards) != len(findings) {
		t.Fatalf("expected %d cards, got %d", len(findings), len(cards))
	}
	if cards[0].Priority != "high" || cards[0].VolunteersNeeded != 4 {
		t.Errorf("critical finding → got priority %q / %d volunteers", cards[0].Priority, cards[0].VolunteersNeeded)
	}
	if cards[1].Priority != "medium" {
		t.Errorf("warning finding → got priority %q", cards[1].Priority)
	}
	if cards[2].Priority != "low" || cards[2].VolunteersNeeded != 1 {
		t.Errorf("low finding → got priority %q / %d volunteers", cards[2].Priority, cards[2].VolunteersNeeded)
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
