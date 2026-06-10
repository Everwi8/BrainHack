-- Run this once in your Supabase SQL editor to create all tables.
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT '',
  role          TEXT        NOT NULL DEFAULT 'resident'
                  CONSTRAINT user_role_valid
                  CHECK (role IN ('resident','volunteer','coordinator')),
  language      TEXT        NOT NULL DEFAULT 'en-SG'
                  CONSTRAINT user_language_valid
                  CHECK (language IN ('en-SG','zh','ms','ta')),
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
  -- Citizen reports start 'pending' and only surface in feed/map once a
  -- coordinator approves. Machine-ingested crises default to 'approved'.
  approval_status TEXT      NOT NULL DEFAULT 'approved'
                  CONSTRAINT crisis_approval_valid
                  CHECK (approval_status IN ('pending','approved','rejected')),
  reported_by   UUID        REFERENCES users(id),
  approved_by   UUID        REFERENCES users(id),
  ai_summary    TEXT        NOT NULL DEFAULT '',
  -- Per-crisis live-sensor snapshot rendered by the CrisisDetail "Live data
  -- sources" cards: { nea_rain_mm, pub_drain_pct, lta_eta_min, moh_beds_avail }.
  -- Shape owned by the frontend; absent key → that card shows "No data".
  sensors       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crises_status     ON crises(status);
CREATE INDEX IF NOT EXISTS idx_crises_location   ON crises(lat, lng);
CREATE INDEX IF NOT EXISTS idx_crises_type       ON crises(type);
CREATE INDEX IF NOT EXISTS idx_crises_approval   ON crises(approval_status);

-- ─── Tasks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  crisis_id   UUID        NOT NULL REFERENCES crises(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'pending'
                CONSTRAINT task_status_valid
                CHECK (status IN ('pending','assigned','in_progress','resolved')),
  -- priority + volunteers_needed mirror the AI task-card fields (taskgen.go) so
  -- generated cards persist with stable IDs and the CrisisDetail UI can render them.
  priority    TEXT        NOT NULL DEFAULT 'medium'
                CONSTRAINT task_priority_valid
                CHECK (priority IN ('low','medium','high')),
  volunteers_needed INT   NOT NULL DEFAULT 1,
  assigned_to UUID        REFERENCES users(id),
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_crisis_id ON tasks(crisis_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);

-- ─── Task membership ─────────────────────────────────────────────────────────
-- One row per (task, user). Joining a task gates access to that task's group
-- chat. Residents/volunteers may hold one task per crisis (enforced in
-- handler/tasks.go); coordinators are unlimited.
CREATE TABLE IF NOT EXISTS task_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_members_user ON task_members(user_id);
CREATE INDEX IF NOT EXISTS idx_task_members_task ON task_members(task_id);

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

-- ─── Chat sessions ───────────────────────────────────────────────────────────
-- One row per conversation. The whole conversation lives in the `messages`
-- JSONB column as an array of {role, content} turns (system prompt + live triage
-- context are rebuilt at request time, so they are NOT stored here). Every read
-- and write is filtered by user_id so one user can never reach another's chats.
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT 'New chat',
  messages   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC);

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

CREATE OR REPLACE TRIGGER trg_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
