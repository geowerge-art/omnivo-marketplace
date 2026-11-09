-- Poze în chat: pozele (cu miniatură) stau într-un tabel separat; mesajul trimite doar referința.
CREATE TABLE IF NOT EXISTS chat_images (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL DEFAULT '',
  thumb_url TEXT NOT NULL DEFAULT '',
  ctype TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  data BYTEA,
  thumb BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_images_owner_idx ON chat_images (owner_id, created_at);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_id INTEGER REFERENCES chat_images(id) ON DELETE SET NULL;
