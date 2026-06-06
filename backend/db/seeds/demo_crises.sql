-- Demo crises for DATA_SOURCE=demo mode.
--
-- These three rows are what the canned triage scenario in lib/triage_demo.go
-- (DemoDataProvider) links its readings back to, by type + proximity/name:
--
--   DemoDataProvider reading            →  crisis row it matches
--   ----------------------------------     ----------------------------------
--   flood  Kranji 4.1m @ 1.4255,103.7576 →  Flash Flood — Kranji      (nearest flood ≤2km)
--   haze   Central PSI 142               →  Haze Alert — Central Region (first haze row)
--   mrt    Line "EWL" disrupted          →  EWL Disruption …          (title contains "EWL")
--
-- So with the server booted in demo mode, tapping a crisis circle on the map
-- (GET /api/crises/:id/triage) returns that crisis's findings + generated tasks.
--
-- Keep the coordinates and types in sync with demoSnapshot() — if you move a
-- reading, move the matching row here too, or the crisis_id link breaks.
--
-- Idempotent: safe to re-run. Run AFTER schema.sql. Pairs with seed_users.sql
-- (users) — this file seeds crises only.

-- Optional clean slate for crises (removes live-ingestion rows too):
-- DELETE FROM crises WHERE external_id LIKE 'nea:%' OR external_id LIKE 'lta:%' OR external_id LIKE 'pub:%';

INSERT INTO crises (id, title, description, type, severity, status, lat, lng, location_name, source) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'Flash Flood — Kranji',
    'Water levels rising rapidly near Kranji MRT. Low-lying areas affected.',
    'flood', 'high', 'active',
    1.4255, 103.7576, 'Kranji', 'pub'
  ),
  (
    '11111111-0000-0000-0000-000000000002',
    'EWL Disruption — Jurong East to Clementi',
    'Train service disrupted between Jurong East and Clementi due to a track fault.',
    'mrt', 'medium', 'active',
    1.3329, 103.7436, 'Jurong East', 'lta'
  ),
  (
    '11111111-0000-0000-0000-000000000003',
    'Haze Alert — Central Region',
    'PSI reading at 142. Unhealthy for sensitive groups.',
    'haze', 'medium', 'active',
    1.3521, 103.8198, 'Central Singapore', 'nea'
  )
ON CONFLICT (id) DO UPDATE SET
  title         = EXCLUDED.title,
  description   = EXCLUDED.description,
  type          = EXCLUDED.type,
  severity      = EXCLUDED.severity,
  status        = EXCLUDED.status,
  lat           = EXCLUDED.lat,
  lng           = EXCLUDED.lng,
  location_name = EXCLUDED.location_name,
  source        = EXCLUDED.source;
