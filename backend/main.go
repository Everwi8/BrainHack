// Sanjey — server entry point
package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"backend/handler"
	"backend/middleware"
)

func main() {
	_ = godotenv.Load()

	r := gin.Default()
	r.Use(middleware.CORS())

	r.GET("/health", handler.Health)

	api := r.Group("/api")
	{
		api.POST("/auth/register", handler.Register)
		api.POST("/auth/login", handler.Login)

		api.GET("/crises", handler.ListCrises)
		api.GET("/crises/:id", handler.GetCrisis)

		api.GET("/tasks", handler.ListTasks)
		api.POST("/tasks", handler.CreateTask)
		api.PUT("/tasks/:id", handler.UpdateTask)
		api.DELETE("/tasks/:id", handler.DeleteTask)

		// Perrin
		api.POST("/chat", handler.Chat)

		// Jerald
		api.GET("/map/markers", handler.MapMarkers)
		api.GET("/shelters", handler.GetShelters)

		// James
		api.GET("/volunteers", handler.ListVolunteers)
		api.POST("/volunteers", handler.RegisterVolunteer)
		api.POST("/voice", handler.Voice)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Fatal(r.Run(":" + port))
}
