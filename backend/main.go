package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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

	// Pick the triage data source: DATA_SOURCE=demo serves the canned demo
	// scenario (db/seeds/demo_crises.sql), anything else uses the live
	// cross-agency feeds. Flippable at runtime via /api/admin/data-source.
	lib.SelectDataProvider()

	// ── Ingestion goroutines ──────────────────────────────────────────────────
	// Each script polls its data source every 5 minutes and upserts to Supabase.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// In demo mode the crises table holds only our curated seed rows, so we skip
	// live ingestion entirely — otherwise it would re-upsert live-feed crises
	// (and noise) on top of the seed every 5 minutes. Live mode runs it normally.
	if os.Getenv("DATA_SOURCE") == "demo" {
		log.Println("[ingestion] DATA_SOURCE=demo — live ingestion paused")
	} else {
		go ingestion.RunNEA(ctx)
		go ingestion.RunLTA(ctx)
		go ingestion.RunPUB(ctx)
	}

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
		api.GET("/crises/:id/triage", handler.CrisisTriage) // triage + tasks for one crisis

		// Tasks — reads are public, writes require auth
		api.GET("/tasks", handler.ListTasks)
		api.POST("/tasks", middleware.RequireAuth(), handler.CreateTask)
		api.PATCH("/tasks/:id", middleware.RequireAuth(), handler.UpdateTask)
		api.DELETE("/tasks/:id", middleware.RequireAuth(), handler.DeleteTask)

		// Perrin — AI chat + triage. Chat requires auth so each user's
		// conversation history is keyed to their account and isolated from others.
		api.POST("/chat", middleware.RequireAuth(), handler.Chat)
		api.POST("/chat/photo", middleware.RequireAuth(), handler.ChatPhoto)
		api.GET("/chat/sessions", middleware.RequireAuth(), handler.ListChatSessions)
		api.POST("/chat/sessions", middleware.RequireAuth(), handler.CreateChatSession)
		api.GET("/chat/sessions/:id", middleware.RequireAuth(), handler.GetChatSession)
		api.DELETE("/chat/sessions/:id", middleware.RequireAuth(), handler.DeleteChatSession)
		api.GET("/triage", handler.Triage)
		api.GET("/triage/tasks", handler.TriageTasks)

		// Data endpoints (Sanjey)
		api.GET("/data/weather", handler.GetWeather)
		api.GET("/data/haze", handler.GetHaze)
		api.GET("/data/floods", handler.GetFloods)
		api.GET("/data/transport", handler.GetTransport)
		api.GET("/data/dengue", handler.GetDengue)
		api.GET("/hospitals", handler.GetHospitals)
		api.GET("/feed", handler.GetFeed)

		// Jerald — map markers
		api.GET("/map/markers", handler.MapMarkers)
		api.GET("/shelters", handler.GetShelters)

		// James — volunteers + voice
		api.GET("/volunteers", handler.ListVolunteers)
		api.POST("/volunteers", middleware.RequireAuth(), handler.RegisterVolunteer)
		api.POST("/voice", handler.Voice) // testing without auth
		// api.POST("/voice", middleware.RequireAuth(), handler.Voice)

		// Admin — runtime demo/live data toggle (open for demo simplicity)
		api.GET("/admin/data-source", handler.DataSourceStatus)
		api.POST("/admin/data-source", handler.SwitchDataSource)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{Addr: ":" + port, Handler: r}

	// Graceful shutdown on SIGINT/SIGTERM: stop ingestion, then stop the HTTP
	// server so ListenAndServe returns and the process actually exits.
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit
		log.Println("shutting down...")
		cancel()

		shutdownCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("server shutdown error: %v", err)
		}
	}()

	log.Printf("server running on http://localhost:%s", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
	log.Println("server stopped")
}
