/* Rulează fișierele din migrations/ în ordine alfabetică, o singură dată fiecare. */
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function migrate() {
  if (!db.hasDb()) throw new Error('DATABASE_URL lipsește');
  const client = await db.pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const dir = __dirname;
    const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]);
        await client.query('COMMIT');
        console.log('migrare aplicată:', f);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migrarea ${f} a eșuat: ${e.message}`);
      }
    }
  } finally {
    client.release();
  }
}

module.exports = migrate;

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
