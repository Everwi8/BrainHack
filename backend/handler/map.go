// Jerald — shelter list (sorted by distance) + map markers stub
package handler

import (
	"math"
	"net/http"
	"sort"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ── Data model ────────────────────────────────────────────────────────────────

// Shelter is a Go struct — a named collection of typed fields.
// The backtick tags (e.g. `json:"id"`) tell Go's JSON encoder what key name to
// use when turning this struct into JSON. Without the tag, Go would use the
// field name as-is ("ID", "Name"), which wouldn't match what the frontend expects.
type Shelter struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Lat              float64 `json:"lat"`
	Lng              float64 `json:"lng"`
	Capacity         int     `json:"capacity"`
	CurrentOccupancy int     `json:"current_occupancy"`
	DistanceKm       float64 `json:"distance_km"`
}

// singaporeShelters is a package-level variable — it lives for the entire lifetime
// of the server process. "var" declares it; the type is inferred as []Shelter
// (a slice of Shelter structs). This is our seed data in place of a database table.
var singaporeShelters = []Shelter{
	{ID: "shelter-1",  Name: "Pasir Ris CC",   Lat: 1.3731, Lng: 103.9497, Capacity: 400, CurrentOccupancy: 312},
	{ID: "shelter-2",  Name: "Tampines CC",    Lat: 1.3536, Lng: 103.9436, Capacity: 350, CurrentOccupancy: 180},
	{ID: "shelter-3",  Name: "Bedok CC",       Lat: 1.3236, Lng: 103.9270, Capacity: 300, CurrentOccupancy: 95},
	{ID: "shelter-4",  Name: "Ang Mo Kio CC",  Lat: 1.3696, Lng: 103.8490, Capacity: 450, CurrentOccupancy: 210},
	{ID: "shelter-5",  Name: "Bishan CC",      Lat: 1.3501, Lng: 103.8480, Capacity: 380, CurrentOccupancy: 140},
	{ID: "shelter-6",  Name: "Jurong East CC", Lat: 1.3329, Lng: 103.7436, Capacity: 320, CurrentOccupancy: 88},
	{ID: "shelter-7",  Name: "Woodlands CC",   Lat: 1.4363, Lng: 103.7861, Capacity: 410, CurrentOccupancy: 300},
	{ID: "shelter-8",  Name: "Yishun CC",      Lat: 1.4257, Lng: 103.8353, Capacity: 360, CurrentOccupancy: 175},
	{ID: "shelter-9",  Name: "Sengkang CC",    Lat: 1.3916, Lng: 103.8956, Capacity: 290, CurrentOccupancy: 60},
	{ID: "shelter-10", Name: "Clementi CC",    Lat: 1.3153, Lng: 103.7650, Capacity: 330, CurrentOccupancy: 120},
}

// ── Haversine formula ─────────────────────────────────────────────────────────

// haversine returns the straight-line ("as the crow flies") distance in km
// between two points on Earth's surface, given their lat/lng in degrees.
//
// Why not just subtract coordinates? Latitude and longitude are angles, not
// distances. One degree of longitude near the equator is ~111 km, but near the
// poles it's nearly 0 km. Haversine accounts for Earth's curvature correctly.
//
// The formula:
//   a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlng/2)
//   c = 2 * atan2(√a, √(1−a))
//   d = R * c          where R = 6371 km (Earth's mean radius)
func haversine(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusKm = 6371.0

	// Convert degrees to radians — Go's math package works in radians.
	// 1 radian = 180/π degrees, so degrees * (π/180) = radians.
	toRad := func(deg float64) float64 { return deg * math.Pi / 180 }

	dLat := toRad(lat2 - lat1)
	dLng := toRad(lng2 - lng1)
	lat1R := toRad(lat1)
	lat2R := toRad(lat2)

	// math.Sin, math.Cos, math.Sqrt, math.Atan2 are all from Go's standard library.
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1R)*math.Cos(lat2R)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusKm * c
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GetShelters handles GET /api/shelters?lat=1.35&lng=103.82
// It reads the caller's coordinates, computes each shelter's distance,
// sorts the list nearest-first, and returns it as JSON.
func GetShelters(c *gin.Context) {
	// c.Query("lat") reads the "lat" key from the URL query string (?lat=...).
	// It returns an empty string "" if the key is absent — not an error.
	// strconv.ParseFloat converts the string "1.3521" into a float64 number.
	// The second argument (64) means 64-bit precision (double).
	// If parsing fails (e.g. someone passes ?lat=abc), err != nil and we keep
	// the default Singapore-centre value.
	userLat := 1.3521
	userLng := 103.8198

	if v, err := strconv.ParseFloat(c.Query("lat"), 64); err == nil {
		userLat = v
	}
	if v, err := strconv.ParseFloat(c.Query("lng"), 64); err == nil {
		userLng = v
	}

	// make() creates a new slice with the same length as singaporeShelters.
	// copy() copies every element from the source into the new slice.
	// We do this because we're about to set DistanceKm on each element —
	// if we mutated singaporeShelters directly, the next request would see
	// stale/wrong distances from the previous caller's location.
	shelters := make([]Shelter, len(singaporeShelters))
	copy(shelters, singaporeShelters)

	// Attach distance to each shelter.
	// "range shelters" iterates the slice; i is the index (0, 1, 2…).
	// We use shelters[i].DistanceKm = ... (index-based) rather than
	// "for _, s := range shelters" because a range copy gives us a copy of
	// each struct — writing s.DistanceKm wouldn't affect the slice at all.
	for i := range shelters {
		raw := haversine(userLat, userLng, shelters[i].Lat, shelters[i].Lng)
		// Round to 2 decimal places: multiply by 100, round, divide by 100.
		shelters[i].DistanceKm = math.Round(raw*100) / 100
	}

	// sort.Slice sorts in-place. The second argument is a "less" function:
	// it returns true if element i should come before element j.
	// Returning i.DistanceKm < j.DistanceKm means "sort nearest first".
	sort.Slice(shelters, func(i, j int) bool {
		return shelters[i].DistanceKm < shelters[j].DistanceKm
	})

	// c.JSON writes the HTTP response:
	// - status 200 (OK) as the status line
	// - "Content-Type: application/json" header
	// - the shelters slice serialised as a JSON array in the body
	// The frontend's fetch() call receives this and calls res.json() to parse it back.
	c.JSON(http.StatusOK, shelters)
}

// MapMarkers is a stub. The frontend uses Approach B (three separate calls),
// so this endpoint isn't called for MVP. Returning an empty array keeps the
// route registered without causing a 404 if someone hits it accidentally.
func MapMarkers(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"markers": []any{}})
}
