package lib

import "testing"

// withStubbedFeeds points the live provider's fetchers at in-memory fixtures for
// the duration of fn, restoring the real fetchers afterwards. This lets us test
// the feed→reading mapping without hitting the network.
func withStubbedFeeds(
	wx WeatherFeed, wl WaterFeed, hz HazeFeed, dg DengueFeed, tr TransportFeed,
	fn func(),
) {
	ow, owl, oh, od, ot := weatherFetcher, waterFetcher, hazeFetcher, dengueFetcher, transportFetcher
	defer func() {
		weatherFetcher, waterFetcher, hazeFetcher, dengueFetcher, transportFetcher = ow, owl, oh, od, ot
	}()
	weatherFetcher = func() (WeatherFeed, error) { return wx, nil }
	waterFetcher = func() (WaterFeed, error) { return wl, nil }
	hazeFetcher = func() (HazeFeed, error) { return hz, nil }
	dengueFetcher = func() (DengueFeed, error) { return dg, nil }
	transportFetcher = func() (TransportFeed, error) { return tr, nil }
	fn()
}

// sampleFeeds returns a fixture set tuned to trip flood + cascade rules:
// Pasir Ris water 3.6m (critical) with heavy rain forecast over Pasir Ris and
// near Pasir Ris MRT, west PSI 142 (warning), a 23-case dengue cluster, and an
// EWL disruption.
func sampleFeeds() (WeatherFeed, WaterFeed, HazeFeed, DengueFeed, TransportFeed) {
	wx := WeatherFeed{Readings: []WeatherForecast{
		{Area: "Pasir Ris", Forecast: "Heavy Thundery Showers"},
		{Area: "Jurong West", Forecast: "Cloudy"},
	}}
	wl := WaterFeed{Stations: []WaterStation{
		{ID: "PUB-PR-03", Name: "Pasir Ris Dr 3", Lat: 1.3721, Lng: 103.9491, LevelM: 3.6},
		{ID: "PUB-BD-11", Name: "Bedok Canal", Lat: 1.3236, Lng: 103.9273, LevelM: 1.8},
	}}
	hz := HazeFeed{PSI24h: PSIReadings{National: 142, West: 142, North: 88, Central: 95}}
	dg := DengueFeed{Clusters: []DengueClusterFeed{
		{Area: "Jurong West St 91", Lat: 1.3404, Lng: 103.6957, Cases: 23},
		{Area: "Tampines Ave 4", Lat: 1.3540, Lng: 103.9540, Cases: 8},
	}}
	tr := TransportFeed{Status: "disrupted", Alerts: []TrainAlert{
		{Line: "EWL", Stations: "Tanah Merah, Simei", Message: "Signalling fault causing delays."},
	}}
	return wx, wl, hz, dg, tr
}

// TestLiveProviderMapping checks each feed is adapted into the right readings.
func TestLiveProviderMapping(t *testing.T) {
	wx, wl, hz, dg, tr := sampleFeeds()
	withStubbedFeeds(wx, wl, hz, dg, tr, func() {
		p := NewLiveDataProvider()

		floods, _ := p.Floods()
		if len(floods) != 2 || floods[0].WaterLevelM != 3.6 {
			t.Fatalf("floods: want 2 readings, first 3.6m, got %+v", floods)
		}

		weather, _ := p.Weather()
		if len(weather) != 2 || weather[0].Area != "Pasir Ris" {
			t.Fatalf("weather: want Pasir Ris first, got %+v", weather)
		}
		if !isHeavyRain(&weather[0]) {
			t.Errorf("weather %+v should read as heavy rain (forecast text)", weather[0])
		}

		haze, _ := p.Haze()
		var west int
		for _, h := range haze {
			if h.Region == "west" {
				west = h.PSI
			}
		}
		if west != 142 {
			t.Fatalf("haze: want west PSI 142, got %d (all: %+v)", west, haze)
		}

		dengue, _ := p.Dengue()
		if len(dengue) != 2 || dengue[0].Cases != 23 {
			t.Fatalf("dengue: want 23 cases first, got %+v", dengue)
		}

		transport, _ := p.Transport()
		if len(transport) != 1 || transport[0].Status != "disrupted" {
			t.Fatalf("transport: want 1 disrupted, got %+v", transport)
		}
		if got := transport[0].Stations; len(got) != 2 || got[0] != "Tanah Merah" {
			t.Errorf("transport stations: want [Tanah Merah Simei], got %v", got)
		}
	})
}

