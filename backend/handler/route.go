// Jerald — travel-time ETAs: driving + public-transport minutes between two
// points via OneMap routing. Powers the "you → crisis" ETA on Crisis Detail.
package handler

import (
	"net/http"
	"strconv"
	"sync"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

// RouteETA handles GET /api/route?from_lat=&from_lng=&to_lat=&to_lng= and
// returns {"drive_min": n|null, "pt_min": n|null}. Each mode is best-effort:
// whichever OneMap can't answer (e.g. no overnight transit, or OneMap
// unconfigured) comes back null so the UI shows only what's available.
func RouteETA(c *gin.Context) {
	fromLat, okA := parseFloatQuery(c, "from_lat")
	fromLng, okB := parseFloatQuery(c, "from_lng")
	toLat, okC := parseFloatQuery(c, "to_lat")
	toLng, okD := parseFloatQuery(c, "to_lng")
	if !(okA && okB && okC && okD) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from_lat, from_lng, to_lat, to_lng are required"})
		return
	}

	// Drive and transit are independent OneMap round-trips — run them together so
	// the response is bounded by the slower single call, not their sum.
	var (
		wg              sync.WaitGroup
		driveMin, ptMin int
		driveOK, ptOK   bool
	)
	wg.Add(2)
	go func() { defer wg.Done(); driveMin, driveOK = lib.DriveETAMinutes(fromLat, fromLng, toLat, toLng) }()
	go func() { defer wg.Done(); ptMin, ptOK = lib.TransitETAMinutes(fromLat, fromLng, toLat, toLng) }()
	wg.Wait()

	resp := gin.H{"drive_min": nil, "pt_min": nil}
	if driveOK {
		resp["drive_min"] = driveMin
	}
	if ptOK {
		resp["pt_min"] = ptMin
	}
	c.JSON(http.StatusOK, resp)
}

// parseFloatQuery reads a float query param, reporting ok=false when missing or
// malformed.
func parseFloatQuery(c *gin.Context, key string) (float64, bool) {
	v, err := strconv.ParseFloat(c.Query(key), 64)
	return v, err == nil
}
