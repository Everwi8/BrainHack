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

	// Ensure the public Storage bucket for chat photos exists (best-effort).
	if err := lib.DB.EnsureChatBucket(); err != nil {
		log.Printf("[storage] could not ensure chat-images bucket: %v", err)
	}

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
		// Profile (self): read + edit own name/password
		api.GET("/auth/me", middleware.RequireAuth(), handler.GetMe)
		api.PATCH("/auth/me", middleware.RequireAuth(), handler.UpdateMe)

		// Crises (public read; only approved crises surface here)
		api.GET("/crises", handler.ListCrises)
		api.GET("/crises/:id", handler.GetCrisis)
		api.GET("/crises/:id/triage", handler.CrisisTriage) // triage + tasks for one crisis
		api.POST("/crises/:id/chat", handler.CrisisChat)                              // crisis-grounded Brainy drawer chat
		api.POST("/crises/:id/chat/photo", middleware.RequireAuth(), handler.CrisisChatPhoto) // crisis-grounded photo read (vision)

		// Crisis reporting + approval (RBAC):
		//   any authenticated user can file a report (coordinators' are auto-approved);
		//   only coordinators can review/approve/reject the pending queue.
		api.POST("/crises", middleware.RequireAuth(), handler.CreateCrisis)
		api.PATCH("/crises/:id", middleware.RequireAuth(), handler.UpdateCrisis)
		api.GET("/crises/mine", middleware.RequireAuth(), handler.ListMyCrises)
		api.GET("/crises/pending", middleware.RequireAuth(), middleware.RequireRole("coordinator"), handler.ListPendingCrises)
		api.POST("/crises/:id/approve", middleware.RequireAuth(), middleware.RequireRole("coordinator"), handler.ApproveCrisis)
		api.POST("/crises/:id/reject", middleware.RequireAuth(), middleware.RequireRole("coordinator"), handler.RejectCrisis)
		api.POST("/crises/:id/resolve", middleware.RequireAuth(), middleware.RequireRole("coordinator"), handler.ResolveCrisis)

		// Tasks — reads are public, writes require auth
		api.GET("/tasks", handler.ListTasks)
		api.GET("/tasks/mine", middleware.RequireAuth(), handler.ListMyTasks) // tasks the caller has joined
		api.POST("/tasks", middleware.RequireAuth(), handler.CreateTask)
		api.PATCH("/tasks/:id", middleware.RequireAuth(), handler.UpdateTask)
		api.DELETE("/tasks/:id", middleware.RequireAuth(), handler.DeleteTask)
		// Task membership: joining gates access to the task's group chat. One task
		// per crisis for residents/volunteers; coordinators unlimited (handler logic).
		api.POST("/tasks/:id/join", middleware.RequireAuth(), handler.JoinTask)
		api.DELETE("/tasks/:id/join", middleware.RequireAuth(), handler.LeaveTask)
		// Skill-based matching: rank a crisis's open tasks for the calling volunteer.
		api.GET("/crises/:id/match", middleware.RequireAuth(), handler.MatchTasks)

		// Perrin — AI chat + triage. Chat requires auth so each user's
		// conversation history is keyed to their account and isolated from others.
		api.POST("/chat", middleware.RequireAuth(), handler.Chat)
		api.POST("/chat/stream", middleware.RequireAuth(), handler.ChatStream) // SSE token streaming
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
		api.GET("/geocode/reverse", handler.ReverseGeocode)   // lat/lng → readable address
		api.GET("/resources/nearby", handler.NearbyResources) // OneMap civic resources near a point

		// Jerald — map markers
		api.GET("/map/markers", handler.MapMarkers)
		api.GET("/shelters", handler.GetShelters)

		// James — volunteers + voice
		api.GET("/volunteers", handler.ListVolunteers)
		api.GET("/volunteers/skills", handler.SkillCatalog)                          // canonical skill catalogue for the profile form
		api.GET("/volunteers/me", middleware.RequireAuth(), handler.GetMyVolunteer)  // caller's saved skill profile
		api.POST("/volunteers", middleware.RequireAuth(), handler.RegisterVolunteer) // create/update own profile
		api.POST("/voice", middleware.RequireAuth(), handler.Voice)
		api.GET("/groupchat/:crisisID/messages", handler.GetGroupChatMessages)
		api.POST("/groupchat/:crisisID/messages", middleware.RequireAuth(), handler.PostGroupChatMessage)
		api.POST("/groupchat/image", middleware.RequireAuth(), handler.UploadGroupChatImage)
		// Per-task group chats — membership-gated (join a task to read/post).
		api.GET("/taskchat/:taskID/messages", middleware.RequireAuth(), handler.GetTaskChatMessages)
		api.POST("/taskchat/:taskID/messages", middleware.RequireAuth(), handler.PostTaskChatMessage)

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
