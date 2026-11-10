-- Profil public al vânzătorului: descriere + recenzii (1-5 stele) de la cei care au vorbit cu el
ALTER TABLE users ADD COLUMN IF NOT EXISTS about TEXT;
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reviews_seller_idx ON reviews (seller_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_once_uq ON reviews (reviewer_id, listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_user_idx ON listings (user_id, status);
