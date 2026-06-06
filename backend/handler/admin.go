// Admin — runtime demo/live data toggle. Lets the frontend flip the triage data
// source between the canned demo scenario and the live cross-agency feeds
// without restarting the server (see lib.SetDataSource for the caveats about
// ingestion, which is wired once at boot).
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

type dataSourceRequest struct {
	Mode string `json:"mode"` // "demo" | "live"
}

// DataSourceStatus reports the active triage data source.
// GET /api/admin/data-source → {"mode":"demo"|"live"}
func DataSourceStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"mode": lib.CurrentDataSource()})
}

// SwitchDataSource flips the triage data source at runtime.
// POST /api/admin/data-source {"mode":"demo"|"live"}
func SwitchDataSource(c *gin.Context) {
	var req dataSourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if !lib.SetDataSource(req.Mode) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "mode must be 'demo' or 'live'"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"mode": lib.CurrentDataSource()})
}
