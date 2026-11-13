-- „Scăzut de preț": reținem prețul dinainte de ultima reducere și momentul ei
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_was NUMERIC(12,2);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_dropped_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS listings_price_drop_idx ON listings (price_dropped_at DESC) WHERE price_was IS NOT NULL;
