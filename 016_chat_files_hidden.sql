-- Fișiere în chat (PDF, Word, Excel, text) în același tabel cu pozele + „șterge conversația” (doar pentru cel care o șterge).
ALTER TABLE chat_images ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'image';
ALTER TABLE chat_images ADD COLUMN IF NOT EXISTS name TEXT;

CREATE TABLE IF NOT EXISTS chat_hidden (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  other_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id, other_id)
);
