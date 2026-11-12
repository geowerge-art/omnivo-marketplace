-- „Cere oferte”: adresa de livrare. Utilizatorul își salvează o adresă în cont; la alegerea ofertei o confirmă sau o schimbă
-- (domiciliu / sediu / alt loc / ridicare personală), iar câștigătorul o vede doar după alegere.
ALTER TABLE users  ADD COLUMN IF NOT EXISTS ship_addr JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ship_to   JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ship_at   TIMESTAMPTZ;
