// Perrin / shared — live cross-agency data fetchers. This is the single source
// of truth for pulling real-time data from data.gov.sg and LTA DataMall: the
// HTTP handlers in handler/data.go serve these verbatim, and the triage live
// provider (triage_live.go) maps them into triage readings. No mock data — every
// value here comes off a live feed.
//
// The exported feed types carry json tags matching the public /api/data/* shape
// so handlers can return them directly without a second DTO layer.
package lib

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"
)

const (
	weatherFeedURL    = "https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast"
	psiFeedURL        = "https://api-open.data.gov.sg/v2/real-time/api/psi"
	floodAlertFeedURL = "https://api-open.data.gov.sg/v2/real-time/api/weather/flood-alerts"
	waterLevelFeedURL = "https://api-open.data.gov.sg/v2/real-time/api/water-level"
	denguePollURL     = "https://api-open.data.gov.sg/v1/public/api/datasets/d_dbfabf16158d1b0e1c420627c0819168/poll-download"
	ltaTrainAlertURL  = "https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts"
)

var feedHTTPClient = &http.Client{Timeout: 10 * time.Second}

func fetchJSON(url string, dst interface{}) error {
	resp, err := feedHTTPClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, dst)
}

func maxF(vals ...float64) float64 {
	m := vals[0]
	for _, v := range vals[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

// ── Weather (NEA 2-hour forecast) ───────────────────────────────────────────────

type WeatherForecast struct {
	Area     string `json:"area"`
	Forecast string `json:"forecast"`
}

type WeatherFeed struct {
	UpdatedAt string            `json:"updated_at"`
	Readings  []WeatherForecast `json:"readings"`
}

// FetchWeather returns the latest per-area 2-hour forecast.
func FetchWeather() (WeatherFeed, error) {
	var resp struct {
		Data struct {
			Items []struct {
				UpdatedTimestamp string `json:"update_timestamp"`
				Forecasts        []struct {
					Area     string `json:"area"`
					Forecast string `json:"forecast"`
				} `json:"forecasts"`
			} `json:"items"`
		} `json:"data"`
	}
	if err := fetchJSON(weatherFeedURL, &resp); err != nil {
		return WeatherFeed{}, err
	}
	out := WeatherFeed{Readings: []WeatherForecast{}}
	if len(resp.Data.Items) > 0 {
		item := resp.Data.Items[0]
		out.UpdatedAt = item.UpdatedTimestamp
		for _, f := range item.Forecasts {
			out.Readings = append(out.Readings, WeatherForecast{Area: f.Area, Forecast: f.Forecast})
		}
	}
	return out, nil
}

// ── Haze / PSI (NEA) ────────────────────────────────────────────────────────────

type PSIReadings struct {
	National float64 `json:"national"`
	North    float64 `json:"north"`
	South    float64 `json:"south"`
	East     float64 `json:"east"`
	West     float64 `json:"west"`
	Central  float64 `json:"central"`
}

type HazeFeed struct {
	UpdatedAt string      `json:"updated_at"`
	PSI24h    PSIReadings `json:"psi_24h"`
	Advisory  string      `json:"advisory"`
}

// FetchHaze returns the 24-hour PSI by region. National is derived as the worst
// region (the feed has no national field) and Advisory is the matching guidance.
func FetchHaze() (HazeFeed, error) {
	var resp struct {
		Data struct {
			Items []struct {
				UpdatedTimestamp string `json:"updatedTimestamp"`
				Readings         struct {
					PsiTwentyFourHourly struct {
						North   float64 `json:"north"`
						South   float64 `json:"south"`
						East    float64 `json:"east"`
						West    float64 `json:"west"`
						Central float64 `json:"central"`
					} `json:"psi_twenty_four_hourly"`
				} `json:"readings"`
			} `json:"items"`
		} `json:"data"`
	}
	if err := fetchJSON(psiFeedURL, &resp); err != nil {
		return HazeFeed{}, err
	}
	out := HazeFeed{}
	if len(resp.Data.Items) > 0 {
		item := resp.Data.Items[0]
		out.UpdatedAt = item.UpdatedTimestamp
		p := item.Readings.PsiTwentyFourHourly
		national := maxF(p.North, p.South, p.East, p.West, p.Central)
		out.PSI24h = PSIReadings{
			National: national,
			North:    p.North, South: p.South,
			East: p.East, West: p.West, Central: p.Central,
		}
		out.Advisory = PSIAdvisory(national)
	}
	return out, nil
}

// PSIAdvisory maps a PSI value to NEA's health guidance band.
func PSIAdvisory(psi float64) string {
	switch {
	case psi >= 301:
		return "Hazardous. Stay indoors; avoid all outdoor activities."
	case psi >= 201:
		return "Very unhealthy. Avoid prolonged outdoor exertion."
	case psi >= 101:
		return "Unhealthy. Wear N95 mask outdoors."
	case psi >= 51:
		return "Moderate. Sensitive individuals may experience discomfort."
	default:
		return "Good. Air quality is satisfactory."
	}
}

// ── Flood alerts (NEA) ──────────────────────────────────────────────────────────

type FloodAlert struct {
	Area        string  `json:"area"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	RadiusKm    float64 `json:"radius_km"`
	Severity    string  `json:"severity"`
	Description string  `json:"description"`
	Headline    string  `json:"headline"`
	Instruction string  `json:"instruction"`
	IssuedAt    string  `json:"issued_at"`
}

type FloodAlertFeed struct {
	UpdatedAt string       `json:"updated_at"`
	Alerts    []FloodAlert `json:"alerts"`
	HasAlerts bool         `json:"has_alerts"`
}

// FetchFloodAlerts returns active NEA flood alerts (distinct from PUB water
// levels — these are issued warnings, not sensor readings).
func FetchFloodAlerts() (FloodAlertFeed, error) {
	var resp struct {
		Data struct {
			Records []struct {
				Datetime         string `json:"datetime"`
				UpdatedTimestamp string `json:"updatedTimestamp"`
				Item             struct {
					MsgType  string `json:"msgType"`
					Readings []struct {
						Area struct {
							AreaDesc string    `json:"areaDesc"`
							Circle   []float64 `json:"circle"` // [lat, lng, radius_km]
						} `json:"area"`
						Severity    string `json:"severity"`
						Description string `json:"description"`
						Headline    string `json:"headline"`
						Instruction string `json:"instruction"`
					} `json:"readings"`
				} `json:"item"`
			} `json:"records"`
		} `json:"data"`
	}
	if err := fetchJSON(floodAlertFeedURL, &resp); err != nil {
		return FloodAlertFeed{}, err
	}
	out := FloodAlertFeed{Alerts: []FloodAlert{}}
	for _, rec := range resp.Data.Records {
		if rec.Item.MsgType != "Alert" {
			continue
		}
		if out.UpdatedAt == "" {
			out.UpdatedAt = rec.UpdatedTimestamp
		}
		for _, r := range rec.Item.Readings {
			fa := FloodAlert{
				Area:        r.Area.AreaDesc,
				Severity:    r.Severity,
				Description: r.Description,
				Headline:    r.Headline,
				Instruction: r.Instruction,
				IssuedAt:    rec.Datetime,
			}
			if len(r.Area.Circle) >= 2 {
				fa.Lat = r.Area.Circle[0]
				fa.Lng = r.Area.Circle[1]
			}
			if len(r.Area.Circle) >= 3 {
				fa.RadiusKm = r.Area.Circle[2]
			}
			out.Alerts = append(out.Alerts, fa)
		}
	}
	out.HasAlerts = len(out.Alerts) > 0
	return out, nil
}

// ── Water level (PUB) ───────────────────────────────────────────────────────────
//
// Not exposed as an /api/data/* endpoint — consumed only by triage as the real
// flood metric (metres). data.gov.sg reports absolute water level in metres; it
// does not publish canal capacity, so triage thresholds on metres directly.

type WaterStation struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Lat    float64 `json:"lat"`
	Lng    float64 `json:"lng"`
	LevelM float64 `json:"level_m"`
}

type WaterFeed struct {
	UpdatedAt string         `json:"updated_at"`
	Stations  []WaterStation `json:"stations"`
}

// FetchWaterLevels returns the latest PUB water-level reading per station.
func FetchWaterLevels() (WaterFeed, error) {
	var resp struct {
		Data struct {
			Stations []struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Location struct {
					Lat float64 `json:"latitude"`
					Lng float64 `json:"longitude"`
				} `json:"location"`
			} `json:"stations"`
			Readings []struct {
				Timestamp string `json:"timestamp"`
				Data      []struct {
					StationID string  `json:"stationId"`
					Value     float64 `json:"value"`
				} `json:"data"`
			} `json:"readings"`
		} `json:"data"`
	}
	if err := fetchJSON(waterLevelFeedURL, &resp); err != nil {
		return WaterFeed{}, err
	}
	out := WaterFeed{Stations: []WaterStation{}}
	if len(resp.Data.Readings) == 0 {
		return out, nil
	}

	meta := make(map[string]struct {
		Name string
		Lat  float64
		Lng  float64
	}, len(resp.Data.Stations))
	for _, s := range resp.Data.Stations {
		meta[s.ID] = struct {
			Name string
			Lat  float64
			Lng  float64
		}{s.Name, s.Location.Lat, s.Location.Lng}
	}

	latest := resp.Data.Readings[0]
	out.UpdatedAt = latest.Timestamp
	for _, r := range latest.Data {
		m, ok := meta[r.StationID]
		if !ok {
			continue
		}
		out.Stations = append(out.Stations, WaterStation{
			ID: r.StationID, Name: m.Name, Lat: m.Lat, Lng: m.Lng, LevelM: r.Value,
		})
	}
	return out, nil
}

// ── Transport (LTA train alerts) ────────────────────────────────────────────────

type TrainAlert struct {
	Line      string `json:"line"`
	Direction string `json:"direction"`
	Stations  string `json:"stations"`
	Message   string `json:"message"`
}

type TransportFeed struct {
	Status string       `json:"status"` // "normal" | "disrupted"
	Alerts []TrainAlert `json:"alerts"`
}

// FetchTransport returns current LTA train service alerts. Requires LTA_API_KEY;
// without it the feed reports "normal" with no alerts (graceful, not an error).
func FetchTransport() (TransportFeed, error) {
	out := TransportFeed{Status: "normal", Alerts: []TrainAlert{}}

	apiKey := os.Getenv("LTA_API_KEY")
	if apiKey == "" {
		return out, nil
	}

	req, _ := http.NewRequest("GET", ltaTrainAlertURL, nil)
	req.Header.Set("AccountKey", apiKey)
	req.Header.Set("accept", "application/json")

	resp, err := feedHTTPClient.Do(req)
	if err != nil {
		return TransportFeed{}, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)

	// LTA returns {"value": {}} (object) when no disruptions, {"value": [...]} when active.
	var raw struct {
		Value json.RawMessage `json:"value"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return TransportFeed{}, err
	}
	var alerts []struct {
		Status           int `json:"Status"`
		AffectedSegments []struct {
			Line      string `json:"Line"`
			Direction string `json:"Direction"`
			Stations  string `json:"Stations"`
		} `json:"AffectedSegments"`
		Message []struct {
			Content string `json:"Content"`
		} `json:"Message"`
	}
	if len(raw.Value) > 0 && raw.Value[0] == '[' {
		_ = json.Unmarshal(raw.Value, &alerts)
	}

	for _, a := range alerts {
		if a.Status == 1 {
			continue // normal
		}
		out.Status = "disrupted"
		msg := ""
		if len(a.Message) > 0 {
			msg = a.Message[0].Content
		}
		for _, seg := range a.AffectedSegments {
			out.Alerts = append(out.Alerts, TrainAlert{
				Line: seg.Line, Direction: seg.Direction,
				Stations: seg.Stations, Message: msg,
			})
		}
	}
	return out, nil
}

// ── Dengue clusters (NEA) ───────────────────────────────────────────────────────

type DengueClusterFeed struct {
	Cases int     `json:"cases"`
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
	Area  string  `json:"area"`
}

type DengueFeed struct {
	UpdatedAt  string              `json:"updated_at"`
	Clusters   []DengueClusterFeed `json:"clusters"`
	TotalCases int                 `json:"total_cases"`
}

// FetchDengue returns active dengue clusters with case counts and centroids.
// data.gov.sg serves this as a poll-download dataset: first resolve a signed
// URL, then fetch the GeoJSON and reduce each polygon to its centroid.
func FetchDengue() (DengueFeed, error) {
	var pollResp struct {
		Code int `json:"code"`
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := fetchJSON(denguePollURL, &pollResp); err != nil {
		return DengueFeed{}, err
	}
	out := DengueFeed{Clusters: []DengueClusterFeed{}}
	if pollResp.Code != 0 || pollResp.Data.URL == "" {
		return out, nil
	}

	resp, err := feedHTTPClient.Get(pollResp.Data.URL)
	if err != nil {
		return DengueFeed{}, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return DengueFeed{}, err
	}

	var fc struct {
		Features []struct {
			Geometry struct {
				Coordinates [][][]float64 `json:"coordinates"`
			} `json:"geometry"`
			Properties struct {
				Locality  string `json:"LOCALITY"`
				CaseSize  int    `json:"CASE_SIZE"`
				UpdatedAt string `json:"FMEL_UPD_D"`
			} `json:"properties"`
		} `json:"features"`
	}
	if err := json.Unmarshal(b, &fc); err != nil {
		return DengueFeed{}, err
	}

	for _, f := range fc.Features {
		if len(f.Geometry.Coordinates) == 0 || len(f.Geometry.Coordinates[0]) == 0 {
			continue
		}
		ring := f.Geometry.Coordinates[0]
		var sumLng, sumLat float64
		for _, pt := range ring {
			if len(pt) < 2 {
				continue
			}
			sumLng += pt[0] // GeoJSON: [lng, lat]
			sumLat += pt[1]
		}
		n := float64(len(ring))
		out.Clusters = append(out.Clusters, DengueClusterFeed{
			Cases: f.Properties.CaseSize,
			Lat:   sumLat / n,
			Lng:   sumLng / n,
			Area:  f.Properties.Locality,
		})
		out.TotalCases += f.Properties.CaseSize
		if out.UpdatedAt == "" && f.Properties.UpdatedAt != "" {
			out.UpdatedAt = f.Properties.UpdatedAt
		}
	}
	return out, nil
}
