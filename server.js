const config = require('./src/config');
const db = require('./src/db');
const migrate = require('./src/migrate');
const { ensureAdmin } = require('./src/bootstrap');
const { createApp } = require('./src/app');

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
  process.on('SIGTERM', () => server.close(() => (db.hasDb() ? db.pool.end() : null)));
}

main().catch((e) => { console.error(e); process.exit(1); });
