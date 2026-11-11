-- „Cere oferte": cumpărătorul descrie piesa, dezmembrătorii potriviți răspund cu oferte (licitație ascunsă:
-- un dezmembrător nu vede ofertele altora), cumpărătorul alege o ofertă câștigătoare, apoi vorbesc într-un chat al ofertei.

CREATE TABLE IF NOT EXISTS dealers (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  cui TEXT,
  county TEXT NOT NULL,
  city TEXT,
  brands TEXT[] NOT NULL DEFAULT '{}',     -- mărci acoperite, fără diacritice și litere mici; gol = toate
  counties TEXT[] NOT NULL DEFAULT '{}',   -- județe în care vinde / livrează; gol = toată țara
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dealers_status_idx ON dealers (status);

CREATE TABLE IF NOT EXISTS part_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  part TEXT NOT NULL,
  brand TEXT NOT NULL,
  brand_key TEXT NOT NULL,                 -- brand fără diacritice, litere mici (pentru potrivire)
  model TEXT NOT NULL DEFAULT '',
  year INTEGER,
  engine TEXT NOT NULL DEFAULT '',
  vin TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  county TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  delivery BOOLEAN NOT NULL DEFAULT TRUE,  -- acceptă livrare prin curier
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','awarded','expired','cancelled')),
  awarded_quote_id INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS part_requests_user_idx ON part_requests (user_id, id DESC);
CREATE INDEX IF NOT EXISTS part_requests_open_idx ON part_requests (status, expires_at);

CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES part_requests(id) ON DELETE CASCADE,
  dealer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'RON' CHECK (currency IN ('RON','EUR')),
  state TEXT NOT NULL DEFAULT 'buna' CHECK (state IN ('excelenta','buna','uzata','de-reparat')),
  warranty_days INTEGER NOT NULL DEFAULT 0 CHECK (warranty_days BETWEEN 0 AND 730),
  shipping NUMERIC(12,2),                  -- NULL = transport neprecizat; 0 = gratuit
  pickup BOOLEAN NOT NULL DEFAULT TRUE,    -- se poate ridica din parc
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','won','lost','withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, dealer_id)
);
CREATE INDEX IF NOT EXISTS quotes_dealer_idx ON quotes (dealer_id, id DESC);

CREATE TABLE IF NOT EXISTS quote_messages (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quote_messages_idx ON quote_messages (quote_id, id);
