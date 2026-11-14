/* 038: acoperire de categorii.
   - 6 categorii principale noi (Imobiliare, Locuri de muncă, Animale, Agro și industrie, Cazare și turism, Hobby și cultură)
   - subcategorii noi la categoriile existente (tablete, smartwatch, accesorii telefoane, audio, foto-video, genți, ceasuri, camioane, rulote...)
   - cuvinte-cheie corectate (mutate de la subcategoria greșită la cea potrivită)
   - atribute la telefoane / televizoare ca pe eMAG și Altex (marcă din listă, diagonală, sistem de operare, baterie, aspect...)
   - câteva anunțuri existente, cu titlul fără echivoc (ex. „Husă iPhone”), trec în subcategoria nouă potrivită.
   Totul e idempotent: ON CONFLICT DO NOTHING, iar mutările se potrivesc doar cu începutul titlului. */

/* ---------- 1. categorii principale noi ---------- */
INSERT INTO categories (slug, name, icon, position) VALUES
  ('imobiliare', 'Imobiliare', '🏘️', 9),
  ('locuri-de-munca', 'Locuri de muncă', '💼', 10),
  ('animale', 'Animale', '🐾', 11),
  ('agro-industrie', 'Agro și industrie', '🚜', 12),
  ('cazare-turism', 'Cazare și turism', '🏖️', 13),
  ('hobby-cultura', 'Hobby și cultură', '🎸', 14)
ON CONFLICT (slug) DO NOTHING;

