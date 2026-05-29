// MOH ingestion — MOH does not publish a real-time public API.
// Hospital bed availability and dengue cluster data are updated manually
// or sourced from data.gov.sg datasets (updated daily, not real-time).
//
// For the hackathon, MOH crises (dengue outbreaks, hospital capacity alerts)
// can be seeded manually via db/seeds/seed.sql or the POST /api/crises endpoint
// once an admin UI is wired up.
//
// To add real MOH data later:
//   1. Download dengue cluster GeoJSON from data.gov.sg
//   2. Parse it here and upsert to the crises table with source="moh"
//   3. Schedule via RunMOH() similar to the other ingestion scripts.
package ingestion

import (
	"context"
	"log"
)

// RunMOH is a no-op placeholder. Replace with real implementation when MOH
// data becomes available.
func RunMOH(ctx context.Context) {
	log.Println("[moh] no real-time API available — skipping MOH ingestion")
	<-ctx.Done()
}
