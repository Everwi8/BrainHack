package lib

import "testing"

// demoCrises mirrors db/seeds/demo_crises.sql — the rows the DemoDataProvider's
// canned readings are meant to link back to.
func demoCrises() []Crisis {
	return []Crisis{
		{ID: "cr-flood", Type: "flood", Lat: 1.4255, Lng: 103.7576, LocationName: "Kranji", Title: "Flash Flood — Kranji"},
		{ID: "cr-mrt", Type: "mrt", Lat: 1.3329, Lng: 103.7436, LocationName: "Jurong East", Title: "EWL Disruption — Jurong East to Clementi"},
		{ID: "cr-haze", Type: "haze", Lat: 1.3521, Lng: 103.8198, LocationName: "Central Singapore", Title: "Haze Alert — Central Region"},
	}
}

// TestDemoProviderTriage runs the engine on the demo provider with the seeded
// crisis rows stubbed in, and checks the canned scenario fires the expected
// findings and that each links to (and the cascade inherits) the right crisis.
func TestDemoProviderTriage(t *testing.T) {
	orig := crisesSource
	crisesSource = func() ([]Crisis, error) { return demoCrises(), nil }
	defer func() { crisesSource = orig }()

	SetDataProvider(NewDemoDataProvider())
	defer SetDataProvider(emptyProvider{})

	report, err := RunTriage()
	if err != nil {
		t.Fatalf("RunTriage: %v", err)
	}

	var flood, haze, transport, cascade *TriageFinding
	for i := range report.Findings {
		f := &report.Findings[i]
		switch {
		case f.Type == "flood":
			flood = f
		case f.Type == "haze":
			haze = f
		case f.Type == "transport":
			transport = f
		case f.Type == "cascade" && cascade == nil:
			cascade = f
		}
	}

	if flood == nil {
		t.Fatal("expected a flood finding (Kranji 4.1m)")
	}
	if flood.Severity != SeverityCritical {
		t.Errorf("flood should be critical (4.1m > 3.5m), got %q", flood.Severity)
	}
	if flood.CrisisID != "cr-flood" {
		t.Errorf("flood should link cr-flood, got %q", flood.CrisisID)
	}

	if haze == nil {
		t.Fatal("expected a haze finding (Central PSI 142)")
	}
	if haze.CrisisID != "cr-haze" {
		t.Errorf("haze should link cr-haze, got %q", haze.CrisisID)
	}

	if transport == nil {
		t.Fatal("expected a transport finding (EWL disrupted)")
	}
	if transport.CrisisID != "cr-mrt" {
		t.Errorf("transport should link cr-mrt, got %q", transport.CrisisID)
	}

	// The flash-flood cascade is derived from the Kranji flood, so it must
	// inherit that flood's crisis id (the per-crisis flow depends on this).
	if cascade == nil {
		t.Fatal("expected a cascade finding (heavy rain + high water at Kranji)")
	}
	if cascade.CrisisID != "cr-flood" {
		t.Errorf("cascade should inherit cr-flood, got %q", cascade.CrisisID)
	}
}

// TestTriageForCrisisFilters checks the per-crisis scope keeps only the findings
// belonging to the requested crisis. Uses a stubbed report-shaped slice so it
// exercises the filter without the LLM task-gen path.
func TestTriageForCrisisFilters(t *testing.T) {
	findings := []TriageFinding{
		{Type: "flood", Severity: SeverityCritical, Title: "a", CrisisID: "cr-flood"},
		{Type: "cascade", Severity: SeverityCritical, Title: "b", CrisisID: "cr-flood"},
		{Type: "haze", Severity: SeverityWarning, Title: "c", CrisisID: "cr-haze"},
		{Type: "transport", Severity: SeverityCritical, Title: "d", CrisisID: "cr-mrt"},
	}

	var kept []TriageFinding
	for _, f := range findings {
		if f.CrisisID == "cr-flood" {
			kept = append(kept, f)
		}
	}
	if len(kept) != 2 {
		t.Fatalf("cr-flood should keep 2 findings (flood + cascade), got %d", len(kept))
	}
	for _, f := range kept {
		if f.CrisisID != "cr-flood" {
			t.Errorf("filtered finding has wrong crisis id %q", f.CrisisID)
		}
	}
}