// TestRunTriageLive runs the full engine on the live provider (stubbed feeds)
// and checks the threshold + cascade rules fire on real metric values.
func TestRunTriageLive(t *testing.T) {
	wx, wl, hz, dg, tr := sampleFeeds()
	withStubbedFeeds(wx, wl, hz, dg, tr, func() {
		SetDataProvider(NewLiveDataProvider())
		defer SetDataProvider(emptyProvider{})

		report, err := RunTriage()
		if err != nil {
			t.Fatalf("RunTriage: %v", err)
		}

		var haveFlood, haveHaze, haveDengue, haveTransport, haveCascade bool
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
			}
		}
		if !haveFlood {
			t.Error("expected a flood finding (Pasir Ris 3.6m)")
		}
		if !haveHaze {
			t.Error("expected a haze finding (west PSI 142)")
		}
		if !haveDengue {
			t.Error("expected a dengue finding (Jurong West 23 cases)")
		}
		if !haveTransport {
			t.Error("expected a transport finding (EWL disrupted)")
		}
		if !haveCascade {
			t.Error("expected a cascade finding (rain + high water near MRT)")
		}
		if severityRank(report.Findings[0].Severity) != 0 {
			t.Errorf("expected a critical finding first, got %q", report.Findings[0].Severity)
		}
	})
}

// TestLiveProviderLinksCrisisID checks live readings are re-linked to the crisis
// row they best match, so generated task cards carry a crisis_id again.
func TestLiveProviderLinksCrisisID(t *testing.T) {
	wx, wl, hz, dg, tr := sampleFeeds()
	crises := []Crisis{
		{ID: "cr-flood", Type: "flood", Lat: 1.3722, Lng: 103.9490, LocationName: "Pasir Ris Dr 3"},
		{ID: "cr-dengue", Type: "dengue", Lat: 1.3405, Lng: 103.6958, LocationName: "Jurong West St 91"},
		{ID: "cr-haze", Type: "haze", Lat: 1.3521, Lng: 103.8198, LocationName: "Singapore (National)"},
		{ID: "cr-mrt", Type: "mrt", LocationName: "EWL Line", Title: "MRT Disruption — EWL"},
	}
	orig := crisesSource
	crisesSource = func() ([]Crisis, error) { return crises, nil }
	defer func() { crisesSource = orig }()

	withStubbedFeeds(wx, wl, hz, dg, tr, func() {
		p := NewLiveDataProvider()

		floods, _ := p.Floods()
		if floods[0].CrisisID != "cr-flood" {
			t.Errorf("flood near Pasir Ris should link cr-flood, got %q", floods[0].CrisisID)
		}
		// Bedok station (1.8m, ~2.5km away) has no nearby flood crisis → unlinked.
		if floods[1].CrisisID != "" {
			t.Errorf("distant flood reading should stay unlinked, got %q", floods[1].CrisisID)
		}

		dengue, _ := p.Dengue()
		if dengue[0].CrisisID != "cr-dengue" {
			t.Errorf("dengue cluster should link cr-dengue, got %q", dengue[0].CrisisID)
		}

		haze, _ := p.Haze()
		for _, h := range haze {
			if h.CrisisID != "cr-haze" {
				t.Errorf("haze region %s should link cr-haze, got %q", h.Region, h.CrisisID)
			}
		}

		transport, _ := p.Transport()
		if transport[0].CrisisID != "cr-mrt" {
			t.Errorf("EWL disruption should link cr-mrt, got %q", transport[0].CrisisID)
		}
	})
}

// TestSplitStations covers the LTA station-list parsing helper.
func TestSplitStations(t *testing.T) {
	got := splitStations("Tanah Merah, Simei,Tampines")
	if len(got) != 3 || got[2] != "Tampines" {
		t.Fatalf("splitStations: got %v", got)
	}
	if len(splitStations("")) != 0 {
		t.Error("splitStations(\"\") should be empty")
	}
}

// TestStampFinding confirms every generated card inherits its source finding's
// crisis_id (and type/location when blank), enabling real task writes. With the
// per-finding generation model, all cards from one finding share its crisis_id —
// no index alignment to get wrong.
func TestStampFinding(t *testing.T) {
	f := TriageFinding{Type: "flood", Severity: SeverityCritical, Title: "x", Location: "Pasir Ris", CrisisID: "c-flood"}
	cards := fallbackTaskCards(f, tasksForSeverity(f.Severity))
	if len(cards) < 2 {
		t.Fatalf("critical finding should yield several cards, got %d", len(cards))
	}
	stampFinding(cards, f)
	for i, c := range cards {
		if c.CrisisID != "c-flood" {
			t.Fatalf("card %d did not inherit crisis id: %+v", i, c)
		}
		if c.Type != "flood" || c.Location != "Pasir Ris" {
			t.Errorf("card %d missing type/location: %+v", i, c)
		}
	}
}
