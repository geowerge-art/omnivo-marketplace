/* Teste pentru recenzii și profil: node profiles.test.js (fără server și fără bază de date; modulele sunt înlocuite). */
const Module = require('module'); const orig = Module._load; const handlers = {}; let queries = [];
let DB = {};
Module._load = function (req, ...a) {
  if (req === 'express') { const mk = () => { const o = {}; ['use'].forEach((m) => (o[m] = () => o));
      ['get', 'post', 'put', 'delete'].forEach((m) => (o[m] = (p, ...h) => { handlers[m.toUpperCase() + ' ' + p] = h[h.length - 1]; return o; })); return o; }
    const ex = () => ({}); ex.Router = mk; return ex; }
  if (req === './db') return { query: async (sql, p) => { queries.push(sql); return DB.q(sql, p); } };
  if (req === './common') return { ah: (f) => f, requireDb: () => {} };
  if (req === './authmw') return { requireAuth: () => {} };
  if (req === './security') return { createThrottle: () => () => true };
  return orig.call(this, req, ...a);
};
require(require('path').join(__dirname, 'profiles.js'));
const run = async (route, user, params, body, q) => { DB = { q }; queries = []; const out = { code: 200 };
  const res = { status(c) { out.code = c; return this; }, json(j) { out.body = j; return this; } };
  await handlers[route]({ user, params, body, query: {} }, res); return out; };
let ok = 0, bad = 0; const t = (name, got, code, err) => { const pass = got.code === code && (!err || (got.body && got.body.error === err)); pass ? ok++ : bad++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} → ${got.code} ${JSON.stringify(got.body)}`); };
const ME = { id: 5, role: 'user' }, STAFF = { id: 1, role: 'admin' }, none = async () => ({ rows: [], rowCount: 0 });
(async () => {
  const P = 'POST /:id(\\d+)/reviews';
  t('recenzie propriului profil', await run(P, ME, { id: 5 }, { rating: 5 }, none), 400, 'RECENZIE_PROPRIE');
  t('stele lipsă', await run(P, ME, { id: 9 }, {}, none), 400, 'RECENZIE_STELE');
  t('6 stele', await run(P, ME, { id: 9 }, { rating: 6 }, none), 400, 'RECENZIE_STELE');
  t('vânzător inexistent', await run(P, ME, { id: 9 }, { rating: 5 }, none), 404, 'NEGASIT');
  t('fără conversație', await run(P, ME, { id: 9 }, { rating: 5 }, async (s) => (/FROM users WHERE id/.test(s) ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 })), 409, 'FARA_CONVERSATIE');
  t('deja recenzat', await run(P, ME, { id: 9 }, { rating: 5 }, async (s) => (/FROM users WHERE id/.test(s) ? { rows: [{}], rowCount: 1 } : /NOT EXISTS/.test(s) ? { rows: [], rowCount: 0 } : { rows: [{}], rowCount: 1 })), 409, 'RECENZIE_EXISTENTA');
  const r = await run(P, ME, { id: 9 }, { rating: 4, body: 'Totul ok' }, async (s) => (/FROM users WHERE id/.test(s) ? { rows: [{}], rowCount: 1 } : /NOT EXISTS/.test(s) ? { rows: [{ listing_id: 3 }], rowCount: 1 } : { rows: [{ id: 77 }], rowCount: 1 }));
  t('recenzie validă', r, 201); console.log('     inserat cu anunțul #3:', queries.some((q) => /INSERT INTO reviews/.test(q)));
  const D = 'DELETE /reviews/:rid(\\d+)', rv = async (s) => (/FROM reviews WHERE id/.test(s) ? { rows: [{ id: 2, seller_id: 9, reviewer_id: 7, rating: 1 }], rowCount: 1 } : { rows: [], rowCount: 1 });
  t('alt utilizator șterge recenzia', await run(D, ME, { rid: 2 }, {}, rv), 403, 'INTERZIS');
  const s = await run(D, STAFF, { rid: 2 }, {}, rv); t('adminul șterge recenzia', s, 200); console.log('     scris în jurnal:', queries.some((q) => /admin_activity/.test(q)));
  t('profil inexistent', await run('GET /:id(\\d+)/profile', null, { id: 99 }, {}, none), 404, 'NEGASIT');
  console.log(`\n${ok} trecute, ${bad} eșuate`); if (bad) process.exit(1);
})();
