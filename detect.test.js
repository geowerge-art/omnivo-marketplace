/* Titluri reale de anunțuri, cu cuvintele-cheie citite chiar din migrările proiectului. */
const test = require('node:test');
const assert = require('node:assert');
const { detect } = require('./detect');
const { leaves } = require('./testleaves');
const L = leaves();
const top = (t) => detect(t, L);

const CASES = [
  ['Vand ford focus 2 an 2008 1.6 tdci 109cp', 'autoturisme'],
  ['Golf 4 1.9 TDI', 'autoturisme'],
  ['Dacia Logan 2010 inmatriculat 150000 km', 'autoturisme'],
  ['Far stânga Golf 4', 'piese-auto'],
  ['Placute frana Logan 2015', 'piese-auto'],
  ['Anvelope iarna 205/55 R16', 'piese-auto'],
  ['Cutie de viteze automata Golf 7', 'piese-auto'],
  ['Mașină de spălat Bosch 7kg', 'electrocasnice'],
  ['Frigider Arctic', 'electrocasnice'],
  ['iPhone 13 128GB', 'telefoane'],
  ['Samsung Galaxy S21 128GB', 'telefoane'],
  ['Samsung televizor 55 inch', 'tv-audio'],
  ['Laptop Lenovo i5 8GB SSD', 'laptopuri'],
  ['Bicicletă MTB 26', 'biciclete'],
  ['Canapea colțar piele', 'canapele'],
  ['Instalator electrician', 'reparatii-constructii'],
  ['Televizor samsung', 'tv-audio'],
  ['Telefon Samsung A52', 'telefoane'],
  ['Ford focus 1.6 tdi 109 cp', 'autoturisme'],
  ['Ford focus 2 an 2016 motor 1.6', 'autoturisme'],
  ['Opel Astra 2004 cutie manuala 1.6 benzina', 'autoturisme'],
  ['Vand masina', 'autoturisme'],
  /* cuvinte care înseamnă altceva în afara mașinii */
  ['Radiator calorifer fontă', 'electrocasnice'],
  ['Lampă birou', 'iluminat-sanitare'],
  ['Ușă metalică interior', 'materiale-constructii'],
  ['Oglindă dormitor', 'dormitor'],
  ['Pompă grădină', 'unelte'],
  ['Radiator Dacia Logan', 'piese-auto'],
  ['Usa stanga Golf 4', 'piese-auto'],
  ['Bară de protecție față', 'piese-auto'],
  /* telefoane și televizoare, titluri ca pe eMAG / Altex */
  ['Telefon mobil Samsung Galaxy S23 Plus 5G, Dual SIM, 8GB RAM, 256GB', 'telefoane'],
  ['Honor 90', 'telefoane'],
  ['Nothing Phone 2', 'telefoane'],
  ['Sony Bravia 65', 'tv-audio'],
  ['Hisense 55A6', 'tv-audio'],
  ['Televizor LED Smart Samsung 55CU7172, 138cm, Ultra HD 4K', 'tv-audio'],
  ['Husă iPhone 13', 'accesorii-telefoane'],
  ['Tabletă Lenovo', 'tablete'],
  ['Apple Watch', 'smartwatch'],
  ['Ceas smartwatch Apple', 'smartwatch'],
  ['Soundbar Samsung', 'audio'],
  ['Căști Sony WH-1000XM4', 'audio'],
  ['Cameră foto Canon', 'foto-video'],
  ['Placă video RTX 3060', 'componente-pc'],
  /* categorii noi */
  ['Apartament 2 camere de vânzare', 'apartamente-vanzare'],
  ['Garsonieră chirie', 'apartamente-inchiriere'],
  ['Casă de vânzare', 'case-vile'],
  ['Teren intravilan', 'terenuri'],
  ['Angajez șofer', 'joburi-transport'],
  ['Angajez vânzătoare', 'joburi-comert-horeca'],
  ['Angajez instalator', 'joburi-constructii'],
  ['Câine Labrador', 'caini'],
  ['Pisică persană', 'pisici'],
  ['Hrană pentru câini', 'accesorii-hrana-animale'],
  ['Cal de vânzare', 'animale-ferma'],
  ['Porumb', 'produse-agricole'],
  ['Tractor John Deere', 'utilaje-agricole'],
  ['Carte Harry Potter', 'carti-muzica-filme'],
  ['Chitară electrică', 'instrumente-muzicale'],
  ['Pian Yamaha', 'instrumente-muzicale'],
  ['Bilete concert', 'bilete-evenimente'],
  ['Parfum Dior', 'frumusete-parfumuri'],
  ['Geantă Louis Vuitton', 'genti-accesorii'],
  ['Ceas Casio', 'ceasuri-bijuterii'],
  ['Haine bebe', 'haine-copii'],
  ['Scaun auto copii', 'carucioare'],
  ['Cazare munte', 'cazare'],
  ['Rulotă', 'rulote-autorulote'],
  ['Barcă cu motor', 'ambarcatiuni'],
  ['Camion', 'camioane-remorci'],
  ['Cort camping', 'camping-pescuit'],
  ['Schiuri', 'sporturi-iarna']
];
for (const [title, slug] of CASES) {
  test(`„${title}” → ${slug}`, () => {
    const r = top(title);
    assert.strictEqual(r.ask, null, 'nu trebuie întrebare');
    assert.strictEqual(r.suggestions[0] && r.suggestions[0].slug, slug);
  });
}

for (const title of ['Motor 1.9 TDI 105 CP Golf 5', 'Golf 5 1.9 tdi motor complet']) {
  test(`„${title}” → întreabă: mașină sau piesă`, () => {
    const r = top(title);
    assert.ok(r.ask, 'trebuie întrebare');
    assert.deepStrictEqual(r.ask.options.map((o) => o.slug), ['autoturisme', 'piese-auto']);
    assert.strictEqual(r.confident, false);
  });
}

test('titlu prea scurt sau fără sens nu dă sugestii', () => {
  assert.deepStrictEqual(top('xyz qwerty').suggestions, []);
});
