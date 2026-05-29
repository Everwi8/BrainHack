// PUB ingestion — polls data.gov.sg water level readings every 5 minutes.
// Creates flood crisis records when any station exceeds the high-water threshold.
package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"backend/cache"
	"backend/lib"
)

const (
	waterLevelURL   = "https://api-open.data.gov.sg/v2/real-time/api/water-level"
	pubInterval     = 5 * time.Minute
	highWaterMetres = 2.5 // readings above this level trigger a flood crisis
)

// RunPUB starts the background PUB ingestion loop. Call as a goroutine from main.
func RunPUB(ctx context.Context) {
	log.Println("[pub] ingestion started")
	if err := fetchPUB(); err != nil {
		log.Printf("[pub] initial fetch error: %v", err)
	}
	ticker := time.NewTicker(pubInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if err := fetchPUB(); err != nil {
				log.Printf("[pub] fetch error: %v", err)
			}
		case <-ctx.Done():
			log.Println("[pub] ingestion stopped")
			return
		}
	}
}

type waterLevelResponse struct {
	Code int `json:"code"`
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

func fetchPUB() error {
	body, err := getJSON(waterLevelURL)
	if err != nil {
		return err
	}
	var resp waterLevelResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return err
	}
	if len(resp.Data.Readings) == 0 {
		return nil
	}

	// Build station lookup map.
	stations := make(map[string]struct {
		Name string
		Lat  float64
		Lng  float64
	}, len(resp.Data.Stations))
	for _, s := range resp.Data.Stations {
		stations[s.ID] = struct {
			Name string
			Lat  float64
			Lng  float64
		}{s.Name, s.Location.Lat, s.Location.Lng}
	}

	latest := resp.Data.Readings[0]
	for _, reading := range latest.Data {
		if reading.Value < highWaterMetres {
			continue
		}
		st, ok := stations[reading.StationID]
		if !ok {
			continue
		}
		severity := "medium"
		if reading.Value >= 3.5 {
			severity = "high"
		}
		if reading.Value >= 4.5 {
			severity = "critical"
		}
		crisis := lib.Crisis{
			ExternalID:   fmt.Sprintf("pub:water:%s", reading.StationID),
			Title:        fmt.Sprintf("High Water Level — %s (%.1fm)", st.Name, reading.Value),
			Description:  fmt.Sprintf("Water level at %s has reached %.1fm. Flooding risk in surrounding area.", st.Name, reading.Value),
			Type:         "flood",
			Severity:     severity,
			Status:       "active",
			Lat:          st.Lat,
			Lng:          st.Lng,
			LocationName: st.Name,
			Source:       "pub",
		}
		if err := lib.DB.UpsertCrisis(crisis); err != nil {
			log.Printf("[pub] upsert %s: %v", crisis.ExternalID, err)
		}
	}

	cache.GlobalCache.Invalidate("crises:all")
	return nil
}
