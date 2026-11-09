ALTER TABLE categories ADD COLUMN IF NOT EXISTS keywords TEXT NOT NULL DEFAULT '';

INSERT INTO categories (parent_id, slug, name, position, keywords)
SELECT p.id, v.slug, v.name, v.pos, v.kw
FROM (VALUES
 ('auto-moto','autoturisme','Autoturisme',1,'masina autoturism dacia logan golf passat bmw audi mercedes opel ford skoda renault toyota'),
 ('auto-moto','motociclete','Motociclete și scutere',2,'motocicleta motor scuter atv enduro cross'),
 ('auto-moto','piese-auto','Piese auto',3,'piesa piese anvelope jante far bara capota aripa radiator turbina amortizor'),
 ('electronice','telefoane','Telefoane',1,'telefon iphone samsung galaxy xiaomi huawei smartphone redmi pixel'),
 ('electronice','laptopuri','Laptopuri',2,'laptop notebook macbook lenovo thinkpad hp dell asus'),
 ('electronice','tv-audio','TV și audio',3,'televizor tv smart boxa casti soundbar'),
 ('electronice','console','Console și jocuri',4,'playstation ps4 ps5 xbox nintendo consola joystick'),
 ('casa-gradina','electrocasnice','Electrocasnice',1,'frigider masina spalat aragaz cuptor aspirator mixer'),
 ('casa-gradina','unelte','Unelte și grădină',2,'bormasina flex drujba motocoasa cositoare unelte'),
 ('moda','haine','Haine',1,'rochie geaca pantaloni tricou camasa pulover jeans hanorac'),
 ('moda','incaltaminte','Încălțăminte',2,'pantofi adidasi ghete cizme sandale papuci'),
 ('mobila','canapele','Canapele și fotolii',1,'canapea coltar fotoliu'),
 ('mobila','dormitor','Dormitor',2,'pat dulap saltea comoda'),
 ('copii-jucarii','carucioare','Cărucioare și scaune auto',1,'carucior scaun auto leagan'),
 ('copii-jucarii','jucarii','Jucării',2,'jucarie lego papusa puzzle'),
 ('sport-timp-liber','biciclete','Biciclete și trotinete',1,'bicicleta mtb trotineta'),
 ('sport-timp-liber','fitness','Fitness',2,'gantera banda alergare fitness')
) AS v(pslug, slug, name, pos, kw)
JOIN categories p ON p.slug = v.pslug;
