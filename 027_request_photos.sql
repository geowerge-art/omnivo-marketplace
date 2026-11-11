-- Poze la cerere: cumpărătorul poate atașa până la 6 poze (piesa stricată, plăcuța cu serie etc.).
-- Folosesc același tabel și aceeași încărcare ca pozele ofertelor; o poză aparține fie unei oferte, fie unei cereri.
ALTER TABLE quote_images ADD COLUMN IF NOT EXISTS request_id INTEGER REFERENCES part_requests(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS quote_images_request_idx ON quote_images (request_id, position);
