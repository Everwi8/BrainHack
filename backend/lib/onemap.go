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
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
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
	onemapTokenMargin = 1 * time.Hour // refresh this long before expiry
)

var onemapHTTP = &http.Client{Timeout: 8 * time.Second}

// onemapAuth caches the bearer token across requests; OneMap tokens last ~3 days.
var onemapAuth struct {
	mu      sync.Mutex
	token   string
	expires time.Time
}

// onemapToken returns a valid bearer token, or "" (no error) when OneMap is
// unconfigured/stale so callers degrade quietly. Two modes:
//
//   - ONEMAP_EMAIL + ONEMAP_PASSWORD → auto-fetch and refresh (preferred; never
//     goes stale because we re-authenticate before the 3-day expiry).
//   - ONEMAP_TOKEN → use a manually-supplied token. OneMap tokens don't
//     auto-renew, so we read the JWT's `exp` claim and stop using it once it
//     expires, logging a hint to refresh it.
func onemapToken() string {
	if email := os.Getenv("ONEMAP_EMAIL"); email != "" {
		if password := os.Getenv("ONEMAP_PASSWORD"); password != "" {
			return onemapTokenFromCreds(email, password)
		}
	}
	if tok := strings.TrimSpace(os.Getenv("ONEMAP_TOKEN")); tok != "" {
		return validStaticToken(tok)
	}
	return ""
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

// validStaticToken returns the manually-supplied token while it is still valid,
// using the JWT's embedded expiry. Once expired it returns "" and logs a
// throttled hint so the caller falls back to the coarse region label.
func validStaticToken(tok string) string {
	exp, err := jwtExpiry(tok)
	if err != nil {
		// Can't read an expiry — trust the token rather than blocking lookups.
		return tok
	}
	if time.Now().After(exp) {
		warnOneMapTokenExpired(exp)
		return ""
	}
	return tok
}

// jwtExpiry pulls the `exp` (unix seconds) claim out of a JWT without verifying
// its signature — we only need the expiry, and the token is OneMap's to trust.
func jwtExpiry(tok string) (time.Time, error) {
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		return time.Time{}, fmt.Errorf("not a JWT")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		if payload, err = base64.StdEncoding.DecodeString(parts[1]); err != nil {
			return time.Time{}, err
		}
	}
	var claims struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil || claims.Exp == 0 {
		return time.Time{}, fmt.Errorf("no exp claim")
	}
	return time.Unix(claims.Exp, 0), nil
}

// onemapWarn throttles the expired-token log so it appears at most hourly.
var onemapWarn struct {
	mu   sync.Mutex
	last time.Time
}

func warnOneMapTokenExpired(exp time.Time) {
	onemapWarn.mu.Lock()
	defer onemapWarn.mu.Unlock()
	if time.Since(onemapWarn.last) < time.Hour {
		return
	}
	onemapWarn.last = time.Now()
	log.Printf("[onemap] ONEMAP_TOKEN expired %s ago — refresh it, or set ONEMAP_EMAIL/ONEMAP_PASSWORD for auto-renewal. Falling back to region labels.",
		time.Since(exp).Round(time.Minute))
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
