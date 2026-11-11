-- Filtru de conținut (telefoane, e-mailuri, linkuri, cuvinte interzise), avertismente cu trepte și aprobare automată pe scor de încredere.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS trust_score INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS trust_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS publish_blocked_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS guard_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                       -- phone, email, link, messenger, banned (separate prin virgulă)
  weight INTEGER NOT NULL DEFAULT 1,        -- cuvintele interzise cântăresc mai mult
  sample TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS guard_events_user_idx ON guard_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guard_events_day_idx ON guard_events (created_at);
