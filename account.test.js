/* Export și ștergere cont (GDPR), cu bază de date și server simulate. */
const Module = require('module'); const orig = Module._load; const handlers = {};
let log = [], rows = {}, removed = null, failOn = null, cleared = 0;
const client = { query: async (sql) => { log.push(sql.replace(/\s+/g, ' ').slice(0, 60)); if (failOn && sql.includes(failOn)) throw new Error('boom');
  if (sql.includes('FROM listing_images')) return { rows: [{ url: 'u1', thumb_url: 't1' }, { url: 'u2', thumb_url: null }] };
  return { rows: [], rowCount: sql.startsWith('DELETE FROM listings') ? 3 : 0 }; }, release() { log.push('release'); } };
Module._load = function (req, ...a) {
  if (req === 'express') { const mk = () => { const o = { use: () => o }; ['get', 'post'].forEach((m) => (o[m] = (p, ...h) => { handlers[m.toUpperCase() + ' ' + p] = h[h.length - 1]; return o; })); return o; }; const ex = () => ({}); ex.Router = mk; return ex; }
  if (req === 'bcryptjs') return { compare: async (p) => p === 'corecta' };
  if (req === './db') return { hasDb: () => true, pool: { connect: async () => client },
    query: async (sql) => { if (sql.includes('password_hash')) return { rows: [{ password_hash: 'h' }], rowCount: 1 };
      if (sql.includes('FROM users WHERE id')) return { rows: [{ id: 7, nickname: 'ana', email: 'a@b.ro', password_hash: 'SECRET', session_token: 'x', credits: 5 }], rowCount: 1 };
      if (sql.includes('FROM reviews')) throw new Error('relation does not exist');
      return { rows: [{ k: 1 }], rowCount: 1 }; } };
  if (req === './common') return { ah: (f) => f, requireDb: () => {} };
  if (req === './authmw') return { requireAuth: () => {}, COOKIE: 'session', cookieOptions: () => ({}) };
  if (req === './security') return { createThrottle: () => () => true };
  if (req === './images') return { removeStored: async (...u) => { removed = u; } };
  return orig.call(this, req, ...a);
};
require(require('path').join(__dirname, 'account.js'));
const run = async (route, user, body) => { log = []; removed = null; cleared = 0; const out = { code: 200, headers: {} };
  const res = { status(c) { out.code = c; return this; }, json(j) { out.body = j; return this; }, send(s) { out.text = s; return this; }, set(k, v) { out.headers[k] = v; return this; }, clearCookie() { cleared++; } };
  await handlers[route]({ user, body }, res); return out; };
let ok = 0, bad = 0; const t = (n, c, extra = '') => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'EȘEC') + ' ' + n + (extra ? ' → ' + extra : '')); };
(async () => {
  const U = { id: 7, role: 'user' }, D = 'POST /delete';
  let r = await run(D, U, { password: 'corecta', confirm: '' }); t('fără cuvântul STERGE', r.code === 400 && r.body.error === 'CONFIRMARE_LIPSA');
  r = await run(D, { id: 1, role: 'admin' }, { password: 'corecta', confirm: 'STERGE' }); t('adminul nu își poate șterge contul direct', r.code === 403 && r.body.error === 'CONT_PRIVILEGIAT');
  r = await run(D, U, { password: 'gresita', confirm: 'STERGE' }); t('parolă greșită', r.code === 401 && r.body.error === 'PAROLA_GRESITA'); t('…și nu s-a șters nimic', !log.some((l) => /DELETE/.test(l)));
  r = await run(D, U, { confirm: 'STERGE' }); t('fără parolă', r.code === 401);
  r = await run(D, U, { password: 'corecta', confirm: ' sterge ' }); t('ștergere reușită (litere mici, spații)', r.code === 200 && r.body.ok); t('cookie-ul de sesiune șters', cleared === 1);
  const order = log.join(' | '); t('ordine: BEGIN → poze → anunțuri → contact → utilizator → COMMIT', /BEGIN.*FROM listing_images.*DELETE FROM listings.*DELETE FROM contact_messages.*DELETE FROM users.*COMMIT/.test(order));
  t('pozele din Storage șterse (și miniaturile, fără null)', JSON.stringify(removed) === '["u1","t1","u2"]', JSON.stringify(removed));
  failOn = 'DELETE FROM users'; let threw = false; try { await run(D, U, { password: 'corecta', confirm: 'STERGE' }); } catch { threw = true; }
  t('eroare la mijloc → ROLLBACK, fără COMMIT, conexiune eliberată', threw && log.includes('ROLLBACK') && !log.includes('COMMIT') && log.includes('release')); t('…și pozele NU se șterg din Storage', removed === null); failOn = null;
  r = await run('GET /export', U); const d = JSON.parse(r.text);
  t('export: fișier de descărcat', /attachment; filename="omnivo-datele-mele-\d{4}-\d{2}-\d{2}\.json"/.test(r.headers['Content-Disposition']));
  t('export: fără parolă sau token', !/SECRET|session_token|password_hash/.test(r.text)); t('export: datele contului', d.cont && d.cont.nickname === 'ana' && d.cont.credits === 5);
  t('export: un tabel lipsă nu strică exportul', d.recenzii_scrise === null && Array.isArray(d.anunturi), 'recenzii_scrise = null');
  console.log(`\n${ok} trecute, ${bad} eșuate`); if (bad) process.exit(1);
})();
