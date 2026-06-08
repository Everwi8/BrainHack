package handler

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func Health(c *gin.Context) {
	set := func(key string) bool { return os.Getenv(key) != "" }
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"keys": gin.H{
			"supabase_url":    set("SUPABASE_URL"),
			"supabase_secret": set("SUPABASE_SECRET_KEY"),
			"llm_api_key":     set("LLM_API_KEY"),
			"stt_api_key":     set("STT_API_KEY"),
			"lta_api_key":     set("LTA_API_KEY"),
			"jwt_secret":      set("JWT_SECRET"),
			"cors_origin":     os.Getenv("CORS_ORIGIN"),
		},
	})
}
