package handler

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"backend/cache"
	"backend/lib"
)

func ListTasks(c *gin.Context) {
	crisisID := c.Query("crisis_id")
	tasks, err := lib.DB.GetTasks(crisisID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch tasks"})
		return
	}
	c.JSON(http.StatusOK, tasks)
}

type createTaskRequest struct {
	CrisisID    string `json:"crisis_id"   binding:"required"`
	Title       string `json:"title"        binding:"required"`
	Description string `json:"description"`
}

func CreateTask(c *gin.Context) {
	var req createTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("userID")
	uid := userID.(string)

	task, err := lib.DB.CreateTask(lib.Task{
		CrisisID:    req.CrisisID,
		Title:       req.Title,
		Description: req.Description,
		Status:      "pending",
		CreatedBy:   &uid,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create task"})
		return
	}

	// Invalidate the crisis detail cache so the new task shows up immediately.
	cache.GlobalCache.Invalidate("crisis:" + req.CrisisID)

	c.JSON(http.StatusCreated, task)
}

type updateTaskRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
	AssignedTo  *string `json:"assigned_to"`
}

func UpdateTask(c *gin.Context) {
	id := c.Param("id")

	var req updateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"updated_at": time.Now(),
	}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.AssignedTo != nil {
		updates["assigned_to"] = *req.AssignedTo
	}

	task, err := lib.DB.UpdateTask(id, updates)
	if err != nil {
		if err.Error() == "task not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update task"})
		return
	}

	cache.GlobalCache.Invalidate("crisis:" + task.CrisisID)

	c.JSON(http.StatusOK, task)
}

func DeleteTask(c *gin.Context) {
	id := c.Param("id")

	task, err := lib.DB.GetTaskByID(id)
	if err != nil {
		if err.Error() == "task not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete task"})
		return
	}

	if err := lib.DB.DeleteTask(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete task"})
		return
	}

	cache.GlobalCache.Invalidate("crisis:" + task.CrisisID)
	c.JSON(http.StatusOK, gin.H{"deleted": id})
}

// JoinTask records the caller as a member of a task, which gates access to that
// task's group chat. Residents/volunteers may hold at most ONE task per crisis
// (the cap that makes the demo legible); coordinators are unlimited. Idempotent:
// re-joining a task you're already on succeeds.
func JoinTask(c *gin.Context) {
	taskID := c.Param("id")

	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user identity"})
		return
	}
	user, err := lib.DB.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	task, err := lib.DB.GetTaskByID(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	// Already a member → ensure the chat exists and return success (idempotent).
	already, err := lib.DB.IsTaskMember(taskID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not check membership"})
		return
	}
	if already {
		_, _ = lib.DB.GetOrCreateTaskChatSession(taskID, userID)
		c.JSON(http.StatusOK, gin.H{"joined": true, "task_id": taskID, "already_member": true})
		return
	}

	// Non-coordinators: enforce one task per crisis, and that the task still has
	// an open volunteer slot.
	if user.Role != "coordinator" {
		current, err := lib.DB.MemberTaskInCrisis(userID, task.CrisisID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not check membership"})
			return
		}
		if current != "" {
			c.JSON(http.StatusConflict, gin.H{
				"error":           "You can only join one task per crisis. Leave your current task to switch.",
				"current_task_id": current,
			})
			return
		}
		if task.VolunteersNeeded < 1 {
			c.JSON(http.StatusConflict, gin.H{
				"error": "This task is already full — every volunteer slot has been taken.",
				"full":  true,
			})
			return
		}
	}

	if err := lib.DB.JoinTask(taskID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not join task"})
		return
	}
	// A volunteer just filled a slot → reduce the remaining count so the card
	// shows fewer needed and locks out once it reaches zero. Coordinators oversee
	// rather than fill a slot, so they don't consume one.
	if user.Role != "coordinator" {
		if _, err := lib.DB.UpdateTask(taskID, map[string]interface{}{
			"volunteers_needed": task.VolunteersNeeded - 1,
			"updated_at":        time.Now(),
		}); err != nil {
			log.Printf("[tasks/join] decrement volunteers_needed for %s: %v", taskID, err)
		}
	}
	// Lazily open the task's group chat thread so it's ready when they arrive.
	if _, err := lib.DB.GetOrCreateTaskChatSession(taskID, userID); err != nil {
		log.Printf("[tasks/join] open task chat %s: %v", taskID, err)
	}

	cache.GlobalCache.Invalidate("crisis:" + task.CrisisID)
	c.JSON(http.StatusCreated, gin.H{"joined": true, "task_id": taskID})
}

// LeaveTask removes the caller from a task (frees the per-crisis slot so they can
// switch). A no-op if they weren't a member.
func LeaveTask(c *gin.Context) {
	taskID := c.Param("id")

	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user identity"})
		return
	}

	// Was the caller actually on this task, and are they a volunteer (not a
	// coordinator)? Only then does leaving free a volunteer slot back up.
	wasMember, _ := lib.DB.IsTaskMember(taskID, userID)
	user, _ := lib.DB.GetUserByID(userID)

	if err := lib.DB.LeaveTask(taskID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not leave task"})
		return
	}

	if task, err := lib.DB.GetTaskByID(taskID); err == nil {
		// Restore the slot the departing volunteer had taken (mirror of JoinTask).
		if wasMember && user != nil && user.Role != "coordinator" {
			if _, err := lib.DB.UpdateTask(taskID, map[string]interface{}{
				"volunteers_needed": task.VolunteersNeeded + 1,
				"updated_at":        time.Now(),
			}); err != nil {
				log.Printf("[tasks/leave] restore volunteers_needed for %s: %v", taskID, err)
			}
		}
		cache.GlobalCache.Invalidate("crisis:" + task.CrisisID)
	}
	c.JSON(http.StatusOK, gin.H{"left": true, "task_id": taskID})
}

// myTask is a joined task enriched with its crisis context, so the Volunteer
// page can label each per-task chat tab without extra round-trips.
type myTask struct {
	lib.Task
	CrisisTitle    string `json:"crisis_title"`
	CrisisType     string `json:"crisis_type"`
	CrisisSeverity string `json:"crisis_severity"`
	CrisisLocation string `json:"crisis_location"`
}

// ListMyTasks returns the tasks the caller has joined (newest first), each with
// crisis context. Drives the per-task tabs on the Volunteer page.
func ListMyTasks(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user identity"})
		return
	}

	tasks, err := lib.DB.ListMemberTasks(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch joined tasks"})
		return
	}

	// Enrich with crisis context. Cache per-crisis lookups so coordinators with
	// several tasks on the same crisis don't refetch it.
	crisisByID := map[string]*lib.CrisisWithTasks{}
	out := make([]myTask, 0, len(tasks))
	for _, t := range tasks {
		cr := crisisByID[t.CrisisID]
		if cr == nil {
			if fetched, err := lib.DB.GetCrisisByID(t.CrisisID); err == nil {
				cr = fetched
				crisisByID[t.CrisisID] = fetched
			}
		}
		m := myTask{Task: t}
		if cr != nil {
			m.CrisisTitle = cr.Title
			m.CrisisType = cr.Type
			m.CrisisSeverity = cr.Severity
			m.CrisisLocation = cr.LocationName
		}
		out = append(out, m)
	}

	c.JSON(http.StatusOK, out)
}
