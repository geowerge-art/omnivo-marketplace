-- Niveluri de cont (Basic / Standard / Silver / Gold / Titanium) și statistici zilnice pe anunț pentru „Studio”.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_until TIMESTAMPTZ;      -- NULL = fără expirare

CREATE TABLE IF NOT EXISTS listing_daily (
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,      -- vizualizări ale paginii anunțului (altcineva decât proprietarul)
  favs INTEGER NOT NULL DEFAULT 0,       -- salvări la favorite
  chats INTEGER NOT NULL DEFAULT 0,      -- conversații noi începute de cumpărători
  phones INTEGER NOT NULL DEFAULT 0,     -- „Arată numărul”
  PRIMARY KEY (listing_id, day)
);
CREATE INDEX IF NOT EXISTS listing_daily_day_idx ON listing_daily (day);
