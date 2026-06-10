// Reverse geocoding: turn GPS lat/lng into a human-readable address for the
// report form's Location field. Tries OneMap first (authoritative Singapore
// block/road data), then OpenStreetMap's Nominatim (keyless), proxied through
// the backend so we can set a proper User-Agent and cache results.
package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"backend/cache"
	"backend/lib"
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

	// Cache per-coordinate to avoid hammering the upstream geocoders. Failures
	// return an error (not the fallback) so they aren't cached for the TTL.
	raw, err := cache.GlobalCache.GetOrFetch("revgeo:"+lat+","+lng, func() (interface{}, error) {
		// OneMap first: local SG data, e.g. "Block 402, Ang Mo Kio Avenue 10".
		if latF, errLat := strconv.ParseFloat(lat, 64); errLat == nil {
			if lngF, errLng := strconv.ParseFloat(lng, 64); errLng == nil {
				if addr := lib.ReverseGeocode(latF, lngF); addr != "" {
					// Drop the "near " prefix — it reads oddly in a Location field.
					return strings.TrimPrefix(addr, "near "), nil
				}
			}
		}
		addr, err := nominatimReverse(lat, lng)
		if err != nil || addr == "" {
			return nil, fmt.Errorf("reverse geocode unavailable for %s,%s", lat, lng)
		}
		return addr, nil
	})
	if err != nil {
		// Both geocoders failed — give the caller readable coordinates.
		c.JSON(http.StatusOK, gin.H{"address": fmt.Sprintf("≈ %s, %s", lat, lng)})
		return
	}

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
