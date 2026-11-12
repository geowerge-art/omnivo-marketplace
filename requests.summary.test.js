/* Rezumatul pentru meniu: câte oferte și răspunsuri noi are cumpărătorul. node requests.summary.test.js (fără rețea, fără bază de date). */
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
  script = (s) => (/buyer_seen_at/.test(s) && /FROM part_requests r WHERE r\.user_id = \$1/.test(s) ? { rows: [{ open: 2, waiting: 5, new_quotes: 3, new_answers: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 });
  const r = await call('GET /summary', { user: { id: 5 }, query: { user_id: 99 } });
  t('rezumatul întoarce contoarele', r.code === 200 && r.body.open === 2 && r.body.waiting === 5 && r.body.new_quotes === 3 && r.body.new_answers === 1);
  const q = queries.find((x) => /buyer_seen_at/.test(x.s));
  t('doar cererile utilizatorului din sesiune (nu un id din cerere)', q && q.p.length === 1 && q.p[0] === 5);
  t('numără doar cererile deschise (4 contoare filtrate)', (q.s.match(/FILTER \(WHERE r\.status = 'open'\)/g) || []).length === 4);
  t('„noi” = de la ultima vizită (buyer_seen_at, altfel data cererii)', (q.s.match(/COALESCE\(r\.buyer_seen_at, r\.created_at\)/g) || []).length === 2);
  t('ofertele se numără doar dacă sunt trimise („sent”), nu cele refuzate, câștigate sau retrase', /q\.status = 'sent'/.test(q.s) && !/'withdrawn'|'rejected'/.test(q.s));
  t('răspunsurile noi vin din întrebările la oferte', /FROM quote_questions qq JOIN quotes q ON q\.id = qq\.quote_id/.test(q.s) && /qq\.answered_at >/.test(q.s));
  t('nu trimite date de contact ale ofertanților', !/phone|email|whatsapp|dealer_id/.test(q.s));
  t('expirările se actualizează înaintea numărătorii', queries.indexOf(q) > 0);
  console.log(`\n${ok} trecute, ${bad} eșuate`); if (bad) process.exit(1);
})();
