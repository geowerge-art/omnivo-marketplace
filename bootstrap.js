const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');
const { weakPassword } = require('./security');

/* Creează contul de administrator la prima pornire (dacă nu există niciun admin). */
async function ensureAdmin() {
  if (!db.hasDb() || !config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) return;
  const has = await db.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  if (has.rowCount) return;
  if (weakPassword(config.ADMIN_PASSWORD, { email: config.ADMIN_EMAIL }) || config.ADMIN_PASSWORD.length < 12) {
    console.warn('ADMIN_PASSWORD e prea slabă (minim 12 caractere, nu o parolă comună): administratorul NU a fost creat.');
    return;
  }
  await db.query(
    `INSERT INTO users(name, nickname, email, password_hash, role, email_verified, terms_accepted_at)
     VALUES('Administrator', 'admin', $1, $2, 'admin', TRUE, NOW()) ON CONFLICT DO NOTHING`,
    [config.ADMIN_EMAIL, await bcrypt.hash(config.ADMIN_PASSWORD, 12)]);
  console.log('Cont administrator creat:', config.ADMIN_EMAIL);
}

module.exports = { ensureAdmin };
