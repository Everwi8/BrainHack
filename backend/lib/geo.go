// Perrin — geo helpers shared by the triage rules: MRT-proximity checks for the
// flood→transport cascade and region-bounds checks for the haze→dengue cascade.
package lib

import "math"

// mrtStation is a minimal station record for proximity checks.
type mrtStation struct {
	Name string
	Lat  float64
	Lng  float64
}

// mrtStations is a sample of MRT interchange/heartland stations used to decide
// whether a flood is close enough to an MRT station to risk a service slowdown.
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
