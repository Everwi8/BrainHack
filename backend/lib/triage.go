// Perrin — Triage logic. Pulls cross-agency data (weather, floods, haze,
// dengue, transport) behind a DataProvider interface, applies threshold and
// cascade rules, and produces a TriageReport. The findings also feed Brainy's
// chat prompt so answers reflect the current situation.
//
// The readings below come from the live cross-agency feeds: LiveDataProvider
// (triage_live.go) pulls NEA weather + PSI, PUB water level, NEA dengue, and LTA
// train alerts via the shared fetchers in datasource.go, and is installed by
// SelectDataProvider at startup. There is no mock data path — when a feed is
// unavailable that signal is simply absent for the run.
package lib

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// Data shapes (what the DataProvider returns)
// ---------------------------------------------------------------------------

// CrisisID, where set, links a reading back to a crisis row so findings (and the
// task cards derived from them) can reference a real crisis_id FK. The live
// /api/data feeds carry no crisis row id, so it is currently always empty — see
// the "live data gaps" note in plan.md.

// WeatherReading is a per-area forecast/nowcast snapshot.
type WeatherReading struct {
	Area       string  `json:"area"`
	Forecast   string  `json:"forecast"`    // e.g. "Heavy Thundery Showers"
	RainfallMM float64 `json:"rainfall_mm"` // recent rainfall, millimetres
	CrisisID   string  `json:"crisis_id,omitempty"`
}

