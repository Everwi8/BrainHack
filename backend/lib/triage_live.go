// Perrin — live data provider for triage. Sanjey's ingestion layer (NEA/PUB/LTA)
// doesn't expose the granular /api/data/* endpoints the original plan assumed;
// instead it aggregates every signal into the crises table (served by
// GET /api/crises / lib.DB.GetCrises). CrisisDataProvider adapts those rows back
// into the per-signal readings the triage rules expect, so RunTriage runs on
// real ingested data with no rule changes.
//
// Two boundary mismatches are handled here:
//   - severity: Sanjey emits low/medium/high/critical; we map those to the
//     metric each rule keys on (water %, PSI, case count) so the same thresholds
//     fire. Triage's own output stays low/warning/critical (the frontend's enum).
//   - shape: a flood crisis from PUB is a water reading, but from NEA it's a
//     rain forecast (same Type="flood"), so we split on Source.
//
// Real numbers are parsed out of the crisis title/description when present (PUB
// metres, "PSI 142", "23 cases"); otherwise we fall back to a severity-derived
// value. On a live fetch error we serve the last good snapshot, and failing that
// the mock data — triage and chat must never break because the DB is down.
package lib

import (
	"log"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// crisisProviderTTL bounds how often a single triage burst re-hits Supabase.
// RunTriage calls all five reading methods back-to-back; the snapshot cache
// turns that into one fetch.
const crisisProviderTTL = 60 * time.Second

// CrisisDataProvider derives triage readings from Sanjey's live crises table.
type CrisisDataProvider struct {
	mu       sync.Mutex
	snapshot []Crisis
	fetched  time.Time
	ttl      time.Duration
	fallback *MockProvider // used only when a live fetch fails with no cached snapshot
}

// NewCrisisDataProvider builds the live provider backed by lib.DB.
func NewCrisisDataProvider() *CrisisDataProvider {
	return &CrisisDataProvider{ttl: crisisProviderTTL, fallback: NewMockProvider()}
}

// load returns the current crises, cached for ttl. On error it serves the last
// good snapshot if there is one; otherwise it returns the error so callers can
// fall back to mock data.
func (p *CrisisDataProvider) load() ([]Crisis, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.snapshot != nil && time.Since(p.fetched) < p.ttl {
		return p.snapshot, nil
	}
	if DB == nil {
		if p.snapshot != nil {
			return p.snapshot, nil
		}
		return nil, errNoDB
	}
	cs, err := DB.GetCrises()
	if err != nil {
		if p.snapshot != nil {
			return p.snapshot, nil // last-known-good
		}
		return nil, err
	}
	p.snapshot = cs
	p.fetched = time.Now()
	return cs, nil
}

var errNoDB = &providerError{"lib.DB not initialised"}

type providerError struct{ msg string }

func (e *providerError) Error() string { return e.msg }

// byType returns the active crises of a given type.
func byType(crises []Crisis, t string) []Crisis {
	var out []Crisis
	for _, c := range crises {
		if c.Type == t {
			out = append(out, c)
		}
	}
	return out
}

func (p *CrisisDataProvider) Weather() ([]WeatherReading, error) {
	crises, err := p.load()
	if err != nil {
		log.Printf("[triage/live] weather: %v — falling back to mock", err)
		return p.fallback.Weather()
	}
	var out []WeatherReading
	for _, c := range byType(crises, "flood") {
		// NEA severe-weather rows are rain forecasts; PUB rows are water levels.
		if !strings.EqualFold(c.Source, "nea") {
			continue
		}
		out = append(out, WeatherReading{
			Area:       c.LocationName,
			Forecast:   forecastFromCrisis(c),
			RainfallMM: 30, // NEA only upserts a crisis for severe weather → treat as heavy
			CrisisID:   c.ID,
		})
	}
	return out, nil
}

func (p *CrisisDataProvider) Floods() ([]FloodReading, error) {
	crises, err := p.load()
	if err != nil {
		log.Printf("[triage/live] floods: %v — falling back to mock", err)
		return p.fallback.Floods()
	}
	var out []FloodReading
	for _, c := range byType(crises, "flood") {
		if strings.EqualFold(c.Source, "nea") {
			continue // that's a rain forecast, handled by Weather()
		}
		out = append(out, FloodReading{
			SensorID:      c.ExternalID,
			Location:      c.LocationName,
			Lat:           c.Lat,
			Lng:           c.Lng,
			WaterLevelPct: floodPctForSeverity(c.Severity),
			CrisisID:      c.ID,
		})
	}
	return out, nil
}

func (p *CrisisDataProvider) Haze() ([]HazeReading, error) {
	crises, err := p.load()
	if err != nil {
		log.Printf("[triage/live] haze: %v — falling back to mock", err)
		return p.fallback.Haze()
	}
	var out []HazeReading
	for _, c := range byType(crises, "haze") {
		psi := parseInt(psiRe, c.Title+" "+c.Description)
		if psi == 0 {
			psi = psiForSeverity(c.Severity)
		}
		out = append(out, HazeReading{
			Region:   regionFromName(c.LocationName),
			PSI:      psi,
			CrisisID: c.ID,
		})
	}
	return out, nil
}

func (p *CrisisDataProvider) Dengue() ([]DengueCluster, error) {
	crises, err := p.load()
	if err != nil {
		log.Printf("[triage/live] dengue: %v — falling back to mock", err)
		return p.fallback.Dengue()
	}
	var out []DengueCluster
	for _, c := range byType(crises, "dengue") {
		cases := parseInt(caseRe, c.Title+" "+c.Description)
		if cases == 0 {
			cases = dengueCasesForSeverity(c.Severity)
		}
		out = append(out, DengueCluster{
			Locality: c.LocationName,
			Lat:      c.Lat,
			Lng:      c.Lng,
			Cases:    cases,
			CrisisID: c.ID,
		})
	}
	return out, nil
}

func (p *CrisisDataProvider) Transport() ([]TransportDisruption, error) {
	crises, err := p.load()
	if err != nil {
		log.Printf("[triage/live] transport: %v — falling back to mock", err)
		return p.fallback.Transport()
	}
	var out []TransportDisruption
	for _, c := range byType(crises, "mrt") {
		status := "delayed"
		if c.Severity == "high" || c.Severity == "critical" {
			status = "disrupted"
		}
		out = append(out, TransportDisruption{
			Line:        strings.TrimSpace(strings.TrimSuffix(c.LocationName, "Line")),
			Stations:    stationsFromDescription(c.Description, c.LocationName),
			Status:      status,
			Description: c.Description,
			CrisisID:    c.ID,
		})
	}
	return out, nil
}

// --- severity → metric mappings (boundary translation) ---------------------
//
// Sanjey's ingestion only upserts a crisis once a source-side threshold is met,
// so even a "medium" row is a genuine event. We map each severity onto a metric
// value that re-trips the matching triage threshold (warn/critical).

func floodPctForSeverity(sev string) float64 {
	switch sev {
	case "critical":
		return 97
	case "high":
		return 92
	case "medium":
		return 80
	default:
		return 70 // below floodWarnPct — won't raise a finding on its own
	}
}

func psiForSeverity(sev string) int {
	switch sev {
	case "critical":
		return 320
	case "high":
		return 220
	case "medium":
		return 120
	default:
		return 80
	}
}

func dengueCasesForSeverity(sev string) int {
	switch sev {
	case "critical":
		return 80
	case "high":
		return 40
	case "medium":
		return 15
	default:
		return 8
	}
}

// --- parsing helpers -------------------------------------------------------

var (
	psiRe      = regexp.MustCompile(`(?i)PSI\s+(\d+)`)
	caseRe     = regexp.MustCompile(`(\d+)\s+case`)
	forecastRe = regexp.MustCompile(`\(([^)]+)\)\s*$`)
)

func parseInt(re *regexp.Regexp, s string) int {
	m := re.FindStringSubmatch(s)
	if len(m) < 2 {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

// forecastFromCrisis pulls the forecast phrase out of an NEA weather title like
// "Severe Weather — Pasir Ris (Heavy Thundery Showers)", falling back to a
// generic heavy-rain label so isHeavyRain still trips the flash-flood cascade.
func forecastFromCrisis(c Crisis) string {
	if m := forecastRe.FindStringSubmatch(c.Title); len(m) == 2 {
		return m[1]
	}
	return "Heavy Thundery Showers"
}

// regionFromName maps a crisis location to one of NEA's PSI regions when the
// name contains it (e.g. "West Region" → "west"); otherwise "national", which
// still surfaces a haze finding (it just won't drive a region-bounded cascade).
func regionFromName(name string) string {
	low := strings.ToLower(name)
	for _, r := range []string{"north", "south", "east", "west", "central"} {
		if strings.Contains(low, r) {
			return r
		}
	}
	return "national"
}

// stationsFromDescription extracts an affected-station list from an LTA
// description ("...affecting stations: A,B."), defaulting to the line name.
func stationsFromDescription(desc, fallback string) []string {
	if i := strings.Index(strings.ToLower(desc), "stations:"); i >= 0 {
		rest := desc[i+len("stations:"):]
		if j := strings.IndexByte(rest, '.'); j >= 0 {
			rest = rest[:j]
		}
		var stations []string
		for _, s := range strings.Split(rest, ",") {
			if s = strings.TrimSpace(s); s != "" {
				stations = append(stations, s)
			}
		}
		if len(stations) > 0 {
			return stations
		}
	}
	return []string{fallback}
}

// --- provider selection ----------------------------------------------------

// SelectDataProvider chooses the triage data source from the environment and
// installs it. Call once after lib.Init(). TRIAGE_PROVIDER overrides the
// default: "live" (always real), "mock" (always demo data), or unset/"auto"
// (live when SUPABASE_URL is configured, else mock so offline demos still work).
func SelectDataProvider() {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("TRIAGE_PROVIDER"))) {
	case "mock":
		SetDataProvider(NewMockProvider())
		log.Println("[triage] data provider: mock (forced)")
	case "live":
		SetDataProvider(NewCrisisDataProvider())
		log.Println("[triage] data provider: live crises (forced)")
	default:
		if os.Getenv("SUPABASE_URL") != "" {
			SetDataProvider(NewCrisisDataProvider())
			log.Println("[triage] data provider: live crises (SUPABASE_URL set)")
		} else {
			// package default is already mock; log for clarity
			log.Println("[triage] data provider: mock (SUPABASE_URL unset)")
		}
	}
}
