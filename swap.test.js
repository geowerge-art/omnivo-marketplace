/* „Schimb”: potrivire directă, lanț de 3, validări. Fără rețea și fără bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const { tokens, titleTokens, wantsScore, matchAll, validWants, mutual } = require('./swap-match');

test('tokens: fără diacritice, fără cuvinte de legătură, tăiere la 5 litere, numerele rămân', () => {
  assert.deepStrictEqual(tokens('Caut o bicicletă sau trotinetă'), ['bicic', 'troti']);
  assert.deepStrictEqual(tokens('iPhone 13 în stare bună'), ['iphon', '13']);
  assert.deepStrictEqual(tokens('Telefoane / telefon'), ['telef']);
  assert.deepStrictEqual(tokens('Ș ț a o'), []);
});

test('wantsScore: plural/singular se potrivesc, numerele trebuie să fie exacte', () => {
  assert.ok(wantsScore('telefon', 'Telefoane Samsung') >= 0.6);
  assert.ok(wantsScore('iPhone 13', 'iPhone 13 Pro 128GB') >= 0.6);
  assert.ok(wantsScore('iPhone 13', 'iPhone 12') < 0.6);
  assert.strictEqual(wantsScore('', 'orice'), 0);
});

const L = (id, user_id, title, wants) => ({ id, user_id, title, wants });

test('potrivire dublă apare prima', () => {
  const mine = [L(1, 10, 'Bicicletă de munte', 'laptop')];
  const others = [L(2, 20, 'Laptop Dell', 'bicicletă'), L(3, 30, 'Laptop Asus', 'consolă PlayStation')];
  const m = matchAll(mine, others);
  assert.strictEqual(m.direct.length, 2);
  assert.strictEqual(m.direct[0].other.id, 2); assert.ok(m.direct[0].both);
  assert.strictEqual(m.direct[1].other.id, 3); assert.ok(!m.direct[1].both);
});

test('lanț de 3: A are bicicletă și vrea laptop, B are laptop și vrea consolă, C are consolă și vrea bicicletă', () => {
  const mine = [L(1, 10, 'Bicicletă', 'laptop')];
  const others = [L(2, 20, 'Laptop', 'consolă'), L(3, 30, 'Consolă PlayStation', 'bicicletă')];
  const m = matchAll(mine, others);
  assert.strictEqual(m.chains.length, 1);
  assert.strictEqual(m.chains[0].b.id, 2); assert.strictEqual(m.chains[0].c.id, 3);
});

test('nu se potrivește cu propriile anunțuri și lanțul nu repetă aceeași persoană', () => {
  const mine = [L(1, 10, 'Bicicletă', 'laptop')];
  const others = [L(2, 10, 'Laptop', 'bicicletă'), L(3, 20, 'Laptop', 'consolă'), L(4, 20, 'Consolă', 'bicicletă')];
  const m = matchAll(mine, others);
  assert.ok(m.direct.every((d) => d.other.user_id !== 10));
  assert.strictEqual(m.chains.length, 0);   // b și c sunt aceeași persoană (20)
});

test('rezultatul nu scapă câmpurile interne', () => {
  const m = matchAll([L(1, 10, 'Bicicletă', 'laptop')], [L(2, 20, 'Laptop', 'bicicletă')]);
  assert.ok(!('_w' in m.direct[0].other) && !('_t' in m.direct[0].mine));
});

test('validWants: lungime, contact interzis', () => {
  assert.strictEqual(validWants('ab').error, 'CE_CAUTI_INVALID');
  assert.strictEqual(validWants('x'.repeat(121)).error, 'CE_CAUTI_INVALID');
  assert.strictEqual(validWants('sunați 0722 123 456').error, 'FARA_CONTACT_IN_SCHIMB');
  assert.strictEqual(validWants('scrie-mi pe a@b.ro').error, 'FARA_CONTACT_IN_SCHIMB');
  assert.strictEqual(validWants('sau o ').error, 'CE_CAUTI_INVALID');
  assert.deepStrictEqual(validWants('  laptop   sau tabletă '), { v: 'laptop sau tabletă' });
});

test('mutual: doar când fiecare caută ce are celălalt, și nu cu sine', () => {
  assert.ok(mutual(L(1, 10, 'Bicicletă', 'laptop'), L(2, 20, 'Laptop Dell', 'bicicletă')));
  assert.ok(!mutual(L(1, 10, 'Bicicletă', 'laptop'), L(2, 20, 'Laptop Dell', 'consolă')));
  assert.ok(!mutual(L(1, 10, 'Bicicletă', 'laptop'), L(2, 10, 'Laptop', 'bicicletă')));
});

test('sinonime: ce cauți (telefon, consolă, laptop, bike, mașină) se potrivește cu numele obiectului', () => {
  const y = (w, t) => assert.ok(wantsScore(w, t) >= 0.6, `${w} ~ ${t}`);
  const n = (w, t) => assert.ok(wantsScore(w, t) < 0.6, `${w} !~ ${t}`);
  y('telefon', 'iPhone 13 Pro'); y('smartphone', 'iPhone 12'); y('apple', 'iPhone 11'); y('tabletă', 'iPad Air');
  y('laptop', 'MacBook Air M1'); y('consolă', 'PlayStation 5'); y('bike', 'Bicicletă de munte'); y('bicicletă', 'MTB Cube');
  y('mașină', 'Dacia Logan 2015'); y('tv', 'Televizor Samsung 43"'); y('PC', 'Calculator gaming');
  n('telefon', 'Husă iPhone 13'); n('mașină', 'Piese Dacia Logan'); n('consolă', 'Suport PlayStation 5'); n('laptop', 'iPhone 13');
});
test('titleTokens: adaugă ce este obiectul, dar nu pentru accesorii', () => {
  assert.ok(titleTokens('iPhone 13').includes('telef') && titleTokens('iPhone 13').includes('apple'));
  assert.ok(!titleTokens('Husă iPhone 13').includes('telef'));
  assert.deepStrictEqual(tokens('TV sau PC'), ['telev', 'calcu']);
});
test('lanț cu sinonime: iPhone → consolă → bicicletă → iPhone, fără cuvinte comune', () => {
  const m = matchAll([L(1, 10, 'Bicicletă MTB', 'telefon')], [L(2, 20, 'iPhone 13', 'consolă'), L(3, 30, 'PlayStation 4', 'bike')]);
  assert.strictEqual(m.chains.length, 1);
});