/* ---------- 2. subcategorii noi (părinte, slug, nume, poziție, cuvinte-cheie) ---------- */
INSERT INTO categories (parent_id, slug, name, position, keywords)
SELECT p.id, v.slug, v.name, v.pos, v.kw
FROM (VALUES
 ('auto-moto','camioane-remorci','Camioane și remorci',4,'camion camioane autocamion tir remorca remorci semiremorca basculanta utilitara furgon autoutilitara'),
 ('auto-moto','rulote-autorulote','Rulote și autorulote',5,'rulota rulote autorulota autorulote caravana camper'),
 ('auto-moto','ambarcatiuni','Ambarcațiuni și nautic',6,'barca barci ambarcatiune ambarcatiuni iaht yacht jetski catamaran caiac canoe'),
 ('electronice','tablete','Tablete și e-readere',5,'tableta tablete ipad tab ereader kindle'),
 ('electronice','smartwatch','Smartwatch și brățări fitness',6,'smartwatch watch fitbit garmin amazfit'),
 ('electronice','accesorii-telefoane','Accesorii telefoane',7,'husa huse folie incarcator cablu powerbank carcasa adaptor handsfree'),
 ('electronice','audio','Audio, boxe și căști',8,'boxa boxe soundbar casti difuzor amplificator radio microfon jbl bose marshall sennheiser airpods earbuds'),
 ('electronice','foto-video','Foto, video și drone',9,'aparat foto camera drona dji gopro canon nikon obiectiv trepied camcorder mirrorless dslr fujifilm'),
 ('electronice','componente-pc','Componente și periferice PC',10,'calculator pc desktop monitor tastatura mouse imprimanta placa procesor ssd hdd gpu rtx gtx radeon geforce webcam router'),
 ('moda','genti-accesorii','Genți și accesorii',3,'geanta genti ghiozdan rucsac portofel curea esarfa fular caciula manusi ochelari palarie valiza troler borseta'),
 ('moda','ceasuri-bijuterii','Ceasuri și bijuterii',4,'ceas ceasuri casio seiko fossil rolex tissot bijuterii bijuterie inel inele lantisor colier bratara cercei pandantiv aur argint verigheta'),
 ('moda','frumusete-parfumuri','Frumusețe și parfumuri',5,'parfum parfumuri deodorant machiaj ruj rimel crema ser sampon balsam cosmetice cosmetica oja manichiura epilator'),
 ('copii-jucarii','haine-copii','Haine copii și bebeluși',3,'hainute hainuta body salopeta botosei combinezon bebelusi'),
 ('casa-gradina','decoratiuni-textile','Decorațiuni și textile',3,'decoratiuni decoratiune perna perne perdea perdele draperie draperii covor covoare cuvertura plapuma patura vaza lumanare prosop prosoape'),
 ('casa-gradina','bucatarie-vase','Bucătărie și vase',4,'oala oale cratita cratite tigaie tigai farfurie farfurii pahar pahare tacamuri cutite vase vas'),
 ('casa-gradina','iluminat-sanitare','Iluminat și sanitare',5,'lustra lustre veioza aplica plafoniera spoturi iluminat bec becuri lampa lampi chiuveta lavoar wc cada robinet sanitare'),
 ('casa-gradina','materiale-constructii','Materiale de construcții',6,'caramida caramizi ciment var nisip pietris bca boltari polistiren vata tigla tabla usa usi geam geamuri termopan fereastra ferestre tevi panou panouri fotovoltaice solare'),
 ('sport-timp-liber','camping-pescuit','Camping și pescuit',3,'cort corturi camping rucsac undita lanseta mulineta pescuit pescar'),
 ('sport-timp-liber','sporturi-iarna','Sporturi de iarnă',4,'schi schiuri snowboard sanie patine hochei clapari'),
 ('sport-timp-liber','echipament-sportiv','Echipament sportiv',5,'minge mingi fotbal tenis baschet handbal volei racheta palete crose golf arc box'),
 ('servicii','it-web','IT, web și grafică',7,'website web programare programator seo aplicatie hosting grafician logo design'),
 ('imobiliare','apartamente-vanzare','Apartamente de vânzare',1,'apartament apartamente garsoniera garsoniere penthouse'),
 ('imobiliare','apartamente-inchiriere','Apartamente de închiriat',2,'apartament apartamente garsoniera garsoniere chirie inchiriez inchiriere inchiriat'),
 ('imobiliare','case-vile','Case și vile',3,'casa case vila vile duplex'),
 ('imobiliare','terenuri','Terenuri',4,'teren terenuri intravilan extravilan parcela hectare'),
 ('imobiliare','spatii-comerciale','Spații comerciale și birouri',5,'spatiu spatii comercial comerciala hala depozit showroom birouri'),
 ('locuri-de-munca','joburi-it','IT și telecom',1,'programator developer dezvoltator it software tester devops analist administrator retea helpdesk'),
 ('locuri-de-munca','joburi-constructii','Construcții și instalații',2,'zidar zugrav instalator electrician tamplar sudor fierar dulgher faiantar muncitor constructii pavaje'),
 ('locuri-de-munca','joburi-transport','Șoferi, transport și curierat',3,'sofer soferi curier curieri livrator camionagiu taximetrist dispecer'),
 ('locuri-de-munca','joburi-comert-horeca','Comerț, HoReCa și servicii',4,'vanzator vanzatoare casier ospatar barman bucatar ajutor chelner receptioner agent frizer coafor'),
 ('locuri-de-munca','joburi-birou','Administrativ, vânzări și birou',5,'secretara asistent contabil administrativ manager vanzari marketing recruiter operator'),
 ('locuri-de-munca','joburi-productie-agro','Producție, depozit și agricultură',6,'muncitor productie depozit manipulant magazioner operator fabrica ferma agricol'),
 ('locuri-de-munca','joburi-strainatate','Muncă în străinătate',7,'strainatate germania anglia italia spania austria olanda belgia norvegia'),
 ('locuri-de-munca','joburi-alte','Alte locuri de muncă',8,'angajare job joburi postul'),
 ('animale','caini','Câini',1,'caine caini catel catei labrador ciobanesc husky bulldog beagle chihuahua pitbull rottweiler boxer'),
 ('animale','pisici','Pisici',2,'pisica pisici pisoi motan persana siameza ragdoll sfinx'),
 ('animale','pasari','Păsări',3,'papagal papagali canar porumbei pasare pasari cinteza peruse'),
 ('animale','alte-animale-companie','Rozătoare, pești și altele',4,'iepure iepuri hamster cobai pesti acvariu broasca testoasa soparla sarpe reptila rozatoare'),
 ('animale','accesorii-hrana-animale','Hrană și accesorii animale',5,'hrana crocante lesa zgarda cusca custi litiera transportor colivie'),
 ('agro-industrie','utilaje-agricole','Utilaje agricole',1,'tractor tractoare combina semanatoare grapa plug cultivator balotiera deere holland fendt claas belarus massey agricol agricola'),
 ('agro-industrie','animale-ferma','Animale de fermă',2,'vaca vaci vitel vitei bovine porc porci purcei scroafa oaie oi miei berbec capra capre iezi cal armasar iapa magar gaina gaini pui gasca curcan albine stupi'),
 ('agro-industrie','produse-agricole','Cereale, furaje și produse agricole',3,'porumb grau orz ovaz seminte samanta rapita furaj furaje lucerna paie cereale legume fructe cartofi miere lemne'),
 ('agro-industrie','utilaje-industriale','Utilaje și echipamente industriale',4,'utilaj utilaje industrial industriala stivuitor excavator buldozer miniexcavator macara betoniera schela strung freza cnc'),
 ('agro-industrie','echipamente-afaceri','Echipamente pentru afaceri',5,'horeca vitrina frigorifica profesional profesionala cantar marcat rafturi expunere'),
 ('cazare-turism','cazare','Cazare',1,'cazare pensiune hotel motel hostel hotelier cabana'),
 ('cazare-turism','pachete-turistice','Pachete turistice și transport',2,'sejur circuit vacanta croaziera avion zbor excursie turistic pachet'),
 ('hobby-cultura','carti-muzica-filme','Cărți, muzică și filme',1,'carte carti roman enciclopedie revista reviste vinil vinyl cd dvd'),
 ('hobby-cultura','instrumente-muzicale','Instrumente muzicale',2,'chitara chitari pian pianina orga claviatura sintetizator tobe vioara saxofon trompeta flaut acordeon ukulele'),
 ('hobby-cultura','colectii-arta','Artă și colecții',3,'moneda monede bancnota bancnote timbre timbru tablou tablouri pictura antichitati antic colectie colectii medalie iconita statueta sculptura'),
 ('hobby-cultura','bilete-evenimente','Bilete și evenimente',4,'bilet bilete concert festival spectacol meci teatru abonament')
) AS v(pslug, slug, name, pos, kw)
JOIN categories p ON p.slug = v.pslug
ON CONFLICT (slug) DO NOTHING;

