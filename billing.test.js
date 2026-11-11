/* Teste pentru credite și plăți: node billing.test.js (fără rețea și fără bază de date; modulele sunt înlocuite). */
const Module = require('module'); const crypto = require('crypto'); const orig = Module._load; let log = [], script = () => ({ rows: [], rowCount: 0 });
const client = { query: async (sql, p) => { log.push(sql.split(/\s+/).slice(0, 3).join(' ')); if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return {}; return script(sql, p); }, release() {} };
Module._load = function (req, ...a) {
  if (req === 'express') { const mk = () => { const o = {}; ['use', 'get', 'post'].forEach((m) => (o[m] = () => o)); return o; }; const ex = () => ({}); ex.Router = mk; return ex; }
  if (req === './db') return { hasDb: () => true, pool: { connect: async () => client }, query: async (s, p) => script(s, p) };
  if (req === './common') return { ah: (f) => f, requireDb: () => {} };
  if (req === './authmw') return { requireAuth: () => {} };
  if (req === './security') return { createThrottle: () => () => true };
  if (req === './mail') return { baseUrl: () => 'http://x' };
  if (req === './plans') return { PLANS: { standard: { name: 'Standard' } }, ORDER: ['basic', 'standard'], effective: () => 'basic' };
  if (req === './config') return { BILLING: true, STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test' };
  return orig.call(this, req, ...a);
};
const B = require('./billing');
let ok = 0, bad = 0; const t = (name, pass) => { pass ? ok++ : bad++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`); };
const sign = (body, secret = 'whsec_test', ts = Math.floor(Date.now() / 1000)) => `t=${ts},v1=${crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
const paid = (o = {}) => ({ id: 'cs_1', payment_status: 'paid', currency: 'ron', amount_total: 3000, client_reference_id: '5', metadata: { pack: 'm' }, ...o });
(async () => {
  // semnătura webhook-ului
  const body = Buffer.from('{"a":1}');
  t('semnătură validă', B.verifySig(body, sign(body.toString()), 'whsec_test'));
  t('semnătură cu alt secret → refuzată', !B.verifySig(body, sign(body.toString(), 'altul'), 'whsec_test'));
  t('corp modificat → refuzat', !B.verifySig(Buffer.from('{"a":2}'), sign(body.toString()), 'whsec_test'));
  t('semnătură veche (>5 min) → refuzată', !B.verifySig(body, sign(body.toString(), 'whsec_test', Math.floor(Date.now() / 1000) - 3600), 'whsec_test'));
  t('antet lipsă → refuzat', !B.verifySig(body, '', 'whsec_test'));
  // codificarea formularului către Stripe
  const f = B.form({ mode: 'payment', line_items: { 0: { quantity: 1, price_data: { currency: 'ron' } } }, metadata: { pack: 'm' }, skip: undefined });
  t('formular Stripe imbricat', JSON.stringify(f) === JSON.stringify([['mode', 'payment'], ['line_items[0][quantity]', '1'], ['line_items[0][price_data][currency]', 'ron'], ['metadata[pack]', 'm']]));
  // creditare
  script = (s) => (/UPDATE users/.test(s) ? { rows: [{ credits: 32 }], rowCount: 1 } : /INSERT INTO credit_tx/.test(s) ? { rows: [{ id: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 });
  t('plată validă → credited (32 de credite pentru 30 lei)', (await B.fulfill(paid())) === 'credited');
  script = (s) => (/UPDATE users/.test(s) ? { rows: [{ credits: 64 }], rowCount: 1 } : { rows: [], rowCount: 0 });   // INSERT nu returnează rând = sesiune deja creditată
  log = []; t('aceeași sesiune a doua oară → duplicate (nu mai creditează)', (await B.fulfill(paid())) === 'duplicate'); t('  …și se face ROLLBACK', log.includes('ROLLBACK'));
  t('sumă diferită de pachet → ignorată', (await B.fulfill(paid({ amount_total: 100 }))) === 'ignored');
  t('altă monedă → ignorată', (await B.fulfill(paid({ currency: 'eur' }))) === 'ignored');
  t('neplătită → ignorată', (await B.fulfill(paid({ payment_status: 'unpaid' }))) === 'ignored');
  t('pachet necunoscut → ignorat', (await B.fulfill(paid({ metadata: { pack: 'zzz' } }))) === 'ignored');
  // cheltuire
  script = () => ({ rows: [], rowCount: 0 }); t('credite insuficiente → null', (await B.spend(client, 5, 9, 'promo', 1, 'x')) === null);
  script = () => ({ rows: [{ credits: 1 }], rowCount: 1 }); t('credite suficiente → sold nou', (await B.spend(client, 5, 9, 'promo', 1, 'x')) === 1);
  t('sumă 0 sau negativă → refuzată', (await B.spend(client, 5, 0, 'x')) === null && (await B.spend(client, 5, -3, 'x')) === null);
  // webhook HTTP
  const run = async (hdr, raw) => { const o = { code: 200 }; await B.webhook({ body: raw, get: () => hdr }, { status(c) { o.code = c; return this; }, json(j) { o.body = j; return this; } }); return o; };
  const ev = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: paid() } }));
  script = (s) => (/UPDATE users/.test(s) ? { rows: [{ credits: 32 }], rowCount: 1 } : { rows: [{ id: 1 }], rowCount: 1 });
  t('webhook cu semnătură bună → 200', (await run(sign(ev.toString()), ev)).code === 200);
  t('webhook cu semnătură greșită → 400', (await run('t=1,v1=00', ev)).code === 400);
  console.log(`\n${ok} trecute, ${bad} eșuate`); if (bad) process.exit(1);
})();
