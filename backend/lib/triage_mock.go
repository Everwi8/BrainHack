// Perrin — Mock data + geo helpers for triage. This stands in for Sanjey's
// /api/data/* endpoints (still stubbed). The numbers are deliberately tuned to
// trip several rules at once so the demo shows real findings and a cascade.
// Swap to live data with lib.SetDataProvider(...) when the endpoints land.
package lib

import "math"

// MockProvider returns a fixed, demo-friendly snapshot of SG conditions.
type MockProvider struct{}

// NewMockProvider builds the default in-memory data source.
func NewMockProvider() *MockProvider { return &MockProvider{} }

func (m *MockProvider) Weather() ([]WeatherReading, error) {
	return []WeatherReading{
		{Area: "Pasir Ris", Forecast: "Heavy Thundery Showers", RainfallMM: 42},
		{Area: "Jurong West", Forecast: "Cloudy", RainfallMM: 3},
		{Area: "Woodlands", Forecast: "Light Showers", RainfallMM: 8},
	}, nil
}

func (m *MockProvider) Floods() ([]FloodReading, error) {
	return []FloodReading{
		// High + heavy rain + near Pasir Ris MRT → trips flood, flash-flood
		// cascade, and transport cascade all at once.
		{SensorID: "PUB-PR-03", Location: "Pasir Ris Dr 3", Lat: 1.3721, Lng: 103.9491, WaterLevelPct: 88},
		{SensorID: "PUB-BD-11", Location: "Bedok Canal", Lat: 1.3236, Lng: 103.9273, WaterLevelPct: 64},
		{SensorID: "PUB-OR-02", Location: "Stamford Canal (Orchard)", Lat: 1.3036, Lng: 103.8318, WaterLevelPct: 79},
	}, nil
}

func (m *MockProvider) Haze() ([]HazeReading, error) {
	return []HazeReading{
		{Region: "west", PSI: 142, PM25: 78},
		{Region: "north", PSI: 88, PM25: 41},
		{Region: "central", PSI: 95, PM25: 49},
	}, nil
}

func (m *MockProvider) Dengue() ([]DengueCluster, error) {
	return []DengueCluster{
		// In the west region (overlaps the PSI 142 reading) → compound health cascade.
		{Locality: "Jurong West St 91", Lat: 1.3404, Lng: 103.6957, Cases: 23},
		{Locality: "Tampines Ave 4", Lat: 1.3540, Lng: 103.9540, Cases: 8},
	}, nil
}

func (m *MockProvider) Transport() ([]TransportDisruption, error) {
	return []TransportDisruption{
		{Line: "East-West", Stations: []string{"Tanah Merah", "Simei"}, Status: "delayed", Description: "Signalling fault causing ~15 min delays towards Pasir Ris."},
	}, nil
}

// --- Geo helpers -----------------------------------------------------------

// mrtStation is a minimal station record for proximity checks.
type mrtStation struct {
	Name string
	Lat  float64
	Lng  float64
}

// mrtStations is a small sample of MRT stations near the demo crisis areas.
var mrtStations = []mrtStation{
	{"Pasir Ris", 1.3731, 103.9493},
	{"Tampines", 1.3546, 103.9452},
	{"Bedok", 1.3240, 103.9300},
	{"Orchard", 1.3041, 103.8320},
	{"Jurong East", 1.3334, 103.7421},
	{"Woodlands", 1.4370, 103.7865},
}

// nearbyMRT returns stations within radiusKm of the given point.
func nearbyMRT(lat, lng, radiusKm float64) []mrtStation {
	var out []mrtStation
	for _, s := range mrtStations {
		if haversineKm(lat, lng, s.Lat, s.Lng) <= radiusKm {
			out = append(out, s)
		}
	}
	return out
}

// regionBounds approximates Singapore's NEA reporting regions as lat/lng boxes.
// Coarse on purpose — enough to decide whether a cluster falls in a haze region.
var regionBounds = map[string]struct{ minLat, maxLat, minLng, maxLng float64 }{
	"west":    {1.27, 1.46, 103.60, 103.78},
	"east":    {1.30, 1.40, 103.90, 104.05},
	"north":   {1.40, 1.48, 103.75, 103.90},
	"south":   {1.24, 1.30, 103.78, 103.92},
	"central": {1.28, 1.38, 103.78, 103.90},
}

// regionContains reports whether a coordinate falls within the named region.
func regionContains(region string, lat, lng float64) bool {
	b, ok := regionBounds[region]
	if !ok {
		return false
	}
	return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng
}

// haversineKm returns the great-circle distance between two points in km.
func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	const earthKm = 6371.0
	dLat := rad(lat2 - lat1)
	dLng := rad(lng2 - lng1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(rad(lat1))*math.Cos(rad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return earthKm * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func rad(deg float64) float64 { return deg * math.Pi / 180 }
