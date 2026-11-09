const { Pool } = require('pg');
const config = require('./config');

let pool = null;

if (config.DATABASE_URL) {
  const local = /localhost|127\.0\.0\.1/.test(config.DATABASE_URL);
  pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    ssl: local ? false : { rejectUnauthorized: config.DATABASE_SSL_STRICT }
  });
  pool.on('error', (err) => console.error('pg pool error:', err.message));
}

module.exports = {
  get pool() { return pool; },
  hasDb: () => !!pool,
  query: (text, params) => pool.query(text, params)
};
