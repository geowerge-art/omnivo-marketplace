/* Titluri reale de anunțuri, cu cuvintele-cheie citite chiar din migrările proiectului. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { detect } = require('./detect');

function leaves() {
  const kw = {}, parent = {}, name = {};
  const row = /\('([a-z-]+)','([a-z-]+)','([^']+)',\d+,'([^']*)'\)/g;
  for (const f of ['003_subcategories.sql', '007_keywords.sql']) {
    const s = fs.readFileSync(path.join(__dirname, f), 'utf8'); let m;
    while ((m = row.exec(s))) { parent[m[2]] = m[1]; name[m[2]] = m[3]; kw[m[2]] = (kw[m[2]] || '') + ' ' + m[4]; }
  }
  const upd = /keywords = keywords \|\| '([^']*)' WHERE slug = '([a-z-]+)'/g;
  const s7 = fs.readFileSync(path.join(__dirname, '007_keywords.sql'), 'utf8'); let m;
  while ((m = upd.exec(s7))) kw[m[2]] = (kw[m[2]] || '') + ' ' + m[1];
  return Object.keys(kw).map((slug, i) => ({ id: i + 1, slug, name: name[slug], parent_name: parent[slug], keywords: kw[slug].trim() }));
}
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
  ['Vand masina', 'autoturisme']
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
