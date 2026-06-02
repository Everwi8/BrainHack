package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"backend/handler"
	"backend/ingestion"
	"backend/lib"
	"backend/middleware"
)

func main() {
	_ = godotenv.Load()

	lib.Init()

	// Pick the triage data source: live (Sanjey's crises table) when SUPABASE_URL
	// is configured, else mock demo data. See lib.SelectDataProvider.
	lib.SelectDataProvider()

	// ── Ingestion goroutines ──────────────────────────────────────────────────
	// Each script polls its data source every 5 minutes and upserts to Supabase.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go ingestion.RunNEA(ctx)
	go ingestion.RunLTA(ctx)
	go ingestion.RunPUB(ctx)
	go ingestion.RunMOH(ctx)

	// ── HTTP server ───────────────────────────────────────────────────────────
	r := gin.Default()
	r.Use(middleware.CORS())

	r.GET("/health", handler.Health)
	r.StaticFile("/test-chat", "../test-chat.html")

	api := r.Group("/api")
	{
		// Auth (public)
		api.POST("/auth/register", handler.Register)
		api.POST("/auth/login", handler.Login)

		// Crises (public read)
		api.GET("/crises", handler.ListCrises)
		api.GET("/crises/:id", handler.GetCrisis)

		// Tasks — reads are public, writes require auth
		api.GET("/tasks", handler.ListTasks)
		api.POST("/tasks", middleware.RequireAuth(), handler.CreateTask)
		api.PUT("/tasks/:id", middleware.RequireAuth(), handler.UpdateTask)
		api.DELETE("/tasks/:id", middleware.RequireAuth(), handler.DeleteTask)

		// Perrin — AI chat
		api.POST("/chat", handler.Chat)
		api.POST("/chat/photo", handler.ChatPhoto)
		api.GET("/triage", handler.Triage)
		api.GET("/triage/tasks", handler.TriageTasks)

		// Jerald — map markers
		api.GET("/map/markers", handler.MapMarkers)
		api.GET("/shelters", handler.GetShelters)

		// James — volunteers + voice
		api.GET("/volunteers", handler.ListVolunteers)
		api.POST("/volunteers", middleware.RequireAuth(), handler.RegisterVolunteer)
		api.POST("/voice", middleware.RequireAuth(), handler.Voice)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Graceful shutdown on SIGINT/SIGTERM
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit
		log.Println("shutting down...")
		cancel()
	}()

	log.Printf("server running on http://localhost:%s", port)
	log.Fatal(r.Run(":" + port))
}
