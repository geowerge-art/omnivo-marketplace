const db = require('./db');
const { hashToken } = require('./security');
const config = require('./config');

const COOKIE = 'session';

const cookieOptions = (maxAgeMs) => ({
  httpOnly: true, sameSite: 'lax', secure: config.IS_PROD, path: '/', ...(maxAgeMs ? { maxAge: maxAgeMs } : {})
});

/* Atașează req.user dacă există o sesiune validă. Nu blochează cererea. */
async function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies && req.cookies[COOKIE];
  if (!token || !db.hasDb()) return next();
  try {
    const r = await db.query(
      `SELECT u.id,u.name,u.nickname,u.email,u.phone,u.show_phone,u.role,u.status,u.email_verified,
              s.id AS session_id, s.last_seen_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [hashToken(token)]);
    if (r.rowCount && r.rows[0].status === 'active') {
      req.user = r.rows[0];
      if (Date.now() - new Date(r.rows[0].last_seen_at).getTime() > 10 * 60 * 1000) {
        db.query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1', [r.rows[0].session_id]).catch(() => {});
      }
    }
  } catch (e) { console.error('loadUser:', e.message); }
  next();
}

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'NEAUTENTIFICAT' }));

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'NEAUTENTIFICAT' });
  return roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'INTERZIS' });
};

/* Dacă REQUIRE_VERIFIED_EMAIL=true, doar conturile cu email confirmat pot publica. Adminii sunt scutiți. */
const requireVerified = (req, res, next) => {
  if (!config.REQUIRE_VERIFIED_EMAIL || req.user.role !== 'user' || req.user.email_verified) return next();
  return res.status(403).json({ error: 'EMAIL_NECONFIRMAT' });
};

module.exports = { COOKIE, cookieOptions, loadUser, requireAuth, requireRole, requireVerified };
