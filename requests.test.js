/* Cereri / oferte piese (model AutoParts): validări + rute + legătura UI ↔ backend. Fără rețea și fără bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const orig = Module._load; const routes = {}; const notes = []; let queries = [], script = () => ({ rows: [], rowCount: 0 });
Module._load = function (req, ...a) {
  if (req === 'express') {
    const mk = (name) => { const o = { name }; ['use'].forEach((m) => (o[m] = () => o));
      ['get', 'post', 'put', 'patch', 'delete'].forEach((m) => (o[m] = (p, ...h) => { routes[`${name} ${m.toUpperCase()} ${p}`] = { handler: h[h.length - 1], mids: h.slice(0, -1).length }; return o; })); return o; };
    let n = 0; const ex = () => ({}); ex.Router = () => mk('R' + n++); ex.raw = () => () => {}; return ex;
  }
  if (req === './db') return { hasDb: () => true, pool: { connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release() {} }) }, query: async (s, p) => { queries.push({ s, p }); return script(s, p); } };
  if (req === './config') return { APP_URL: 'http://x' };
  if (req === './common') return { ah: (f) => f, requireDb: () => {} };
  if (req === './authmw') return { requireAuth: () => {}, requireVerified: () => {}, requireRole: () => () => {} };
  if (req === './security') return { createThrottle: () => () => true };
  if (req === './notify') return { notify: async (...x) => { notes.push(x); } };
  if (req === './live') return { send: () => {} };
  if (req === './guard') return { gate: async () => false };
  if (req === './images') return { raw: () => {}, kind: () => 'jpeg', process: async () => ({}), STORAGE: false, removeStored: async () => {} };
  return orig.call(this, req, ...a);
};
const R = require('./requests');
Module._load = orig;

const good = { title: 'Far stânga', make: 'Audi', model: 'A4', year: '2012', county: 'Timiș' };

test('cerere validă: câmpurile se curăță și primesc valori implicite', () => {
  const p = R.parseRequest({ ...good, vin: 'wauzzz8k9ca012345', kind: 'noi', extra_parts: [{ title: 'Oglindă dreapta', details: 'electrică' }] });
  assert.ok(p.v, JSON.stringify(p));
  assert.strictEqual(p.v.vin, 'WAUZZZ8K9CA012345'); assert.strictEqual(p.v.kind, 'noi'); assert.strictEqual(p.v.extra_parts.length, 1);
  assert.strictEqual(R.parseRequest(good).v.kind, 'ambele');
});

test('cerere invalidă: piesă, marcă, an, VIN, județ, prea multe piese', () => {
  const err = (o) => R.parseRequest({ ...good, ...o }).error;
  assert.strictEqual(err({ title: 'ab' }), 'PIESA_INVALIDA');
  assert.strictEqual(err({ make: '' }), 'MARCA_INVALIDA');
  assert.strictEqual(err({ year: '1900' }), 'AN_INVALID');
  assert.strictEqual(err({ vin: 'ABC' }), 'VIN_INVALID');
  assert.strictEqual(err({ county: '' }), 'JUDET_LIPSA');
  assert.strictEqual(err({ extra_parts: Array.from({ length: 10 }, () => ({ title: 'piesa x' })) }), 'PREA_MULTE_PIESE');
  assert.strictEqual(err({ extra_parts: 'nu' }), 'PIESE_INVALIDE');
  assert.strictEqual(err({ extra_parts: [{ title: 'x' }] }), 'PIESA_INVALIDA');
});

test('cererea e publică: fără telefon, email sau linkuri (dar codurile OEM trec)', () => {
  for (const d of ['sunați la 0722 123 456', 'scrie la a@b.ro', 'vezi https://x.ro', 'WhatsApp +40 722 123 456']) assert.strictEqual(R.parseRequest({ ...good, description: d }).error, 'FARA_CONTACT_IN_CERERE', d);
  assert.strictEqual(R.parseRequest({ ...good, description: 'cod OEM 8200123456 sau 0 986 494 123' }).error, undefined);
  assert.strictEqual(R.parseRequest({ ...good, extra_parts: [{ title: 'bară', details: 'tel 0722123456' }] }).error, 'FARA_CONTACT_IN_CERERE');
});

test('oferta: preț obligatoriu, monedă, mesaj fără contact', () => {
  assert.deepStrictEqual(R.parseOffer({ price: '150.456', message: 'Stare bună' }).v, { price: 150.46, currency: 'RON', message: 'Stare bună' });
  assert.strictEqual(R.parseOffer({ price: 10, currency: 'EUR' }).v.currency, 'EUR');
  for (const price of ['', null, undefined, 0, -5, 'abc', 1e9]) assert.strictEqual(R.parseOffer({ price }).error, 'PRET_INVALID', String(price));
  assert.strictEqual(R.parseOffer({ price: 10, message: 'ma gasesti la 0722123456' }).error, 'FARA_CONTACT_IN_OFERTA');
  assert.strictEqual(R.parseOffer({ price: 10, message: 'x'.repeat(2001) }).error, 'MESAJ_PREA_LUNG');
});

test('rutele din AutoParts există și cele private cer cont', () => {
  const need = ['GET /', 'GET /mine', 'GET /summary', 'GET /mine/:id(\\d+)', 'GET /:id(\\d+)', 'POST /:id(\\d+)/mark', 'DELETE /:id(\\d+)/mark', 'POST /:id(\\d+)/reactivate', 'PATCH /:id(\\d+)', 'POST /', 'POST /:id(\\d+)/offers', 'POST /image'];
  const all = Object.keys(routes).map((k) => k.replace(/^R\d+ /, ''));
  for (const n of need) assert.ok(all.includes(n), 'lipsește ' + n);
  for (const n of ['GET /offers-mine'.replace('offers-mine', 'received'), 'GET /mine', 'POST /:id(\\d+)/accept', 'POST /:id(\\d+)/reject', 'PATCH /:id(\\d+)/status', 'POST /:id(\\d+)/answer']) assert.ok(all.includes(n), 'lipsește ' + n);
  const priv = Object.entries(routes).filter(([k]) => /\/(mine|summary|received|accept|reject|status|answer)/.test(k) || /(POST|PATCH|DELETE) \/(:id.*)?$/.test(k.replace(/^R\d+ /, '')));
  for (const [k, v] of priv) assert.ok(v.mids >= 1, 'fără verificare de cont: ' + k);
});

test('lista publică nu cere cont și filtrează după stare', async () => {
  const h = routes[Object.keys(routes).find((k) => / GET \/$/.test(k) && routes[k])].handler;
  script = (s) => (/FROM rq_requests r\s+LEFT JOIN rq_offers mo/.test(s) && /ORDER BY r\.created_at DESC/.test(s) ? { rows: [{ id: 1, title: 'Far' }], rowCount: 1 } : { rows: [{ new: 3, all: 5, offered: 1, later: 0, ignored: 0 }], rowCount: 1 });
  let out; const res = { set() { return this; }, status() { return this; }, json(j) { out = j; return this; } };
  await h({ query: { seen: 'offered', q: '50%_x' }, user: null }, res);
  assert.strictEqual(out.requests.length, 1); assert.strictEqual(out.counts, null);
  const q = queries.find((x) => /ORDER BY r\.created_at DESC/.test(x.s));
  assert.match(q.s, /mo\.id IS NOT NULL/); assert.ok(q.p.includes('%50  x%'), 'caracterele LIKE sunt neutralizate');
});

test('blocare: ofertă și întrebare refuzate între utilizatori blocați (în ambele sensuri)', async () => {
  const key = (re) => Object.keys(routes).find((k) => re.test(k));
  const offer = routes[key(/POST \/:id\(\\d\+\)\/offers$/)].handler, ask = routes[key(/POST \/:id\(\\d\+\)\/questions$/)].handler;
  const res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (j) => { o.body = j; return o; }; o.set = () => o; return o; };
  const run = async (h, block, body) => {
    script = (s) => /FROM user_blocks/.test(s) ? { rows: [block] }
      : /FROM rq_requests WHERE id/.test(s) ? { rows: [{ id: 1, user_id: 7, title: 'Far' }], rowCount: 1 }
      : /FROM rq_offers o JOIN rq_requests/.test(s) ? { rows: [{ id: 1, seller_id: 7, buyer_id: 5, title: 'Far' }], rowCount: 1 }
      : /INSERT INTO rq_(offers|questions)/.test(s) ? { rows: [{ id: 9 }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
    const r = res(); await h({ params: { id: '1' }, body, user: { id: 5 } }, r); return r;
  };
  let r = await run(offer, { by_me: 1, by_them: 0 }, { price: 10 }); assert.deepStrictEqual([r.code, r.body.error], [403, 'RQ_BLOCAT_DE_TINE']);
  r = await run(offer, { by_me: 0, by_them: 1 }, { price: 10 }); assert.deepStrictEqual([r.code, r.body.error], [403, 'RQ_BLOCAT']);
  r = await run(offer, { by_me: 0, by_them: 0 }, { price: 10 }); assert.notStrictEqual(r.code, 403);
  r = await run(ask, { by_me: 1, by_them: 0 }, { body: 'Are garanție?' }); assert.deepStrictEqual([r.code, r.body.error], [403, 'RQ_BLOCAT_DE_TINE']);
  r = await run(ask, { by_me: 0, by_them: 1 }, { body: 'Are garanție?' }); assert.deepStrictEqual([r.code, r.body.error], [403, 'RQ_BLOCAT']);
});

test('blocare: lista ascunde cererile blocate, ofertele vânzătorilor blocați nu se numără', async () => {
  const h = routes[Object.keys(routes).find((k) => / GET \/$/.test(k))].handler;
  script = () => ({ rows: [], rowCount: 0 });
  const o = { set() { return this; }, json() { return this; } }; queries = [];
  await h({ query: {}, user: { id: 5 } }, o);
  const list = queries.find((x) => /ORDER BY r\.created_at DESC/.test(x.s));
  assert.match(list.s, /b\.blocker_id = \$1::int AND b\.blocked_id = r\.user_id\) OR \(b\.blocker_id = r\.user_id AND b\.blocked_id = \$1::int/);
  assert.match(list.s, /b\.blocker_id = \$1::int AND b\.blocked_id = o\.seller_id/);
  const src = fs.readFileSync(path.join(__dirname, 'requests.js'), 'utf8');
  assert.ok((src.match(/OFFER_NOT_BLOCKED\('o'/g) || []).length >= 8, 'ofertele blocate trebuie excluse peste tot');
});

test('raportare: rute private pe cerere și pe ofertă, cu motiv valid', async () => {
  const rq = routes['R0 POST /:id(\\d+)/report'], of = routes['R1 POST /:id(\\d+)/report'];
  assert.ok(rq && of, 'lipsesc rutele de raportare'); assert.ok(rq.mids >= 1 && of.mids >= 1, 'cer cont');
  const res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (j) => { o.body = j; return o; }; return o; };
  const r = res(); await rq.handler({ params: { id: '1' }, body: { reason: 'nu-exista' }, user: { id: 5 } }, r);
  assert.deepStrictEqual([r.code, r.body.error], [400, 'RQ_RAPORT_MOTIV']);
  assert.deepStrictEqual(R.REASONS, ['inselatorie', 'contact', 'interzis', 'spam', 'duplicat', 'altul']);
});

test('raportare: nu-ți raportezi propria cerere; ofertele le raportează doar cumpărătorul; duplicatul nu se mai inserează', async () => {
  const rq = routes['R0 POST /:id(\\d+)/report'].handler, of = routes['R1 POST /:id(\\d+)/report'].handler;
  const res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (j) => { o.body = j; return o; }; return o; };
  const base = (extra) => (s) => (extra && extra(s)) || { rows: [], rowCount: 0 };
  script = base((s) => /FROM rq_requests r WHERE r\.id/.test(s) ? { rows: [{ request_id: 1, offer_id: null, owner_id: 5, title: 'Far', status: 'open' }], rowCount: 1 } : null);
  let r = res(); await rq({ params: { id: '1' }, body: { reason: 'spam' }, user: { id: 5 } }, r); assert.deepStrictEqual([r.code, r.body.error], [400, 'RQ_REPORT_PROPRIU']);
  script = base((s) => /FROM rq_offers o JOIN rq_requests q/.test(s) ? { rows: [{ request_id: 1, offer_id: 3, owner_id: 8, title: 'Far', status: 'open', buyer_id: 9 }], rowCount: 1 } : null);
  r = res(); await of({ params: { id: '3' }, body: { reason: 'spam' }, user: { id: 5 } }, r); assert.deepStrictEqual([r.code, r.body.error], [403, 'INTERZIS']);
  // duplicat: există deja o raportare deschisă -> 201, dar fără INSERT
  script = base((s) => /FROM rq_requests r WHERE r\.id/.test(s) ? { rows: [{ request_id: 1, offer_id: null, owner_id: 7, title: 'Far', status: 'open' }], rowCount: 1 } : /FROM rq_reports WHERE kind/.test(s) ? { rows: [{ '?column?': 1 }], rowCount: 1 } : null); queries = [];
  r = res(); await rq({ params: { id: '1' }, body: { reason: 'spam' }, user: { id: 5 } }, r); assert.strictEqual(r.code, 201);
  assert.ok(!queries.some((q) => /INSERT INTO rq_reports/.test(q.s)));
});

test('raportare: a treia raportare de la utilizatori diferiți închide cererea și anunță proprietarul', async () => {
  const rq = routes['R0 POST /:id(\\d+)/report'].handler, res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (j) => { o.body = j; return o; }; return o; };
  const mk = (n) => (s) => /FROM rq_requests r WHERE r\.id/.test(s) ? { rows: [{ request_id: 1, offer_id: null, owner_id: 7, title: 'Far', status: 'open' }], rowCount: 1 }
    : /COUNT\(DISTINCT reporter_id\)/.test(s) ? { rows: [{ n }], rowCount: 1 }
    : /UPDATE rq_requests SET status = 'closed'/.test(s) ? { rows: [{ user_id: 7 }], rowCount: 1 } : { rows: [], rowCount: 0 };
  script = mk(2); queries = []; notes.length = 0; let r = res();
  await rq({ params: { id: '1' }, body: { reason: 'inselatorie', details: 'x' }, user: { id: 5 } }, r);
  assert.strictEqual(r.code, 201); assert.ok(queries.some((q) => /INSERT INTO rq_reports/.test(q.s))); assert.ok(!queries.some((q) => /UPDATE rq_requests SET status = 'closed'/.test(q.s)), 'sub prag nu se închide');
  script = mk(3); queries = []; r = res();
  await rq({ params: { id: '1' }, body: { reason: 'inselatorie' }, user: { id: 5 } }, r);
  assert.ok(queries.some((q) => /UPDATE rq_requests SET status = 'closed'/.test(q.s)), 'la 3 se închide');
  const n = notes.find((x) => x[1] === 'rfq_mod'); assert.ok(n && n[0] === 7);
});

test('reactivarea e refuzată cât timp cererea are raportări deschise', async () => {
  const h = routes['R0 POST /:id(\\d+)/reactivate'].handler, o = { code: 200, status(c) { this.code = c; return this; }, json(j) { this.body = j; return this; } };
  script = (s) => (/FROM rq_reports WHERE request_id/.test(s) ? { rows: [{ x: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 });
  await h({ params: { id: '1' }, user: { id: 5 } }, o); assert.deepStrictEqual([o.code, o.body.error], [409, 'CERERE_RAPORTATA']);
});

test('interfața apelează doar rute care există în backend', () => {
  const ui = fs.readFileSync(path.join(__dirname, 'requests-ui.js'), 'utf8');
  const all = Object.keys(routes).map((k) => k.replace(/^R\d+ /, ''));
  const base = { '/api/requests': 'GET /', '/api/offers': 'GET /mine', '/api/orders': 'GET /', '/api/offer-questions': 'GET /' };
  const used = [...ui.matchAll(/api\((?:"|`)(\/api\/[a-z-]+)([^"`]*)/g)].map((m) => m[1]);
  assert.ok(used.length >= 15);
  for (const u of new Set(used)) assert.ok(base[u], 'prefix necunoscut: ' + u);
  for (const p of ['/api/requests/summary', '/api/requests/mine', '/api/offers/received', '/api/offers/mine', '/api/offer-questions']) assert.ok(ui.includes(p), p);
  assert.ok(all.includes('GET /'), 'listă');
});

test('integrare: cârligele din script.js și rutele paginii există', () => {
  const ui = fs.readFileSync(path.join(__dirname, 'requests-ui.js'), 'utf8');
  for (const f of ['openRequests', 'rfqSummaryRefresh', 'rfqRefresh', 'rfqMsg']) assert.match(ui, new RegExp('window\\.' + f + ' ='), f);
  for (const r of ['"/cereri"', '"/cerere-noua"', '"/cererile-mele"', '"/oferte-primite"', '"/ofertele-mele"']) assert.ok(ui.includes(r), r);
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  for (const m of ['/api/requests', '/api/offers', '/api/offer-questions', '/api/orders']) assert.ok(app.includes(`'${m}'`), 'nemontat: ' + m);
});

test('migrarea 039 creează tabelele rq_* fără să atingă cele vechi', () => {
  const sql = fs.readFileSync(path.join(__dirname, '039_rfq_autoparts.sql'), 'utf8');
  for (const t of ['rq_requests', 'rq_offers', 'rq_marks', 'rq_orders', 'rq_questions', 'rq_images']) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${t} `), t);
  assert.ok(!/DROP TABLE|ALTER TABLE (part_requests|quotes|dealers)/i.test(sql));
});
