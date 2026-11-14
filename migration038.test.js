/* Verificări statice pe 038_coverage.sql (fără bază de date): slug-uri, părinți, atribute, cuvinte-cheie. */
const test = require('node:test');
const assert = require('node:assert');
const { readSql, valuesBlocks } = require('./sqlparse');

const sql = readSql('038_coverage.sql');
const blocks = valuesBlocks(sql);
const topRows = blocks.flat().filter((r) => r.length === 4);
const leafRows = blocks.flat().filter((r) => r.length === 5);
const attrRows = blocks.flat().filter((r) => r.length === 8);

const old = new Set();
for (const f of ['002_seed_categories.sql', '003_subcategories.sql', '007_keywords.sql']) {
  for (const r of valuesBlocks(readSql(f)).flat()) if (r.length >= 3 && typeof r[0] === 'string') { old.add(r[0]); if (typeof r[1] === 'string') old.add(r[1]); }
}
const topOld = new Set(['auto-moto', 'electronice', 'casa-gradina', 'moda', 'servicii', 'sport-timp-liber', 'mobila', 'copii-jucarii']);
const topNew = new Set(topRows.map((r) => r[0]));

test('toate rândurile au forma așteptată', () => {
  assert.strictEqual(topRows.length, 6);
  assert.ok(leafRows.length >= 45, 'subcategorii noi: ' + leafRows.length);
  assert.ok(attrRows.length >= 100, 'atribute noi: ' + attrRows.length);
});

test('slug-urile noi sunt unice și nu se lovesc de cele vechi', () => {
  const all = [...topRows.map((r) => r[0]), ...leafRows.map((r) => r[1])];
  assert.strictEqual(new Set(all).size, all.length, 'slug duplicat în 038');
  for (const s of all) {
    assert.match(s, /^[a-z0-9-]+$/, s);
    assert.ok(!old.has(s), `slug deja folosit în migrările vechi: ${s}`);
  }
});

test('fiecare subcategorie are un părinte existent și cuvinte-cheie curate', () => {
  for (const [p, slug, name, pos, kw] of leafRows) {
    assert.ok(topOld.has(p) || topNew.has(p), `părinte necunoscut la ${slug}: ${p}`);
    assert.ok(name.length >= 3 && Number.isInteger(pos), slug);
    const words = kw.split(' ');
    assert.ok(words.length >= 3, `${slug}: prea puține cuvinte-cheie`);
    for (const w of words) assert.match(w, /^[a-z0-9]+$/, `${slug}: cuvânt-cheie nepermis „${w}”`);
    assert.strictEqual(new Set(words).size, words.length, `${slug}: cuvânt repetat`);
  }
});

test('fiecare categorie principală nouă are cel puțin o subcategorie', () => {
  for (const t of topNew) assert.ok(leafRows.some((r) => r[0] === t), t);
});

test('atributele se leagă de categorii existente, fără dubluri', () => {
  const known = new Set([...old, ...topNew, ...leafRows.map((r) => r[1])]);
  const seen = new Set();
  for (const [slug, key, label, type, options, req, filt, pos] of attrRows) {
    assert.ok(known.has(slug), `atribut pe categorie necunoscută: ${slug}`);
    assert.match(key, /^[a-z0-9_]+$/, key);
    assert.ok(label.length >= 2, key);
    assert.ok(['text', 'number', 'select'].includes(type), `${slug}.${key}: tip ${type}`);
    assert.strictEqual(typeof req, 'boolean'); assert.strictEqual(typeof filt, 'boolean'); assert.ok(Number.isInteger(pos));
    const id = slug + '.' + key;
    assert.ok(!seen.has(id), 'atribut duplicat: ' + id); seen.add(id);
    if (type === 'select') {
      const o = JSON.parse(options);
      assert.ok(Array.isArray(o) && o.length >= 2 && o.every((x) => typeof x === 'string' && x.trim()), id);
      assert.strictEqual(new Set(o).size, o.length, `${id}: opțiune repetată`);
    } else assert.strictEqual(options, null, `${id}: doar select are opțiuni`);
  }
});

test('categoriile cu atribute obligatorii nu blochează postarea fără rost', () => {
  const req = attrRows.filter((r) => r[5]).map((r) => r[0] + '.' + r[1]).sort();
  assert.deepStrictEqual(req, ['case-vile.tranzactie', 'locuri-de-munca.tip_anunt', 'spatii-comerciale.tranzactie', 'terenuri.tranzactie']);
});

test('telefoanele și televizoarele au câmpurile din eMAG / Altex', () => {
  const has = (s, k) => attrRows.some((r) => r[0] === s && r[1] === k);
  for (const k of ['marca', 'diagonala', 'sistem_operare', 'tip_sim', 'retea_5g', 'sanatate_baterie', 'liber_retea', 'garantie', 'aspect']) assert.ok(has('telefoane', k), 'telefoane.' + k);
  for (const k of ['marca', 'diagonala_cm', 'tip_display', 'os_tv', 'clasa_energetica', 'an_lansare']) assert.ok(has('tv-audio', k), 'tv-audio.' + k);
});

test('marca de pe Electronice se șterge doar după ce fiecare subcategorie își are propria marcă', () => {
  assert.match(sql, /DELETE FROM category_attributes\s+WHERE key = 'marca' AND category_id = \(SELECT id FROM categories WHERE slug = 'electronice'\)/);
  const withOwn = new Set(attrRows.filter((r) => r[1] === 'marca').map((r) => r[0]));
  const existing = new Set(['console']);        // are deja marcă proprie (008)
  const electronics = ['telefoane', 'tv-audio', 'laptopuri', ...leafRows.filter((r) => r[0] === 'electronice').map((r) => r[1])];
  for (const s of electronics) assert.ok(withOwn.has(s) || existing.has(s), `fără marcă proprie: ${s}`);
});

test('mutările de anunțuri țintesc doar subcategorii create aici', () => {
  const newLeaves = new Set(leafRows.map((r) => r[1]));
  const moves = [...sql.matchAll(/UPDATE listings SET category_id = \(SELECT id FROM categories WHERE slug = '([a-z-]+)'\)\s+WHERE category_id = \(SELECT id FROM categories WHERE slug = '([a-z-]+)'\)/g)];
  assert.ok(moves.length >= 10);
  for (const [, to, from] of moves) { assert.ok(newLeaves.has(to), 'țintă necunoscută: ' + to); assert.ok(old.has(from), 'sursă necunoscută: ' + from); }
});

test('fișierul nu conține apostrof în texte (ar rupe VALUES) și are ghilimele echilibrate', () => {
  const s = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.strictEqual((s.match(/'/g) || []).length % 2, 0);
});
