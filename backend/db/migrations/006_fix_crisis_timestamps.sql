-- Migration 006 — ensure crises.created_at / updated_at default and backfill.
--
-- Symptom this fixes: crisis cards/feed showed "739774 days ago" (then blank
-- once the frontend guarded it). Root cause: an OLDER UpsertCrisis sent the raw
-- Crisis struct, serialising the zero time.Time as "0001-01-01T00:00:00Z" and
-- writing that LITERAL value into created_at/updated_at. The current code omits
-- the column (crisisInsertBody) so the DEFAULT NOW() applies, but the stale
-- rows already on the table still hold the 0001-01-01 sentinel — which is a
-- real value, NOT NULL, so a `WHERE created_at IS NULL` backfill misses it.
--
-- Idempotent: safe to re-run.

-- 1. Make sure the columns exist (no-op if already present).
ALTER TABLE crises ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE crises ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 2. Attach the DEFAULT NOW() so future inserts that omit the column are stamped.
ALTER TABLE crises ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE crises ALTER COLUMN updated_at SET DEFAULT NOW();

-- 3. Backfill rows that are NULL *or* hold the Go zero-time sentinel
--    ('0001-01-01'). Anything before 1971 can only be the sentinel — no real
--    BrainySG crisis predates the app — so this is a safe floor.
UPDATE crises SET created_at = NOW()
WHERE created_at IS NULL OR created_at < TIMESTAMPTZ '1971-01-01';

UPDATE crises SET updated_at = created_at
WHERE updated_at IS NULL OR updated_at < TIMESTAMPTZ '1971-01-01';

-- 4. Enforce NOT NULL now that no nulls remain.
ALTER TABLE crises ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE crises ALTER COLUMN updated_at SET NOT NULL;

-- 5. Ensure the auto-update trigger exists (re-ingestion bumps updated_at).
--    Reuses set_updated_at() from the initial schema.
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
