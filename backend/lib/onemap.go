// Perrin — OneMap reverse-geocoding for chat personalisation. Turns the user's
// coordinates into a precise Singapore neighbourhood (nearest building/road)
// instead of the coarse compass region from AreaLabel.
//
// OneMap's geocoding API requires an authenticated token (free account at
// https://www.onemap.gov.sg). Set ONEMAP_EMAIL + ONEMAP_PASSWORD to enable it.
// Everything here is best-effort: with no credentials, or on any API failure,
// ReverseGeocode returns "" and callers fall back to AreaLabel.
package lib

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	onemapTokenURL    = "https://www.onemap.gov.sg/api/auth/post/getToken"
	onemapRevgeoURL   = "https://www.onemap.gov.sg/api/public/revgeocode"
	onemapThemeURL    = "https://www.onemap.gov.sg/api/public/themesvc/retrieveTheme"
	onemapTokenMargin = 1 * time.Hour // refresh this long before expiry
)

var onemapHTTP = &http.Client{Timeout: 8 * time.Second}

// onemapAuth caches the bearer token across requests; OneMap tokens last ~3 days.
var onemapAuth struct {
	mu      sync.Mutex
	token   string
	expires time.Time
}

// onemapToken returns a valid bearer token from ONEMAP_EMAIL + ONEMAP_PASSWORD,
// auto-fetching and refreshing it before the ~3-day expiry. It returns "" (no
// error) when unconfigured/unavailable so callers degrade quietly to AreaLabel.
func onemapToken() string {
	email := os.Getenv("ONEMAP_EMAIL")
	password := os.Getenv("ONEMAP_PASSWORD")
	if email == "" || password == "" {
		return ""
	}
	return onemapTokenFromCreds(email, password)
}

// onemapTokenFromCreds fetches and caches a token from credentials, refreshing
// it shortly before the OneMap-reported expiry.
func onemapTokenFromCreds(email, password string) string {
	onemapAuth.mu.Lock()
	defer onemapAuth.mu.Unlock()

	if onemapAuth.token != "" && time.Now().Before(onemapAuth.expires.Add(-onemapTokenMargin)) {
		return onemapAuth.token
	}

	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	resp, err := onemapHTTP.Post(onemapTokenURL, "application/json", strings.NewReader(string(body)))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	var tok struct {
		AccessToken     string `json:"access_token"`
		ExpiryTimestamp string `json:"expiry_timestamp"` // unix seconds, as a string
	}
	if err := json.Unmarshal(raw, &tok); err != nil || tok.AccessToken == "" {
		return ""
	}

	onemapAuth.token = tok.AccessToken
	// Default to a conservative 1-day life if the expiry doesn't parse.
	onemapAuth.expires = time.Now().Add(24 * time.Hour)
	if secs, perr := parseUnixSeconds(tok.ExpiryTimestamp); perr == nil {
		onemapAuth.expires = time.Unix(secs, 0)
	}
	return onemapAuth.token
}

