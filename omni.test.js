const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');
const { parse } = require('./omni');

// aceleași liste ca în aplicație: COUNTIES din script.js, CITIES din cities.js
const COUNTIES = JSON.parse(fs.readFileSync('script.js', 'utf8').match(/const COUNTIES = (\[.*?\]);/)[1]);
const sb = { window: {} }; vm.runInNewContext(fs.readFileSync('cities.js', 'utf8'), sb);
const L = { counties: COUNTIES, cities: sb.window.CITIES };
const P = (t, o) => parse(t, Object.assign({}, L, o));

test('preț maxim + județ', () => {
  const r = P('audi a4 sub 8000 € în Timiș');
  assert.deepStrictEqual([r.q, r.max, r.currency, r.county, r.city], ['audi a4', '8000', 'EUR', 'Timiș', '']);
});
test('lei cu punct de mii', () => {
  const r = P('iphone 13 sub 1.500 lei');
  assert.deepStrictEqual([r.q, r.max, r.currency], ['iphone 13', '1500', 'RON']);
});
test('interval + loc cu „la”', () => {
  const r = P('apartament 2 camere între 50.000 și 80.000 euro la Cluj');
  assert.deepStrictEqual([r.q, r.min, r.max, r.currency, r.county], ['apartament 2 camere', '50000', '80000', 'EUR', 'Cluj']);
});
test('oraș fără „în” la capăt -> oraș + județ', () => {
  const r = P('golf 4 timisoara');
  assert.deepStrictEqual([r.q, r.city, r.county], ['golf 4', 'Timișoara', 'Timiș']);
});
test('oraș cu cratimă scris cu spațiu', () => {
  const r = P('ford focus sub 6.500 € cluj napoca');
  assert.deepStrictEqual([r.q, r.max, r.county], ['ford focus', '6500', 'Cluj']);
});
test('peste / k', () => {
  assert.strictEqual(P('frigider peste 500 ron').min, '500');
  assert.strictEqual(P('laptop max 3k lei').max, '3000');
});
test('anul nu e preț', () => {
  const r = P('audi a4 peste 2010');
  assert.strictEqual(r.changed, false); assert.strictEqual(r.q, 'audi a4 peste 2010');
});
test('unitățile nu sunt preț', () => {
  assert.strictEqual(P('masina sub 100 km').changed, false);
  assert.strictEqual(P('bmw sub 200 cp').changed, false);
});
test('tv 55 inch sub 2000', () => {
  const r = P('tv 55 inch sub 2000');
  assert.deepStrictEqual([r.q, r.max], ['tv 55 inch', '2000']);
});
test('cuvinte care sunt și localități', () => {
  assert.strictEqual(P('rochie alba').changed, false);
  const r = P('rochie în Alba'); assert.deepStrictEqual([r.q, r.county], ['rochie', 'Alba']);
});
test('doar un nume de oraș nu e filtru', () => {
  assert.strictEqual(P('Timisoara').changed, false);
});
test('doar preț', () => {
  const r = P('sub 5000 lei'); assert.deepStrictEqual([r.q, r.max, r.changed], ['', '5000', true]);
});
test('ce ai ales deja nu se atinge', () => {
  const r = P('audi sub 8000 în Timiș', { skipPrice: true, skipLocation: true });
  assert.strictEqual(r.changed, false); assert.strictEqual(r.q, 'audi sub 8000 în Timiș');
});
test('text gol / fără nimic de extras', () => {
  assert.strictEqual(P('').changed, false);
  assert.strictEqual(P('masina de spalat').changed, false);
});
test('județ scurt la capăt', () => {
  const r = P('iphone 13 pana la 1500 lei Cluj');
  assert.deepStrictEqual([r.q, r.max, r.currency, r.county], ['iphone 13', '1500', 'RON', 'Cluj']);
});
