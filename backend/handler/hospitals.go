package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Hospital struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Lat           float64 `json:"lat"`
	Lng           float64 `json:"lng"`
	BedsTotal     int     `json:"beds_total"`
	BedsAvailable int     `json:"beds_available"`
	BOR           int     `json:"bor"` // bed occupancy rate, percent
	LastUpdated   string  `json:"last_updated"`
}

// Public acute hospitals, 2025 MOH data (total public acute: 10,784).
// BOR and beds_available are estimates for demo — MOH publishes annual figures only.
var singaporeHospitals = []Hospital{
	{"sgh", "Singapore General Hospital", 1.2797, 103.8364, 1700, 204, 88, "2025-01-01"},
	{"wh", "Woodlands Health", 1.4441, 103.7985, 1800, 504, 72, "2025-01-01"},
	{"ttsh", "Tan Tock Seng Hospital", 1.3216, 103.8454, 1600, 240, 85, "2025-01-01"},
	{"nuh", "National University Hospital", 1.2951, 103.7831, 1200, 216, 82, "2025-01-01"},
	{"cgh", "Changi General Hospital", 1.3409, 103.9491, 1000, 200, 80, "2025-01-01"},
	{"kkh", "KK Women's and Children's Hospital", 1.3094, 103.8459, 830, 208, 75, "2025-01-01"},
	{"ktph", "Khoo Teck Puat Hospital", 1.4244, 103.8387, 800, 176, 78, "2025-01-01"},
	{"ntfgh", "Ng Teng Fong General Hospital", 1.3365, 103.7438, 700, 147, 79, "2025-01-01"},
	{"skh", "Sengkang General Hospital", 1.3919, 103.8948, 700, 168, 76, "2025-01-01"},
	{"ah", "Alexandra Hospital", 1.2876, 103.8004, 454, 118, 74, "2025-01-01"},
}

// GetHospitals returns the static public-hospital list used by map/chat cards.
// This dataset is intentionally deterministic for the demo; live bed telemetry
// is not wired here.
func GetHospitals(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"hospitals": singaporeHospitals})
}
