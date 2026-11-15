/* Detectorul de poze duplicate: amprenta (dHash), pragurile și raportarea automată. Fără sharp, fără bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const { hashFromGray, distance, usable, nearest } = require('./dhash');

const rnd = (seed) => { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % 256; }; };
const noise = (seed) => { const r = rnd(seed); return Uint8Array.from({ length: 72 }, () => r()); };
const A = noise(1), B = noise(2);
const A2 = Uint8Array.from(A); A2[20] = Math.min(255, A2[20] + 30);   // aceeași poză, un pixel schimbat de compresie

test('hashFromGray: 16 caractere hex, stabilă; intrare scurtă => null', () => {
  assert.match(hashFromGray(A), /^[0-9a-f]{16}$/);
  assert.strictEqual(hashFromGray(A), hashFromGray(A));
  assert.strictEqual(hashFromGray(new Uint8Array(10)), null);
});
test('distance: 0 pentru identice, 64 pentru opuse, simetrică', () => {
  assert.strictEqual(distance('0000000000000000', '0000000000000000'), 0);
  assert.strictEqual(distance('0000000000000000', 'ffffffffffffffff'), 64);
  assert.strictEqual(distance('00000000000000ff', '0000000000000000'), 8);
  assert.strictEqual(distance(hashFromGray(A), hashFromGray(B)), distance(hashFromGray(B), hashFromGray(A)));
});
test('aceeași poză modificată puțin e aproape; altă poză e departe', () => {
  const a = hashFromGray(A), a2 = hashFromGray(A2), b = hashFromGray(B);
  assert.ok(distance(a, a2) <= 4, 'a~a2 ' + distance(a, a2));
  assert.ok(distance(a, b) > 4, 'a~b ' + distance(a, b));
});
test('usable: poze uniforme (negru/alb) nu se compară', () => {
  assert.ok(!usable('0000000000000000') && !usable('ffffffffffffffff') && !usable(null) && !usable('xyz'));
  assert.ok(usable(hashFromGray(A)));
});
test('nearest: alege cea mai apropiată și respectă pragul', () => {
  const a = hashFromGray(A), a2 = hashFromGray(A2), b = hashFromGray(B);
  const m = nearest(a, [{ phash: b, id: 1 }, { phash: a2, id: 2 }]);
  assert.strictEqual(m.id, 2);
  assert.strictEqual(nearest(a, [{ phash: b, id: 1 }]), null);
  assert.strictEqual(nearest('0000000000000000', [{ phash: '0000000000000000' }]), null);
});

/* flagDuplicate, cu baza de date simulată */
const orig = Module._load; let queries = [], script = () => ({ rows: [], rowCount: 0 });
Module._load = function (req, ...a) {
  if (req === 'express') { const mk = () => { const o = {}; ['use', 'get', 'post', 'put', 'patch', 'delete'].forEach((m) => (o[m] = () => o)); return o; }; const ex = () => ({}); ex.Router = mk; ex.raw = () => () => {}; return ex; }
  if (req === './db') return { query: async (s, p) => { queries.push({ s, p }); return script(s, p); } };
  if (req === './common') return { ah: (f) => f, requireDb: () => {} };
  if (req === './authmw') return { requireAuth: () => {} };
  if (req === './security') return { createThrottle: () => () => true };
  if (req === './config') return {};
  if (req === 'sharp') throw new Error('fără sharp');
  return orig.call(this, req, ...a);
};
const { flagDuplicate } = require('./images'); Module._load = orig;
const reset = (fn) => { queries = []; script = fn; };

test('flagDuplicate: poză găsită la alt cont => raportare automată fără autor', async () => {
  const a = hashFromGray(A), a2 = hashFromGray(A2);
  reset((s) => (/FROM listing_images/.test(s) ? { rows: [{ listing_id: 77, phash: a2, title: 'iPhone 14' }] } : { rows: [], rowCount: 0 }));
  await flagDuplicate(5, 10, 100, a);
  const ins = queries.find((q) => /INSERT INTO reports/.test(q.s));
  assert.ok(ins && /reporter_id|NULL/.test(ins.s) && /poza_duplicat/.test(ins.s));
  assert.strictEqual(ins.p[0], 5); assert.match(ins.p[1], /#77/);
  assert.ok(/l\.user_id <> \$1/.test(queries[0].s));   // doar alte conturi
});
test('flagDuplicate: fără potrivire sau deja raportat => nu scrie', async () => {
  const a = hashFromGray(A), b = hashFromGray(B);
  reset((s) => (/FROM listing_images/.test(s) ? { rows: [{ listing_id: 77, phash: b, title: 'x' }] } : { rows: [], rowCount: 0 }));
  await flagDuplicate(5, 10, 100, a); assert.ok(!queries.some((q) => /INSERT INTO reports/.test(q.s)));
  reset((s) => (/FROM listing_images/.test(s) ? { rows: [{ listing_id: 77, phash: hashFromGray(A2), title: 'x' }] } : /FROM reports/.test(s) ? { rows: [{}], rowCount: 1 } : { rows: [] }));
  await flagDuplicate(5, 10, 100, a); assert.ok(!queries.some((q) => /INSERT INTO reports/.test(q.s)));
});
test('flagDuplicate: o eroare de bază de date nu se propagă', async () => {
  reset(() => { throw new Error('boom'); });
  await flagDuplicate(5, 10, 100, hashFromGray(A));
});