// FloodReading is a single PUB water-level sensor reading. data.gov.sg reports
// absolute level in metres (it does not publish canal capacity), so triage keys
// on metres rather than a % of capacity.
type FloodReading struct {
	SensorID    string  `json:"sensor_id"`
	Location    string  `json:"location"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	WaterLevelM float64 `json:"water_level_m"` // absolute water level, metres
	CrisisID    string  `json:"crisis_id,omitempty"`
}

// HazeReading is a regional PSI/PM2.5 reading.
type HazeReading struct {
	Region   string `json:"region"` // north, south, east, west, central
	PSI      int    `json:"psi"`
	PM25     int    `json:"pm25"`
	CrisisID string `json:"crisis_id,omitempty"`
}

// DengueCluster is an active NEA dengue cluster.
type DengueCluster struct {
	Locality string  `json:"locality"`
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
	Cases    int     `json:"cases"`
	CrisisID string  `json:"crisis_id,omitempty"`
}

// TransportDisruption is an LTA MRT/bus service disruption.
type TransportDisruption struct {
	Line        string   `json:"line"`
	Stations    []string `json:"stations"`
	Status      string   `json:"status"` // normal, delayed, disrupted
	Description string   `json:"description"`
	CrisisID    string   `json:"crisis_id,omitempty"`
}

// DataProvider supplies the latest cross-agency readings. LiveDataProvider
// (triage_live.go) is the production implementation, backed by the live feeds;
// emptyProvider is the inert default until it is installed.
type DataProvider interface {
	Weather() ([]WeatherReading, error)
	Floods() ([]FloodReading, error)
	Haze() ([]HazeReading, error)
	Dengue() ([]DengueCluster, error)
	Transport() ([]TransportDisruption, error)
}

// ---------------------------------------------------------------------------
// Triage output
// ---------------------------------------------------------------------------

// Severity levels match the team-wide enum (see plan.md "Shared").
const (
	SeverityLow      = "low"
	SeverityWarning  = "warning"
	SeverityCritical = "critical"
)

// TriageFinding is one assessed situation, ready to surface in chat, on the
// map, or as the seed for a task card (Phase 4).
type TriageFinding struct {
	Type     string   `json:"type"`     // flood, haze, dengue, transport, cascade
	Severity string   `json:"severity"` // low, warning, critical
	Title    string   `json:"title"`
	Detail   string   `json:"detail"`
	Location string   `json:"location,omitempty"`
	Sources  []string `json:"sources"`             // agencies/data that drove it (NEA, PUB, LTA, MOH)
	Cascade  bool     `json:"cascade,omitempty"`   // true if derived from a multi-signal cascade rule
	CrisisID string   `json:"crisis_id,omitempty"` // originating crisis row, when triage runs on live data
}

// TriageReport is the full set of findings at a point in time.
type TriageReport struct {
	GeneratedAt time.Time       `json:"generated_at"`
	Findings    []TriageFinding `json:"findings"`
}

// Thresholds — tuned for a believable demo. Centralised so they are easy to
// explain and adjust.
const (
	floodWarnM    = 2.5 // PUB water level (metres); matches ingestion's high-water mark
	floodCritM    = 3.5
	hazeWarnPSI   = 100 // NEA "unhealthy"
	hazeCritPSI   = 200 // NEA "very unhealthy"
	dengueWarnCnt = 10  // NEA yellow cluster
	dengueCritCnt = 50  // NEA red cluster
	floodMRTKm    = 1.5 // a flood within this radius of an MRT station risks transport
)

// ---------------------------------------------------------------------------
// Active provider (swappable)
// ---------------------------------------------------------------------------

var (
	providerMu     sync.RWMutex
	activeProvider DataProvider = emptyProvider{}
)

// SetDataProvider swaps the data source (e.g. mock → live) at runtime.
func SetDataProvider(p DataProvider) {
	providerMu.Lock()
	activeProvider = p
	providerMu.Unlock()
}

func getProvider() DataProvider {
	providerMu.RLock()
	defer providerMu.RUnlock()
	return activeProvider
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

// RunTriage pulls the latest data from the active provider and applies the
// threshold and cascade rules, returning a sorted report (most severe first).
func RunTriage() (TriageReport, error) {
	p := getProvider()

	weather, err := p.Weather()
	if err != nil {
		return TriageReport{}, fmt.Errorf("triage: weather: %w", err)
	}
	floods, err := p.Floods()
	if err != nil {
		return TriageReport{}, fmt.Errorf("triage: floods: %w", err)
	}
	haze, err := p.Haze()
	if err != nil {
		return TriageReport{}, fmt.Errorf("triage: haze: %w", err)
	}
	dengue, err := p.Dengue()
	if err != nil {
		return TriageReport{}, fmt.Errorf("triage: dengue: %w", err)
	}
	transport, err := p.Transport()
	if err != nil {
		return TriageReport{}, fmt.Errorf("triage: transport: %w", err)
	}

	var findings []TriageFinding
	findings = append(findings, floodFindings(floods)...)
	findings = append(findings, hazeFindings(haze)...)
	findings = append(findings, dengueFindings(dengue)...)
	findings = append(findings, transportFindings(transport)...)

	// Cascade rules combine signals across agencies.
	findings = append(findings, cascadeFindings(weather, floods, haze, dengue)...)

	sortBySeverity(findings)
	return TriageReport{GeneratedAt: time.Now(), Findings: findings}, nil
}

// --- Threshold rules -------------------------------------------------------

func floodFindings(floods []FloodReading) []TriageFinding {
	var out []TriageFinding
	for _, f := range floods {
		switch {
		case f.WaterLevelM >= floodCritM:
			out = append(out, TriageFinding{
				Type:     "flood",
				Severity: SeverityCritical,
				Title:    "Flash flood risk: " + f.Location,
				Detail:   fmt.Sprintf("Water level at %.1fm — flooding likely. Avoid the area and move to higher ground.", f.WaterLevelM),
				Location: f.Location,
				Sources:  []string{"PUB"},
				CrisisID: f.CrisisID,
			})
		case f.WaterLevelM >= floodWarnM:
			out = append(out, TriageFinding{
				Type:     "flood",
				Severity: SeverityWarning,
				Title:    "Rising water: " + f.Location,
				Detail:   fmt.Sprintf("Water level at %.1fm. Stay alert and avoid low-lying paths nearby.", f.WaterLevelM),
				Location: f.Location,
				Sources:  []string{"PUB"},
				CrisisID: f.CrisisID,
			})
		}
	}
	return out
}

func hazeFindings(haze []HazeReading) []TriageFinding {
	var out []TriageFinding
	for _, h := range haze {
		region := titleCase(h.Region)
		switch {
		case h.PSI >= hazeCritPSI:
			out = append(out, TriageFinding{
				Type:     "haze",
				Severity: SeverityCritical,
				Title:    fmt.Sprintf("Very unhealthy air: %s (PSI %d)", region, h.PSI),
				Detail:   "Air quality is very unhealthy. Stay indoors, keep windows shut, and wear an N95 mask if you must go out. Vulnerable groups should avoid all outdoor activity.",
				Location: region,
				Sources:  []string{"NEA"},
				CrisisID: h.CrisisID,
			})
		case h.PSI >= hazeWarnPSI:
			out = append(out, TriageFinding{
				Type:     "haze",
				Severity: SeverityWarning,
				Title:    fmt.Sprintf("Unhealthy air: %s (PSI %d)", region, h.PSI),
				Detail:   "Air quality is unhealthy. Reduce prolonged outdoor exertion; the elderly, children, and those with heart/lung conditions should stay indoors.",
				Location: region,
				Sources:  []string{"NEA"},
				CrisisID: h.CrisisID,
			})
		}
	}
	return out
}

func dengueFindings(clusters []DengueCluster) []TriageFinding {
	var out []TriageFinding
	for _, d := range clusters {
		switch {
		case d.Cases >= dengueCritCnt:
			out = append(out, TriageFinding{
				Type:     "dengue",
				Severity: SeverityCritical,
				Title:    "Large dengue cluster: " + d.Locality,
				Detail:   fmt.Sprintf("%d cases reported. Remove stagnant water, apply repellent, and see a doctor for fever with body aches.", d.Cases),
				Location: d.Locality,
				Sources:  []string{"NEA"},
				CrisisID: d.CrisisID,
			})
		case d.Cases >= dengueWarnCnt:
			out = append(out, TriageFinding{
				Type:     "dengue",
				Severity: SeverityWarning,
				Title:    "Dengue cluster: " + d.Locality,
				Detail:   fmt.Sprintf("%d cases reported. Do the Mozzie Wipeout and use repellent.", d.Cases),
				Location: d.Locality,
				Sources:  []string{"NEA"},
				CrisisID: d.CrisisID,
			})
		}
	}
	return out
}

func transportFindings(disruptions []TransportDisruption) []TriageFinding {
	var out []TriageFinding
	for _, t := range disruptions {
		if t.Status == "" || t.Status == "normal" {
			continue
		}
		sev := SeverityWarning
		if t.Status == "disrupted" {
			sev = SeverityCritical
		}
		out = append(out, TriageFinding{
			Type:     "transport",
			Severity: sev,
			Title:    fmt.Sprintf("%s line %s", t.Line, t.Status),
			Detail:   t.Description,
			Location: strings.Join(t.Stations, ", "),
			Sources:  []string{"LTA"},
			CrisisID: t.CrisisID,
		})
	}
	return out
}

// --- Cascade rules ---------------------------------------------------------

// cascadeFindings derives compound risks from multiple signals:
//   - heavy rain forecast + a high water level → elevated flash-flood risk
//   - a flood near an MRT station → likely transport disruption
//   - unhealthy haze overlapping a dengue cluster → compound health risk
func cascadeFindings(weather []WeatherReading, floods []FloodReading, haze []HazeReading, dengue []DengueCluster) []TriageFinding {
	var out []TriageFinding

	// 1) Heavy rain + already-high water in the SAME area → flash-flood risk.
	// Pairing rain to the flood's own locality (rather than any heavy rain
	// anywhere) keeps the warning geographically honest.
	for _, f := range floods {
		if f.WaterLevelM < floodWarnM {
			continue
		}
		rain := rainForArea(weather, f.Location)
		if rain == nil {
			continue
		}
		out = append(out, TriageFinding{
			Type:     "cascade",
			Severity: SeverityCritical,
			Title:    "Flash-flood cascade: " + f.Location,
			Detail: fmt.Sprintf("%s forecast over %s while %s is already at %.1fm — flash flooding likely within the hour. Avoid underpasses and low-lying roads.",
				rain.Forecast, rain.Area, f.Location, f.WaterLevelM),
			Location: f.Location,
			Sources:  []string{"NEA", "PUB"},
			Cascade:  true,
			CrisisID: f.CrisisID, // inherit the originating flood's crisis so this surfaces per-crisis
		})
	}

	// 2) Flood near an MRT station → transport disruption risk.
	for _, f := range floods {
		if f.WaterLevelM < floodWarnM {
			continue
		}
		for _, st := range nearbyMRT(f.Lat, f.Lng, floodMRTKm) {
			out = append(out, TriageFinding{
				Type:     "cascade",
				Severity: SeverityWarning,
				Title:    "Transport risk: " + st.Name + " MRT",
				Detail: fmt.Sprintf("Flooding at %s is within %.1f km of %s station — expect possible service slowdowns or station entrance closures. Plan an alternate route.",
					f.Location, floodMRTKm, st.Name),
				Location: st.Name,
				Sources:  []string{"PUB", "LTA"},
				Cascade:  true,
				CrisisID: f.CrisisID, // originating flood crisis
			})
		}
	}

	// 3) Unhealthy haze overlapping a dengue cluster → compound health risk.
	for _, h := range haze {
		if h.PSI < hazeWarnPSI {
			continue
		}
		for _, d := range dengue {
			if d.Cases < dengueWarnCnt {
				continue
			}
			if regionContains(h.Region, d.Lat, d.Lng) {
				crisisID := d.CrisisID // prefer the dengue cluster row (matches Location); fall back to haze
				if crisisID == "" {
					crisisID = h.CrisisID
				}
				out = append(out, TriageFinding{
					Type:     "cascade",
					Severity: SeverityWarning,
					Title:    "Compound health risk: " + d.Locality,
					Detail: fmt.Sprintf("Unhealthy haze (PSI %d) overlaps a dengue cluster (%d cases) in %s. Staying indoors helps with haze but check for stagnant water inside; use repellent indoors too.",
						h.PSI, d.Cases, d.Locality),
					Location: d.Locality,
					Sources:  []string{"NEA"},
					Cascade:  true,
					CrisisID: crisisID,
				})
			}
		}
	}

	return out
}

// rainForArea returns the heavy-rain forecast covering the given flood
// location, or nil. A forecast covers a location when the location string
// contains the forecast's area name (e.g. area "Pasir Ris" covers "Pasir Ris
// Dr 3"); flood locations are named after their area, so substring matching is
// enough without a full geocoder.
func rainForArea(weather []WeatherReading, location string) *WeatherReading {
	loc := strings.ToLower(location)
	var best *WeatherReading
	for i := range weather {
		w := &weather[i]
		if !isHeavyRain(w) {
			continue
		}
		if !strings.Contains(loc, strings.ToLower(w.Area)) {
			continue
		}
		if best == nil || w.RainfallMM > best.RainfallMM {
			best = w
		}
	}
	return best
}

func isHeavyRain(w *WeatherReading) bool {
	f := strings.ToLower(w.Forecast)
	return w.RainfallMM >= 20 || strings.Contains(f, "heavy") || strings.Contains(f, "thundery")
}

// --- Sorting ---------------------------------------------------------------

func severityRank(s string) int {
	switch s {
	case SeverityCritical:
		return 0
	case SeverityWarning:
		return 1
	default:
		return 2
	}
}

// titleCase upper-cases the first rune of a lower-case region name (e.g.
// "west" → "West"). Region names are single ASCII words, so this is enough.
func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func sortBySeverity(f []TriageFinding) {
	sort.SliceStable(f, func(i, j int) bool {
		return severityRank(f[i].Severity) < severityRank(f[j].Severity)
	})
}

// ---------------------------------------------------------------------------
// Chat context
// ---------------------------------------------------------------------------

// currentTriageContext builds a concise situational-awareness block injected as
// a system message when a chat session starts, so Brainy's answers reflect the
// live situation. Returns "" if triage fails or finds nothing notable — chat
// must never break because the data layer is unavailable.
func currentTriageContext() string {
	report, err := RunTriage()
	if err != nil || len(report.Findings) == 0 {
		return ""
	}

	var b strings.Builder
	b.WriteString("CURRENT SINGAPORE SITUATION (live triage — use this to ground your answers; cite locations and severity when relevant, but do not invent details beyond this list):\n")
	for _, f := range report.Findings {
		loc := ""
		if f.Location != "" {
			loc = " @ " + f.Location
		}
		fmt.Fprintf(&b, "- [%s] %s%s — %s\n", strings.ToUpper(f.Severity), f.Title, loc, f.Detail)
	}
	return b.String()
}
