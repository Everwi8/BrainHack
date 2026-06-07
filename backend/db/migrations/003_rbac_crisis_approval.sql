-- 003_rbac_crisis_approval — role-based access + report approval workflow.
--
-- Roles: residents and volunteers can FILE crisis reports; coordinators can
-- file AND approve them. A report only surfaces in the public feed and on the
-- map once a coordinator approves it.
--
-- Run in the Supabase SQL editor (or via your migration runner). Idempotent.

-- ─── Users get a role ────────────────────────────────────────────────────────
-- (seed_users.sql and the auth handlers already assume this column; this is the
--  migration that actually creates it.)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'resident';

ALTER TABLE users DROP CONSTRAINT IF EXISTS user_role_valid;
ALTER TABLE users
  ADD CONSTRAINT user_role_valid CHECK (role IN ('resident','volunteer','coordinator'));

-- ─── Crises get an approval workflow ─────────────────────────────────────────
-- DEFAULT 'approved' so machine-ingested crises (NEA/LTA/PUB, which never set
-- this field) and all pre-existing rows are visible immediately. Citizen
-- reports created via POST /api/crises set 'pending' explicitly.
ALTER TABLE crises
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE crises DROP CONSTRAINT IF EXISTS crisis_approval_valid;
ALTER TABLE crises
  ADD CONSTRAINT crisis_approval_valid CHECK (approval_status IN ('pending','approved','rejected'));

-- Who filed the report, and which coordinator actioned it.
ALTER TABLE crises ADD COLUMN IF NOT EXISTS reported_by UUID REFERENCES users(id);
ALTER TABLE crises ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_crises_approval ON crises(approval_status);
