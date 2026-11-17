/* Cereri / oferte piese (model AutoParts): validări + rute + legătura UI ↔ backend. Fără rețea și fără bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const orig = Module._load; const routes = {}; const mails = []; const notes = []; let queries = [], script = () => ({ rows: [], rowCount: 0 });
Module._load = function (req, ...a) {
  if (req === 'express') {
    const mk = (name) => { const o = { name }; ['use'].forEach((m) => (o[m] = () => o));
      ['get', 'post', 'put', 'patch', 'delete'].forEach((m) => (o[m] = (p, ...h) => { routes[`${name} ${m.toUpperCase()} ${p}`] = { handler: h[h.length - 1], mids: h.slice(0, -1).length }; return o; })); return o; };
    let n = 0; const ex = () => ({}); ex.Router = () => mk('R' + n++); ex.raw = () => () => {}; return ex;
  }
  if (req === './db') return { hasDb: () => true, pool: { connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release() {} }) }, query: async (s, p) => { queries.push({ s, p }); return script(s, p); } };
  if (req === './config') return { APP_URL: 'http://x' };
  if (req === './mail') return { MAIL_READY: true, sendMail: async (...x) => { mails.push(x); return true; }, baseUrl: () => 'http://x' };
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
require('./rfq-notify').clock.now = () => new Date('2026-11-17T10:00:00Z');   // 12:00 în România: emailurile pleacă imediat (nu e interval de liniște)

const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));
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

const resp = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (j) => { o.body = j; return o; }; o.set = () => o; return o; };
const H = (key) => routes[key].handler;
const user = (extra) => ({ rows: [{ email: 'x@y.ro', nickname: 'ion', ...extra }], rowCount: 1 });

test('comenzi/contact/preferință: rutele noi există și cer cont', () => {
  for (const k of ['R3 GET /', 'R3 PATCH /:id(\\d+)/status', 'R3 PATCH /:id(\\d+)/details', 'R3 PUT /:id(\\d+)/rating', 'R0 GET /:id(\\d+)/contact', 'R0 PUT /email-pref']) {
    assert.ok(routes[k], 'lipsește ' + k); assert.ok(routes[k].mids >= 1, 'fără cont: ' + k);
  }
});

test('comandă: cumpărătorul poate doar anula una nouă sau confirma primirea după expediere', async () => {
  const run = async (status, who, body) => {
    script = (s) => (/FROM rq_orders WHERE id/.test(s) ? { rows: [{ id: 1, buyer_id: 5, seller_id: 8, status, title: 'Far' }], rowCount: 1 } : { rows: [{ id: 1 }], rowCount: 1 });
    const r = resp(); await H('R3 PATCH /:id(\\d+)/status')({ params: { id: '1' }, body, user: { id: who } }, r); return r;
  };
  let r = await run('new', 5, { status: 'confirmed' }); assert.deepStrictEqual([r.code, r.body.error], [403, 'INTERZIS']);
  r = await run('new', 5, { status: 'shipped' }); assert.strictEqual(r.code, 403);
  r = await run('confirmed', 5, { status: 'cancelled' }); assert.strictEqual(r.code, 403, 'cumpărătorul nu anulează după confirmare');
  r = await run('new', 5, { status: 'done' }); assert.strictEqual(r.code, 403, 'nu poate finaliza înainte de expediere');
  r = await run('new', 5, { status: 'cancelled' }); assert.strictEqual(r.body.ok, true);
  r = await run('shipped', 5, { status: 'done' }); assert.strictEqual(r.body.ok, true);
  r = await run('new', 99, { status: 'cancelled' }); assert.deepStrictEqual([r.code, r.body.error], [404, 'NEGASIT']);
  r = await run('done', 8, { status: 'cancelled', reason: 'ok ok' }); assert.deepStrictEqual([r.code, r.body.error], [409, 'COMANDA_INCHEIATA']);
  r = await run('new', 8, { status: 'new' }); assert.strictEqual(r.body.error, 'STATUS_INVALID');
});

test('comandă: vânzătorul suspendă/anulează doar cu motiv (fără linkuri); tranziții invalide refuzate', async () => {
  const run = async (status, body) => {
    script = (s) => (/FROM rq_orders WHERE id/.test(s) ? { rows: [{ id: 1, buyer_id: 5, seller_id: 8, status, title: 'Far' }], rowCount: 1 } : { rows: [{ id: 1 }], rowCount: 1 });
    const r = resp(); await H('R3 PATCH /:id(\\d+)/status')({ params: { id: '1' }, body, user: { id: 8 } }, r); return r;
  };
  let r = await run('new', { status: 'suspended' }); assert.deepStrictEqual([r.code, r.body.error], [400, 'MOTIV_OBLIGATORIU']);
  r = await run('new', { status: 'cancelled', reason: 'ab' }); assert.strictEqual(r.body.error, 'MOTIV_OBLIGATORIU');
  r = await run('new', { status: 'suspended', reason: 'vezi https://x.ro' }); assert.deepStrictEqual([r.code, r.body.error], [400, 'LINK_INTERZIS']);
  r = await run('shipped', { status: 'confirmed' }); assert.deepStrictEqual([r.code, r.body.error], [409, 'STATUS_INVALID']);
  r = await run('suspended', { status: 'suspended', reason: 'din nou' }); assert.strictEqual(r.body.error, 'STATUS_INVALID');
  r = await run('new', { status: 'suspended', reason: 'Piesa nu mai e pe stoc' }); assert.strictEqual(r.body.ok, true);
  r = await run('suspended', { status: 'shipped' }); assert.strictEqual(r.body.ok, true, 'din suspendată se poate relua');
});

test('comandă: cealaltă parte primește notificare în aplicație ȘI email, cu motivul', async () => {
  script = (s) => (/FROM rq_orders WHERE id/.test(s) ? { rows: [{ id: 1, buyer_id: 5, seller_id: 8, status: 'new', title: 'Far' }], rowCount: 1 } : /FROM users WHERE id/.test(s) ? user() : { rows: [{ id: 1 }], rowCount: 1 });
  notes.length = 0; mails.length = 0;
  await H('R3 PATCH /:id(\\d+)/status')({ params: { id: '1' }, body: { status: 'suspended', reason: 'Aștept piesa' }, user: { id: 8 } }, resp()); await tick();
  const n = notes.find((x) => x[0] === 5); assert.ok(n, 'în aplicație'); assert.match(n[3], /suspendată: Far/); assert.match(n[4], /Aștept piesa/);
  assert.strictEqual(mails.length, 1, 'și pe email'); assert.strictEqual(mails[0][0], 'x@y.ro'); assert.match(mails[0][1], /suspendată/); assert.match(mails[0][2], /http:\/\/x\/comenzi-piese/);
});

test('AWB și notă: doar vânzătorul; AWB valid; cumpărătorul e anunțat (aplicație + email) la un AWB nou', async () => {
  const run = async (body, row = { id: 1, buyer_id: 5, title: 'Far', awb: null }) => { script = (s) => (/FROM rq_orders WHERE id/.test(s) ? { rows: row ? [row] : [], rowCount: row ? 1 : 0 } : /FROM users WHERE id/.test(s) ? user() : { rows: [], rowCount: 1 }); const r = resp(); await H('R3 PATCH /:id(\\d+)/details')({ params: { id: '1' }, body, user: { id: 8 } }, r); return r; };
  let r = await run({ awb: 'X' }, null); assert.deepStrictEqual([r.code, r.body.error], [404, 'NEGASIT']);
  r = await run({ awb: 'a$b$c' }); assert.strictEqual(r.body.error, 'AWB_INVALID');
  r = await run({}); assert.strictEqual(r.body.error, 'NIMIC_DE_SALVAT');
  notes.length = 0; mails.length = 0; queries = [];
  r = await run({ awb: 'AWB 123 456', seller_note: 'predat curier' }); assert.strictEqual(r.body.ok, true);
  assert.ok(queries.some((q) => /SET awb = \$2, seller_note = \$3/.test(q.s) && q.p[1] === 'AWB123456'), 'spațiile se scot din AWB'); await tick();
  assert.ok(notes.some((x) => x[0] === 5 && /AWB: AWB123456/.test(x[3]))); assert.strictEqual(mails.length, 1);
  notes.length = 0; mails.length = 0;
  await run({ awb: 'AWB123456' }, { id: 1, buyer_id: 5, title: 'Far', awb: 'AWB123456' }); await tick();
  assert.strictEqual(notes.length, 0, 'același AWB nu anunță din nou');
});

test('calificativ: doar după comandă finalizată, 1-5 stele, fără linkuri; salvat în reviews cu rolul corect', async () => {
  const run = async (who, body, status = 'done') => {
    script = (s) => (/FROM rq_orders WHERE id/.test(s) ? { rows: [{ id: 1, buyer_id: 5, seller_id: 8, status, title: 'Far' }], rowCount: 1 } : /INSERT INTO reviews/.test(s) ? { rows: [{ created: true }], rowCount: 1 } : user());
    queries = []; const r = resp(); await H('R3 PUT /:id(\\d+)/rating')({ params: { id: '1' }, body, user: { id: who } }, r); return r;
  };
  let r = await run(5, { stars: 0 }); assert.deepStrictEqual([r.code, r.body.error], [400, 'CALIFICATIV_INVALID']);
  r = await run(5, { stars: 3.5 }); assert.strictEqual(r.body.error, 'CALIFICATIV_INVALID');
  r = await run(5, { stars: 5, comment: 'vezi www.x.ro' }); assert.strictEqual(r.body.error, 'LINK_INTERZIS');
  r = await run(5, { stars: 5 }, 'shipped'); assert.deepStrictEqual([r.code, r.body.error], [409, 'COMANDA_NEFINALIZATA']);
  r = await run(99, { stars: 5 }); assert.strictEqual(r.code, 404);
  notes.length = 0; mails.length = 0;
  r = await run(5, { stars: 5, comment: 'Super' }); assert.strictEqual(r.body.ok, true);
  let q = queries.find((x) => /INSERT INTO reviews/.test(x.s)); assert.deepStrictEqual(q.p, [8, 5, 5, 'Super', 'seller', 1], 'cumpărătorul îl califică pe vânzător');
  assert.match(q.s, /ON CONFLICT \(reviewer_id, order_id\) WHERE order_id IS NOT NULL DO UPDATE/); await tick();
  assert.ok(notes.some((x) => x[0] === 8 && x[1] === 'review' && /5 stele/.test(x[3]))); assert.strictEqual(mails.length, 1, 'și email');
  r = await run(8, { stars: 1 }); q = queries.find((x) => /INSERT INTO reviews/.test(x.s)); assert.deepStrictEqual([q.p[0], q.p[1], q.p[4]], [5, 8, 'buyer'], 'vânzătorul îl califică pe cumpărător');
});

test('calificativ modificat (nu nou) nu mai trimite notificare', async () => {
  script = (s) => (/FROM rq_orders WHERE id/.test(s) ? { rows: [{ id: 1, buyer_id: 5, seller_id: 8, status: 'done', title: 'Far' }], rowCount: 1 } : /INSERT INTO reviews/.test(s) ? { rows: [{ created: false }], rowCount: 1 } : user());
  notes.length = 0; mails.length = 0;
  const r = resp(); await H('R3 PUT /:id(\\d+)/rating')({ params: { id: '1' }, body: { stars: 4 }, user: { id: 5 } }, r); await tick();
  assert.strictEqual(r.body.ok, true); assert.strictEqual(notes.length, 0); assert.strictEqual(mails.length, 0);
});

test('lista de comenzi: citește întâi, marchează „văzut” după (insigna ajunge la cumpărător)', async () => {
  script = () => ({ rows: [{ id: 1, title: 'Far', i_buy: true, unseen: true, phone: '0722111222', whatsapp: true, extra_phones: [{ phone: '0733', wa: false }, { nope: 1 }] }], rowCount: 1 });
  queries = []; const r = resp(); await H('R3 GET /')({ query: { seen: 'buyer' }, user: { id: 5 } }, r);
  const iSel = queries.findIndex((q) => /FROM rq_orders s/.test(q.s)), iUpd = queries.findIndex((q) => /SET buyer_seen_status = status/.test(q.s));
  assert.ok(iSel >= 0 && iUpd > iSel, 'SELECT înainte de UPDATE');
  assert.deepStrictEqual(r.body.orders[0].phones, [{ phone: '0722111222', whatsapp: true }, { phone: '0733', whatsapp: false }]);
  assert.ok(!('extra_phones' in r.body.orders[0]) && !('phone' in r.body.orders[0]), 'câmpurile brute nu ies');
  queries = []; await H('R3 GET /')({ query: {}, user: { id: 5 } }, resp()); assert.ok(!queries.some((q) => /SET buyer_seen_status/.test(q.s)), 'fără ?seen nu se marchează');
});

test('contact pe cerere: doar pentru cereri deschise ale altora, nu între blocați, telefon doar dacă e făcut vizibil', async () => {
  const run = async (o) => {
    script = (s) => (/FROM rq_requests WHERE id/.test(s) ? (o.closed ? { rows: [], rowCount: 0 } : { rows: [{ user_id: o.owner || 7 }], rowCount: 1 })
      : /FROM user_blocks/.test(s) ? { rows: [o.block || { by_me: 0, by_them: 0 }] }
      : /FROM users WHERE id/.test(s) ? { rows: [{ phone: '0722111222', whatsapp: true, extra_phones: [{ phone: '0733000111', wa: true }], show_phone: !!o.show }], rowCount: 1 } : { rows: [], rowCount: 0 });
    const r = resp(); await H('R0 GET /:id(\\d+)/contact')({ params: { id: '1' }, user: { id: 5 } }, r); return r;
  };
  let r = await run({ closed: true }); assert.deepStrictEqual([r.code, r.body.error], [404, 'NEGASIT']);
  r = await run({ owner: 5 }); assert.deepStrictEqual([r.code, r.body.error], [400, 'CERERE_PROPRIE']);
  r = await run({ block: { by_me: 1, by_them: 0 } }); assert.deepStrictEqual([r.code, r.body.error], [403, 'RQ_BLOCAT_DE_TINE']);
  r = await run({ block: { by_me: 0, by_them: 1 } }); assert.deepStrictEqual([r.code, r.body.error], [403, 'RQ_BLOCAT']);
  r = await run({ show: false }); assert.deepStrictEqual(r.body, { phones: [], shown: false });
  r = await run({ show: true }); assert.deepStrictEqual(r.body.phones, [{ phone: '0722111222', whatsapp: true }, { phone: '0733000111', whatsapp: true }]);
});

test('preferința de email se salvează; rezumatul expune comenzile actualizate și bifa', async () => {
  queries = []; let r = resp(); await H('R0 PUT /email-pref')({ body: { on: false }, user: { id: 5 } }, r);
  assert.strictEqual(r.body.ok, true); let q = queries.find((x) => /UPDATE users SET rfq_email/.test(x.s)); assert.deepStrictEqual(q.p, [false, 5]);
  queries = []; await H('R0 PUT /email-pref')({ body: {}, user: { id: 5 } }, resp()); assert.deepStrictEqual(queries.find((x) => /rfq_email/.test(x.s)).p, [true, 5], 'implicit activ');
  script = () => ({ rows: [{}], rowCount: 1 }); queries = []; await H('R0 GET /summary')({ user: { id: 5 } }, resp());
  const sum = queries.find((x) => /AS open_questions/.test(x.s)); assert.match(sum.s, /buyer_seen_status IS DISTINCT FROM s\.status\) AS order_updates/); assert.match(sum.s, /rfq_email FROM users WHERE id = \$1\) AS email_on/);
});

test('cerere nouă: emailuri plafonate (max. pe zi la același vânzător), notificarea în aplicație pleacă mereu', async () => {
  script = (s) => (/INSERT INTO rq_requests/.test(s) ? { rows: [{ id: 5 }], rowCount: 1 }
    : /FROM listings l JOIN users u/.test(s) ? { rows: [{ user_id: 11 }, { user_id: 12 }, { user_id: 13 }], rowCount: 3 }
    : /FROM notifications WHERE kind = 'rfq_new'/.test(s) ? { rows: [{ user_id: 11, n: 10 }] }
    : /FROM users WHERE id/.test(s) ? user() : { rows: [], rowCount: 0 });
  notes.length = 0; mails.length = 0;
  const r = resp(); await H('R0 POST /')({ body: { ...good }, user: { id: 5 } }, r); await tick(40);
  assert.strictEqual(r.code, 201);
  assert.deepStrictEqual(notes.filter((x) => x[1] === 'rfq_new').map((x) => x[0]), [11, 12, 13], 'toți primesc notificare în aplicație');
  assert.strictEqual(mails.length, 2, 'vânzătorul care a atins plafonul zilnic (10) nu mai primește email'); assert.match(mails[0][1], /Cerere nouă: Far stânga Audi A4 2012/);
});

test('anunț atașat la ofertă: validare (absent = neatins, null = scos, id invalid refuzat)', () => {
  assert.ok(!('listing_id' in R.parseOffer({ price: 10 }).v), 'fără cheie nu se atinge');
  assert.strictEqual(R.parseOffer({ price: 10, listing_id: null }).v.listing_id, null);
  assert.strictEqual(R.parseOffer({ price: 10, listing_id: '' }).v.listing_id, null);
  assert.strictEqual(R.parseOffer({ price: 10, listing_id: '33' }).v.listing_id, 33);
  for (const bad of ['abc', -1, 0, 1.5, '12x']) assert.strictEqual(R.parseOffer({ price: 10, listing_id: bad }).error, 'ANUNT_INVALID', String(bad));
});

test('anunț atașat: doar anunțuri publicate ale vânzătorului, la creare și la modificare', async () => {
  const offer = H('R0 POST /:id(\\d+)/offers'), patch = H('R1 PATCH /:id(\\d+)');
  const mk = (owned) => (s) => /FROM rq_requests WHERE id/.test(s) ? { rows: [{ id: 1, user_id: 7, title: 'Far' }], rowCount: 1 }
    : /FROM listings l WHERE l\.id = \$1 AND l\.user_id = \$2 AND l\.status = 'approved' AND \(l\.expires_at IS NULL OR l\.expires_at > NOW\(\)\)/.test(s) ? { rows: owned ? [{ '?column?': 1 }] : [], rowCount: owned ? 1 : 0 }
    : /INSERT INTO rq_offers/.test(s) ? { rows: [{ id: 9 }], rowCount: 1 }
    : /UPDATE rq_offers o SET/.test(s) ? { rows: [{ id: 9, buyer_id: 7, title: 'Far' }], rowCount: 1 }
    : { rows: [], rowCount: 0 };
  script = mk(false); queries = []; let r = resp();
  await offer({ params: { id: '1' }, body: { price: 10, listing_id: 33 }, user: { id: 5 } }, r); assert.deepStrictEqual([r.code, r.body.error], [400, 'ANUNT_INVALID']); assert.ok(!queries.some((q) => /INSERT INTO rq_offers/.test(q.s)));
  script = mk(true); queries = []; r = resp();
  await offer({ params: { id: '1' }, body: { price: 10, listing_id: 33 }, user: { id: 5 } }, r); assert.strictEqual(r.code, 201);
  assert.deepStrictEqual(queries.find((q) => /INSERT INTO rq_offers/.test(q.s)).p.slice(-1), [33]);
  queries = []; r = resp(); await offer({ params: { id: '1' }, body: { price: 10 }, user: { id: 5 } }, r);
  assert.deepStrictEqual(queries.find((q) => /INSERT INTO rq_offers/.test(q.s)).p.slice(-1), [null], 'fără anunț -> NULL');
  // modificare: neatins / scos / schimbat
  const upd = async (body, owned = true) => { script = mk(owned); queries = []; const rr = resp(); await patch({ params: { id: '9' }, body, user: { id: 5 } }, rr); return [rr, queries.find((q) => /UPDATE rq_offers o SET/.test(q.s))]; };
  let [rr, q] = await upd({ price: 20 }); assert.strictEqual(rr.body.ok, true); assert.deepStrictEqual(q.p.slice(-2), [false, null], 'neatins');
  [rr, q] = await upd({ price: 20, listing_id: null }); assert.deepStrictEqual(q.p.slice(-2), [true, null], 'scos');
  [rr, q] = await upd({ price: 20, listing_id: 44 }); assert.deepStrictEqual(q.p.slice(-2), [true, 44], 'schimbat');
  [rr, q] = await upd({ price: 20, listing_id: 44 }, false); assert.deepStrictEqual([rr.code, rr.body.error], [400, 'ANUNT_INVALID']); assert.strictEqual(q, undefined, 'nu se scrie nimic');
});

test('anunțul atașat se întoarce pe oferta primită, oferta mea, ofertele mele și comandă (doar dacă e încă public)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'requests.js'), 'utf8');
  assert.ok((src.match(/\$\{LISTING_JSON\('o'\)\} AS listing/g) || []).length >= 4, 'în toate cele 4 locuri');
  const sql = R.LISTING_JSON('o'); assert.match(sql, /l\.id = o\.listing_id AND \(l\.status = 'sold' OR \(l\.status = 'approved' AND \(l\.expires_at IS NULL OR l\.expires_at > NOW\(\)\)\)\)/, 'anunțurile expirate nu se mai arată'); assert.match(sql, /FROM listing_images i WHERE i\.listing_id = l\.id/);
  const mig = fs.readFileSync(path.join(__dirname, '044_offer_listing.sql'), 'utf8'); assert.match(mig, /ADD COLUMN IF NOT EXISTS listing_id INTEGER REFERENCES listings\(id\) ON DELETE SET NULL/);
});

test('cerere nouă: sunt anunțați doar vânzătorii de piese (categoria piese-auto), cu cuvintele potrivite, mai întâi cei care se potrivesc și la marcă și la piesă', async () => {
  script = (s) => (/INSERT INTO rq_requests/.test(s) ? { rows: [{ id: 5 }], rowCount: 1 } : { rows: [], rowCount: 0 });
  queries = []; const r = resp();
  await H('R0 POST /')({ body: { ...good, make: '50%_Audi', title: 'Alternator Bosch pentru stânga', extra_parts: [{ title: 'Bujii incandescente', details: '' }, { title: 'Far', details: '' }] }, user: { id: 5 } }, r); await tick(30);
  const q = queries.find((x) => /FROM listings l JOIN users u/.test(x.s)); assert.ok(q, 'căutarea vânzătorilor a rulat');
  assert.match(q.s, /JOIN categories c ON c\.id = l\.category_id/); assert.match(q.s, /c\.slug = 'piese-auto'/); assert.match(q.s, /l\.status = 'approved' AND \(l\.expires_at IS NULL OR l\.expires_at > NOW\(\)\) AND u\.status = 'active' AND l\.user_id <> \$1/); assert.match(q.s, /COALESCE\(l\.attributes->>'marca_auto', ''\) ILIKE \$2/, 'și după atributul Marca mașinii');
  assert.match(q.s, /ORDER BY MAX\(CASE WHEN .* THEN 2 ELSE 1 END\) DESC/s);
  assert.strictEqual(q.p[0], 5); assert.strictEqual(q.p[1], '%50  Audi%', 'caracterele LIKE din marcă sunt neutralizate');
  assert.deepStrictEqual(q.p[2], ['%alternator%', '%bosch%', '%bujii%', '%incandescente%'], 'fără cuvinte scurte (far) sau banale (pentru, stânga)');
  assert.strictEqual(q.p[3], 300);
});

test('cereri potrivite cu anunțurile mele: doar piese-auto publicate, fără cererile mele / ignorate / deja ofertate / blocate', async () => {
  assert.ok(routes['R0 GET /matching'] && routes['R0 GET /matching'].mids >= 1, 'cere cont');
  const row = (listing_id, id, extra) => ({ listing_id, listing_title: 'Far Audi A4 B8', id, title: 'Far', make: 'Audi', model: 'A4', year: '2012', county: 'Timiș', city: '', kind: 'ambele', created_at: new Date(), expires_at: new Date(), extra_n: 0, thumb: null, by_make: true, ...extra });
  script = () => ({ rows: [row(10, 1), row(11, 1), row(10, 2), row(11, 3, { by_make: false })], rowCount: 4 });
  queries = []; const r = resp(); await H('R0 GET /matching')({ query: { listing_id: '10' }, user: { id: 5 } }, r);
  const q = queries[0]; assert.match(q.s, /c\.slug = 'piese-auto'/); assert.match(q.s, /l\.user_id = \$1 AND l\.status = 'approved' AND \(l\.expires_at IS NULL OR l\.expires_at > NOW\(\)\) AND \(\$2::int IS NULL OR l\.id = \$2\)/); assert.match(q.s, /lower\(COALESCE\(l\.attributes->>'marca_auto', ''\)\)/, 'marca din atributul anunțului');
  assert.match(q.s, /r\.status = 'open' AND r\.expires_at > NOW\(\) AND r\.user_id <> \$1/); assert.match(q.s, /mk\.mark IS DISTINCT FROM 'ignored' AND mo\.id IS NULL/);
  assert.match(q.s, /b\.blocker_id = \$1::int AND b\.blocked_id = r\.user_id\) OR \(b\.blocker_id = r\.user_id/); assert.match(q.s, /w <> ALL\(\$3::text\[\]\)/);
  assert.strictEqual(q.p[0], 5); assert.strictEqual(q.p[1], 10); assert.ok(Array.isArray(q.p[2]) && q.p[2].includes('pentru') && q.p[2].includes('stanga'));
  assert.deepStrictEqual(r.body.by_listing, [{ listing_id: 10, count: 2 }, { listing_id: 11, count: 2 }]);
  assert.deepStrictEqual(r.body.requests.map((x) => x.id), [1, 2, 3], 'cererile sunt unice (cererea 1 se potrivește cu două anunțuri)');
  assert.strictEqual(r.body.requests[0].listing_id, 10, 'primul anunț potrivit rămâne');
  queries = []; await H('R0 GET /matching')({ query: { listing_id: 'abc' }, user: { id: 5 } }, resp()); assert.strictEqual(queries[0].p[1], null, 'listing_id invalid = toate anunțurile');
  queries = []; await H('R0 GET /matching')({ query: {}, user: { id: 5 } }, resp()); assert.strictEqual(queries[0].p[1], null);
});

test('integrare anunțuri: script.js are cârligele, detaliul anunțului expune categoria', () => {
  const sc = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
  assert.match(sc, /if \(window\.rfqMatchBadge && l\.status === "approved"\) rfqMatchBadge\(l, r\)/);
  assert.match(sc, /if \(window\.rfqListingCta\) rfqListingCta\(l, ob, true\)/); assert.match(sc, /if \(window\.rfqListingCta\) rfqListingCta\(l, act, false\)/);
  assert.match(fs.readFileSync(path.join(__dirname, 'listings.js'), 'utf8'), /category: l\.category, category_slug: l\.category_slug,/);
});

test('anunț atașat indisponibil: cumpărătorul e anunțat o singură dată, doar în aplicație', async () => {
  const x = (status, extra) => ({ buyer_id: 9, request_id: 4, request_title: 'Far', listing_title: 'Far Audi', listing_status: status, ...extra });
  script = () => ({ rows: [x('sold'), x('deleted'), x('blocked'), x('approved')], rowCount: 4 });   // „approved” aici = expirat (a ieșit din LIVE)
  queries = []; notes.length = 0; mails.length = 0;
  const n = await R.sweepListings(); await tick();
  assert.strictEqual(n, 4);
  const q = queries[0].s; assert.match(q, /UPDATE rq_offers o SET listing_notified = TRUE FROM listings l, rq_requests q/); assert.match(q, /o\.status = 'pending' AND q\.status = 'open' AND NOT o\.listing_notified/);
  assert.match(q, /NOT \(l\.status = 'approved' AND \(l\.expires_at IS NULL OR l\.expires_at > NOW\(\)\)\)/);
  assert.deepStrictEqual(notes.map((a) => a[0]), [9, 9, 9, 9]); assert.ok(notes.every((a) => a[1] === 'rfq_edit'));
  assert.match(notes[0][3], /Anunțul din oferta pentru „Far” a fost vândut/); assert.match(notes[1][3], /a fost șters/); assert.match(notes[2][3], /a fost blocat/); assert.match(notes[3][3], /a expirat/);
  assert.match(notes[0][4], /„Far Audi” nu mai e disponibil/); assert.strictEqual(mails.length, 0, 'fără email');
  script = () => ({ rows: [], rowCount: 0 }); notes.length = 0; assert.strictEqual(await R.sweepListings(), 0); assert.strictEqual(notes.length, 0);
});

test('schimbarea anunțului atașat resetează notificarea de indisponibilitate', async () => {
  script = (s) => (/FROM rq_requests WHERE id/.test(s) ? { rows: [], rowCount: 0 } : /FROM listings l WHERE/.test(s) ? { rows: [{ x: 1 }], rowCount: 1 } : { rows: [{ id: 9, buyer_id: 7, title: 'Far' }], rowCount: 1 });
  queries = []; await H('R1 PATCH /:id(\\d+)')({ params: { id: '9' }, body: { price: 20, listing_id: 44 }, user: { id: 5 } }, resp());
  assert.match(queries.find((q) => /UPDATE rq_offers o SET/.test(q.s)).s, /listing_notified = CASE WHEN \$6::boolean THEN FALSE ELSE o\.listing_notified END/);
});

test('migrarea 045 și programarea din server.js: anunț indisponibil, coadă de emailuri, atribute Marca/Model la piese', () => {
  const sql = fs.readFileSync(path.join(__dirname, '045_rfq_followups.sql'), 'utf8');
  assert.match(sql, /ALTER TABLE rq_offers ADD COLUMN IF NOT EXISTS listing_notified BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rfq_mail_queue/); assert.match(sql, /user_id INTEGER NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/); assert.match(sql, /sent_at TIMESTAMPTZ/);
  assert.match(sql, /'marca_auto', 'Marca mașinii', TRUE, 12/); assert.match(sql, /'model_auto', 'Model compatibil', FALSE, 13/); assert.match(sql, /c\.slug = 'piese-auto'/); assert.match(sql, /NOT EXISTS \(SELECT 1 FROM category_attributes/);
  assert.ok(!/DROP TABLE/i.test(sql));
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.match(srv, /\['sweep', \(\) => rq\.sweep\(\)\], \['listings', \(\) => rq\.sweepListings\(\)\], \['mail', \(\) => nf\.flushQueue\(\)\]/);
  assert.match(srv, /10 \* 60 \* 1000\)\.unref\(\)/);
});

test('interfața apelează doar rute care există în backend', () => {
  const ui = fs.readFileSync(path.join(__dirname, 'requests-ui.js'), 'utf8');
  const all = Object.keys(routes).map((k) => k.replace(/^R\d+ /, ''));
  const base = { '/api/requests': 'GET /', '/api/offers': 'GET /mine', '/api/orders': 'GET /', '/api/offer-questions': 'GET /' };
  const used = [...ui.matchAll(/api\((?:"|`)(\/api\/[a-z-]+)([^"`]*)/g)].map((m) => m[1]);
  assert.ok(used.length >= 15);
  for (const u of new Set(used)) assert.ok(base[u] || u === '/api/listings', 'prefix necunoscut: ' + u);
  // „Atașează un anunț” folosește ruta existentă din listings.js
  assert.match(fs.readFileSync(path.join(__dirname, 'listings.js'), 'utf8'), /router\.get\('\/mine', requireAuth/); assert.ok(ui.includes('/api/listings/mine'));
  for (const p of ['/api/requests/summary', '/api/requests/mine', '/api/offers/received', '/api/offers/mine', '/api/offer-questions']) assert.ok(ui.includes(p), p);
  assert.ok(all.includes('GET /'), 'listă');
});

test('integrare: cârligele din script.js și rutele paginii există', () => {
  const ui = fs.readFileSync(path.join(__dirname, 'requests-ui.js'), 'utf8');
  for (const f of ['openRequests', 'rfqSummaryRefresh', 'rfqRefresh', 'rfqMsg']) assert.match(ui, new RegExp('window\\.' + f + ' ='), f);
  for (const r of ['"/cereri"', '"/cerere-noua"', '"/cererile-mele"', '"/oferte-primite"', '"/ofertele-mele"']) assert.ok(ui.includes(r), r);
  assert.match(fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8'), /\(x\.new_quotes \|\| 0\) \+ \(x\.new_answers \|\| 0\) \+ \(x\.order_updates \|\| 0\)/, 'insigna din Cont include și comenzile actualizate');
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  for (const m of ['/api/requests', '/api/offers', '/api/offer-questions', '/api/orders']) assert.ok(app.includes(`'${m}'`), 'nemontat: ' + m);
});

test('migrarea 039 creează tabelele rq_* fără să atingă cele vechi', () => {
  const sql = fs.readFileSync(path.join(__dirname, '039_rfq_autoparts.sql'), 'utf8');
  for (const t of ['rq_requests', 'rq_offers', 'rq_marks', 'rq_orders', 'rq_questions', 'rq_images']) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${t} `), t);
  assert.ok(!/DROP TABLE|ALTER TABLE (part_requests|quotes|dealers)/i.test(sql));
});
