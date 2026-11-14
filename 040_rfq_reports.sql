-- Raportarea cererilor și a ofertelor de piese (separat de `reports`, care e legat de anunțuri).
-- La ștergerea cererii/ofertei raportarea rămâne în istoric (request_id/offer_id devin NULL, titlul rămâne în target_title).
CREATE TABLE IF NOT EXISTS rq_reports (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('request','offer')),
  request_id INTEGER REFERENCES rq_requests(id) ON DELETE SET NULL,
  offer_id INTEGER REFERENCES rq_offers(id) ON DELETE SET NULL,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_title TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  admin_note TEXT,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rq_reports_status_idx ON rq_reports (status, created_at);
CREATE INDEX IF NOT EXISTS rq_reports_request_idx ON rq_reports (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rq_reports_offer_idx ON rq_reports (offer_id) WHERE offer_id IS NOT NULL;
