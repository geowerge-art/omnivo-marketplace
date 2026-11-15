/* Preț sugerat: interval, mediană, rotunjire, praguri. Funcții pure. */
const test = require('node:test');
const assert = require('node:assert');
const { suggest, nice, pct } = require('./price-hint');

const R = (title, price, condition = 'folosit') => ({ title, price, condition });
const phones = [900, 1000, 1100, 1200, 1300, 1400, 1500].map((p, i) => R('iPhone 13 ' + i, p));

test('nice: rotunjire pe trepte', () => {
  assert.strictEqual(nice(47), 45); assert.strictEqual(nice(1234), 1250); assert.strictEqual(nice(5120), 5100); assert.strictEqual(nice(12340), 12500); assert.strictEqual(nice(1), 5);
});
test('pct: percentile', () => { assert.strictEqual(pct([1, 2, 3, 4, 5], 0.5), 3); assert.strictEqual(pct([], 0.5), null); });

test('anunțuri asemănătoare: interval și mediană', () => {
  const h = suggest([...phones, R('Frigider Arctic', 700), R('Laptop Dell', 2500)], 'iPhone 13 Pro');
  assert.strictEqual(h.scope, 'similar'); assert.strictEqual(h.n, 7);
  assert.deepStrictEqual([h.low, h.mid, h.high], [1050, 1200, 1350]);
});
test('prea puține asemănătoare => categoria întreagă, dacă sunt destule', () => {
  const cat = Array.from({ length: 10 }, (_, i) => R('Obiect ' + i, 100 + i * 10));
  const h = suggest(cat, 'Altceva complet'); assert.strictEqual(h.scope, 'category'); assert.strictEqual(h.n, 10);
});
test('prea puține anunțuri => nu răspundem', () => {
  assert.strictEqual(suggest([R('iPhone 13', 1000), R('iPhone 13', 1100)], 'iPhone 13'), null);
  assert.strictEqual(suggest([], 'x'), null);
});
test('starea: se folosește doar dacă sunt destule de aceeași stare', () => {
  const mix = [...phones.map((r) => ({ ...r, condition: 'folosit' })), R('iPhone 13 nou', 4000, 'nou')];
  assert.strictEqual(suggest(mix, 'iPhone 13', 'nou').n, 8);        // doar 1 nou: rămâne toată grupa
  const two = [...mix, ...[4100, 4200, 4300, 4400].map((p) => R('iPhone 13 sigilat', p, 'nou'))];
  assert.strictEqual(suggest(two, 'iPhone 13', 'nou').n, 5);        // 5 noi: doar ele
});
test('prețurile 0, negative sau lipsă sunt ignorate', () => {
  const x = suggest([...phones, R('iPhone 13', 0), R('iPhone 13', null), R('iPhone 13', -5)], 'iPhone 13');
  assert.strictEqual(x.n, 7);
});
test('cu sinonime: „telefon” găsește iPhone-uri', () => {
  assert.strictEqual(suggest(phones, 'telefon').scope, 'similar');
});
