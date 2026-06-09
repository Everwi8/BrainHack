// NEA ingestion — polls data.gov.sg every 5 minutes for PSI (haze) and
// 2-hour weather forecasts, then upserts crisis records when thresholds are met.
package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"backend/cache"
	"backend/lib"
)

const (
	psiURL      = "https://api-open.data.gov.sg/v2/real-time/api/psi"
	weatherURL  = "https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast"
	neaInterval = 5 * time.Minute
)

// RunNEA starts the background ingestion loop. Call as a goroutine from main.
func RunNEA(ctx context.Context) {
	log.Println("[nea] ingestion started")
	if err := fetchNEA(); err != nil {
		log.Printf("[nea] initial fetch error: %v", err)
	}
	ticker := time.NewTicker(neaInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if err := fetchNEA(); err != nil {
				log.Printf("[nea] fetch error: %v", err)
			}
		case <-ctx.Done():
			log.Println("[nea] ingestion stopped")
			return
		}
	}
}

func fetchNEA() error {
	if err := fetchPSI(); err != nil {
		log.Printf("[nea] psi error: %v", err)
	}
	if err := fetchWeather(); err != nil {
		log.Printf("[nea] weather error: %v", err)
	}
	// Bust the crises list cache so the next API call returns fresh data.
	cache.GlobalCache.Invalidate("crises:all")
	return nil
}

// ─── PSI ─────────────────────────────────────────────────────────────────────

type psiResponse struct {
	Code int `json:"code"`
	Data struct {
		Items []struct {
			Readings struct {
				PsiTwentyFourHourly struct {
					North   float64 `json:"north"`
					South   float64 `json:"south"`
					East    float64 `json:"east"`
					West    float64 `json:"west"`
					Central float64 `json:"central"`
				} `json:"psi_twenty_four_hourly"`
			} `json:"readings"`
		} `json:"items"`
		RegionMetadata []struct {
			Name          string `json:"name"`
			LabelLocation struct {
				Lat float64 `json:"latitude"`
				Lng float64 `json:"longitude"`
			} `json:"labelLocation"`
		} `json:"regionMetadata"`
	} `json:"data"`
}

func fetchPSI() error {
	body, err := getJSON(psiURL)
	if err != nil {
		return err
	}
	var resp psiResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return err
	}
	if len(resp.Data.Items) == 0 {
		return nil
	}

	readings := resp.Data.Items[0].Readings.PsiTwentyFourHourly
	national := maxPSI(readings.North, readings.South, readings.East, readings.West, readings.Central)

	// PSI >= 100 = Unhealthy → create/update a haze crisis
	if national < 100 {
		return nil
	}

	severity := psiSeverity(national)
	crisis := lib.Crisis{
		ExternalID:   "nea:psi:national",
		Title:        fmt.Sprintf("Haze Alert — PSI %.0f (National)", national),
		Description:  fmt.Sprintf("24-hour national PSI is %.0f. %s", national, psiAdvice(national)),
		Type:         "haze",
		Severity:     severity,
		Status:       "active",
		Lat:          1.3521,
		Lng:          103.8198,
		LocationName: "Singapore (National)",
		Source:       "nea",
	}
	return lib.DB.UpsertCrisis(crisis)
}

func maxPSI(vals ...float64) float64 {
	m := vals[0]
	for _, v := range vals[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

func psiSeverity(psi float64) string {
	switch {
	case psi >= 301:
		return "critical"
	case psi >= 201:
		return "high"
	case psi >= 101:
		return "medium"
	default:
		return "low"
	}
}

func psiAdvice(psi float64) string {
	switch {
	case psi >= 301:
		return "Hazardous. Everyone should avoid outdoor activities."
	case psi >= 201:
		return "Very unhealthy. Avoid prolonged outdoor exertion."
	default:
		return "Unhealthy for sensitive groups. Wear N95 outdoors."
	}
}

// ─── 2-hour weather ───────────────────────────────────────────────────────────

type weatherResponse struct {
	Code int `json:"code"`
	Data struct {
		Items []struct {
			Forecasts []struct {
				Area     string `json:"area"`
				Forecast string `json:"forecast"`
			} `json:"forecasts"`
		} `json:"items"`
		AreaMetadata []struct {
			Name          string `json:"name"`
			LabelLocation struct {
				Lat float64 `json:"latitude"`
				Lng float64 `json:"longitude"`
			} `json:"label_location"`
		} `json:"area_metadata"`
	} `json:"data"`
}

// Only genuinely severe forecasts become flood crises. Plain "Thundery Showers"
// and "Passing Showers" are everyday Singapore weather — including them flooded
// the map with bogus medium "flood" circles, so they are deliberately excluded.
var severeKeywords = []string{
	"Heavy Thundery Showers", "Heavy Rain", "Heavy Showers",
}

func fetchWeather() error {
	body, err := getJSON(weatherURL)
	if err != nil {
		return err
	}
	var resp weatherResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return err
	}
	if len(resp.Data.Items) == 0 {
		return nil
	}

	// Build a location map for lat/lng lookups.
	coords := make(map[string][2]float64, len(resp.Data.AreaMetadata))
	for _, m := range resp.Data.AreaMetadata {
		coords[m.Name] = [2]float64{m.LabelLocation.Lat, m.LabelLocation.Lng}
	}

	severe := make(map[string]bool)
	for _, f := range resp.Data.Items[0].Forecasts {
		if !isSevereWeather(f.Forecast) {
			continue
		}
		loc, ok := coords[f.Area]
		if !ok {
			continue
		}
		externalID := "nea:weather:" + f.Area
		severe[externalID] = true
		crisis := lib.Crisis{
			ExternalID:   externalID,
			Title:        fmt.Sprintf("Severe Weather — %s (%s)", f.Area, f.Forecast),
			Description:  fmt.Sprintf("2-hour forecast for %s: %s.", f.Area, f.Forecast),
			Type:         "flood",
			Severity:     "medium",
			Status:       "active",
			Lat:          loc[0],
			Lng:          loc[1],
			LocationName: f.Area,
			Source:       "nea",
		}
		if err := lib.DB.UpsertCrisis(crisis); err != nil {
			log.Printf("[nea] upsert weather crisis for %s: %v", f.Area, err)
		}
	}

	resolveClearedWeather(severe)
	return nil
}

// resolveClearedWeather marks any active weather crisis whose area is no longer
// in the severe set as resolved. Upsert only creates/refreshes severe rows, so
// without this a "Severe Weather — … (Heavy Showers)" circle would linger on the
// map indefinitely after the forecast eased back to plain showers.
func resolveClearedWeather(severe map[string]bool) {
	active, err := lib.DB.GetActiveCrisesByPrefix("nea:weather:")
	if err != nil {
		log.Printf("[nea] list active weather crises: %v", err)
		return
	}
	for _, cr := range active {
		if severe[cr.ExternalID] {
			continue
		}
		if _, err := lib.DB.UpdateCrisis(cr.ID, map[string]interface{}{"status": "resolved"}); err != nil {
			log.Printf("[nea] resolve cleared weather crisis %s: %v", cr.ExternalID, err)
		}
	}
}

func isSevereWeather(forecast string) bool {
	for _, kw := range severeKeywords {
		if forecast == kw {
			return true
		}
	}
	return false
}

// ─── shared HTTP helper ───────────────────────────────────────────────────────

func getJSON(url string) ([]byte, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}
