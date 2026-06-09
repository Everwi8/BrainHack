// "Near you" panel data: the closest civic resources to a coordinate, sourced
// from OneMap's SCDF "Emergency Preparedness" themes (public-access AEDs, civil
// defence public shelters) plus MOH hospitals. This is deliberately NOT crisis
// data — it gives the Timeline sidebar useful ambient context (where's my
// nearest shelter / AED / hospital) without echoing the crisis feed beside it.
package handler

import (
	"fmt"
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"backend/cache"
	"backend/lib"
)

// Themes are static-ish, so a generous box keeps even sparse layers (hospitals:
// ~20 islandwide) populated for most urban points.
const nearbyRadiusKm = 5.0

// resourceItem is one "near you" entry (the nearest shelter or hospital).
type resourceItem struct {
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	DistanceM int     `json:"distanceM"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
}

// aedSummary describes AED coverage: how many sit within range and how far the
// closest one is (AED theme points carry no useful per-item name to show).
type aedSummary struct {
	Count    int `json:"count"`
	NearestM int `json:"nearestM"`
}

// NearbyResources answers ?lat=&lng= with the nearest shelter, hospital and AED
// coverage. Best-effort: any theme OneMap can't supply comes back null and the
// UI simply omits that row.
func NearbyResources(c *gin.Context) {
	lat, err1 := strconv.ParseFloat(c.Query("lat"), 64)
	lng, err2 := strconv.ParseFloat(c.Query("lng"), 64)
	if err1 != nil || err2 != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lat and lng are required"})
		return
	}

	// Cache per ~111m cell so panning/refresh reuses one OneMap round-trip.
	key := fmt.Sprintf("nearby:%.3f,%.3f", lat, lng)
	out, _ := cache.GlobalCache.GetOrFetch(key, func() (interface{}, error) {
		return buildNearby(lat, lng), nil
	})
	c.JSON(http.StatusOK, out)
}

func buildNearby(lat, lng float64) gin.H {
	// Convert the radius to a lat/lng bounding box (lng degrees shrink with
	// latitude, but near the equator the correction is tiny).
	dLat := nearbyRadiusKm / 111.0
	dLng := nearbyRadiusKm / (111.0 * math.Cos(lat*math.Pi/180))
	latMin, latMax := lat-dLat, lat+dLat
	lngMin, lngMax := lng-dLng, lng+dLng

	return gin.H{
		"shelter":  nearest(lib.RetrieveTheme("civildefencepublicshelters", latMin, lngMin, latMax, lngMax), lat, lng),
		"hospital": nearest(lib.RetrieveTheme("moh_hospitals", latMin, lngMin, latMax, lngMax), lat, lng),
		"aed":      aedCoverage(lib.RetrieveTheme("aed_locations", latMin, lngMin, latMax, lngMax), lat, lng),
	}
}

// nearest returns the closest point to (lat,lng) as a resourceItem, or nil when
// the theme yielded nothing.
func nearest(points []lib.ThemePoint, lat, lng float64) *resourceItem {
	best := -1
	var bestKm float64
	for i, p := range points {
		d := haversineKm(lat, lng, p.Lat, p.Lng)
		if best == -1 || d < bestKm {
			best, bestKm = i, d
		}
	}
	if best == -1 {
		return nil
	}
	p := points[best]
	// Shelters expose a clean address; hospitals expose a name. Prefer the name.
	name := p.Name
	if name == "" {
		name = p.Address
	}
	return &resourceItem{
		Name:      name,
		Address:   p.Address,
		DistanceM: int(math.Round(bestKm * 1000)),
		Lat:       p.Lat,
		Lng:       p.Lng,
	}
}

// aedCoverage summarises AED density: count in range + nearest distance.
func aedCoverage(points []lib.ThemePoint, lat, lng float64) *aedSummary {
	if len(points) == 0 {
		return nil
	}
	nearestKm := math.MaxFloat64
	for _, p := range points {
		if d := haversineKm(lat, lng, p.Lat, p.Lng); d < nearestKm {
			nearestKm = d
		}
	}
	return &aedSummary{Count: len(points), NearestM: int(math.Round(nearestKm * 1000))}
}
