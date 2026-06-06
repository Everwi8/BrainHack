// Perrin — live data provider for triage. Reads the real cross-agency feeds via
// the shared fetchers in datasource.go (NEA weather + PSI, PUB water level, NEA
// dengue, LTA train alerts) and maps them into the per-signal readings the
// triage rules expect. No mock data and no severity-bucket guesswork: every
// metric here is a real reading off a live feed.
//
// One run of RunTriage calls all five reading methods back-to-back, so the five
// feeds are fetched once and cached for a short TTL to avoid hammering the
// upstream APIs (and to keep a single triage burst consistent). On a feed error
// that signal degrades to empty for the run — triage and chat must never break
// because one upstream is down — and the error is logged.
package lib

import (
	"log"
	"strings"
	"sync"
	"time"
)

// liveProviderTTL bounds how often a triage burst re-hits the upstream feeds.
const liveProviderTTL = 60 * time.Second

// Fetchers are indirected through package vars so tests can stub the network.
var (
	weatherFetcher   = FetchWeather
	waterFetcher     = FetchWaterLevels
	hazeFetcher      = FetchHaze
	dengueFetcher    = FetchDengue
	transportFetcher = FetchTransport
)

// crisesSource supplies the active crisis rows used to re-link a live reading to
// a crisis_id (see crisisMatcher). Indirected so tests can stub it without a DB.
var crisesSource = liveCrises

func liveCrises() ([]Crisis, error) {
	if DB == nil {
		return nil, nil
	}
	return DB.GetCrises()
}

// How close a live reading must be to a crisis row (km) to be linked to it.
const (
	floodMatchKm  = 2.0
	dengueMatchKm = 2.0
)

// liveSnapshot is one consistent pull of all five signals.
type liveSnapshot struct {
	weather   []WeatherReading
	floods    []FloodReading
	haze      []HazeReading
	dengue    []DengueCluster
	transport []TransportDisruption
}

// LiveDataProvider derives triage readings from the live cross-agency feeds.
type LiveDataProvider struct {
	mu      sync.Mutex
	snap    *liveSnapshot
	fetched time.Time
	ttl     time.Duration
}

// NewLiveDataProvider builds the live provider.
func NewLiveDataProvider() *LiveDataProvider {
	return &LiveDataProvider{ttl: liveProviderTTL}
}

// load returns the cached snapshot if fresh, else pulls every feed once. A feed
// error degrades that signal to empty (logged) rather than failing the whole run.
func (p *LiveDataProvider) load() *liveSnapshot {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.snap != nil && time.Since(p.fetched) < p.ttl {
		return p.snap
	}

	snap := &liveSnapshot{}

	if wx, err := weatherFetcher(); err != nil {
		log.Printf("[triage/live] weather feed: %v — skipping this run", err)
	} else {
		for _, f := range wx.Readings {
			snap.weather = append(snap.weather, WeatherReading{
				Area:     f.Area,
				Forecast: f.Forecast,
				// RainfallMM not available from the 2-hour forecast feed (gap —
				// see plan.md); heavy-rain detection falls back to forecast text.
			})
		}
	}

	if wl, err := waterFetcher(); err != nil {
		log.Printf("[triage/live] water-level feed: %v — skipping this run", err)
	} else {
		for _, s := range wl.Stations {
			snap.floods = append(snap.floods, FloodReading{
				SensorID:    s.ID,
				Location:    s.Name,
				Lat:         s.Lat,
				Lng:         s.Lng,
				WaterLevelM: s.LevelM,
			})
		}
	}

	if hz, err := hazeFetcher(); err != nil {
		log.Printf("[triage/live] psi feed: %v — skipping this run", err)
	} else {
		p := hz.PSI24h
		for _, r := range []struct {
			region string
			psi    float64
		}{
			{"north", p.North}, {"south", p.South}, {"east", p.East},
			{"west", p.West}, {"central", p.Central},
		} {
			snap.haze = append(snap.haze, HazeReading{Region: r.region, PSI: int(r.psi)})
		}
	}

	if dg, err := dengueFetcher(); err != nil {
		log.Printf("[triage/live] dengue feed: %v — skipping this run", err)
	} else {
		for _, c := range dg.Clusters {
			snap.dengue = append(snap.dengue, DengueCluster{
				Locality: c.Area, Lat: c.Lat, Lng: c.Lng, Cases: c.Cases,
			})
		}
	}

	if tr, err := transportFetcher(); err != nil {
		log.Printf("[triage/live] transport feed: %v — skipping this run", err)
	} else {
		status := "delayed"
		if tr.Status == "disrupted" {
			status = "disrupted"
		}
		for _, a := range tr.Alerts {
			snap.transport = append(snap.transport, TransportDisruption{
				Line:        a.Line,
				Stations:    splitStations(a.Stations),
				Status:      status,
				Description: a.Message,
			})
		}
	}

	// Re-link each reading to a crisis row so the generated task cards carry a
	// crisis_id (the raw feeds don't). Best-effort: a lookup failure just leaves
	// the ids empty, same as an unmatched reading.
	if crises, err := crisesSource(); err != nil {
		log.Printf("[triage/live] crisis_id lookup: %v — findings will have no crisis_id", err)
	} else {
		linkCrisisIDs(snap, newCrisisMatcher(crises))
	}

	p.snap = snap
	p.fetched = time.Now()
	return snap
}

