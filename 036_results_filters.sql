/* Pagina de rezultate cu filtre (stil OLX, dar cu identitate Omnivo):
   - țara anunțului (implicit România) ca să poată intra în filtre;
   - mai multe atribute pe categorii, ca filtrele să se adapteze la fiecare categorie;
   - căutările salvate rețin și filtrele (județ, preț, atribute...). */

ALTER TABLE listings ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'România';
CREATE INDEX IF NOT EXISTS listings_country_idx ON listings (country);
CREATE INDEX IF NOT EXISTS listings_county_idx ON listings (LOWER(county));

ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS params TEXT NOT NULL DEFAULT '';

/* Atributele existente care merită să fie filtre */
UPDATE category_attributes SET filterable = TRUE
 WHERE key IN ('km', 'capacitate', 'putere', 'model', 'procesor', 'culoare', 'material', 'diagonala', 'clasa_energetica', 'gen');

INSERT INTO category_attributes (category_id, key, label, type, options, required, filterable, position)
SELECT c.id, a.key, a.label, a.type, a.options::jsonb, FALSE, TRUE, a.pos
FROM categories c
JOIN (VALUES
  ('autoturisme','culoare','Culoare','select','["Alb","Negru","Gri","Argintiu","Albastru","Roșu","Verde","Maro","Bej","Galben","Portocaliu","Altă culoare"]',15),
  ('autoturisme','volan','Volan','select','["Stânga","Dreapta"]',16),
  ('autoturisme','norma','Normă de poluare','select','["Euro 6","Euro 5","Euro 4","Euro 3","Euro 2","Euro 1","Non-euro"]',17),
  ('motociclete','tip','Tip','select','["Scuter","Enduro","Cross","Sport","Chopper","Touring","ATV","Altele"]',11),
  ('piese-auto','categorie_piesa','Tip piesă','select','["Motor","Caroserie","Faruri și lumini","Frâne","Suspensie","Transmisie","Electrice","Interior","Roți și jante","Altele"]',11),
  ('telefoane','ram','Memorie RAM','select','["2GB","3GB","4GB","6GB","8GB","12GB","16GB"]',12),
  ('laptopuri','diagonala','Diagonală (inch)','number',NULL,13),
  ('laptopuri','placa_video','Placă video','text',NULL,14),
  ('tv-audio','rezolutie','Rezoluție','select','["HD","Full HD","4K","8K"]',11),
  ('tv-audio','smart','Smart TV','select','["Da","Nu"]',12),
  ('haine','culoare','Culoare','text',NULL,11),
  ('incaltaminte','culoare','Culoare','text',NULL,11),
  ('biciclete','roata','Mărime roată','select','["12\"","16\"","20\"","24\"","26\"","27.5\"","28\"","29\""]',12),
  ('servicii','tarif','Tarif','select','["Pe oră","Pe zi","Pe proiect","Negociabil"]',10)
) AS a(slug,key,label,type,options,pos) ON c.slug = a.slug
ON CONFLICT DO NOTHING;
