-- 005_task_groups — per-task group chats with membership.
--
-- Adds the fields the AI task cards already carry (priority, volunteers_needed)
-- so generated tasks can be persisted with stable IDs, and a task_members table
-- so users can JOIN a task (gating access to that task's group chat).
--
-- Membership rule (enforced in the handler, not SQL): residents/volunteers may
-- hold at most ONE task per crisis; coordinators are unlimited.
--
-- Run in the Supabase SQL editor (or via your migration runner). Idempotent.

-- ─── Tasks gain the AI-card fields ───────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS task_priority_valid;
ALTER TABLE tasks
  ADD CONSTRAINT task_priority_valid CHECK (priority IN ('low','medium','high'));

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS volunteers_needed INT NOT NULL DEFAULT 1;

-- ─── Task membership ─────────────────────────────────────────────────────────
-- One row per (task, user). The UNIQUE constraint makes JOIN idempotent and
-- blocks duplicate rows; the per-crisis cap for non-coordinators is enforced in
-- handler/tasks.go (JoinTask).
CREATE TABLE IF NOT EXISTS task_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_members_user ON task_members(user_id);
CREATE INDEX IF NOT EXISTS idx_task_members_task ON task_members(task_id);
