const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');
const { ah, requireDb } = require('./common');
const { COOKIE, cookieOptions, requireAuth } = require('./authmw');
const { sendMail, baseUrl } = require('./mail');
const S = require('./security');

const router = express.Router();
router.use(requireDb);

const BCRYPT_COST = 12;
const DUMMY_HASH = bcrypt.hashSync('parola-inexistenta-pentru-timp-constant', BCRYPT_COST);
const regAllow = S.createThrottle(10, 60 * 60 * 1000);
const mailAllow = S.createThrottle(5, 60 * 60 * 1000);
const loginIpAllow = S.createThrottle(40, 15 * 60 * 1000);

const publicUser = (u) => ({
  id: u.id, name: u.name, nickname: u.nickname, email: u.email, phone: u.phone,
  show_phone: u.show_phone, role: u.role, status: u.status, email_verified: u.email_verified
});

/* ---- limitare login persistentă (rezistă repornirilor) ---- */
const FAIL_WINDOW = "INTERVAL '15 minutes'";
async function loginBlocked(idKey, acctKey) {
  const r = await db.query(
    `SELECT key, fails FROM login_attempts WHERE key = ANY($1) AND first_at > NOW() - ${FAIL_WINDOW}`, [[idKey, acctKey]]);
  return r.rows.some((x) => (x.key === idKey ? x.fails >= 8 : x.fails >= 40));
}
async function loginFailed(...keys) {
  for (const k of keys) {
    await db.query(
      `INSERT INTO login_attempts(key, fails, first_at) VALUES($1, 1, NOW())
       ON CONFLICT (key) DO UPDATE SET
         fails = CASE WHEN login_attempts.first_at < NOW() - ${FAIL_WINDOW} THEN 1 ELSE login_attempts.fails + 1 END,
         first_at = CASE WHEN login_attempts.first_at < NOW() - ${FAIL_WINDOW} THEN NOW() ELSE login_attempts.first_at END`, [k]);
  }
}

async function createSession(userId, req, remember) {
  const token = S.newToken();
  const maxAge = remember ? config.SESSION_DAYS * 86400000 : null;
  const ttl = maxAge || config.SESSION_SHORT_HOURS * 3600000;
  await db.query(
    'INSERT INTO sessions(user_id, token_hash, expires_at, user_agent) VALUES($1,$2,$3,$4)',
    [userId, S.hashToken(token), new Date(Date.now() + ttl), String(req.get('user-agent') || '').slice(0, 200)]);
  return { token, maxAge };
}

