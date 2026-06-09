// Perrin — triage endpoint: returns the current cross-agency situation
// assessment (threshold + cascade findings) from lib.RunTriage. The data source
// (live crises table vs. mock demo data) is chosen at startup by
// lib.SelectDataProvider.
package handler

import (
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"

	"backend/cache"
	"backend/lib"
)

// Per-crisis locks serialize first-view task generation so two concurrent opens
// (e.g. a double-fired client effect) can't each generate and persist a separate
// task set — which would otherwise spawn duplicate per-task group chats.
var (
	crisisGenMu    sync.Mutex
	crisisGenLocks = map[string]*sync.Mutex{}
)

func lockCrisisGen(id string) func() {
	crisisGenMu.Lock()
	lk := crisisGenLocks[id]
	if lk == nil {
		lk = &sync.Mutex{}
		crisisGenLocks[id] = lk
	}
	crisisGenMu.Unlock()
	lk.Lock()
	return lk.Unlock
}

// respondPersistedTasks returns the crisis's persisted tasks plus freshly
// computed triage findings (the Situation assessment is never cached).
func respondPersistedTasks(c *gin.Context, id string, tasks []lib.Task) {
	report, err := lib.TriageFindingsForCrisis(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"crisis_id":    id,
		"generated_at": report.GeneratedAt,
		"findings":     lib.EnrichFindingsProse(report.Findings),
		"tasks":        tasks,
	})
}

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

// CrisisTriage returns the triage findings and the crisis's volunteer tasks.
// Backs the map-click flow: GET /api/crises/:id/triage →
// {crisis_id, generated_at, findings, tasks}.
//
// Tasks are persist-on-first-view: the first time a crisis is opened we generate
// the AI task cards and INSERT them so each gets a stable id (needed for per-task
// group chats + membership). Subsequent views serve the persisted rows, so task
// ids stay constant across reloads and we skip re-running task generation.
// Findings (the Situation assessment) stay freshly computed each call.
func CrisisTriage(c *gin.Context) {
	id := c.Param("id")

	existing, err := lib.DB.GetTasks(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch tasks"})
		return
	}

	// Already have persisted tasks → just refresh the findings (cheap) and return.
	if len(existing) > 0 {
		respondPersistedTasks(c, id, existing)
		return
	}

	// First view → serialize generation per crisis, then double-check: another
	// request may have generated + persisted while we waited on the lock.
	unlock := lockCrisisGen(id)
	defer unlock()
	if again, err := lib.DB.GetTasks(id); err == nil && len(again) > 0 {
		respondPersistedTasks(c, id, again)
		return
	}

	// Generate + persist the task cards so they gain stable ids.
	report, cards, err := lib.TriageForCrisis(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tasks := make([]lib.Task, 0, len(cards))
	for _, card := range cards {
		// Deterministic id (crisis + title) so a concurrent first view or a data
		// reset reuses the same task + group chat instead of duplicating it.
		t, err := lib.DB.UpsertAITask(lib.Task{
			CrisisID:         id,
			Title:            card.Title,
			Description:      card.Description,
			Status:           "pending",
			Priority:         card.Priority,
			VolunteersNeeded: card.VolunteersNeeded,
			SkillsNeeded:     card.SkillsNeeded,
		})
		if err != nil {
			log.Printf("[crisis-triage] persist task %q for crisis %s: %v", card.Title, id, err)
			continue
		}
		tasks = append(tasks, *t)
	}

	// New task rows are embedded in the cached crisis detail — drop it so the
	// next GET /api/crises/:id reflects them.
	if len(tasks) > 0 {
		cache.GlobalCache.Invalidate("crisis:" + id)
	}

	c.JSON(http.StatusOK, gin.H{
		"crisis_id":    id,
		"generated_at": report.GeneratedAt,
		"findings":     lib.EnrichFindingsProse(report.Findings),
		"tasks":        tasks,
	})
}
