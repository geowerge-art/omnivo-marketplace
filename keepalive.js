/* Ține serviciul treaz pe Render (planul gratuit adoarme după ~15 minute fără trafic).
   La fiecare 10 minute cere /api/health prin adresa publică, deci cererea trece prin proxy-ul Render și contează ca trafic.
   Se pornește doar în producție și doar dacă există o adresă publică (APP_URL sau RENDER_EXTERNAL_URL, pe care Render o setează singur).
   Se oprește cu KEEPALIVE=off. Nu poate trezi un serviciu deja adormit: pentru asta ai nevoie și de un pinger extern (vezi README). */
const config = require('./config');

const EVERY_MS = 10 * 60 * 1000;

function target(env = process.env, cfg = config) {
  if (String(env.KEEPALIVE || '').toLowerCase() === 'off') return null;
  if (!cfg.IS_PROD || !/^https:\/\//i.test(cfg.APP_URL)) return null;
  return cfg.APP_URL + '/api/health';
}

async function ping(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'omnivo-keepalive' } });
    if (!r.ok) console.warn('keepalive: răspuns', r.status);
  } catch (e) { console.warn('keepalive:', e.name === 'TimeoutError' ? 'timeout' : e.message); }
}

function start() {
  const url = target();
  if (!url) return false;
  setInterval(() => ping(url), EVERY_MS).unref();
  console.log(`keepalive: ping la ${EVERY_MS / 60000} minute pe ${url}`);
  return true;
}

module.exports = { start, target, EVERY_MS };
