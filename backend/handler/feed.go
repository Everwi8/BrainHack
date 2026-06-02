package handler

import (
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"backend/lib"
)

type FeedItem struct {
	ID           string  `json:"id"`
	Tag          string  `json:"tag"` // URGENT_ALERT | LIVE | TRENDING | COMMUNITY
	Title        string  `json:"title"`
	Location     string  `json:"location"`
	Body         string  `json:"body"`
	ImageURL     *string `json:"image_url"`
	CreatedAt    string  `json:"created_at"`
	CommentCount int     `json:"comment_count"`
	ShareCount   int     `json:"share_count"`
	HelpNeeded   bool    `json:"help_needed"`
}

var severityToTag = map[string]string{
	"critical": "URGENT_ALERT",
	"high":     "LIVE",
	"medium":   "TRENDING",
	"low":      "COMMUNITY",
}

// tagPriority controls sort order — lower number = pinned higher.
var tagPriority = map[string]int{
	"URGENT_ALERT": 0,
	"LIVE":         1,
	"TRENDING":     2,
	"COMMUNITY":    3,
}

func GetFeed(c *gin.Context) {
	limit := 20
	offset := 0
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	crises, err := lib.DB.GetCrisesPaged(limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "feed unavailable"})
		return
	}

	items := make([]FeedItem, 0, len(crises))
	for _, crisis := range crises {
		tag, ok := severityToTag[crisis.Severity]
		if !ok {
			tag = "COMMUNITY"
		}
		items = append(items, FeedItem{
			ID:         crisis.ID,
			Tag:        tag,
			Title:      crisis.Title,
			Location:   crisis.LocationName,
			Body:       crisis.Description,
			ImageURL:   nil,
			CreatedAt:  crisis.CreatedAt.UTC().Format(time.RFC3339),
			HelpNeeded: crisis.Severity != "low",
		})
	}

	// Pin URGENT_ALERT first, then LIVE, TRENDING, COMMUNITY. Within each tag,
	// the original created_at.desc order from Supabase is preserved (SliceStable).
	sort.SliceStable(items, func(i, j int) bool {
		return tagPriority[items[i].Tag] < tagPriority[items[j].Tag]
	})

	c.JSON(http.StatusOK, gin.H{
		"items":  items,
		"limit":  limit,
		"offset": offset,
	})
}
