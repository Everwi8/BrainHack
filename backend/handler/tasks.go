package handler

import (
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

	if err := lib.DB.DeleteTask(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete task"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deleted": id})
}
