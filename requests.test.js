/* Cereri / oferte piese (model AutoParts): validări + rute + legătura UI ↔ backend. Fără rețea și fără bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const orig = Module._load; const routes = {}; let queries = [], script = () => ({ rows: [], rowCount: 0 });
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
  if (req === './notify') return { notify: async () => {} };
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
