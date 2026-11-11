const config = require('./config');
const db = require('./db');
const migrate = require('./migrate');
const { ensureAdmin } = require('./bootstrap');
const { createApp } = require('./app');

async function main() {
  if (db.hasDb()) {
    await migrate();
    await ensureAdmin();
    // curăță sesiunile expirate din oră în oră
    setInterval(() => db.query('DELETE FROM sessions WHERE expires_at < NOW()').catch(() => {}), 3600000).unref();
  } else {
    console.warn('DATABASE_URL lipsește: pornesc fără bază de date (conturile și anunțurile nu funcționează).');
  }
  const server = createApp().listen(config.PORT, '0.0.0.0', () => console.log(`Omnivo rulează pe portul ${config.PORT}`));
  // anti-adormire (ca la AutoParts): aplicația își cheamă singură adresa publică la 10 minute, ca Render să vadă trafic.
  // Dezactivare: KEEP_AWAKE=0. Adresa vine din APP_URL sau, automat, din RENDER_EXTERNAL_URL.
  if (config.APP_URL && process.env.KEEP_AWAKE !== '0' && typeof fetch === 'function') {
    const ping = () => fetch(config.APP_URL + '/api/health', { signal: AbortSignal.timeout(15000) }).catch(() => {});
    setTimeout(ping, 60 * 1000).unref(); setInterval(ping, 10 * 60 * 1000).unref();
  }
  require('./keepalive').start(); // ping la 10 minute, ca serviciul să nu adoarmă pe Render
  process.on('SIGTERM', () => server.close(() => (db.hasDb() ? db.pool.end() : null)));
}

main().catch((e) => { console.error(e); process.exit(1); });