// ReverseGeocode returns a precise, human-readable neighbourhood label for a
// coordinate (e.g. "near Block 402, Ang Mo Kio Avenue 10"), or "" when OneMap is
// unconfigured/unavailable or the point has no nearby address.
func ReverseGeocode(lat, lng float64) string {
	if lat == 0 && lng == 0 {
		return ""
	}
	token := onemapToken()
	if token == "" {
		return ""
	}

	q := url.Values{}
	q.Set("location", fmt.Sprintf("%f,%f", lat, lng))
	q.Set("buffer", "100") // metres to search outward for the nearest address
	q.Set("addressType", "All")

	req, _ := http.NewRequest("GET", onemapRevgeoURL+"?"+q.Encode(), nil)
	req.Header.Set("Authorization", token)

	resp, err := onemapHTTP.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	var out struct {
		GeocodeInfo []struct {
			BuildingName string `json:"BUILDINGNAME"`
			Block        string `json:"BLOCK"`
			Road         string `json:"ROAD"`
		} `json:"GeocodeInfo"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || len(out.GeocodeInfo) == 0 {
		return ""
	}

	g := out.GeocodeInfo[0]
	building := cleanOneMapField(g.BuildingName)
	road := cleanOneMapField(g.Road)
	block := cleanOneMapField(g.Block)

	switch {
	case building != "":
		return "near " + titleCaseWords(building)
	case road != "" && block != "":
		return fmt.Sprintf("near Block %s, %s", block, titleCaseWords(road))
	case road != "":
		return "near " + titleCaseWords(road)
	default:
		return ""
	}
}

// ThemePoint is one feature in a OneMap thematic layer (a POI such as an AED or
// a public shelter). Only the fields we surface in the UI are kept.
type ThemePoint struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Address     string  `json:"address"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
}

// RetrieveTheme returns every point of a OneMap theme (queryName, e.g.
// "aed_locations") whose location falls inside the lat/lng bounding box. It
// returns nil — never an error — when OneMap is unconfigured or the call fails,
// so callers degrade quietly just like ReverseGeocode.
func RetrieveTheme(queryName string, latMin, lngMin, latMax, lngMax float64) []ThemePoint {
	token := onemapToken()
	if token == "" {
		return nil
	}

	q := url.Values{}
	q.Set("queryName", queryName)
	// OneMap expects extents as lat_min,lng_min,lat_max,lng_max.
	q.Set("extents", fmt.Sprintf("%f,%f,%f,%f", latMin, lngMin, latMax, lngMax))

	req, _ := http.NewRequest("GET", onemapThemeURL+"?"+q.Encode(), nil)
	req.Header.Set("Authorization", token)

	resp, err := onemapHTTP.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	var out struct {
		SrchResults []map[string]interface{} `json:"SrchResults"`
	}
	// SrchResults[0] is theme metadata (FeatCount, owner, …); the rest are POIs.
	if err := json.Unmarshal(raw, &out); err != nil || len(out.SrchResults) < 2 {
		return nil
	}

	points := make([]ThemePoint, 0, len(out.SrchResults)-1)
	for _, m := range out.SrchResults[1:] {
		lat, lng, ok := parseLatLngPair(omString(m["LatLng"]))
		if !ok {
			continue
		}
		points = append(points, ThemePoint{
			Name:        titleCaseWords(omString(m["NAME"])),
			Description: omString(m["DESCRIPTION"]),
			Address:     titleCaseWords(omString(m["ADDRESSSTREETNAME"])),
			Lat:         lat,
			Lng:         lng,
		})
	}
	return points
}

// ── Routing (travel-time ETAs) ────────────────────────────────────────────────
//
// OneMap's routing service gives point-to-point travel time. The Crisis Detail
// page surfaces two modes so a resident can judge how to reach a situation:
// driving (private vehicle) and public transport (bus + MRT). Both are
// best-effort like the rest of this file — any failure returns ok=false and the
// UI simply omits that ETA rather than erroring.

const onemapRouteURL = "https://www.onemap.gov.sg/api/public/routingsvc/route"

// onemapRouteGet performs an authenticated GET against the routing service and
// decodes the JSON body into dst. Returns false on any error (unconfigured
// token, network failure, non-2xx, malformed body) so callers degrade quietly.
func onemapRouteGet(query string, dst interface{}) bool {
	token := onemapToken()
	if token == "" {
		return false
	}
	req, _ := http.NewRequest("GET", onemapRouteURL+"?"+query, nil)
	req.Header.Set("Authorization", token)
	resp, err := onemapHTTP.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	raw, _ := io.ReadAll(resp.Body)
	return json.Unmarshal(raw, dst) == nil
}

// secondsToMinutes rounds a positive second count up to whole minutes (so a
// 90-second hop reads as "2 min", never "1 min" or "0 min"). Non-positive
// inputs are treated as "no usable time".
func secondsToMinutes(secs int) (int, bool) {
	if secs <= 0 {
		return 0, false
	}
	return (secs + 59) / 60, true
}

// DriveETAMinutes returns the private-vehicle travel time in whole minutes
// between two coordinates, or ok=false when OneMap can't answer.
func DriveETAMinutes(fromLat, fromLng, toLat, toLng float64) (int, bool) {
	q := url.Values{}
	q.Set("start", fmt.Sprintf("%f,%f", fromLat, fromLng))
	q.Set("end", fmt.Sprintf("%f,%f", toLat, toLng))
	q.Set("routeType", "drive")

	var out struct {
		RouteSummary struct {
			TotalTime int `json:"total_time"` // seconds
		} `json:"route_summary"`
	}
	if !onemapRouteGet(q.Encode(), &out) {
		return 0, false
	}
	return secondsToMinutes(out.RouteSummary.TotalTime)
}

// TransitETAMinutes returns the public-transport (bus + MRT) travel time in
// whole minutes between two coordinates, or ok=false when OneMap can't answer.
//
// OneMap's PT routing is time-of-day sensitive: it plans against the live
// schedule for the date/time given, so overnight hours legitimately return "no
// route" (no service) — which we surface as simply unavailable, not an error.
// We query against the current Singapore time.
func TransitETAMinutes(fromLat, fromLng, toLat, toLng float64) (int, bool) {
	now := time.Now().In(singaporeLocation())
	q := url.Values{}
	q.Set("start", fmt.Sprintf("%f,%f", fromLat, fromLng))
	q.Set("end", fmt.Sprintf("%f,%f", toLat, toLng))
	q.Set("routeType", "pt")
	q.Set("date", now.Format("01-02-2006")) // OneMap wants MM-DD-YYYY
	q.Set("time", now.Format("15:04:05"))
	q.Set("mode", "TRANSIT")         // bus + rail
	q.Set("maxWalkDistance", "1500") // metres of walking OneMap may include
	q.Set("numItineraries", "1")

	var out struct {
		Plan struct {
			Itineraries []struct {
				Duration int `json:"duration"` // seconds
			} `json:"itineraries"`
		} `json:"plan"`
	}
	if !onemapRouteGet(q.Encode(), &out) || len(out.Plan.Itineraries) == 0 {
		return 0, false
	}
	return secondsToMinutes(out.Plan.Itineraries[0].Duration)
}

// singaporeLocation returns Asia/Singapore, falling back to a fixed UTC+8 zone
// if the tzdata isn't available on the host — so PT queries always carry SGT.
func singaporeLocation() *time.Location {
	if loc, err := time.LoadLocation("Asia/Singapore"); err == nil {
		return loc
	}
	return time.FixedZone("SGT", 8*60*60)
}

// omString coerces an interface{} from the decoded JSON map to a trimmed string.
func omString(v interface{}) string {
	s, _ := v.(string)
	return strings.TrimSpace(s)
}

// parseLatLngPair splits OneMap's "lat,lng" string into two floats.
func parseLatLngPair(s string) (lat, lng float64, ok bool) {
	parts := strings.SplitN(s, ",", 2)
	if len(parts) != 2 {
		return 0, 0, false
	}
	if _, err := fmt.Sscan(strings.TrimSpace(parts[0]), &lat); err != nil {
		return 0, 0, false
	}
	if _, err := fmt.Sscan(strings.TrimSpace(parts[1]), &lng); err != nil {
		return 0, 0, false
	}
	return lat, lng, true
}

// cleanOneMapField normalises OneMap's placeholder values ("NIL"/empty) to "".
func cleanOneMapField(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || strings.EqualFold(s, "NIL") {
		return ""
	}
	return s
}

// titleCaseWords turns OneMap's ALL-CAPS strings into Title Case for a natural
// label, leaving short all-caps tokens (MRT, HDB) untouched.
func titleCaseWords(s string) string {
	words := strings.Fields(strings.ToLower(s))
	for i, w := range words {
		runes := []rune(w)
		runes[0] = []rune(strings.ToUpper(string(runes[0])))[0]
		words[i] = string(runes)
	}
	return strings.Join(words, " ")
}

// parseUnixSeconds parses a unix-seconds timestamp delivered as a string.
func parseUnixSeconds(s string) (int64, error) {
	var secs int64
	_, err := fmt.Sscan(strings.TrimSpace(s), &secs)
	return secs, err
}