/* ---------- 3. cuvinte-cheie: ce a plecat la subcategoria nouă nu mai rămâne în cea veche ---------- */
UPDATE categories SET name = 'Televizoare' WHERE slug = 'tv-audio';
UPDATE categories SET keywords = trim(regexp_replace(' ' || keywords || ' ', ' (tractor|rulota|autorulota)(?= )', '', 'g')) WHERE slug = 'autoturisme';
UPDATE categories SET keywords = trim(regexp_replace(' ' || keywords || ' ', ' (boxa|casti|soundbar|difuzor|boxe|amplificator|radio|camera|foto|video|gopro|drona)(?= )', '', 'g')) WHERE slug = 'tv-audio';
UPDATE categories SET keywords = trim(regexp_replace(' ' || keywords || ' ', ' (ipad|tableta|smartwatch|ceas|husa|incarcator|sony)(?= )', '', 'g')) WHERE slug = 'telefoane';
UPDATE categories SET keywords = trim(regexp_replace(' ' || keywords || ' ', ' (calculator|pc|desktop|monitor|tastatura|mouse|imprimanta|placa|video|procesor|ssd|hdd|ram)(?= )', '', 'g')) WHERE slug = 'laptopuri';
UPDATE categories SET keywords = trim(regexp_replace(' ' || keywords || ' ', ' (geanta|ceas|ochelari|fular|caciula|manusi)(?= )', '', 'g')) WHERE slug = 'haine';
UPDATE categories SET keywords = trim(regexp_replace(' ' || keywords || ' ', ' (electrica)(?= )', '', 'g')) WHERE slug = 'biciclete';
UPDATE categories SET keywords = trim(regexp_replace(' ' || keywords || ' ', ' (cort|rucsac|pescuit|undita|schiuri|snowboard|minge|fotbal|tenis|aparat|corp)(?= )', '', 'g')) WHERE slug = 'fitness';
UPDATE categories SET keywords = trim(regexp_replace(' ' || keywords || ' ', ' (copii|bebe|bebelus)(?= )', '', 'g')) WHERE slug = 'carucioare';
UPDATE categories SET keywords = keywords || ' xperia honor nothing vivo zte infinix tecno poco blackview ulefone doogee umidigi allview evolio' WHERE slug = 'telefoane';
UPDATE categories SET keywords = keywords || ' sony hisense tcl panasonic bravia vortex horizon toshiba sharp' WHERE slug = 'tv-audio';
UPDATE categories SET keywords = keywords || ' radiator radiatoare' WHERE slug = 'electrocasnice';
UPDATE categories SET keywords = keywords || ' dormitor' WHERE slug = 'dormitor';

