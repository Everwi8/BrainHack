// Sanjey — /api/data/* endpoints. The HTTP-fetch + parse for every feed lives in
// lib/datasource.go (shared with Perrin's triage live provider); these handlers
// just add the 5-minute cache layer and serve the result as JSON.
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"backend/cache"
	"backend/lib"
)

// GET /api/data/weather — NEA 2-hour forecast per area.
func GetWeather(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:weather", func() (interface{}, error) {
		return lib.FetchWeather()
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "weather data unavailable"})
		return
	}
	c.JSON(http.StatusOK, raw)
}

// GET /api/data/haze — NEA 24-hour PSI by region (+ derived advisory).
func GetHaze(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:haze", func() (interface{}, error) {
		return lib.FetchHaze()
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "haze data unavailable"})
		return
	}
	c.JSON(http.StatusOK, raw)
}

// GET /api/data/floods — active NEA flood alerts.
func GetFloods(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:floods", func() (interface{}, error) {
		return lib.FetchFloodAlerts()
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "flood data unavailable"})
		return
	}
	c.JSON(http.StatusOK, raw)
}

// GET /api/data/transport — LTA train service alerts.
func GetTransport(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:transport", func() (interface{}, error) {
		return lib.FetchTransport()
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "transport data unavailable"})
		return
	}
	c.JSON(http.StatusOK, raw)
}

// GET /api/data/dengue — active NEA dengue clusters. Non-critical path: returns
// an empty set (HTTP 200) rather than 503 when the upstream fetch fails.
func GetDengue(c *gin.Context) {
	raw, err := cache.GlobalCache.GetOrFetch("data:dengue", func() (interface{}, error) {
		return lib.FetchDengue()
	})
	if err != nil {
		c.JSON(http.StatusOK, lib.DengueFeed{Clusters: []lib.DengueClusterFeed{}})
		return
	}
	c.JSON(http.StatusOK, raw)
}
