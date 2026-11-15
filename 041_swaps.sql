-- „Schimb”: anunțuri la care proprietarul acceptă schimb și spune ce caută în loc.
CREATE TABLE IF NOT EXISTS swaps (
  listing_id INTEGER PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wants TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS swaps_user_idx ON swaps (user_id);
CREATE INDEX IF NOT EXISTS swaps_updated_idx ON swaps (updated_at DESC);
