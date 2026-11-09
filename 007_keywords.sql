/* Cuvinte-cheie mai bogate pentru alegerea automată a categoriei din titlu + subcategorii la Servicii. */
UPDATE categories SET keywords = keywords || ' vw volkswagen seat peugeot citroen fiat hyundai kia nissan mazda honda suzuki volvo mini jeep lada tesla porsche cupra bmw sedan break suv hatchback cabrio microbuz duba camioneta rulota autorulota tractor' WHERE slug = 'autoturisme';
UPDATE categories SET keywords = keywords || ' yamaha honda suzuki kawasaki ducati harley vespa piaggio mopeda moped cbr ninja quad' WHERE slug = 'motociclete';
UPDATE categories SET keywords = keywords || ' cauciucuri roti stop faruri oglinda geam motor cutie viteze ambreiaj discuri placute frana filtru ulei baterie alternator electromotor cardan planetara punte esapament catalizator bujii injector bobina distributie ambreiaj bara portbagaj covorase husa scaun navigatie' WHERE slug = 'piese-auto';
UPDATE categories SET keywords = keywords || ' ipad tableta smartwatch ceas telefoane mobil apple oppo oneplus realme motorola nokia sony husa incarcator' WHERE slug = 'telefoane';
UPDATE categories SET keywords = keywords || ' calculator pc desktop monitor tastatura mouse imprimanta placa video procesor ssd hdd ram acer msi gaming' WHERE slug = 'laptopuri';
UPDATE categories SET keywords = keywords || ' televizoare lg philips telecomanda difuzor boxe amplificator radio camera foto video gopro drona proiector' WHERE slug = 'tv-audio';
UPDATE categories SET keywords = keywords || ' jocuri gta fifa switch controller' WHERE slug = 'console';
UPDATE categories SET keywords = keywords || ' masina de spalat uscator frigidere congelator lada hota plita microunde cuptor aer conditionat ac calorifer centrala boiler fier uscator espressor cafea robot' WHERE slug = 'electrocasnice';
UPDATE categories SET keywords = keywords || ' ghiveci plante flori gard foarfeca generator pompa compresor surubelnita ciocan scule polizor fierastrau slefuitor mototocator tocator grill gratar mobilier gradina leagan umbrela' WHERE slug = 'unelte';
UPDATE categories SET keywords = keywords || ' fusta bluza costum sacou palton scurta vesta hanorace tricouri rochii camasi blugi pijama lenjerie fular caciula manusi geanta ceas ochelari' WHERE slug = 'haine';
UPDATE categories SET keywords = keywords || ' pantof sneakers nike adidas puma bocanci tenisi balerini tocuri sandala papuc cizma' WHERE slug = 'incaltaminte';
UPDATE categories SET keywords = keywords || ' coltar extensibila sofa canapele fotolii taburet' WHERE slug = 'canapele';
UPDATE categories SET keywords = keywords || ' paturi dulapuri saltele comode noptiera oglinda birou masa scaune scaun biblioteca raft sifonier bucatarie living' WHERE slug = 'dormitor';
UPDATE categories SET keywords = keywords || ' carucioare scaune copii bebe bebelus parc patut' WHERE slug = 'carucioare';
UPDATE categories SET keywords = keywords || ' jucarii papusi masinuta masinute puzzle jocuri joc barbie cuburi plus' WHERE slug = 'jucarii';
UPDATE categories SET keywords = keywords || ' biciclete trotinete electrica mountain bike role skateboard' WHERE slug = 'biciclete';
UPDATE categories SET keywords = keywords || ' gantere haltere banca fitness bara greutati yoga saltea aparat corp cort rucsac pescuit undita schiuri snowboard minge fotbal tenis' WHERE slug = 'fitness';

INSERT INTO categories (parent_id, slug, name, position, keywords)
SELECT p.id, v.slug, v.name, v.pos, v.kw
FROM (VALUES
 ('servicii','reparatii-constructii','Reparații și construcții',1,'reparatii renovari zugrav instalator electrician tamplar zidar constructii amenajari parchet gresie faianta mesterul'),
 ('servicii','transport-mutari','Transport și mutări',2,'transport mutari mutare marfa curier tractari platforma'),
 ('servicii','service-auto','Service auto',3,'service vulcanizare spalatorie detailing tinichigerie vopsitorie itp diagnoza'),
 ('servicii','curatenie','Curățenie',4,'curatenie menaj spalat covoare igienizare'),
 ('servicii','cursuri','Meditații și cursuri',5,'meditatii cursuri lectii pregatire engleza matematica scoala'),
 ('servicii','alte-servicii','Alte servicii',6,'serviciu servicii fotograf evenimente nunta dj traduceri contabil')
) AS v(pslug, slug, name, pos, kw)
JOIN categories p ON p.slug = v.pslug
ON CONFLICT (slug) DO NOTHING;
