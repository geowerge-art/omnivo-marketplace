/* „Oferte primite” și datele ofertanților: node requests.offers.test.js (fără rețea, fără bază de date; modulele sunt înlocuite). */
const Module = require('module'); const fs = require('fs'); const orig = Module._load; const handlers = {}; let queries = [], script = () => ({ rows: [], rowCount: 0 });
Module._load = function (req, ...a) {
  if (req === 'express') { const mk = () => { const o = {}; ['use'].forEach((m) => (o[m] = () => o));
      ['get', 'post', 'put', 'delete'].forEach((m) => (o[m] = (p, ...h) => { handlers[m.toUpperCase() + ' ' + p] = h[h.length - 1]; return o; })); return o; };
    const ex = () => ({}); ex.Router = mk; return ex; }
  if (req === './db') return { hasDb: () => true, pool: { connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release() {} }) }, query: async (s, p) => { queries.push({ s, p }); return script(s, p); } };
  if (req === './config') return { APP_URL: 'http://x' };
  if (req === './common') return { ah: (f) => f, requireDb: () => {} };
  if (req === './authmw') return { requireAuth: () => {}, requireRole: () => () => {}, requireVerified: () => {} };
  if (req === './security') return { createThrottle: () => () => true };
  if (req === './mail') return { sendMail: async () => {}, MAIL_READY: false };
  if (req === './notify') return { notify: async () => {} };
  if (req === './live') return { send: () => {} };
  if (req === './guard') return new Proxy({}, { get: () => () => ({ ok: true }) });
  if (req === './images') return { raw: () => {}, kind: () => 'jpg', process: async () => ({}), STORAGE: false, removeStored: async () => {} };
  return orig.call(this, req, ...a);
};
require(require('path').join(__dirname, 'requests.js'));
let ok = 0, bad = 0; const t = (name, pass) => { pass ? ok++ : bad++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`); };
const call = async (route, req) => { queries = []; const out = { code: 200 }; const res = { status(c) { out.code = c; return this; }, json(j) { out.body = j; return this; }, set() { return this; } };
  await handlers[route]({ params: {}, query: {}, body: {}, ...req }, res); return out; };
(async () => {
  script = (s) => (/FROM quotes q JOIN part_requests r/.test(s) ? { rows: [{ quote_id: 1, request_id: 7, company: 'A' }], rowCount: 1 } : { rows: [], rowCount: 0 });
  let r = await call('GET /received', { user: { id: 5 } });
  t('„Oferte primite” întoarce ofertele', r.code === 200 && r.body.offers.length === 1);
  const q = queries.find((x) => /FROM quotes q JOIN part_requests r/.test(x.s));
  t('doar cererile mele (r.user_id = $1) și userul din sesiune', q && /r\.user_id = \$1/.test(q.s) && q.p[0] === 5);
  t('doar oferte trimise sau câștigătoare, doar la cereri deschise sau cu câștigător', /q\.status IN \('sent', 'won'\) AND \(r\.status = 'open' OR q\.status = 'won'\)/.test(q.s));
  t('calificativul ofertantului e doar cel de vânzător (role = seller)', (q.s.match(/role = 'seller'/g) || []).length === 2);
  t('nu trimite contact (telefon / email) în listă', !/phone|email|whatsapp/.test(q.s));
  script = (s) => (/FROM part_requests WHERE id/.test(s) ? { rows: [{ id: 7, user_id: 5 }], rowCount: 1 } : /FROM quotes q JOIN users u/.test(s) ? { rows: [{ id: 1, dealer_id: 9, status: 'sent', phone: null }], rowCount: 1 } : { rows: [], rowCount: 0 });
  r = await call('GET /:id(\\d+)', { user: { id: 5 }, params: { id: 7 } });
  t('detaliul cererii trimite dealer_id și pentru ofertele nealese (link spre profil)', r.code === 200 && r.body.quotes[0].dealer_id === 9);
  const dq = queries.find((x) => /FROM quotes q JOIN users u/.test(x.s));
  t('telefonul rămâne ascuns până la alegere', /CASE WHEN q\.status = 'won' AND u\.show_phone THEN u\.phone END AS phone/.test(dq.s));
  t('dealer_id nu mai e condiționat de câștig', !/CASE WHEN q\.status = 'won' THEN q\.dealer_id END/.test(dq.s));
  console.log(`\n${ok} trecute, ${bad} eșuate`); if (bad) process.exit(1);
})();
