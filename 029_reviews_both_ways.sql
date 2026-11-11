-- Recenzii în ambele sensuri (cumpărătorul îl recenzează pe vânzător și invers), finalizarea tranzacției la „Cere oferte”
-- și întrebări la o ofertă, înainte de alegere.
-- reviews.seller_id rămâne „utilizatorul recenzat”; reviews.role spune în ce rol a fost recenzat:
--   'seller' = ca vânzător / dezmembrător (recenzia vine de la cumpărător), 'buyer' = ca cumpărător (recenzia vine de la vânzător).
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'seller';
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_role_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_role_check CHECK (role IN ('seller', 'buyer'));
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- o recenzie per (cine recenzează, cine e recenzat, anunț) și una per (cine recenzează, ofertă câștigătoare)
DROP INDEX IF EXISTS reviews_once_uq;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_listing_uq ON reviews (reviewer_id, seller_id, listing_id) WHERE listing_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_quote_uq ON reviews (reviewer_id, quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reviews_role_idx ON reviews (seller_id, role, created_at DESC);

-- oferta câștigătoare se marchează „finalizată” de oricare dintre cei doi; abia apoi se pot lăsa recenzii
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- întrebările cumpărătorului la o ofertă (înainte de alegere) și răspunsul ofertantului
CREATE TABLE IF NOT EXISTS quote_questions (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  asker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  answer TEXT,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quote_questions_idx ON quote_questions (quote_id, id);
