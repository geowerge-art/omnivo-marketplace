-- Portofel cu credite (1 credit = 1 leu): încărcare cu cardul, urcare în listă, promovare, planuri
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0);
CREATE TABLE IF NOT EXISTS credit_tx (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,                 -- + încărcare / - cheltuit
  balance_after INTEGER NOT NULL,
  kind TEXT NOT NULL,                      -- purchase | bump | promo | plan | admin
  ref_id INTEGER,                          -- anunțul pentru care s-a plătit
  note TEXT,
  amount_lei NUMERIC(10,2),                -- banii reali plătiți (doar la încărcări)
  stripe_session TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credit_tx_user_idx ON credit_tx (user_id, id DESC);
-- aceeași plată Stripe nu poate credita de două ori (webhook + pagina de succes)
CREATE UNIQUE INDEX IF NOT EXISTS credit_tx_session_uq ON credit_tx (stripe_session) WHERE stripe_session IS NOT NULL;
