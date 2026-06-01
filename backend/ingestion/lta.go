// LTA ingestion — polls the LTA DataMall train service alerts API every 5 minutes.
// Requires LTA_API_KEY in the environment (free registration at datamall.lta.gov.sg).
package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"backend/cache"
	"backend/lib"
)

const (
	ltaTrainURL  = "https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts"
	ltaInterval  = 5 * time.Minute
)

// RunLTA starts the background LTA ingestion loop. Call as a goroutine from main.
func RunLTA(ctx context.Context) {
	if os.Getenv("LTA_API_KEY") == "" {
		log.Println("[lta] LTA_API_KEY not set — skipping LTA ingestion")
		return
	}
	log.Println("[lta] ingestion started")
	if err := fetchLTA(); err != nil {
		log.Printf("[lta] initial fetch error: %v", err)
	}
	ticker := time.NewTicker(ltaInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if err := fetchLTA(); err != nil {
				log.Printf("[lta] fetch error: %v", err)
			}
		case <-ctx.Done():
			log.Println("[lta] ingestion stopped")
			return
		}
	}
}

type ltaResponse struct {
	Value []struct {
		Status           int    `json:"Status"` // 1 = Normal, 2 = Disrupted
		AffectedSegments []struct {
			Line      string `json:"Line"`
			Direction string `json:"Direction"`
			Stations  string `json:"Stations"`
		} `json:"AffectedSegments"`
		Message []struct {
			Content     string `json:"Content"`
			CreatedDate string `json:"CreatedDate"`
		} `json:"Message"`
	} `json:"value"`
}

// lineCoords maps MRT line codes to approximate midpoint coordinates.
var lineCoords = map[string][2]float64{
	"EWL": {1.3200, 103.7800},
	"NSL": {1.3500, 103.8200},
	"NEL": {1.3300, 103.8450},
	"CCL": {1.3050, 103.8200},
	"DTL": {1.3300, 103.7750},
	"TEL": {1.3000, 103.7750},
}

func fetchLTA() error {
	req, err := http.NewRequest("GET", ltaTrainURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("AccountKey", os.Getenv("LTA_API_KEY"))
	req.Header.Set("accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var data ltaResponse
	if err := json.Unmarshal(body, &data); err != nil {
		return err
	}

	for _, alert := range data.Value {
		if alert.Status == 1 {
			// Normal — resolve any existing disruption crisis for this alert.
			continue
		}
		for _, seg := range alert.AffectedSegments {
			coords := lineCoords[seg.Line]
			msg := ""
			if len(alert.Message) > 0 {
				msg = alert.Message[0].Content
			}
			crisis := lib.Crisis{
				ExternalID:   fmt.Sprintf("lta:mrt:%s:%s", seg.Line, seg.Direction),
				Title:        fmt.Sprintf("MRT Disruption — %s (%s)", seg.Line, seg.Direction),
				Description:  describeLTADisruption(seg.Line, seg.Stations, msg),
				Type:         "mrt",
				Severity:     "medium",
				Status:       "active",
				Lat:          coords[0],
				Lng:          coords[1],
				LocationName: fmt.Sprintf("%s Line", seg.Line),
				Source:       "lta",
			}
			if err := lib.DB.UpsertCrisis(crisis); err != nil {
				log.Printf("[lta] upsert %s: %v", crisis.ExternalID, err)
			}
		}
	}

	cache.GlobalCache.Invalidate("crises:all")
	return nil
}

func describeLTADisruption(line, stations, msg string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%s Line disruption", line))
	if stations != "" {
		sb.WriteString(fmt.Sprintf(" affecting stations: %s.", stations))
	}
	if msg != "" {
		sb.WriteString(" " + msg)
	}
	return sb.String()
}
