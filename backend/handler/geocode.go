// Reverse geocoding: turn GPS lat/lng into a human-readable address for the
// report form's Location field. Uses OpenStreetMap's Nominatim (keyless), proxied
// through the backend so we can set a proper User-Agent and cache results.
package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"backend/cache"
)

var geoClient = &http.Client{Timeout: 6 * time.Second}

// ReverseGeocode resolves ?lat=&lng= to {"address": "..."}. Best-effort: on any
// failure it returns the coordinates as a readable fallback so the caller always
// has something to show.
func ReverseGeocode(c *gin.Context) {
	lat := c.Query("lat")
	lng := c.Query("lng")
	if lat == "" || lng == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lat and lng are required"})
		return
	}

	fallback := fmt.Sprintf("≈ %s, %s", lat, lng)
	// Cache per-coordinate (also caches the fallback) to avoid hammering Nominatim.
	raw, _ := cache.GlobalCache.GetOrFetch("revgeo:"+lat+","+lng, func() (interface{}, error) {
		addr, err := nominatimReverse(lat, lng)
		if err != nil || addr == "" {
			return fallback, nil
		}
		return addr, nil
	})

	c.JSON(http.StatusOK, gin.H{"address": raw})
}

func nominatimReverse(lat, lng string) (string, error) {
	endpoint := "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=" +
		url.QueryEscape(lat) + "&lon=" + url.QueryEscape(lng)
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	// Nominatim's usage policy requires an identifying User-Agent.
	req.Header.Set("User-Agent", "BrainySG/1.0 (DSTA BrainHack demo)")

	resp, err := geoClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("nominatim status %d", resp.StatusCode)
	}

	var out struct {
		DisplayName string            `json:"display_name"`
		Address     map[string]string `json:"address"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if a := conciseAddress(out.Address); a != "" {
		return a, nil
	}
	// Strip the trailing ", Singapore, <postcode>, Singapore"-style country tail.
	return strings.TrimSuffix(out.DisplayName, ", Singapore"), nil
}

// conciseAddress builds a short "<road>, <area> <postcode>" string from
// Nominatim's address parts, which reads better than the full display_name.
func conciseAddress(a map[string]string) string {
	if a == nil {
		return ""
	}
	pick := func(keys ...string) string {
		for _, k := range keys {
			if v := a[k]; v != "" {
				return v
			}
		}
		return ""
	}
	parts := []string{}
	if road := pick("road", "pedestrian", "footway", "neighbourhood"); road != "" {
		parts = append(parts, road)
	}
	if area := pick("suburb", "quarter", "city_district", "town", "city", "county"); area != "" {
		parts = append(parts, area)
	}
	addr := strings.Join(parts, ", ")
	if pc := a["postcode"]; pc != "" {
		if addr != "" {
			addr += " " + pc
		} else {
			addr = "Singapore " + pc
		}
	}
	return addr
}
