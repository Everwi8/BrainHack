-- 004_crisis_sensors — per-crisis live-sensor snapshot for the CrisisDetail UI.
--
-- The "Live data sources" cards on the crisis detail page (NEA Rain, PUB Drain,
-- LTA Transit, MOH Beds) read crisis.sensors.{nea_rain_mm, pub_drain_pct,
-- lta_eta_min, moh_beds_avail}. Until now no such column existed, so every card
-- rendered "No data". This adds a free-form jsonb snapshot per crisis row.
--
-- jsonb (not a typed column set) keeps the shape owned by the frontend cards:
-- a key is present → the card shows a value; absent → "No data". Defaults to an
-- empty object so existing rows are valid and read as "No data" everywhere.
--
-- Run in the Supabase SQL editor (or via your migration runner). Idempotent.

ALTER TABLE crises
  ADD COLUMN IF NOT EXISTS sensors JSONB NOT NULL DEFAULT '{}'::jsonb;
