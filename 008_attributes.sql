/* Atribute în stil OLX pe subcategorii (se adaugă peste cele de pe categoria principală). */
UPDATE category_attributes SET type = 'text', options = NULL, label = 'Mărime'
 WHERE key = 'marime' AND category_id = (SELECT id FROM categories WHERE slug = 'moda');

INSERT INTO category_attributes (category_id, key, label, type, options, required, filterable, position)
SELECT c.id, a.key, a.label, a.type, a.options::jsonb, FALSE, a.filt, a.pos
FROM categories c
JOIN (VALUES
  ('autoturisme','combustibil','Combustibil','select','["Benzină","Motorină","GPL","Hibrid","Electric"]',TRUE,10),
  ('autoturisme','cutie','Cutie de viteze','select','["Manuală","Automată"]',TRUE,11),
  ('autoturisme','caroserie','Caroserie','select','["Berlină","Break","Hatchback","SUV","Coupe","Cabrio","Monovolum","Duba"]',TRUE,12),
  ('autoturisme','capacitate','Capacitate cilindrică (cmc)','number',NULL,FALSE,13),
  ('autoturisme','putere','Putere (CP)','number',NULL,FALSE,14),
  ('motociclete','capacitate','Capacitate cilindrică (cmc)','number',NULL,FALSE,10),
  ('piese-auto','cod_piesa','Cod piesă / OEM','text',NULL,FALSE,10),
  ('telefoane','memorie','Memorie','select','["16GB","32GB","64GB","128GB","256GB","512GB","1TB"]',TRUE,10),
  ('telefoane','culoare','Culoare','text',NULL,FALSE,11),
  ('laptopuri','procesor','Procesor','text',NULL,FALSE,10),
  ('laptopuri','ram','Memorie RAM','select','["4GB","8GB","16GB","32GB","64GB"]',TRUE,11),
  ('laptopuri','stocare','Stocare','select','["128GB","256GB","512GB","1TB","2TB"]',TRUE,12),
  ('tv-audio','diagonala','Diagonală (inch)','number',NULL,FALSE,10),
  ('console','platforma','Platformă','select','["PlayStation 5","PlayStation 4","Xbox Series","Xbox One","Nintendo Switch","PC","Altele"]',TRUE,10),
  ('electrocasnice','clasa_energetica','Clasă energetică','select','["A","B","C","D","E","F","G"]',FALSE,10),
  ('unelte','alimentare','Alimentare','select','["Electric","Acumulator","Benzină","Manual"]',TRUE,10),
  ('haine','gen','Pentru','select','["Femei","Bărbați","Copii"]',TRUE,10),
  ('incaltaminte','gen','Pentru','select','["Femei","Bărbați","Copii"]',TRUE,10),
  ('canapele','material','Material','text',NULL,FALSE,10),
  ('canapele','culoare','Culoare','text',NULL,FALSE,11),
  ('dormitor','material','Material','text',NULL,FALSE,10),
  ('dormitor','culoare','Culoare','text',NULL,FALSE,11),
  ('carucioare','marca','Marcă','text',NULL,TRUE,10),
  ('jucarii','marca','Marcă','text',NULL,TRUE,10),
  ('jucarii','varsta','Vârstă recomandată','select','["0-2 ani","3-5 ani","6-9 ani","10+ ani"]',TRUE,11),
  ('biciclete','marca','Marcă','text',NULL,TRUE,10),
  ('biciclete','tip','Tip','select','["Mountain bike","Oraș","Șosea","Electrică","Trotinetă","Copii"]',TRUE,11),
  ('fitness','marca','Marcă','text',NULL,TRUE,10),
  ('electrocasnice','marca','Marcă','text',NULL,TRUE,11),
  ('unelte','marca','Marcă','text',NULL,TRUE,11),
  ('console','marca','Marcă','text',NULL,TRUE,11)
) AS a(slug,key,label,type,options,filt,pos) ON c.slug = a.slug
ON CONFLICT DO NOTHING;