/* ---------- 4. atribute ---------- */
/* Marca nu mai e pe „Electronice” (text liber, același pentru toate): fiecare subcategorie are propria ei (listă sau text). */
DELETE FROM category_attributes
 WHERE key = 'marca' AND category_id = (SELECT id FROM categories WHERE slug = 'electronice');

INSERT INTO category_attributes (category_id, key, label, type, options, required, filterable, position)
SELECT c.id, a.key, a.label, a.type, a.options::jsonb, a.req, a.filt, a.pos
FROM categories c
JOIN (VALUES
  /* telefoane (ca eMAG + câmpurile care contează la second-hand) */
  ('telefoane','marca','Marcă','select','["Apple","Samsung","Xiaomi","Huawei","Honor","Oppo","Realme","OnePlus","Motorola","Google","Nokia","Sony","Vivo","Nothing","Altele"]',FALSE,TRUE,9),
  ('telefoane','diagonala','Diagonală ecran (inch)','number',NULL,FALSE,TRUE,12),
  ('telefoane','sistem_operare','Sistem de operare','select','["Android","iOS","Altul"]',FALSE,TRUE,13),
  ('telefoane','tip_sim','Tip SIM','select','["Single SIM","Dual SIM","eSIM","Dual SIM + eSIM"]',FALSE,TRUE,14),
  ('telefoane','retea_5g','Rețea 5G','select','["Da","Nu"]',FALSE,TRUE,15),
  ('telefoane','sanatate_baterie','Sănătate baterie (%)','number',NULL,FALSE,TRUE,16),
  ('telefoane','liber_retea','Liber de rețea','select','["Da","Nu"]',FALSE,TRUE,17),
  ('telefoane','garantie','Garanție','select','["Fără garanție","De la vânzător","De la producător"]',FALSE,TRUE,18),
  ('telefoane','aspect','Aspect','select','["Ca nou","Foarte bun","Bun","Acceptabil"]',FALSE,TRUE,19),
  ('telefoane','accesorii_incluse','Accesorii incluse','select','["Cutie și încărcător","Doar încărcător","Doar telefonul"]',FALSE,FALSE,20),
  /* televizoare (ca Altex) */
  ('tv-audio','marca','Marcă','select','["Samsung","LG","Sony","Philips","Hisense","TCL","Panasonic","Vortex","Horizon","Toshiba","Sharp","Xiaomi","Altele"]',FALSE,TRUE,9),
  ('tv-audio','diagonala_cm','Diagonală (cm)','number',NULL,FALSE,TRUE,13),
  ('tv-audio','tip_display','Tip display','select','["LED","QLED","Neo QLED","MiniLED","OLED","Plasmă"]',FALSE,TRUE,14),
  ('tv-audio','os_tv','Sistem de operare','select','["Google TV / Android TV","Tizen","webOS","Vidaa","Roku","Altul"]',FALSE,TRUE,15),
  ('tv-audio','clasa_energetica','Clasă energetică','select','["A","B","C","D","E","F","G"]',FALSE,TRUE,16),
  ('tv-audio','an_lansare','An lansare','number',NULL,FALSE,TRUE,17),
  /* laptopuri, tablete, smartwatch */
  ('laptopuri','marca','Marcă','select','["Apple","Lenovo","HP","Dell","Asus","Acer","MSI","Huawei","Microsoft","Samsung","Altele"]',FALSE,TRUE,9),
  ('laptopuri','aspect','Aspect','select','["Ca nou","Foarte bun","Bun","Acceptabil"]',FALSE,TRUE,20),
  ('tablete','marca','Marcă','select','["Apple","Samsung","Lenovo","Huawei","Xiaomi","Amazon","Microsoft","Altele"]',FALSE,TRUE,9),
  ('tablete','memorie','Memorie','select','["16GB","32GB","64GB","128GB","256GB","512GB","1TB"]',FALSE,TRUE,10),
  ('tablete','diagonala','Diagonală (inch)','number',NULL,FALSE,TRUE,11),
  ('tablete','conectivitate','Conectivitate','select','["Wi-Fi","Wi-Fi + celular"]',FALSE,TRUE,12),
  ('tablete','aspect','Aspect','select','["Ca nou","Foarte bun","Bun","Acceptabil"]',FALSE,TRUE,13),
  ('smartwatch','marca','Marcă','select','["Apple","Samsung","Garmin","Huawei","Xiaomi","Fitbit","Amazfit","Altele"]',FALSE,TRUE,9),
  ('smartwatch','compatibil','Compatibil cu','select','["Android","iOS","Android și iOS"]',FALSE,TRUE,10),
  /* restul subcategoriilor din Electronice */
  ('accesorii-telefoane','marca','Marcă','text',NULL,FALSE,TRUE,9),
  ('accesorii-telefoane','tip','Tip','select','["Husă","Folie de protecție","Încărcător","Cablu","Baterie externă","Suport","Altele"]',FALSE,TRUE,10),
  ('audio','marca','Marcă','text',NULL,FALSE,TRUE,9),
  ('audio','tip','Tip','select','["Boxă","Soundbar","Căști","Amplificator / receiver","Microfon","Altele"]',FALSE,TRUE,10),
  ('foto-video','marca','Marcă','select','["Canon","Nikon","Sony","Fujifilm","Panasonic","GoPro","DJI","Altele"]',FALSE,TRUE,9),
  ('foto-video','tip','Tip','select','["Aparat foto","Cameră video","Dronă","Cameră de acțiune","Obiectiv","Accesorii"]',FALSE,TRUE,10),
  ('componente-pc','marca','Marcă','text',NULL,FALSE,TRUE,9),
  ('componente-pc','tip','Tip','select','["Monitor","Placă video","Procesor","Placă de bază","Memorie RAM","SSD / HDD","Periferice","Imprimantă","Desktop complet","Altele"]',FALSE,TRUE,10),
  /* auto: camioane, rulote, ambarcațiuni */
  ('camioane-remorci','tip','Tip','select','["Camion","Autoutilitară","Remorcă","Semiremorcă","Altele"]',FALSE,TRUE,10),
  ('camioane-remorci','tonaj','Tonaj (kg)','number',NULL,FALSE,TRUE,11),
  ('rulote-autorulote','tip','Tip','select','["Rulotă","Autorulotă","Remorcă cort","Altele"]',FALSE,TRUE,10),
  ('ambarcatiuni','tip','Tip','select','["Barcă","Iaht","Jet ski","Motor pentru barcă","Accesorii"]',FALSE,TRUE,10),
  ('ambarcatiuni','lungime','Lungime (m)','number',NULL,FALSE,TRUE,11),
  /* modă, copii */
  ('genti-accesorii','gen','Pentru','select','["Femei","Bărbați","Copii","Unisex"]',FALSE,TRUE,10),
  ('genti-accesorii','tip','Tip','select','["Geantă","Rucsac","Portofel","Ochelari","Curea","Căciulă / fular","Altele"]',FALSE,TRUE,11),
  ('ceasuri-bijuterii','gen','Pentru','select','["Femei","Bărbați","Copii","Unisex"]',FALSE,TRUE,10),
  ('ceasuri-bijuterii','tip','Tip','select','["Ceas","Bijuterii din aur","Bijuterii din argint","Alte bijuterii"]',FALSE,TRUE,11),
  ('frumusete-parfumuri','tip','Tip','select','["Parfum","Machiaj","Îngrijire piele","Îngrijire păr","Aparate frumusețe","Altele"]',FALSE,TRUE,10),
  ('haine-copii','gen','Pentru','select','["Fete","Băieți","Unisex"]',FALSE,TRUE,10),
  ('haine-copii','marime','Mărime / vârstă','text',NULL,FALSE,TRUE,11),
  ('haine-copii','marca','Marcă','text',NULL,FALSE,TRUE,12),
  /* casă și grădină, sport */
  ('decoratiuni-textile','material','Material','text',NULL,FALSE,TRUE,10),
  ('iluminat-sanitare','tip','Tip','select','["Corp de iluminat","Lustră","Veioză","Obiecte sanitare","Baterii și robineți","Altele"]',FALSE,TRUE,10),
  ('materiale-constructii','tip','Tip','select','["Zidărie și beton","Termoizolații","Acoperiș","Pardoseli și faianță","Uși și ferestre","Instalații","Panouri solare","Altele"]',FALSE,TRUE,10),
  ('camping-pescuit','tip','Tip','select','["Cort","Rucsac","Sac de dormit","Unelte de pescuit","Echipament camping","Altele"]',FALSE,TRUE,10),
  ('camping-pescuit','marca','Marcă','text',NULL,FALSE,TRUE,11),
  ('sporturi-iarna','tip','Tip','select','["Schiuri","Snowboard","Clăpari / bocanci","Patine","Echipament de iarnă","Altele"]',FALSE,TRUE,10),
  ('sporturi-iarna','marca','Marcă','text',NULL,FALSE,TRUE,11),
  ('echipament-sportiv','tip','Tip','select','["Fotbal","Tenis","Baschet","Box / arte marțiale","Golf","Altele"]',FALSE,TRUE,10),
  ('echipament-sportiv','marca','Marcă','text',NULL,FALSE,TRUE,11),
  /* imobiliare */
  ('imobiliare','suprafata','Suprafață utilă (mp)','number',NULL,FALSE,TRUE,1),
  ('apartamente-vanzare','camere','Număr de camere','select','["1","2","3","4","5+"]',FALSE,TRUE,10),
  ('apartamente-vanzare','etaj','Etaj','select','["Demisol","Parter","1","2","3","4","5","6-10","Peste 10"]',FALSE,TRUE,11),
  ('apartamente-vanzare','an_constructie','An construcție','number',NULL,FALSE,TRUE,12),
  ('apartamente-vanzare','compartimentare','Compartimentare','select','["Decomandat","Semidecomandat","Nedecomandat","Circular"]',FALSE,TRUE,13),
  ('apartamente-inchiriere','camere','Număr de camere','select','["1","2","3","4","5+"]',FALSE,TRUE,10),
  ('apartamente-inchiriere','etaj','Etaj','select','["Demisol","Parter","1","2","3","4","5","6-10","Peste 10"]',FALSE,TRUE,11),
  ('apartamente-inchiriere','mobilat','Mobilat','select','["Da","Parțial","Nu"]',FALSE,TRUE,12),
  ('apartamente-inchiriere','compartimentare','Compartimentare','select','["Decomandat","Semidecomandat","Nedecomandat","Circular"]',FALSE,TRUE,13),
  ('case-vile','tranzactie','Tranzacție','select','["Vânzare","Închiriere"]',TRUE,TRUE,10),
  ('case-vile','tip_casa','Tip proprietate','select','["Casă","Vilă","Duplex","Casă de vacanță"]',FALSE,TRUE,11),
  ('case-vile','camere','Număr de camere','select','["1","2","3","4","5+"]',FALSE,TRUE,12),
  ('case-vile','suprafata_teren','Suprafață teren (mp)','number',NULL,FALSE,TRUE,13),
  ('case-vile','an_constructie','An construcție','number',NULL,FALSE,TRUE,14),
  ('terenuri','tranzactie','Tranzacție','select','["Vânzare","Închiriere"]',TRUE,TRUE,10),
  ('terenuri','tip_teren','Tip teren','select','["Intravilan","Extravilan","Agricol","Pădure","Alt tip"]',FALSE,TRUE,11),
  ('spatii-comerciale','tranzactie','Tranzacție','select','["Vânzare","Închiriere"]',TRUE,TRUE,10),
  ('spatii-comerciale','tip','Tip','select','["Birou","Spațiu comercial","Hală / depozit","Teren industrial","Altele"]',FALSE,TRUE,11),
  /* locuri de muncă: aceleași câmpuri pentru toate domeniile */
  ('locuri-de-munca','tip_anunt','Tip anunț','select','["Angajez","Caut loc de muncă"]',TRUE,TRUE,1),
  ('locuri-de-munca','contract','Program / contract','select','["Normă întreagă","Part-time","Colaborare / PFA","Sezonier","Practică / stagiu"]',FALSE,TRUE,2),
  ('locuri-de-munca','experienta','Experiență','select','["Fără experiență","1-3 ani","Peste 3 ani"]',FALSE,TRUE,3),
  ('locuri-de-munca','mod_lucru','Mod de lucru','select','["La sediu","Hibrid","Remote"]',FALSE,TRUE,4),
  /* animale */
  ('caini','rasa','Rasă','text',NULL,FALSE,TRUE,10),
  ('caini','sex','Sex','select','["Mascul","Femelă"]',FALSE,TRUE,11),
  ('caini','varsta_animal','Vârstă','select','["Sub 6 luni","6-12 luni","1-3 ani","Peste 3 ani"]',FALSE,TRUE,12),
  ('pisici','rasa','Rasă','text',NULL,FALSE,TRUE,10),
  ('pisici','sex','Sex','select','["Mascul","Femelă"]',FALSE,TRUE,11),
  ('pisici','varsta_animal','Vârstă','select','["Sub 6 luni","6-12 luni","1-3 ani","Peste 3 ani"]',FALSE,TRUE,12),
  ('pasari','rasa','Specie / rasă','text',NULL,FALSE,TRUE,10),
  ('pasari','sex','Sex','select','["Mascul","Femelă"]',FALSE,TRUE,11),
  ('pasari','varsta_animal','Vârstă','select','["Sub 6 luni","6-12 luni","1-3 ani","Peste 3 ani"]',FALSE,TRUE,12),
  ('alte-animale-companie','rasa','Specie / rasă','text',NULL,FALSE,TRUE,10),
  ('alte-animale-companie','sex','Sex','select','["Mascul","Femelă"]',FALSE,TRUE,11),
  ('alte-animale-companie','varsta_animal','Vârstă','select','["Sub 6 luni","6-12 luni","1-3 ani","Peste 3 ani"]',FALSE,TRUE,12),
  ('accesorii-hrana-animale','tip','Tip','select','["Hrană","Cuști și adăposturi","Jucării","Îngrijire","Alte accesorii"]',FALSE,TRUE,10),
  /* agro și industrie */
  ('utilaje-agricole','tip','Tip','select','["Tractor","Combină","Plug / grapă","Remorcă agricolă","Semănătoare","Altele"]',FALSE,TRUE,10),
  ('utilaje-agricole','marca','Marcă','text',NULL,FALSE,TRUE,11),
  ('utilaje-agricole','an','An fabricație','number',NULL,FALSE,TRUE,12),
  ('utilaje-agricole','putere','Putere (CP)','number',NULL,FALSE,TRUE,13),
  ('utilaje-agricole','ore_functionare','Ore de funcționare','number',NULL,FALSE,TRUE,14),
  ('animale-ferma','specie','Specie','select','["Bovine","Ovine","Caprine","Porcine","Păsări de curte","Cai","Albine","Altele"]',FALSE,TRUE,10),
  ('animale-ferma','varsta_animal','Vârstă','select','["Sub 6 luni","6-12 luni","1-3 ani","Peste 3 ani"]',FALSE,TRUE,11),
  ('produse-agricole','tip','Tip','select','["Cereale","Furaje","Semințe și răsaduri","Legume și fructe","Miere și produse apicole","Lemne de foc","Altele"]',FALSE,TRUE,10),
  ('produse-agricole','cantitate','Cantitate (ex. 20 tone)','text',NULL,FALSE,FALSE,11),
  ('utilaje-industriale','marca','Marcă','text',NULL,FALSE,TRUE,10),
  ('utilaje-industriale','an','An fabricație','number',NULL,FALSE,TRUE,11),
  ('echipamente-afaceri','tip','Tip','select','["HoReCa","Magazin / comerț","Atelier / service","Birou","Altele"]',FALSE,TRUE,10),
  ('echipamente-afaceri','marca','Marcă','text',NULL,FALSE,TRUE,11),
  /* cazare și turism, hobby și cultură */
  ('cazare','tip_cazare','Tip cazare','select','["Pensiune","Hotel","Apartament","Cabană","Vilă","Cameră","Camping"]',FALSE,TRUE,10),
  ('cazare','nr_locuri','Număr de locuri','number',NULL,FALSE,TRUE,11),
  ('pachete-turistice','tip','Tip','select','["Sejur","Circuit","City break","Croazieră","Bilete de transport","Altele"]',FALSE,TRUE,10),
  ('carti-muzica-filme','tip','Tip','select','["Cărți","Reviste / benzi desenate","Vinil","CD / DVD","Altele"]',FALSE,TRUE,10),
  ('instrumente-muzicale','tip','Tip','select','["Chitară","Pian / claviatură","Tobe","Coarde","Suflat","Amplificatoare și efecte","Altele"]',FALSE,TRUE,10),
  ('instrumente-muzicale','marca','Marcă','text',NULL,FALSE,TRUE,11),
  ('colectii-arta','tip','Tip','select','["Monede și bancnote","Timbre","Tablouri","Antichități","Obiecte de colecție","Altele"]',FALSE,TRUE,10),
  ('bilete-evenimente','tip','Tip','select','["Concert","Festival","Sport","Teatru / spectacol","Altele"]',FALSE,TRUE,10),
  ('bilete-evenimente','data_eveniment','Data evenimentului','text',NULL,FALSE,FALSE,11)
) AS a(slug,key,label,type,options,req,filt,pos) ON c.slug = a.slug
ON CONFLICT DO NOTHING;

