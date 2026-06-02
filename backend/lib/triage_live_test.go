package lib

import (
	"testing"
	"time"
)

// liveProviderWith builds a CrisisDataProvider pre-seeded with a fixed crises
// snapshot so the mapping logic can be tested without hitting Supabase.
func liveProviderWith(crises []Crisis) *CrisisDataProvider {
	p := NewCrisisDataProvider()
	p.snapshot = crises
	p.fetched = time.Now()
	p.ttl = time.Hour
	return p
}

// sampleCrises mimics what Sanjey's ingestion upserts into the crises table.
func sampleCrises() []Crisis {
	return []Crisis{
		// PUB water level near Pasir Ris MRT → flood + flash-flood + transport cascade.
		{ID: "c-flood", Type: "flood", Source: "pub", Severity: "high",
			LocationName: "Pasir Ris Canal", Lat: 1.3721, Lng: 103.9491,
			Title: "High Water Level — Pasir Ris Canal (3.6m)"},
		// NEA severe-weather forecast over the same area → drives the flash-flood cascade.
		{ID: "c-wx", Type: "flood", Source: "nea", Severity: "medium",
			LocationName: "Pasir Ris",
			Title:        "Severe Weather — Pasir Ris (Heavy Thundery Showers)"},
		{ID: "c-haze", Type: "haze", Source: "nea", Severity: "high",
			LocationName: "Singapore (National)",
			Title:        "Haze Alert — PSI 142 (National)"},
		{ID: "c-dengue", Type: "dengue", Source: "moh", Severity: "medium",
			LocationName: "Jurong West", Lat: 1.3404, Lng: 103.6957,
			Title: "Dengue Cluster — Jurong West", Description: "23 cases reported."},
		{ID: "c-mrt", Type: "mrt", Source: "lta", Severity: "medium",
			LocationName: "EWL Line",
			Description:  "EWL Line disruption affecting stations: Tanah Merah,Simei."},
	}
}

// TestLiveProviderMapping checks crises rows are adapted into the right readings.
func TestLiveProviderMapping(t *testing.T) {
	p := liveProviderWith(sampleCrises())

	floods, _ := p.Floods()
	if len(floods) != 1 || floods[0].CrisisID != "c-flood" {
		t.Fatalf("floods: want 1 reading from c-flood, got %+v", floods)
	}
	if floods[0].WaterLevelPct < floodWarnPct {
		t.Errorf("flood pct %v should trip warn threshold", floods[0].WaterLevelPct)
	}

	weather, _ := p.Weather()
	if len(weather) != 1 || weather[0].Area != "Pasir Ris" {
		t.Fatalf("weather: want 1 NEA forecast for Pasir Ris, got %+v", weather)
	}
	if !isHeavyRain(&weather[0]) {
		t.Errorf("weather %+v should read as heavy rain", weather[0])
	}

	haze, _ := p.Haze()
	if len(haze) != 1 || haze[0].PSI != 142 {
		t.Fatalf("haze: want PSI 142 parsed from title, got %+v", haze)
	}

	dengue, _ := p.Dengue()
	if len(dengue) != 1 || dengue[0].Cases != 23 {
		t.Fatalf("dengue: want 23 cases parsed, got %+v", dengue)
	}

	transport, _ := p.Transport()
	if len(transport) != 1 || transport[0].Status != "delayed" {
		t.Fatalf("transport: want 1 delayed disruption, got %+v", transport)
	}
	if got := transport[0].Stations; len(got) != 2 || got[0] != "Tanah Merah" {
		t.Errorf("transport stations: want [Tanah Merah Simei], got %v", got)
	}
}

// TestRunTriageLive runs the full engine on the live provider and checks the
// rules fire and the originating crisis_id is carried onto findings.
func TestRunTriageLive(t *testing.T) {
	SetDataProvider(liveProviderWith(sampleCrises()))
	defer SetDataProvider(NewMockProvider()) // restore for other tests

	report, err := RunTriage()
	if err != nil {
		t.Fatalf("RunTriage: %v", err)
	}

	var haveFlood, haveCascade bool
	var floodCrisisID string
	for _, f := range report.Findings {
		switch f.Type {
		case "flood":
			haveFlood = true
			floodCrisisID = f.CrisisID
		case "cascade":
			haveCascade = true
		}
	}
	if !haveFlood {
		t.Error("expected a flood finding from the live crisis")
	}
	if floodCrisisID != "c-flood" {
		t.Errorf("flood finding should carry crisis_id c-flood, got %q", floodCrisisID)
	}
	if !haveCascade {
		t.Error("expected a cascade finding (rain + high water near MRT)")
	}
}

// TestAttachFindingMeta confirms generated cards inherit the crisis_id of the
// finding they map to (index alignment), enabling real task writes.
func TestAttachFindingMeta(t *testing.T) {
	findings := []TriageFinding{
		{Type: "flood", Severity: SeverityCritical, Title: "x", Location: "Pasir Ris", CrisisID: "c-flood"},
		{Type: "haze", Severity: SeverityWarning, Title: "y", Location: "West", CrisisID: "c-haze"},
	}
	cards := fallbackTaskCards(findings)
	attachFindingMeta(cards, findings)
	if cards[0].CrisisID != "c-flood" || cards[1].CrisisID != "c-haze" {
		t.Fatalf("cards did not inherit crisis ids: %+v", cards)
	}

	// Length mismatch must leave cards untagged rather than mislabel them.
	cards2 := []TaskCard{{Title: "only one"}}
	attachFindingMeta(cards2, findings)
	if cards2[0].CrisisID != "" {
		t.Errorf("mismatched lengths should not tag cards, got %q", cards2[0].CrisisID)
	}
}

// TestLiveProviderHelpers covers the small parsing helpers.
func TestLiveProviderHelpers(t *testing.T) {
	if regionFromName("West Region") != "west" {
		t.Error("regionFromName should detect 'west'")
	}
	if regionFromName("Singapore (National)") != "national" {
		t.Error("regionFromName should default to 'national'")
	}
	if got := forecastFromCrisis(Crisis{Title: "Severe Weather — Pasir Ris (Heavy Thundery Showers)"}); got != "Heavy Thundery Showers" {
		t.Errorf("forecastFromCrisis: got %q", got)
	}
	if parseInt(psiRe, "PSI 142 (National)") != 142 {
		t.Error("psiRe should parse 142")
	}
}
