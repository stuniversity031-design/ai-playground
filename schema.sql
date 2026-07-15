-- AURA — Neon Postgres schema
-- Run this once in the Neon SQL editor (Tables tab -> SQL Editor) to create all three tables.

-- ─────────────────────────────────────────────
-- LEADS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  company       TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  title         TEXT,
  industry      TEXT,
  revenue       TEXT,
  score         INTEGER NOT NULL DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  stage         TEXT NOT NULL DEFAULT 'New',
  budget        TEXT,
  need          TEXT,
  timeline      TEXT,
  source        TEXT,
  notes         TEXT,
  last_contact  DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads (stage);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads (score DESC);

-- ─────────────────────────────────────────────
-- CHAT HISTORY
-- One row per message exchanged with AURA. lead_id is nullable —
-- general pipeline questions aren't tied to one lead.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_history (
  id          BIGSERIAL PRIMARY KEY,
  lead_id     BIGINT REFERENCES leads(id) ON DELETE SET NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_lead ON chat_history (lead_id);

-- ─────────────────────────────────────────────
-- ACTIVITY LOG
-- Tracks stage changes, new-lead scoring events, and email notifications
-- sent — this is what a live "Intel Feed" panel would read from.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGSERIAL PRIMARY KEY,
  lead_id     BIGINT REFERENCES leads(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN ('lead_created', 'stage_change', 'scored', 'email_sent', 'note')),
  detail      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_lead ON activity_log (lead_id);
