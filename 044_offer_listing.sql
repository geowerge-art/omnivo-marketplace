-- Vânzătorul poate atașa la ofertă unul dintre anunțurile lui publicate; cumpărătorul îl vede pe ofertă și pe comandă.
-- Dacă anunțul se șterge, oferta rămâne (listing_id devine NULL).
ALTER TABLE rq_offers ADD COLUMN IF NOT EXISTS listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL;
