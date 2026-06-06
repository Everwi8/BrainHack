// Perrin — triage endpoint: returns the current cross-agency situation
// assessment (threshold + cascade findings) from lib.RunTriage. The data source
// (live crises table vs. mock demo data) is chosen at startup by
// lib.SelectDataProvider.
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

// CrisisTriage returns the triage findings and generated task cards scoped to a
// single crisis. Backs the map-click flow: GET /api/crises/:id/triage →
// {crisis_id, generated_at, findings, tasks}. Findings/tasks are empty (not an
// error) when nothing currently links to the crisis.
func CrisisTriage(c *gin.Context) {
	id := c.Param("id")
	report, tasks, err := lib.TriageForCrisis(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"crisis_id":    id,
		"generated_at": report.GeneratedAt,
		"findings":     report.Findings,
		"tasks":        tasks,
	})
}