/* ---------- 5. anunțuri existente: mutări prudente (doar începutul titlului, cuvinte fără echivoc) ---------- */
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'accesorii-telefoane')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'telefoane')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(husa|huse|folie|incarcator|incarcatoare|cablu|carcasa|powerbank|handsfree)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'tablete')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'telefoane')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '(^| )(tableta|tablete|ipad)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'smartwatch')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'telefoane')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '(^| )(smartwatch|fitbit|garmin|amazfit)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'audio')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'tv-audio')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(boxa|boxe|casti|soundbar|difuzor|amplificator|microfon)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'foto-video')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'tv-audio')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(aparat foto|camera foto|camera video|drona|gopro|obiectiv|trepied|canon|nikon)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'genti-accesorii')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'haine')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(geanta|genti|ghiozdan|rucsac|portofel|curea|esarfa|fular|caciula|manusi|ochelari|palarie|valiza|troler)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'ceasuri-bijuterii')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'haine')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(ceas|ceasuri|bijuterii|inel|inele|colier|cercei|bratara|lantisor|pandantiv)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'rulote-autorulote')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'autoturisme')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(rulota|rulote|autorulota|caravana|camper)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'camioane-remorci')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'autoturisme')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(camion|autocamion|remorca|semiremorca|autoutilitara)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'utilaje-agricole')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'autoturisme')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(tractor|tractoare)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'camping-pescuit')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'fitness')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(cort|corturi|undita|lanseta|mulineta|rucsac)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'sporturi-iarna')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'fitness')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(schiuri|snowboard|sanie|patine|clapari)( |$)';
UPDATE listings SET category_id = (SELECT id FROM categories WHERE slug = 'echipament-sportiv')
 WHERE category_id = (SELECT id FROM categories WHERE slug = 'fitness')
   AND lower(translate(title, 'ĂÂÎȘŞȚŢăâîșşțţ', 'AAISSTTaaisstt')) ~ '^(minge|mingi|fotbal|racheta|palete|crose)( |$)';
