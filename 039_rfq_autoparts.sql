-- „Cereri piese” / „Ofertează piesele” în modelul din AutoParts: cereri publice, oferte vizibile doar cumpărătorului,
-- acceptarea unei oferte creează o comandă. Tabele NOI (prefix rq_): cele vechi (part_requests, quotes, dealers, ...)
-- rămân neatinse în baza de date, dar nu mai sunt folosite de aplicație.

CREATE TABLE IF NOT EXISTS rq_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  make TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL DEFAULT '',
  vin TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'ambele' CHECK (kind IN ('noi','second-hand','ambele')),
  county TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  ship_address TEXT NOT NULL DEFAULT '',
  extra_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','closed')),
  buyer_seen_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rq_requests_open_idx ON rq_requests (status, expires_at);
CREATE INDEX IF NOT EXISTS rq_requests_user_idx ON rq_requests (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS rq_offers (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES rq_requests(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL DEFAULT 'RON' CHECK (currency IN ('RON','EUR')),
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rq_offers_request_idx ON rq_offers (request_id);
CREATE INDEX IF NOT EXISTS rq_offers_seller_idx ON rq_offers (seller_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS rq_offers_one_pending_uq ON rq_offers (request_id, seller_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS rq_marks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id INTEGER NOT NULL REFERENCES rq_requests(id) ON DELETE CASCADE,
  mark TEXT NOT NULL CHECK (mark IN ('later','ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, request_id)
);

CREATE TABLE IF NOT EXISTS rq_orders (
  id SERIAL PRIMARY KEY,
  offer_id INTEGER REFERENCES rq_offers(id) ON DELETE SET NULL,
  request_id INTEGER REFERENCES rq_requests(id) ON DELETE SET NULL,
  buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  price NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RON',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','shipped','done','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rq_orders_buyer_idx ON rq_orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rq_orders_seller_idx ON rq_orders (seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rq_questions (
  id SERIAL PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES rq_offers(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  answer TEXT,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rq_questions_offer_idx ON rq_questions (offer_id, created_at);
CREATE INDEX IF NOT EXISTS rq_questions_seller_idx ON rq_questions (seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rq_images (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id INTEGER REFERENCES rq_requests(id) ON DELETE CASCADE,
  offer_id INTEGER REFERENCES rq_offers(id) ON DELETE CASCADE,
  url TEXT,
  thumb_url TEXT,
  ctype TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  data BYTEA,
  thumb BYTEA,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rq_images_request_idx ON rq_images (request_id, position);
CREATE INDEX IF NOT EXISTS rq_images_offer_idx ON rq_images (offer_id, position);
CREATE INDEX IF NOT EXISTS rq_images_owner_idx ON rq_images (owner_id);
