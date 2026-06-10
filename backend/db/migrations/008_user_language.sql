-- 008_user_language — per-user preferred reply language for Brainy.
--
-- Singapore has 4 official languages (English, Mandarin, Malay, Tamil); the
-- highest-risk crisis demographic — the elderly — skews toward Mandarin and
-- Malay. Brainy answers in the user's choice. Singlish (Singapore English) is
-- the default local voice; plain English is not offered. The chat API also
-- accepts a per-request `lang`, but this column is the persisted default.
--
-- Run in the Supabase SQL editor (or via your migration runner). Idempotent, and
-- safe to re-run over an earlier draft of this migration that defaulted to 'en'.

-- Add the column (no-op if it already exists from an earlier run).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en-SG';

-- Make Singlish the default even if the column was first created with 'en'.
ALTER TABLE users
  ALTER COLUMN language SET DEFAULT 'en-SG';

-- Migrate any rows left on the old 'en' default to Singlish so the tightened
-- CHECK below (which no longer allows 'en') won't reject existing data.
UPDATE users SET language = 'en-SG' WHERE language = 'en';

-- Constrain to the supported codes. Drop any prior version of the constraint
-- first so re-runs (and the old 'en'-allowing variant) reconcile cleanly.
ALTER TABLE users DROP CONSTRAINT IF EXISTS user_language_valid;
ALTER TABLE users
  ADD CONSTRAINT user_language_valid
  CHECK (language IN ('en-SG','zh','ms','ta'));
