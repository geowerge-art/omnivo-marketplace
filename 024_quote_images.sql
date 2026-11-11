-- Poze la oferte: încărcate de dezmembrător (max 4 per ofertă), atașate ofertei la trimitere.
CREATE TABLE IF NOT EXISTS quote_images (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE,   -- NULL = încărcată, dar încă neatașată unei oferte
  url TEXT NOT NULL DEFAULT '',
  thumb_url TEXT NOT NULL DEFAULT '',
  ctype TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  data BYTEA,
  thumb BYTEA,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quote_images_quote_idx ON quote_images (quote_id, position);
CREATE INDEX IF NOT EXISTS quote_images_owner_idx ON quote_images (owner_id, created_at);