func (p *LiveDataProvider) Weather() ([]WeatherReading, error)        { return p.load().weather, nil }
func (p *LiveDataProvider) Floods() ([]FloodReading, error)           { return p.load().floods, nil }
func (p *LiveDataProvider) Haze() ([]HazeReading, error)              { return p.load().haze, nil }
func (p *LiveDataProvider) Dengue() ([]DengueCluster, error)          { return p.load().dengue, nil }
func (p *LiveDataProvider) Transport() ([]TransportDisruption, error) { return p.load().transport, nil }

// ---------------------------------------------------------------------------
// crisis_id re-linking
// ---------------------------------------------------------------------------
//
// The raw /api/data feeds carry no crisis-row id, but ingestion still populates
// the crises table, so we match each live reading back to a crisis row (by type
// + proximity/name) and stamp its id onto the reading. That id then rides the
// chain reading → finding → task card, letting ForwardTasks write FK-valid task
// rows. Best-effort: an unmatched reading keeps an empty CrisisID and its task
// card simply isn't DB-persisted, exactly as in the unlinked case.

type crisisMatcher struct {
	byType map[string][]Crisis
}

func newCrisisMatcher(crises []Crisis) *crisisMatcher {
	m := &crisisMatcher{byType: make(map[string][]Crisis)}
	for _, c := range crises {
		m.byType[c.Type] = append(m.byType[c.Type], c)
	}
	return m
}

// nearest returns the id of the crisis of the given type closest to (lat,lng)
// within maxKm. Rows without coordinates are ignored. "" if none qualify.
func (m *crisisMatcher) nearest(ctype string, lat, lng, maxKm float64) string {
	best, bestKm := "", maxKm
	for _, c := range m.byType[ctype] {
		if c.Lat == 0 && c.Lng == 0 {
			continue
		}
		if d := haversineKm(lat, lng, c.Lat, c.Lng); d <= bestKm {
			best, bestKm = c.ID, d
		}
	}
	return best
}

// byName returns the id of the first crisis of the given type whose location
// name or title contains needle (case-insensitive). "" if none / empty needle.
func (m *crisisMatcher) byName(ctype, needle string) string {
	needle = strings.ToLower(strings.TrimSpace(needle))
	if needle == "" {
		return ""
	}
	for _, c := range m.byType[ctype] {
		if strings.Contains(strings.ToLower(c.LocationName+" "+c.Title), needle) {
			return c.ID
		}
	}
	return ""
}

// first returns the id of any crisis of the given type (used for national-scope
// signals like haze where there is a single aggregate row). "" if none.
func (m *crisisMatcher) first(ctype string) string {
	if rows := m.byType[ctype]; len(rows) > 0 {
		return rows[0].ID
	}
	return ""
}

// linkCrisisIDs stamps each reading in the snapshot with the id of the crisis
// row it best matches. Mutates snap in place.
func linkCrisisIDs(snap *liveSnapshot, m *crisisMatcher) {
	for i := range snap.floods {
		f := &snap.floods[i]
		f.CrisisID = m.nearest("flood", f.Lat, f.Lng, floodMatchKm)
	}
	for i := range snap.dengue {
		d := &snap.dengue[i]
		id := m.nearest("dengue", d.Lat, d.Lng, dengueMatchKm)
		if id == "" {
			id = m.byName("dengue", d.Locality)
		}
		d.CrisisID = id
	}
	hazeID := m.first("haze") // haze is upserted as one national row
	for i := range snap.haze {
		snap.haze[i].CrisisID = hazeID
	}
	for i := range snap.transport {
		t := &snap.transport[i]
		t.CrisisID = m.byName("mrt", t.Line) // crisis LocationName is e.g. "EWL Line"
	}
}

// splitStations parses an LTA affected-stations string ("Tanah Merah, Simei" or
// "Tanah Merah,Simei") into a clean slice; empty input yields no stations.
func splitStations(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Default provider (no data until SelectDataProvider installs the live one)
// ---------------------------------------------------------------------------

// emptyProvider yields no readings. It is the package default so triage is inert
// until SelectDataProvider wires in the live feeds at startup, and so unit tests
// that don't install a provider don't accidentally hit the network.
type emptyProvider struct{}

func (emptyProvider) Weather() ([]WeatherReading, error)        { return nil, nil }
func (emptyProvider) Floods() ([]FloodReading, error)           { return nil, nil }
func (emptyProvider) Haze() ([]HazeReading, error)              { return nil, nil }
func (emptyProvider) Dengue() ([]DengueCluster, error)          { return nil, nil }
func (emptyProvider) Transport() ([]TransportDisruption, error) { return nil, nil }

// SelectDataProvider installs the live data source. Call once after lib.Init().
// Triage now runs only on live cross-agency feeds — there is no mock fallback.
func SelectDataProvider() {
	SetDataProvider(NewLiveDataProvider())
	log.Println("[triage] data provider: live cross-agency feeds")
}
