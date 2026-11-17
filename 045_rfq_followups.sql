-- 1) notificarea cumpărătorului când anunțul atașat la o ofertă nu mai e disponibil (o singură dată pe ofertă)
ALTER TABLE rq_offers ADD COLUMN IF NOT EXISTS listing_notified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) interval de liniște pentru emailuri (implicit 22:00-08:00, ora României): emailurile din timpul nopții se țin aici și pleacă dimineața
CREATE TABLE IF NOT EXISTS rfq_mail_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '/cereri',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rfq_mail_queue_unsent_idx ON rfq_mail_queue (id) WHERE sent_at IS NULL;

-- 3) piese auto: marca și modelul mașinii pentru care se potrivește piesa (folosite la potrivirea cu cererile; marca e și filtru)
INSERT INTO category_attributes (category_id, key, label, type, options, required, filterable, position)
SELECT c.id, a.key, a.label, 'text', NULL, FALSE, a.filt, a.pos
  FROM categories c
  JOIN (VALUES ('marca_auto', 'Marca mașinii', TRUE, 12), ('model_auto', 'Model compatibil', FALSE, 13)) AS a(key, label, filt, pos) ON TRUE
 WHERE c.slug = 'piese-auto'
   AND NOT EXISTS (SELECT 1 FROM category_attributes x WHERE x.category_id = c.id AND x.key = a.key);
