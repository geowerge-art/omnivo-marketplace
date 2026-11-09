const crypto = require('crypto');

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NICK_RE = /^[a-z0-9_.-]{3,24}$/i; // fără @ și fără spații (nu se confundă cu emailul la login)
const PHONE_RE = /^\+?[0-9 ().-]{6,20}$/;

const normEmail = (e) => String(e || '').trim().toLowerCase();
const normNick = (n) => String(n || '').trim();

const COMMON = new Set([
  '12345678', '123456789', '1234567890', 'password', 'parola123', 'parola1234',
  'qwertyuiop', 'qwerty123', 'iloveyou', 'omnivo123', 'admin12345', '11111111'
]);

/* Întoarce un motiv (string) dacă parola e slabă, altfel null. Limita de 72 de octeți e cea a bcrypt. */
function weakPassword(pw, { email = '', nickname = '' } = {}) {
  const p = String(pw || '');
  if (p.length < 8) return 'TOO_SHORT';
  if (Buffer.byteLength(p) > 72) return 'TOO_LONG';
  const low = p.toLowerCase();
  if (COMMON.has(low)) return 'COMMON';
  if (/^\d+$/.test(p) && p.length < 12) return 'ONLY_DIGITS';
  if (/^(.)\1+$/.test(p)) return 'REPEATED';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return 'CONTAINS_EMAIL';
  const nick = String(nickname).toLowerCase();
  if (nick.length >= 4 && low.includes(nick)) return 'CONTAINS_NICKNAME';
  return null;
}

/* Limitare în memorie (pe o singură instanță). Întoarce false dacă s-a depășit limita. */
function createThrottle(max, windowMs) {
  const hits = new Map();
  return function allow(key) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { hits.set(key, arr); return false; }
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
    return true;
  };
}

function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = {
  hashToken, newToken, EMAIL_RE, NICK_RE, PHONE_RE,
  normEmail, normNick, weakPassword, createThrottle, clientIp
};
