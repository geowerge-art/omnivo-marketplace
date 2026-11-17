/* Moderarea cererilor de piese din admin: rute, motive obligatorii, drepturi admin/moderator, jurnal și notificări. Fără bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const orig = Module._load; const routes = {}; let queries = [], script = () => ({ rows: [], rowCount: 0 }); const notes = [], logs = [];
Module._load = function (req, ...a) {
  if (req === './db') return { query: async (s, p) => { queries.push({ s, p }); return script(s, p); } };
  if (req === './common') return { ah: (f) => f };
  if (req === './notify') return { notify: async (...x) => { notes.push(x); } };
  return orig.call(this, req, ...a);
};
const mount = require('./admin-requests');
Module._load = orig;
const router = {}; ['get', 'post', 'patch', 'delete'].forEach((m) => (router[m] = (p, ...h) => { routes[`${m.toUpperCase()} ${p}`] = { handler: h[h.length - 1], admin: h.length > 1 }; }));
const adminOnly = () => {}; mount(router, { adminOnly: adminOnly, log: async (...x) => { logs.push(x.slice(1)); } });
// `adminOnly` e înlocuit în rută: verificăm prin identitate
const rt = (k) => routes[k] || routes[Object.keys(routes).find((r) => r.startsWith(k))];
const res = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (j) => { o.body = j; return o; }; o.set = () => o; o.end = () => o; o.send = () => o; return o; };
const call = async (key, req) => { const r = res(); await rt(key).handler({ params: {}, query: {}, body: {}, user: { id: 1, role: 'moderator' }, ...req }, r); return r; };

test('rutele de moderare există; ștergerea cererii e doar pentru admin', () => {
  for (const k of ['GET /requests/img/', 'GET /requests', 'GET /requests/:id', 'PATCH /requests/:id', 'DELETE /requests/:id', 'GET /offers', 'POST /offers/:id', 'GET /rfq-orders', 'GET /rfq-overview']) assert.ok(rt(k), 'lipsește ' + k);
  assert.ok(rt('DELETE /requests/:id').admin, 'DELETE cerere trebuie protejat cu adminOnly');
  assert.ok(!rt('PATCH /requests/:id').admin && !rt('POST /offers/:id').admin, 'moderatorul poate închide și scoate oferte');
});

test('închiderea cere motiv, notifică cumpărătorul și intră în jurnal', async () => {
  let r = await call('PATCH /requests/:id', { params: { id: '5' }, body: { status: 'closed' } });
  assert.deepStrictEqual([r.code, r.body.error], [400, 'MOTIV_OBLIGATORIU']);
  r = await call('PATCH /requests/:id', { params: { id: '5' }, body: { status: 'zzz', reason: 'x' } });
  assert.strictEqual(r.body.error, 'STATUS_INVALID');
  script = (s) => (/FROM rq_requests WHERE id/.test(s) ? { rows: [{ id: 5, user_id: 9, title: 'Far', status: 'open' }], rowCount: 1 } : { rows: [], rowCount: 1 });
  r = await call('PATCH /requests/:id', { params: { id: '5' }, body: { status: 'closed', reason: 'Conține date de contact' } });
  assert.strictEqual(r.body.ok, true);
  assert.ok(queries.some((q) => /UPDATE rq_requests SET status = 'closed'/.test(q.s)));
  assert.deepStrictEqual(logs.at(-1).slice(0, 3), ['request_close', 'request', 5]);
  const n = notes.at(-1); assert.deepStrictEqual([n[0], n[1]], [9, 'rfq_mod']); assert.match(n[4], /date de contact/);
});

test('cererea rezolvată nu se poate modifica; redeschiderea pornește încă 7 zile', async () => {
  script = (s) => (/FROM rq_requests WHERE id/.test(s) ? { rows: [{ id: 5, user_id: 9, title: 'Far', status: 'matched' }], rowCount: 1 } : { rows: [], rowCount: 1 });
  let r = await call('PATCH /requests/:id', { params: { id: '5' }, body: { status: 'closed', reason: 'x' } });
  assert.deepStrictEqual([r.code, r.body.error], [409, 'CERERE_REZOLVATA']);
  script = (s) => (/FROM rq_requests WHERE id/.test(s) ? { rows: [{ id: 5, user_id: 9, title: 'Far', status: 'closed' }], rowCount: 1 } : { rows: [], rowCount: 1 }); queries = [];
  r = await call('PATCH /requests/:id', { params: { id: '5' }, body: { status: 'open' } });
  assert.strictEqual(r.body.ok, true); const up = queries.find((q) => /SET status = 'open'/.test(q.s)); assert.ok(up && up.p[1] === 7);
});

test('scoaterea unei oferte cere motiv și funcționează doar pe cele în așteptare', async () => {
  let r = await call('POST /offers/:id', { params: { id: '3' }, body: {} });
  assert.strictEqual(r.body.error, 'MOTIV_OBLIGATORIU');
  script = () => ({ rows: [], rowCount: 0 });
  r = await call('POST /offers/:id', { params: { id: '3' }, body: { reason: 'Înșelăciune' } });
  assert.deepStrictEqual([r.code, r.body.error], [409, 'OFERTA_NU_MAI_E_DISPONIBILA']);
  script = () => ({ rows: [{ seller_id: 8, title: 'Far', rid: 5, buyer_id: 9 }], rowCount: 1 }); queries = [];
  r = await call('POST /offers/:id', { params: { id: '3' }, body: { reason: 'Înșelăciune' } });
  assert.strictEqual(r.body.ok, true);
  assert.match(queries[0].s, /o\.status = 'pending'/);
  assert.deepStrictEqual(logs.at(-1).slice(0, 3), ['offer_remove', 'offer', 3]); assert.strictEqual(notes.at(-1)[0], 8);
});

test('ștergerea cererii: jurnal + notificare; lista filtrează și neutralizează LIKE', async () => {
  script = () => ({ rows: [{ user_id: 9, title: 'Far' }], rowCount: 1 });
  let r = await call('DELETE /requests/:id', { params: { id: '5' }, body: { reason: 'Spam' }, user: { id: 1, role: 'admin' } });
  assert.strictEqual(r.body.ok, true); assert.deepStrictEqual(logs.at(-1).slice(0, 3), ['request_delete', 'request', 5]);
  script = () => ({ rows: [], rowCount: 0 }); queries = [];
  await call('GET /requests', { query: { status: 'open', q: '50%_x', limit: '999', offset: '-4' } });
  const q = queries[0]; assert.match(q.s, /r\.status = \$1/); assert.ok(q.p.includes('%50  x%')); assert.ok(q.p.includes(50) && q.p.includes(0), 'limită și offset normalizate');
  queries = []; await call('GET /requests', { query: { status: 'x' } }); assert.ok(!/r\.status = \$/.test(queries[0].s), 'stare necunoscută ignorată');
});

test('raportări: listare pe stări și rezolvare cu acțiune (închide cererea / scoate oferta)', async () => {
  assert.ok(rt('GET /rfq-reports') && rt('PATCH /rfq-reports/:id'));
  script = () => ({ rows: [{ id: 1 }], rowCount: 1 }); queries = [];
  let r = await call('GET /rfq-reports', { query: { status: 'zzz' } }); assert.strictEqual(queries[0].p[0], 'open', 'stare necunoscută -> open');
  r = await call('PATCH /rfq-reports/:id', { params: { id: '1' }, body: { status: 'nu' } }); assert.strictEqual(r.body.error, 'STATUS_INVALID');
  r = await call('PATCH /rfq-reports/:id', { params: { id: '1' }, body: { status: 'resolved', action: 'close_request' } }); assert.strictEqual(r.body.error, 'MOTIV_OBLIGATORIU');
  // acțiune care nu se potrivește cu tipul raportării
  script = (s) => (/FROM rq_reports WHERE id/.test(s) ? { rows: [{ id: 1, kind: 'offer', request_id: 5, offer_id: 3, target_title: 'Far' }], rowCount: 1 } : { rows: [], rowCount: 1 });
  r = await call('PATCH /rfq-reports/:id', { params: { id: '1' }, body: { status: 'resolved', action: 'close_request', note: 'x' } }); assert.deepStrictEqual([r.code, r.body.error], [409, 'ACTIUNE_INVALIDA']);
  // scoate oferta
  script = (s) => (/FROM rq_reports WHERE id/.test(s) ? { rows: [{ id: 1, kind: 'offer', request_id: 5, offer_id: 3, target_title: 'Far' }], rowCount: 1 } : /DELETE FROM rq_offers/.test(s) ? { rows: [{ seller_id: 8 }], rowCount: 1 } : { rows: [], rowCount: 1 }); queries = [];
  r = await call('PATCH /rfq-reports/:id', { params: { id: '1' }, body: { status: 'resolved', action: 'remove_offer', note: 'Înșelăciune' } });
  assert.strictEqual(r.body.ok, true); assert.deepStrictEqual(logs.at(-1).slice(0, 3), ['offer_remove', 'offer', 3]); assert.deepStrictEqual([notes.at(-1)[0], notes.at(-1)[1]], [8, 'rfq_mod']);
  // închide cererea
  script = (s) => (/FROM rq_reports WHERE id/.test(s) ? { rows: [{ id: 2, kind: 'request', request_id: 5, offer_id: null, target_title: 'Far' }], rowCount: 1 } : /UPDATE rq_requests SET status = 'closed'/.test(s) ? { rows: [{ user_id: 9, title: 'Far' }], rowCount: 1 } : { rows: [], rowCount: 1 }); queries = [];
  r = await call('PATCH /rfq-reports/:id', { params: { id: '2' }, body: { status: 'resolved', action: 'close_request', note: 'Spam' } });
  assert.strictEqual(r.body.ok, true); assert.ok(queries.some((q) => /UPDATE rq_reports SET status = 'resolved'.*request_id = \$3/s.test(q.s)), 'toate raportările pe cerere se rezolvă'); assert.strictEqual(logs.at(-1)[0], 'request_close');
  // respingere simplă
  script = (s) => (/FROM rq_reports WHERE id/.test(s) ? { rows: [{ id: 3, kind: 'request', request_id: 5, offer_id: null, target_title: 'Far' }], rowCount: 1 } : { rows: [], rowCount: 1 });
  r = await call('PATCH /rfq-reports/:id', { params: { id: '3' }, body: { status: 'dismissed', note: 'Fals' } });
  assert.strictEqual(r.body.ok, true); assert.deepStrictEqual(logs.at(-1).slice(0, 3), ['rfq_report_dismissed', 'report', 3]);
});

test('raportare verificată: cel care a raportat e anunțat în aplicație (fără email), cu rezultatul', async () => {
  const row = (kind) => ({ rows: [{ id: 9, kind, request_id: 5, offer_id: kind === 'offer' ? 3 : null, target_title: 'Far', reporter_id: 4 }], rowCount: 1 });
  script = (s) => (/FROM rq_reports WHERE id/.test(s) ? row('request') : { rows: [], rowCount: 1 });
  notes.length = 0;
  await call('PATCH /rfq-reports/:id', { params: { id: '9' }, body: { status: 'dismissed', note: 'Fals' } });
  let n = notes.find((x) => x[0] === 4); assert.ok(n, 'reporterul e anunțat'); assert.strictEqual(n[1], 'rfq_mod'); assert.match(n[3], /Raportarea ta a fost verificată: Far/); assert.match(n[4], /Nu am găsit o încălcare/);
  notes.length = 0; await call('PATCH /rfq-reports/:id', { params: { id: '9' }, body: { status: 'resolved' } });
  n = notes.find((x) => x[0] === 4); assert.match(n[4], /Am luat măsuri/);
  // cu acțiune: și proprietarul conținutului, și reporterul
  script = (s) => (/FROM rq_reports WHERE id/.test(s) ? row('request') : /UPDATE rq_requests SET status = 'closed'/.test(s) ? { rows: [{ user_id: 9, title: 'Far' }], rowCount: 1 } : { rows: [], rowCount: 1 });
  notes.length = 0; await call('PATCH /rfq-reports/:id', { params: { id: '9' }, body: { status: 'resolved', action: 'close_request', note: 'Spam' } });
  assert.deepStrictEqual(notes.map((x) => x[0]).sort(), [4, 9]);
  // fără reporter (cont șters): nu se notifică nimeni în plus
  script = (s) => (/FROM rq_reports WHERE id/.test(s) ? { rows: [{ id: 9, kind: 'request', request_id: 5, offer_id: null, target_title: 'Far', reporter_id: null }], rowCount: 1 } : { rows: [], rowCount: 1 });
  notes.length = 0; await call('PATCH /rfq-reports/:id', { params: { id: '9' }, body: { status: 'dismissed' } }); assert.strictEqual(notes.length, 0);
});

test('integrare: admin.js montează modulul, iar interfața folosește doar rute existente', () => {
  const adm = fs.readFileSync(path.join(__dirname, 'admin.js'), 'utf8');
  assert.match(adm, /require\('\.\/admin-requests'\)\(router, \{ adminOnly, log \}\)/);
  const ui = fs.readFileSync(path.join(__dirname, 'admin-ui.js'), 'utf8');
  for (const u of ['/api/admin/requests', '/api/admin/offers', '/api/admin/rfq-orders', '/api/admin/rfq-reports']) assert.ok(ui.includes(u), u);
  assert.match(ui, /\["reqs", "Cereri piese"\]/); assert.match(ui, /reqs: vReqs/);
  assert.match(fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8'), /rfq_mod: "⚑"/);
});
