-- Promovare și reactualizare (UP) anunțuri
ALTER TABLE listings ADD COLUMN IF NOT EXISTS promoted_until TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS bumped_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS listings_promoted_idx ON listings (promoted_until) WHERE promoted_until IS NOT NULL;
