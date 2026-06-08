-- 007_skills_matching — volunteer skills + skill-based task matching.
--
-- Adds the data the "I want to help → match me" flow needs:
--   • tasks.skills_needed — the skills a task calls for (set by the AI task
--     generator), matched against a volunteer's own skills.
--   • volunteers — a per-user skill/availability/location profile. The table is
--     in schema.sql but predates the migration set, so create it here too
--     (idempotent) for projects that bootstrapped from migrations only.
--
-- Run in the Supabase SQL editor (or via your migration runner). Idempotent.

-- ─── Tasks gain the skills they call for ─────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS skills_needed TEXT[] NOT NULL DEFAULT '{}';

-- ─── Volunteer profiles ──────────────────────────────────────────────────────
-- One row per user: the skills they offer (nurse, driver, first_aid, …), their
-- last-known location for proximity matching, and an availability flag.
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

-- One profile per user so UpsertVolunteer can rely on a single row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteers_user ON volunteers(user_id);

-- Keep updated_at fresh (the trigger function is defined in schema.sql).
CREATE OR REPLACE TRIGGER trg_volunteers_updated_at
  BEFORE UPDATE ON volunteers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
