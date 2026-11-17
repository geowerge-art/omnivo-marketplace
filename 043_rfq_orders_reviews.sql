-- Comenzi din cereri ca la AutoParts (suspendare, motiv, AWB, notă vânzător, insignă pentru cumpărător),
-- recenzii legate de comandă și preferința de email pentru cereri/oferte.

ALTER TABLE rq_orders DROP CONSTRAINT IF EXISTS rq_orders_status_check;
ALTER TABLE rq_orders ADD CONSTRAINT rq_orders_status_check CHECK (status IN ('new','confirmed','shipped','done','cancelled','suspended'));
ALTER TABLE rq_orders ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE rq_orders ADD COLUMN IF NOT EXISTS awb TEXT;
ALTER TABLE rq_orders ADD COLUMN IF NOT EXISTS seller_note TEXT;
ALTER TABLE rq_orders ADD COLUMN IF NOT EXISTS buyer_seen_status TEXT;
UPDATE rq_orders SET buyer_seen_status = status WHERE buyer_seen_status IS NULL;

-- recenzia unui utilizator pentru o comandă: cumpărătorul îl califică pe vânzător (role = 'seller'), vânzătorul pe cumpărător (role = 'buyer')
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES rq_orders(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_uq ON reviews (reviewer_id, order_id) WHERE order_id IS NOT NULL;

-- emailuri despre cereri, oferte, comenzi (în plus față de notificările din aplicație); implicit active
ALTER TABLE users ADD COLUMN IF NOT EXISTS rfq_email BOOLEAN NOT NULL DEFAULT TRUE;
