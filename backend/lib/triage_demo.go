// Perrin — demo data provider for triage. Returns a fixed set of
// threshold-crossing readings positioned at the seeded demo crises (see
// db/seeds/seed.sql), so that with DATA_SOURCE=demo the triage engine fires a
// believable, repeatable scenario even when Singapore is calm and the live
// feeds report all-clear.
//
// The coordinates and names here mirror the seeded crisis rows on purpose:
// linkCrisisIDs (triage_live.go) matches each reading back to its crisis row by
// type + proximity/name, so the findings — and the task cards derived from them
// — carry the right crisis_id and surface under the matching map circle.
package lib

import (
	"log"
	"sync"
	"time"
)

// DemoDataProvider serves a canned cross-agency scenario for demos. Like
// LiveDataProvider it builds one snapshot, links each reading to a seeded crisis
// row, and caches for a short TTL (so re-seeding the crises table is picked up
// within a minute without a restart).
type DemoDataProvider struct {
	mu    sync.Mutex
	snap  *liveSnapshot
	built time.Time
	ttl   time.Duration
}

// NewDemoDataProvider builds the demo provider.
func NewDemoDataProvider() *DemoDataProvider {
	return &DemoDataProvider{ttl: liveProviderTTL}
}

// demoSnapshot returns a fresh set of canned readings. Each is tuned to cross a
// triage threshold and to match a seeded crisis row:
//
//	flood     Kranji 4.1 m   (> floodCritM 3.5)  → critical, matches "Flash Flood — Kranji"
//	haze      Central PSI 142 (> hazeWarnPSI 100) → warning,  matches "Haze Alert — Central Region"
//	transport EWL disrupted                       → critical, matches "EWL Disruption …"
//	weather   Heavy rain over Kranji              → pairs with the flood for the flash-flood cascade
func demoSnapshot() *liveSnapshot {
	return &liveSnapshot{
		weather: []WeatherReading{
			// Heavy rain over Kranji pairs with the high water level below to
			// trigger the flash-flood cascade rule (NEA + PUB).
			{Area: "Kranji", Forecast: "Heavy Thundery Showers", RainfallMM: 42},
			{Area: "Jurong East", Forecast: "Cloudy"},
			{Area: "City", Forecast: "Hazy"},
		},
		floods: []FloodReading{
			{SensorID: "PUB-DEMO-KRANJI", Location: "Kranji", Lat: 1.4255, Lng: 103.7576, WaterLevelM: 4.1},
		},
		haze: []HazeReading{
			{Region: "central", PSI: 142},
			{Region: "north", PSI: 78},
			{Region: "south", PSI: 70},
			{Region: "east", PSI: 65},
			{Region: "west", PSI: 88},
		},
		// No dengue cluster is seeded, so leave dengue empty to keep the demo
		// focused on the three seeded crises (flood, haze, transport).
		transport: []TransportDisruption{
			{
				Line:        "EWL",
				Stations:    []string{"Jurong East", "Clementi"},
				Status:      "disrupted",
				Description: "Train service disrupted between Jurong East and Clementi due to a track fault. Free bridging buses are available.",
			},
		},
	}
}

// load returns the cached snapshot if fresh, else rebuilds the canned readings
// and re-links them to the current seeded crisis rows. Mirrors
// LiveDataProvider.load minus the network fetches.
func (p *DemoDataProvider) load() *liveSnapshot {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.snap != nil && time.Since(p.built) < p.ttl {
		return p.snap
	}

	snap := demoSnapshot()
	if crises, err := crisesSource(); err != nil {
		log.Printf("[triage/demo] crisis_id lookup: %v — findings will have no crisis_id", err)
	} else {
		linkCrisisIDs(snap, newCrisisMatcher(crises))
	}

	p.snap = snap
	p.built = time.Now()
	return snap
}

func (p *DemoDataProvider) Weather() ([]WeatherReading, error)        { return p.load().weather, nil }
func (p *DemoDataProvider) Floods() ([]FloodReading, error)           { return p.load().floods, nil }
func (p *DemoDataProvider) Haze() ([]HazeReading, error)              { return p.load().haze, nil }
func (p *DemoDataProvider) Dengue() ([]DengueCluster, error)          { return p.load().dengue, nil }
func (p *DemoDataProvider) Transport() ([]TransportDisruption, error) { return p.load().transport, nil }
