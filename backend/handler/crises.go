package handler

import (
	"math"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"backend/cache"
	"backend/lib"
)

func ListCrises(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("crises:all", func() (interface{}, error) {
		return lib.DB.GetCrises()
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch crises"})
		return
	}

	crises := raw.([]lib.Crisis)

	// Optional proximity filter: ?lat=1.35&lng=103.82&radius=10 (km, default 10)
	latStr := c.Query("lat")
	lngStr := c.Query("lng")
	if latStr != "" && lngStr != "" {
		lat, errLat := strconv.ParseFloat(latStr, 64)
		lng, errLng := strconv.ParseFloat(lngStr, 64)
		if errLat != nil || errLng != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lat/lng"})
			return
		}
		radius := 10.0
		if r := c.Query("radius"); r != "" {
			if v, err := strconv.ParseFloat(r, 64); err == nil {
				radius = v
			}
		}
		crises = filterByProximity(crises, lat, lng, radius)
	}

	c.JSON(http.StatusOK, crises)
}

func GetCrisis(c *gin.Context) {
	id := c.Param("id")
	cacheKey := "crisis:" + id

	raw, err := cache.GlobalCache.GetOrFetch(cacheKey, func() (interface{}, error) {
		return lib.DB.GetCrisisByID(id)
	})
	if err != nil {
		if err.Error() == "crisis not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "crisis not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch crisis"})
		return
	}

	c.JSON(http.StatusOK, raw.(*lib.CrisisWithTasks))
}

// filterByProximity returns crises within radius km of (lat, lng).
// Crises without coordinates (0,0) are excluded.
func filterByProximity(crises []lib.Crisis, lat, lng, radiusKm float64) []lib.Crisis {
	out := make([]lib.Crisis, 0, len(crises))
	for _, cr := range crises {
		if cr.Lat == 0 && cr.Lng == 0 {
			continue
		}
		if haversineKm(lat, lng, cr.Lat, cr.Lng) <= radiusKm {
			out = append(out, cr)
		}
	}
	return out
}

func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}
