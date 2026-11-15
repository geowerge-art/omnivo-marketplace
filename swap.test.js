/* „Schimb”: potrivire directă, lanț de 3, validări. Fără rețea și fără bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const { tokens, wantsScore, matchAll, validWants, mutual } = require('./swap-match');

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
