/* „Schimb”: rutele backend, cu baza de date simulată. */
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const orig = Module._load; const routes = {}; let queries = [], script = () => ({ rows: [], rowCount: 0 });
Module._load = function (req, ...a) {
  if (req === 'express') {
    const mk = () => { const o = {}; o.use = () => o; ['get', 'post', 'put', 'patch', 'delete'].forEach((m) => (o[m] = (p, ...h) => { routes[`${m.toUpperCase()} ${p}`] = h[h.length - 1]; return o; })); return o; };
    const ex = () => ({}); ex.Router = mk; return ex;
  }
  if (req === './db') return { hasDb: () => true, query: async (s, p) => { queries.push({ s, p }); return script(s, p); } };
  if (req === './common') return { ah: (f) => f, requireDb: () => {} };
  if (req === './authmw') return { requireAuth: () => {} };
  if (req === './security') return { createThrottle: () => () => true };
  return orig.call(this, req, ...a);
};
const notes = [];
const np = require.resolve('./notify');   // notify.js se încarcă târziu (din interiorul funcției): îl înlocuim în cache
require.cache[np] = { id: np, filename: np, loaded: true, exports: { notify: async (...x) => { notes.push(x); } } };
const S = require('./swap'); Module._load = orig;

const call = async (key, { params = {}, query = {}, body = {}, user = { id: 7 } } = {}) => {
  let status = 200, out; const res = { status(c) { status = c; return res; }, json(j) { out = j; return res; }, set() { return res; } };
  await routes[key]({ params, query, body, user }, res); return { status, out };
};
const reset = (fn) => { queries = []; script = fn || (() => ({ rows: [], rowCount: 0 })); };

test('rutele există', () => { for (const k of ['GET /', 'GET /mine', 'PUT /:id(\\d+)', 'DELETE /:id(\\d+)']) assert.ok(routes[k], k); });

test('PUT: ce cauți invalid sau cu contact => 400, fără scriere', async () => {
  reset();
  assert.strictEqual((await call('PUT /:id(\\d+)', { params: { id: '5' }, body: { wants: 'a' } })).out.error, 'CE_CAUTI_INVALID');
  assert.strictEqual((await call('PUT /:id(\\d+)', { params: { id: '5' }, body: { wants: 'sună la 0722123456' } })).out.error, 'FARA_CONTACT_IN_SCHIMB');
  assert.strictEqual(queries.length, 0);
});

test('PUT: anunț străin sau șters => 404', async () => {
  reset(() => ({ rows: [], rowCount: 0 }));
  const r = await call('PUT /:id(\\d+)', { params: { id: '5' }, body: { wants: 'laptop' } });
  assert.strictEqual(r.status, 404);
  assert.ok(/user_id = \$2/.test(queries[0].s));   // verifică proprietarul
});

test('PUT: limita de 20 și salvarea', async () => {
  reset((s) => (/FROM listings/.test(s) ? { rows: [{ id: 5, status: 'approved' }] } : /COUNT/.test(s) ? { rows: [{ n: 20 }] } : { rows: [] }));
  assert.strictEqual((await call('PUT /:id(\\d+)', { params: { id: '5' }, body: { wants: 'laptop' } })).out.error, 'PREA_MULTE_SCHIMBURI');
  reset((s) => (/FROM listings/.test(s) ? { rows: [{ id: 5, status: 'approved' }] } : /COUNT/.test(s) ? { rows: [{ n: 3 }] } : { rows: [] }));
  const r = await call('PUT /:id(\\d+)', { params: { id: '5' }, body: { wants: '  laptop  sau tabletă ' } });
  assert.deepStrictEqual(r.out, { ok: true, wants: 'laptop sau tabletă' });
  assert.deepStrictEqual(queries.find((q) => /INSERT INTO swaps/.test(q.s)).p, [5, 7, 'laptop sau tabletă']);
});

test('DELETE: șterge doar al meu', async () => {
  reset(); await call('DELETE /:id(\\d+)', { params: { id: '5' } });
  assert.deepStrictEqual(queries[0].p, [5, 7]); assert.ok(/user_id = \$2/.test(queries[0].s));
});

test('GET /mine: potriviri calculate, blocările excluse în SQL', async () => {
  reset((s) => (/s\.user_id <> \$1/.test(s)
    ? { rows: [{ id: 2, user_id: 20, title: 'Laptop Dell', wants: 'bicicletă', nickname: 'ana' }] }
    : { rows: [{ id: 1, user_id: 7, title: 'Bicicletă', wants: 'laptop', status: 'approved' }] }));
  const r = await call('GET /mine');
  assert.strictEqual(r.out.direct.length, 1); assert.ok(r.out.direct[0].both);
  assert.ok(queries.some((q) => /user_blocks/.test(q.s)));
});

test('GET /: filtrează după ?q=', async () => {
  reset(() => ({ rows: [{ id: 1, title: 'Laptop', wants: 'bicicletă' }, { id: 2, title: 'Masă', wants: 'scaun' }] }));
  const r = await call('GET /', { query: { q: 'laptop' } });
  assert.deepStrictEqual(r.out.swaps.map((x) => x.id), [1]);
});

test('GET /:id: ce caută, sau 404', async () => {
  reset(() => ({ rows: [{ wants: 'laptop' }], rowCount: 1 }));
  assert.deepStrictEqual((await call('GET /:id(\\d+)', { params: { id: '5' } })).out, { wants: 'laptop' });
  reset(); assert.strictEqual((await call('GET /:id(\\d+)', { params: { id: '5' } })).status, 404);
});

test('notifyMatches: anunță ambele părți la potrivire dublă, o singură dată, și respectă plafonul', async () => {
  const me = { id: 1, user_id: 10, title: 'Bicicletă', wants: 'laptop', nickname: 'eu' };
  const o1 = { id: 2, user_id: 20, title: 'Laptop Dell', wants: 'bicicletă', nickname: 'ana' };
  const o2 = { id: 3, user_id: 30, title: 'Laptop Asus', wants: 'consolă', nickname: 'dan' };   // nu vrea bicicletă
  const mk = (h, same) => (s) => (/FROM notifications/.test(s) ? { rows: [{ h, same }] } : /AND s\.listing_id = \$1/.test(s) ? { rows: [me] } : { rows: [o1, o2] });
  notes.length = 0; reset(mk(0, 0)); await S.notifyMatches(1);
  assert.deepStrictEqual(notes.map((n) => [n[0], n[1], n[2]]), [[10, 'swap', 2], [20, 'swap', 1]]);
  notes.length = 0; reset(mk(0, 1)); await S.notifyMatches(1); assert.strictEqual(notes.length, 0);   // deja anunțați
  notes.length = 0; reset(mk(5, 0)); await S.notifyMatches(1); assert.strictEqual(notes.length, 0);   // plafon pe oră
});
