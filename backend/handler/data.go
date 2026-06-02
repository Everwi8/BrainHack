package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"

	"backend/cache"
)

var dataHTTPClient = &http.Client{Timeout: 10 * time.Second}

func fetchJSONInto(url string, dst interface{}) error {
	resp, err := dataHTTPClient.Get(url)
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

// ── Weather ───────────────────────────────────────────────────────────────────

type WeatherReading struct {
	Area     string `json:"area"`
	Forecast string `json:"forecast"`
}

type WeatherData struct {
	UpdatedAt string           `json:"updated_at"`
	Readings  []WeatherReading `json:"readings"`
}

func GetWeather(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:weather", func() (interface{}, error) {
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
		if err := fetchJSONInto("https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast", &resp); err != nil {
			return nil, err
		}
		out := WeatherData{Readings: []WeatherReading{}}
		if len(resp.Data.Items) > 0 {
			item := resp.Data.Items[0]
			out.UpdatedAt = item.UpdatedTimestamp
			for _, f := range item.Forecasts {
				out.Readings = append(out.Readings, WeatherReading{Area: f.Area, Forecast: f.Forecast})
			}
		}
		return out, nil
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "weather data unavailable"})
		return
	}
	c.JSON(http.StatusOK, raw)
}

// ── Haze / PSI ────────────────────────────────────────────────────────────────

type PSIReadings struct {
	National float64 `json:"national"`
	North    float64 `json:"north"`
	South    float64 `json:"south"`
	East     float64 `json:"east"`
	West     float64 `json:"west"`
	Central  float64 `json:"central"`
}

type HazeData struct {
	UpdatedAt string      `json:"updated_at"`
	PSI24h    PSIReadings `json:"psi_24h"`
	Advisory  string      `json:"advisory"`
}

func GetHaze(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:haze", func() (interface{}, error) {
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
		if err := fetchJSONInto("https://api-open.data.gov.sg/v2/real-time/api/psi", &resp); err != nil {
			return nil, err
		}
		out := HazeData{}
		if len(resp.Data.Items) > 0 {
			item := resp.Data.Items[0]
			out.UpdatedAt = item.UpdatedTimestamp
			p := item.Readings.PsiTwentyFourHourly
			// API has no national field — derive as worst-region reading.
			national := maxFloat64(p.North, p.South, p.East, p.West, p.Central)
			out.PSI24h = PSIReadings{
				National: national,
				North:    p.North, South: p.South,
				East: p.East, West: p.West, Central: p.Central,
			}
			out.Advisory = psiAdvisory(national)
		}
		return out, nil
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "haze data unavailable"})
		return
	}
	c.JSON(http.StatusOK, raw)
}

func maxFloat64(vals ...float64) float64 {
	m := vals[0]
	for _, v := range vals[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

func psiAdvisory(psi float64) string {
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

// ── Floods / Flood Alerts ─────────────────────────────────────────────────────

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

type FloodData struct {
	UpdatedAt string       `json:"updated_at"`
	Alerts    []FloodAlert `json:"alerts"`
	HasAlerts bool         `json:"has_alerts"`
}

func GetFloods(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:floods", func() (interface{}, error) {
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
		if err := fetchJSONInto("https://api-open.data.gov.sg/v2/real-time/api/weather/flood-alerts", &resp); err != nil {
			return nil, err
		}
		out := FloodData{Alerts: []FloodAlert{}}
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
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "flood data unavailable"})
		return
	}
	c.JSON(http.StatusOK, raw)
}

// ── Transport / MRT ───────────────────────────────────────────────────────────

type TrainAlert struct {
	Line      string `json:"line"`
	Direction string `json:"direction"`
	Stations  string `json:"stations"`
	Message   string `json:"message"`
}

type TransportData struct {
	Status string       `json:"status"` // "normal" | "disrupted"
	Alerts []TrainAlert `json:"alerts"`
}

func GetTransport(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:transport", func() (interface{}, error) {
		apiKey := os.Getenv("LTA_API_KEY")
		if apiKey == "" {
			return TransportData{Status: "normal", Alerts: []TrainAlert{}}, nil
		}

		req, _ := http.NewRequest("GET", "https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts", nil)
		req.Header.Set("AccountKey", apiKey)
		req.Header.Set("accept", "application/json")

		resp, err := dataHTTPClient.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)

		// LTA returns {"value": {}} (object) when no disruptions, {"value": [...]} when active.
		var rawLTA struct {
			Value json.RawMessage `json:"value"`
		}
		if err := json.Unmarshal(b, &rawLTA); err != nil {
			return nil, err
		}
		var ltaAlerts []struct {
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
		if len(rawLTA.Value) > 0 && rawLTA.Value[0] == '[' {
			json.Unmarshal(rawLTA.Value, &ltaAlerts) //nolint:errcheck
		}

		out := TransportData{Status: "normal", Alerts: []TrainAlert{}}
		for _, alert := range ltaAlerts {
			if alert.Status == 1 {
				continue
			}
			out.Status = "disrupted"
			msg := ""
			if len(alert.Message) > 0 {
				msg = alert.Message[0].Content
			}
			for _, seg := range alert.AffectedSegments {
				out.Alerts = append(out.Alerts, TrainAlert{
					Line: seg.Line, Direction: seg.Direction,
					Stations: seg.Stations, Message: msg,
				})
			}
		}
		return out, nil
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "transport data unavailable"})
		return
	}
	c.JSON(http.StatusOK, raw)
}

// ── Dengue ────────────────────────────────────────────────────────────────────

type DengueCluster struct {
	Cases int     `json:"cases"`
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
	Area  string  `json:"area"`
}

type DengueData struct {
	UpdatedAt  string          `json:"updated_at"`
	Clusters   []DengueCluster `json:"clusters"`
	TotalCases int             `json:"total_cases"`
}

func GetDengue(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:dengue", func() (interface{}, error) {
		// Step 1: get signed download URL from data.gov.sg poll-download endpoint.
		var pollResp struct {
			Code int `json:"code"`
			Data struct {
				URL string `json:"url"`
			} `json:"data"`
		}
		const pollURL = "https://api-open.data.gov.sg/v1/public/api/datasets/d_dbfabf16158d1b0e1c420627c0819168/poll-download"
		if err := fetchJSONInto(pollURL, &pollResp); err != nil {
			return nil, err
		}
		if pollResp.Code != 0 || pollResp.Data.URL == "" {
			return DengueData{Clusters: []DengueCluster{}}, nil
		}

		// Step 2: fetch GeoJSON from the signed S3 URL.
		resp, err := dataHTTPClient.Get(pollResp.Data.URL)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}

		// GeoJSON FeatureCollection — coordinates are [longitude, latitude] per spec.
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
			return nil, err
		}

		out := DengueData{Clusters: []DengueCluster{}}
		updatedAt := ""
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
			out.Clusters = append(out.Clusters, DengueCluster{
				Cases: f.Properties.CaseSize,
				Lat:   sumLat / n,
				Lng:   sumLng / n,
				Area:  f.Properties.Locality,
			})
			out.TotalCases += f.Properties.CaseSize
			if updatedAt == "" && f.Properties.UpdatedAt != "" {
				updatedAt = f.Properties.UpdatedAt
			}
		}
		out.UpdatedAt = updatedAt
		return out, nil
	})
	// Dengue is not critical path — return empty rather than 503.
	if err != nil {
		c.JSON(http.StatusOK, DengueData{Clusters: []DengueCluster{}})
		return
	}
	c.JSON(http.StatusOK, raw)
}
