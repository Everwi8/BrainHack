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

// validCrisisTypes / validSeverities mirror the DB CHECK constraints so a bad
// payload fails with a clear 400 instead of an opaque 500 from PostgREST.
var validCrisisTypes = map[string]bool{
	"flood": true, "haze": true, "dengue": true, "mrt": true, "fire": true, "other": true,
}
var validSeverities = map[string]bool{
	"low": true, "medium": true, "high": true, "critical": true,
}

type createCrisisRequest struct {
	Title        string  `json:"title"    binding:"required"`
	Description  string  `json:"description"`
	Type         string  `json:"type"     binding:"required"`
	Severity     string  `json:"severity"`
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
	LocationName string  `json:"location_name"`
}

// CreateCrisis files a citizen crisis report. Any authenticated user may report;
// the report only reaches the public feed/map after a coordinator approves it.
// A coordinator's own report is trusted and auto-approved.
func CreateCrisis(c *gin.Context) {
	var req createCrisisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validCrisisTypes[req.Type] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid crisis type"})
		return
	}
	severity := req.Severity
	if severity == "" {
		severity = "low"
	}
	if !validSeverities[severity] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid severity"})
		return
	}

	userID := c.GetString("userID")
	approval := "pending"
	if c.GetString("role") == "coordinator" {
		approval = "approved"
	}

	crisis := lib.Crisis{
		Title:          req.Title,
		Description:    req.Description,
		Type:           req.Type,
		Severity:       severity,
		Status:         "active",
		Lat:            req.Lat,
		Lng:            req.Lng,
		LocationName:   req.LocationName,
		Source:         "user",
		ApprovalStatus: approval,
		ReportedBy:     &userID,
	}
	if approval == "approved" {
		crisis.ApprovedBy = &userID
	}

	created, err := lib.DB.CreateCrisis(crisis)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create crisis"})
		return
	}
	if approval == "approved" {
		cache.GlobalCache.Invalidate("crises:all")
	}
	c.JSON(http.StatusCreated, created)
}

type updateCrisisRequest struct {
	Title        *string `json:"title"`
	Description  *string `json:"description"`
	Type         *string `json:"type"`
	Severity     *string `json:"severity"`
	LocationName *string `json:"location_name"`
}

// UpdateCrisis lets the reporter edit their own report while it's still pending
// (coordinators may edit any pending report). Approved/rejected reports are
// locked to owners. Only the supplied fields are changed.
func UpdateCrisis(c *gin.Context) {
	id := c.Param("id")

	current, err := lib.DB.GetCrisisByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "crisis not found"})
		return
	}

	isCoordinator := c.GetString("role") == "coordinator"
	isOwner := current.ReportedBy != nil && *current.ReportedBy == c.GetString("userID")
	if !isCoordinator && !isOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "you can only edit your own reports"})
		return
	}
	if isOwner && !isCoordinator && current.ApprovalStatus != "pending" {
		c.JSON(http.StatusForbidden, gin.H{"error": "a report can only be edited while it is pending review"})
		return
	}

	var req updateCrisisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.LocationName != nil {
		updates["location_name"] = *req.LocationName
	}
	if req.Type != nil {
		if !validCrisisTypes[*req.Type] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid crisis type"})
			return
		}
		updates["type"] = *req.Type
	}
	if req.Severity != nil {
		if !validSeverities[*req.Severity] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid severity"})
			return
		}
		updates["severity"] = *req.Severity
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	updated, err := lib.DB.UpdateCrisis(id, updates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update report"})
		return
	}
	// Refresh cached views in case an already-approved crisis was edited.
	cache.GlobalCache.Invalidate("crises:all")
	cache.GlobalCache.Invalidate("crisis:" + id)
	c.JSON(http.StatusOK, updated)
}

// ListMyCrises returns the authenticated user's own reports (any approval
// status) so they can track what's still pending. Backs the resident/volunteer
// "your pending reports" container in the feed.
func ListMyCrises(c *gin.Context) {
	crises, err := lib.DB.GetCrisesByReporter(c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch your reports"})
		return
	}
	c.JSON(http.StatusOK, crises)
}

// ListPendingCrises returns reports awaiting review. Coordinator-only.
func ListPendingCrises(c *gin.Context) {
	crises, err := lib.DB.GetPendingCrises()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch pending reports"})
		return
	}
	c.JSON(http.StatusOK, crises)
}

// ResolveCrisis marks a crisis as resolved (the situation is handled).
// Coordinator-only. Resolved crises drop off the map but stay in the feed as
// history (sorted to the end).
func ResolveCrisis(c *gin.Context) {
	id := c.Param("id")
	updated, err := lib.DB.UpdateCrisis(id, map[string]interface{}{"status": "resolved"})
	if err != nil {
		if err.Error() == "crisis not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "crisis not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not resolve crisis"})
		return
	}
	cache.GlobalCache.Invalidate("crises:all")
	cache.GlobalCache.Invalidate("crisis:" + id)
	c.JSON(http.StatusOK, updated)
}

// ApproveCrisis / RejectCrisis action a pending report. Coordinator-only.
func ApproveCrisis(c *gin.Context) { setCrisisApproval(c, "approved") }
func RejectCrisis(c *gin.Context)  { setCrisisApproval(c, "rejected") }

func setCrisisApproval(c *gin.Context, status string) {
	id := c.Param("id")
	updated, err := lib.DB.SetCrisisApproval(id, status, c.GetString("userID"))
	if err != nil {
		if err.Error() == "crisis not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "crisis not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update report"})
		return
	}
	// Drop cached views so the (de)approved crisis appears/disappears at once.
	cache.GlobalCache.Invalidate("crises:all")
	cache.GlobalCache.Invalidate("crisis:" + id)
	c.JSON(http.StatusOK, updated)
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
