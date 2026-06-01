// Perrin — triage endpoint: returns the current cross-agency situation
// assessment (threshold + cascade findings) from lib.RunTriage. Runs against
// mock data until Sanjey's /api/data/* endpoints are live.
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

func Triage(c *gin.Context) {
	report, err := lib.RunTriage()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

// TriageTasks runs triage and generates volunteer task cards from the findings
// (Phase 4). Cards are best-effort forwarded to the tasks sink and also
// returned so the frontend can render them immediately.
func TriageTasks(c *gin.Context) {
	tasks, err := lib.GenerateTasksFromTriage()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	lib.ForwardTasks(tasks)
	c.JSON(http.StatusOK, gin.H{"tasks": tasks})
}
