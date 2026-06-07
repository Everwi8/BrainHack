-- 002_chat_sessions — persist Brainy chat history so users can revisit past
-- conversations. One row per conversation; the full transcript lives in the
-- `messages` JSONB column ([{role, content}, ...]). The system prompt and live
-- triage snapshot are rebuilt at request time and deliberately not stored.
-- Run in the Supabase SQL editor (or via your migration runner).

CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT 'New chat',
  messages   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC);

-- Reuses the shared set_updated_at() trigger function from the initial schema.
CREATE OR REPLACE TRIGGER trg_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
