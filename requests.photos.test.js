/* Poze la cereri: node requests.photos.test.js (fără rețea, fără bază de date; modulele sunt înlocuite). */
const Module = require('module'); const fs = require('fs'); const orig = Module._load; const handlers = {}; let queries = [], script = () => ({ rows: [], rowCount: 0 });
Module._load = function (req, ...a) {
  if (req === 'express') { const mk = () => { const o = {}; ['use'].forEach((m) => (o[m] = () => o));
      ['get', 'post', 'put', 'delete'].forEach((m) => (o[m] = (p, ...h) => { handlers[m.toUpperCase() + ' ' + p] = h[h.length - 1]; return o; })); return o; };
    const ex = () => ({}); ex.Router = mk; return ex; }
  if (req === './db') return { hasDb: () => true, query: async (s, p) => { queries.push({ s, p }); return script(s, p); } };
  if (req === './config') return { APP_URL: 'http://x' };
  if (req === './common') return { ah: (f) => f, requireDb: () => {} };
  if (req === './authmw') return { requireAuth: () => {}, requireRole: () => () => {}, requireVerified: () => {} };
  if (req === './security') return { createThrottle: () => () => true };
  if (req === './mail') return { sendMail: async () => {}, MAIL_READY: false };
  if (req === './notify') return { notify: async () => {} };
  if (req === './live') return { send: () => {} };
  if (req === './images') return { raw: () => {}, kind: () => 'jpg', process: async () => ({}), STORAGE: false, removeStored: async () => {} };
  return orig.call(this, req, ...a);
};
require(require('path').join(__dirname, 'requests.js'));
let ok = 0, bad = 0; const t = (name, pass) => { pass ? ok++ : bad++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`); };
const call = async (route, req) => { queries = []; const out = { code: 200, sent: null };
  const res = { status(c) { out.code = c; return this; }, json(j) { out.body = j; return this; }, set() { return this; }, send(b) { out.sent = b; return this; }, end() { return this; } };
  await handlers[route]({ params: {}, query: {}, body: {}, ...req }, res); return out; };
const body = { part: 'Far stânga', brand: 'VW', model: 'Golf 7', year: 2015, county: 'Cluj' };
(async () => {
  script = (s) => (/INSERT INTO part_requests/.test(s) ? { rows: [{ id: 42, expires_at: '2026-12-01' }], rowCount: 1 } : { rows: [], rowCount: 0 });
  let r = await call('POST /', { user: { id: 5 }, body: { ...body, image_ids: [3, 3, 'x', 7, '9'] } });
  const att = queries.filter((q) => /UPDATE quote_images SET request_id/.test(q.s));
  t('cerere cu poze → 201', r.code === 201 && r.body.request.id === 42);
  t('pozele se atașează o singură dată fiecare (3, 7, 9), în ordine', att.length === 3 && att.map((q) => q.p[1]).join() === '3,7,9' && att.map((q) => q.p[3]).join() === '0,1,2');
  t('doar pozele încărcate de el, neatașate încă (owner + request_id IS NULL)', att.every((q) => q.p[2] === 5 && /owner_id = \$3 AND quote_id IS NULL AND request_id IS NULL/.test(q.s)));
  t('pozele salvate în baza de date primesc adresă publică /api/requests/photo/', att.every((q) => /'\/api\/requests\/photo\/'/.test(q.s)));
  r = await call('POST /', { user: { id: 5 }, body });
  t('cerere fără poze → fără atașări', r.code === 201 && !queries.some((q) => /UPDATE quote_images/.test(q.s)));
  r = await call('POST /', { user: { id: 5 }, body: { ...body, image_ids: [1, 2, 3, 4, 5, 6, 7, 8] } });
  t('maximum 6 poze la o cerere', queries.filter((q) => /UPDATE quote_images SET request_id/.test(q.s)).length === 6);
  r = await call('POST /', { user: { id: 5 }, body: { ...body, part: 'a' } });
  t('cerere invalidă → 400, nimic atașat', r.code === 400 && !queries.some((q) => /UPDATE quote_images/.test(q.s)));
  // ruta publică de poze
  script = () => ({ rows: [], rowCount: 0 });
  r = await call('GET /photo/:id(\\d+)', { params: { id: 9 } }); t('poză inexistentă sau cerere închisă → 404', r.code === 404);
  script = () => ({ rows: [{ data: 'FULL', thumb: 'THUMB', ctype: 'image/webp' }], rowCount: 1 });
  r = await call('GET /photo/:id(\\d+)', { params: { id: 9 }, query: {} }); t('poză de cerere deschisă se vede și fără cont', r.sent === 'FULL' && queries[0].p[1] === null);
  r = await call('GET /photo/:id(\\d+)', { params: { id: 9 }, query: { t: '1' }, user: { id: 5 } }); t('miniatura (?t=1) trimite thumb-ul', r.sent === 'THUMB');
  t('ruta nu cere cont și nu servește poze de oferte', /request_id/.test(queries[0].s) && /q\.status IN \('open', 'awarded'\)/.test(queries[0].s));
  // panoul și curățenia
  script = () => ({ rows: [], rowCount: 0 });
  await call('GET /open', { query: {} }); t('panoul public trimite pozele cererii (photos)', queries.some((q) => /AS photos/.test(q.s)));
  const src = fs.readFileSync(require('path').join(__dirname, 'requests.js'), 'utf8');
  t('curățenia și numărătoarea pozelor neatașate nu ating pozele de cereri', (src.match(/quote_id IS NULL AND request_id IS NULL/g) || []).length >= 3);
  console.log(`\n${ok} trecute, ${bad} eșuate`); if (bad) process.exit(1);
})();