async function sendVerification(req, user) {
  const token = S.newToken();
  await db.query('INSERT INTO email_verifications(user_id, token_hash, expires_at) VALUES($1,$2,$3)',
    [user.id, S.hashToken(token), new Date(Date.now() + 24 * 3600000)]);
  const link = `${baseUrl(req)}/#verifica-email=${token}`;
  await sendMail(user.email, 'Confirmă adresa de email - Omnivo',
    `<p>Salut, ${escapeHtml(user.name)}!</p><p><a href="${link}">Confirmă emailul</a> (valabil 24 de ore).</p>`,
    `Confirmă emailul: ${link}`);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---- înregistrare ---- */
router.post('/register', ah(async (req, res) => {
  const { name, nickname, email, phone, password, accept_terms, remember = true } = req.body || {};
  if (accept_terms !== true) return res.status(400).json({ error: 'TERMENI_NEACCEPTATI' });
  if ([name, nickname, email, password].some((v) => typeof v !== 'string') ||
      !name.trim() || name.length > 100 || email.length > 254 || !S.EMAIL_RE.test(email.trim()) ||
      (phone && !S.PHONE_RE.test(String(phone)))) {
    return res.status(400).json({ error: 'DATE_INVALIDE' });
  }
  const em = S.normEmail(email), nick = S.normNick(nickname);
  if (!S.NICK_RE.test(nick)) return res.status(400).json({ error: 'NICKNAME_INVALID' });
  const weak = S.weakPassword(password, { email: em, nickname: nick });
  if (weak) return res.status(400).json({ error: 'PAROLA_SLABA', reason: weak });
  if (!regAllow(S.clientIp(req))) return res.status(429).json({ error: 'RATE_LIMIT' });

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    const r = await db.query(
      `INSERT INTO users(name, nickname, email, phone, password_hash, terms_accepted_at)
       VALUES($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [name.trim(), nick, em, phone ? String(phone).trim() : null, hash]);
    const user = r.rows[0];
    sendVerification(req, user).catch((e) => console.error('mail confirmare:', e.message));
    const s = await createSession(user.id, req, remember !== false);
    res.cookie(COOKIE, s.token, cookieOptions(s.maxAge));
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: /nickname/i.test(String(e.constraint)) ? 'NICKNAME_EXISTS' : 'EMAIL_EXISTS' });
    }
    throw e;
  }
}));

/* ---- login (email sau nickname) ---- */
router.post('/login', ah(async (req, res) => {
  const { identifier, password, remember = true } = req.body || {};
  const id = String(identifier || '').trim().toLowerCase();
  if (!id || typeof password !== 'string' || !password || id.length > 254) return res.status(400).json({ error: 'DATE_INVALIDE' });
  const ip = S.clientIp(req), idKey = `ip:${ip}:${id}`, acctKey = `acct:${id}`;
  if (!loginIpAllow(ip) || await loginBlocked(idKey, acctKey)) return res.status(429).json({ error: 'LOGIN_RATE_LIMIT' });

  const r = await db.query('SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(nickname) = $1 LIMIT 1', [id]);
  const ok = await bcrypt.compare(password.slice(0, 72), r.rowCount ? r.rows[0].password_hash : DUMMY_HASH); // timp constant
  if (!r.rowCount || !ok) {
    await loginFailed(idKey, acctKey);
    return res.status(401).json({ error: 'INVALID_LOGIN' });
  }
  const user = r.rows[0];
  if (user.status !== 'active') return res.status(403).json({ error: 'CONT_BLOCAT' });
  await db.query('DELETE FROM login_attempts WHERE key = $1', [idKey]);
  const s = await createSession(user.id, req, remember !== false);
  res.cookie(COOKIE, s.token, cookieOptions(s.maxAge));
  res.json({ user: publicUser(user) });
}));

router.post('/logout', ah(async (req, res) => {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [S.hashToken(token)]);
  res.clearCookie(COOKIE, cookieOptions());
  res.json({ ok: true });
}));

router.post('/logout-all', requireAuth, ah(async (req, res) => {
  await db.query('DELETE FROM sessions WHERE user_id = $1', [req.user.id]);
  res.clearCookie(COOKIE, cookieOptions());
  res.json({ ok: true });
}));

/* ---- schimbare parolă (închide celelalte sesiuni) ---- */
router.post('/change-password', requireAuth, ah(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (typeof current_password !== 'string' || typeof new_password !== 'string') return res.status(400).json({ error: 'DATE_INVALIDE' });
  const r = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(current_password.slice(0, 72), r.rows[0].password_hash))) return res.status(401).json({ error: 'PAROLA_GRESITA' });
  const weak = S.weakPassword(new_password, { email: req.user.email, nickname: req.user.nickname });
  if (weak) return res.status(400).json({ error: 'PAROLA_SLABA', reason: weak });
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(new_password, BCRYPT_COST), req.user.id]);
  const keep = S.hashToken(req.cookies[COOKIE]);
  await db.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, keep]);
  res.json({ ok: true });
}));

/* ---- resetare parolă (răspuns identic, indiferent dacă emailul există) ---- */
router.post('/forgot-password', ah(async (req, res) => {
  const em = S.normEmail(req.body && req.body.email);
  if (!S.EMAIL_RE.test(em)) return res.status(400).json({ error: 'DATE_INVALIDE' });
  if (!mailAllow(S.clientIp(req))) return res.status(429).json({ error: 'RATE_LIMIT' });
  const r = await db.query("SELECT id, name, email FROM users WHERE LOWER(email) = $1 AND status = 'active'", [em]);
  if (r.rowCount) {
    const token = S.newToken();
    await db.query('INSERT INTO password_resets(user_id, token_hash, expires_at) VALUES($1,$2,$3)',
      [r.rows[0].id, S.hashToken(token), new Date(Date.now() + 30 * 60000)]);
    const link = `${baseUrl(req)}/#reseteaza-parola=${token}`;
    sendMail(em, 'Resetare parolă - Omnivo',
      `<p>Ai cerut resetarea parolei.</p><p><a href="${link}">Alege o parolă nouă</a> (valabil 30 de minute). Dacă nu ai cerut tu, ignoră mesajul.</p>`,
      `Resetează parola: ${link}`).catch((e) => console.error('mail resetare:', e.message));
  }
  res.json({ ok: true });
}));

router.post('/reset-password', ah(async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'DATE_INVALIDE' });
  const r = await db.query(
    `SELECT pr.id, pr.user_id, u.email, u.nickname FROM password_resets pr JOIN users u ON u.id = pr.user_id
      WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW()`, [S.hashToken(token)]);
  if (!r.rowCount) return res.status(400).json({ error: 'TOKEN_INVALID' });
  const weak = S.weakPassword(password, { email: r.rows[0].email, nickname: r.rows[0].nickname });
  if (weak) return res.status(400).json({ error: 'PAROLA_SLABA', reason: weak });
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, BCRYPT_COST), r.rows[0].user_id]);
  await db.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [r.rows[0].id]);
  await db.query('DELETE FROM sessions WHERE user_id = $1', [r.rows[0].user_id]);
  res.json({ ok: true });
}));

/* ---- confirmare email ---- */
router.post('/verify-email', ah(async (req, res) => {
  const token = req.body && req.body.token;
  if (typeof token !== 'string') return res.status(400).json({ error: 'DATE_INVALIDE' });
  const r = await db.query(
    `UPDATE email_verifications SET verified_at = NOW()
      WHERE token_hash = $1 AND verified_at IS NULL AND expires_at > NOW() RETURNING user_id`, [S.hashToken(token)]);
  if (!r.rowCount) return res.status(400).json({ error: 'TOKEN_INVALID' });
  await db.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [r.rows[0].user_id]);
  res.json({ ok: true });
}));

router.post('/resend-verification', requireAuth, ah(async (req, res) => {
  if (req.user.email_verified) return res.json({ ok: true, already: true });
  if (!mailAllow('verif:' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  await sendVerification(req, req.user);
  res.json({ ok: true });
}));

module.exports = { router, publicUser };
