package lib

import "testing"

// TestRunTriageMock checks the mock data trips the expected threshold and
// cascade rules so the demo shows real findings.
func TestRunTriageMock(t *testing.T) {
	report, err := RunTriage()
	if err != nil {
		t.Fatalf("RunTriage: %v", err)
	}
	if len(report.Findings) == 0 {
		t.Fatal("expected findings, got none")
	}

	var haveFlood, haveHaze, haveDengue, haveTransport, haveCascade bool
	var cascadeKinds = map[string]bool{}
	for _, f := range report.Findings {
		switch f.Type {
		case "flood":
			haveFlood = true
		case "haze":
			haveHaze = true
		case "dengue":
			haveDengue = true
		case "transport":
			haveTransport = true
		case "cascade":
			haveCascade = true
			cascadeKinds[f.Title] = true
		}
		if severityRank(f.Severity) > 2 {
			t.Errorf("unexpected severity %q in %q", f.Severity, f.Title)
		}
	}

	if !haveFlood {
		t.Error("expected a flood finding (Pasir Ris 88%)")
	}
	if !haveHaze {
		t.Error("expected a haze finding (west PSI 142)")
	}
	if !haveDengue {
		t.Error("expected a dengue finding (Jurong West 23 cases)")
	}
	if !haveTransport {
		t.Error("expected a transport finding (EWL delayed)")
	}
	if !haveCascade {
		t.Error("expected at least one cascade finding")
	}

	// First finding must be the most severe (sorted).
	if severityRank(report.Findings[0].Severity) != 0 {
		t.Errorf("expected a critical finding first, got %q", report.Findings[0].Severity)
	}
}

// TestTriageContextNonEmpty ensures the chat-context block is produced.
func TestTriageContextNonEmpty(t *testing.T) {
	if currentTriageContext() == "" {
		t.Fatal("expected a non-empty triage context for chat injection")
	}
}
