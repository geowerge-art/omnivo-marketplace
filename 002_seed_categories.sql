INSERT INTO categories (slug, name, icon, position) VALUES
  ('auto-moto', 'Auto și moto', '🚗', 1),
  ('piese-auto', 'Piese auto', '🔧', 2),
  ('electronice', 'Electronice', '📱', 3),
  ('casa-gradina', 'Casă și grădină', '🏠', 4),
  ('moda', 'Modă', '👕', 5),
  ('servicii', 'Servicii', '🛠️', 6),
  ('sport-timp-liber', 'Sport și timp liber', '⚽', 7),
  ('mobila', 'Mobilă', '🪑', 8),
  ('copii-jucarii', 'Copii și jucării', '🧸', 9);

INSERT INTO category_attributes (category_id, key, label, type, options, required, filterable, position)
SELECT c.id, a.key, a.label, a.type, a.options::jsonb, a.required, a.filterable, a.position
FROM categories c
JOIN (VALUES
  ('auto-moto','marca','Marcă','text',NULL,TRUE,TRUE,1),
  ('auto-moto','model','Model','text',NULL,FALSE,TRUE,2),
  ('auto-moto','an','An fabricație','number',NULL,FALSE,TRUE,3),
  ('auto-moto','km','Kilometri','number',NULL,FALSE,FALSE,4),
  ('piese-auto','cod_piesa','Cod piesă / OEM','text',NULL,FALSE,TRUE,2),
  ('electronice','marca','Marcă','text',NULL,FALSE,TRUE,1),
  ('electronice','model','Model','text',NULL,FALSE,FALSE,2),
  ('moda','marca','Marcă','text',NULL,FALSE,TRUE,1),
  ('moda','marime','Mărime','select','["XS","S","M","L","XL","XXL"]',FALSE,TRUE,2)
) AS a(slug,key,label,type,options,required,filterable,position) ON a.slug = c.slug;
