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
--   dengue Tampines 64 @ 1.3536,103.9436 →  Dengue Cluster — Tampines (nearest dengue ≤2km)
--
-- So with the server booted in demo mode, tapping a crisis circle on the map
-- (GET /api/crises/:id/triage) returns that crisis's findings + generated tasks.
--
-- Keep the coordinates and types in sync with demoSnapshot() — if you move a
-- reading, move the matching row here too, or the crisis_id link breaks.
--
-- Idempotent: safe to re-run. Run AFTER schema.sql. Pairs with seed_users.sql
-- (users) — this file seeds crises only.

-- Clean slate: drop any live-ingestion rows (nea/lta/pub) left over from a
-- previous DATA_SOURCE=live run. In demo mode the map should show ONLY the four
-- curated rows below — without this, stale rows like "Severe Weather — … (Thundery
-- Showers)" linger because live ingestion is paused and never resolves them.
DELETE FROM crises WHERE external_id LIKE 'nea:%' OR external_id LIKE 'lta:%' OR external_id LIKE 'pub:%';

-- The `sensors` jsonb (migration 004 / schema.sql) feeds the CrisisDetail
-- "Live data sources" cards. Keys present render a value + status; omitted keys
-- show "No data" / "Normal". Values are themed per crisis and tuned to the card
-- thresholds (rain >60 ALERT / >40 WARN; drain >80 ALERT / >60 WARN).
INSERT INTO crises (id, title, description, type, severity, status, lat, lng, location_name, source, sensors) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'Flash Flood — Kranji',
    'Water levels rising rapidly near Kranji MRT. Low-lying areas affected.',
    'flood', 'high', 'active',
    1.4255, 103.7576, 'Kranji', 'pub',
    -- Flood: heavy rain + drains near capacity, nearby beds drawn down.
    '{"nea_rain_mm": 72, "pub_drain_pct": 88, "moh_beds_avail": 24}'::jsonb
  ),
  (
    '11111111-0000-0000-0000-000000000002',
    'EWL Disruption — Jurong East to Clementi',
    'Train service disrupted between Jurong East and Clementi due to a track fault.',
    'mrt', 'medium', 'active',
    1.3329, 103.7436, 'Jurong East', 'lta',
    -- MRT fault: dry weather, transit ETA elevated (WATCH).
    '{"nea_rain_mm": 6, "pub_drain_pct": 22, "lta_eta_min": 18, "moh_beds_avail": 41}'::jsonb
  ),
  (
    '11111111-0000-0000-0000-000000000003',
    'Haze Alert — Central Region',
    'PSI reading at 142. Unhealthy for sensitive groups.',
    'haze', 'medium', 'active',
    1.3521, 103.8198, 'Central Singapore', 'nea',
    -- Haze: clear/dry, transit normal, beds steady.
    '{"nea_rain_mm": 2, "pub_drain_pct": 16, "moh_beds_avail": 33}'::jsonb
  ),
  (
    '11111111-0000-0000-0000-000000000004',
    'Dengue Cluster — Tampines',
    'NEA red dengue cluster in Tampines. 64 cases reported. Remove stagnant water, apply repellent, and see a doctor for fever with body aches.',
    'dengue', 'high', 'active',
    1.3536, 103.9436, 'Tampines', 'nea',
    -- Dengue: dry weather (mozzie breeding in stagnant water, not rain), drains
    -- low, hospitals carrying extra fever cases so beds drawn down. nea_dengue_cases
    -- carries the cluster count for reference (no dedicated sensor card yet).
    '{"nea_rain_mm": 4, "pub_drain_pct": 14, "moh_beds_avail": 29, "nea_dengue_cases": 64}'::jsonb
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
  source        = EXCLUDED.source,
  sensors       = EXCLUDED.sensors;
