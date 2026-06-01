-- Run this once in your Supabase SQL editor to create all tables.
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Crises ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crises (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- external_id lets ingestion scripts upsert without creating duplicates
  external_id   TEXT        UNIQUE,
  title         TEXT        NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  type          TEXT        NOT NULL
                  CONSTRAINT crisis_type_valid
                  CHECK (type IN ('flood','haze','dengue','mrt','fire','other')),
  severity      TEXT        NOT NULL DEFAULT 'low'
                  CONSTRAINT crisis_severity_valid
                  CHECK (severity IN ('low','medium','high','critical')),
  status        TEXT        NOT NULL DEFAULT 'active'
                  CONSTRAINT crisis_status_valid
                  CHECK (status IN ('active','resolved')),
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  location_name TEXT        NOT NULL DEFAULT '',
  source        TEXT        NOT NULL DEFAULT 'user'
                  CONSTRAINT crisis_source_valid
                  CHECK (source IN ('nea','lta','pub','moh','user')),
  ai_summary    TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crises_status     ON crises(status);
CREATE INDEX IF NOT EXISTS idx_crises_location   ON crises(lat, lng);
CREATE INDEX IF NOT EXISTS idx_crises_type       ON crises(type);

-- ─── Tasks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  crisis_id   UUID        NOT NULL REFERENCES crises(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'pending'
                CONSTRAINT task_status_valid
                CHECK (status IN ('pending','assigned','in_progress','resolved')),
  assigned_to UUID        REFERENCES users(id),
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_crisis_id ON tasks(crisis_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);

-- ─── Volunteers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS volunteers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skills     TEXT[]      NOT NULL DEFAULT '{}',
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  available  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Reports ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  crisis_id   UUID        REFERENCES crises(id),
  user_id     UUID        REFERENCES users(id),
  description TEXT        NOT NULL DEFAULT '',
  photo_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── auto-updated updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_crises_updated_at
  BEFORE UPDATE ON crises
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_volunteers_updated_at
  BEFORE UPDATE ON volunteers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
