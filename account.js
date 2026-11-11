/* Drepturile GDPR ale utilizatorului: descărcarea datelor proprii și ștergerea contului. */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth, COOKIE, cookieOptions } = require('./authmw');
const { createThrottle } = require('./security');
const { eraseUser } = require('./erase');

const router = express.Router();
router.use(requireDb, requireAuth);
const exportAllow = createThrottle(5, 60 * 60 * 1000), deleteAllow = createThrottle(5, 60 * 60 * 1000);
const SECRET = /(password|hash|token|secret)/i, LIMIT = 10000;
const strip = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !SECRET.test(k) && k !== 'search_text'));

/* Toate datele pe care le avem despre cont, într-un fișier JSON. Nu include parole, tokenuri sau conținutul altor persoane
   (mesajele primite și identitatea celor care te-au evaluat nu sunt incluse). */
router.get('/export', ah(async (req, res) => {
  if (!exportAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const id = req.user.id;
  const q = async (sql) => { try { return (await db.query(sql + ` LIMIT ${LIMIT}`, [id])).rows.map(strip); } catch { return null; } }; // tabel lipsă => null, nu pică exportul
  const data = {
    generat_la: new Date().toISOString(),
    nota: 'Acestea sunt datele păstrate de Omnivo despre contul tău. Parolele și tokenurile nu sunt incluse.',
    cont: (await q('SELECT * FROM users WHERE id = $1'))?.[0] || null,
    anunturi: await q('SELECT * FROM listings WHERE user_id = $1 ORDER BY id'),
    poze_anunturi: await q('SELECT i.listing_id, i.url, i.position FROM listing_images i JOIN listings l ON l.id = i.listing_id WHERE l.user_id = $1'),
    favorite: await q('SELECT f.listing_id, l.title, f.created_at FROM favorites f LEFT JOIN listings l ON l.id = f.listing_id WHERE f.user_id = $1'),
    cautari_salvate: await q('SELECT * FROM saved_searches WHERE user_id = $1'),
    mesaje_trimise: await q('SELECT m.listing_id, u.nickname AS catre, m.body, m.created_at FROM messages m JOIN users u ON u.id = m.recipient_id WHERE m.sender_id = $1 ORDER BY m.created_at'),
    recenzii_scrise: await q('SELECT seller_id, rating, body, created_at FROM reviews WHERE reviewer_id = $1'),
    recenzii_primite: await q('SELECT rating, body, created_at FROM reviews WHERE seller_id = $1'),
    notificari: await q('SELECT kind, title, body, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY id'),
    plati_si_credite: await q('SELECT * FROM credit_tx WHERE user_id = $1 ORDER BY id'),
    sesiuni: await q('SELECT created_at, last_seen_at, expires_at, user_agent FROM sessions WHERE user_id = $1'),
    raportari_trimise: await q('SELECT listing_id, reason, details, status, created_at FROM reports WHERE reporter_id = $1'),
    utilizatori_blocati: await q('SELECT u.nickname, b.created_at FROM user_blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = $1'),
    mesaje_de_contact: await q('SELECT * FROM contact_messages WHERE user_id = $1')
  };
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="omnivo-datele-mele-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));

/* Ștergerea contului: parola + cuvântul STERGE. Conturile de administrator/moderator trebuie mai întâi retrogradate. */
router.post('/delete', ah(async (req, res) => {
  const { password, confirm } = req.body || {};
  if (!deleteAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  if (String(confirm || '').trim().toUpperCase() !== 'STERGE') return res.status(400).json({ error: 'CONFIRMARE_LIPSA' });
  if (req.user.role !== 'user') return res.status(403).json({ error: 'CONT_PRIVILEGIAT' });
  const r = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!r.rowCount || typeof password !== 'string' || !(await bcrypt.compare(password.slice(0, 72), r.rows[0].password_hash))) return res.status(401).json({ error: 'PAROLA_GRESITA' });
  await eraseUser(req.user.id);
  res.clearCookie(COOKIE, cookieOptions());
  res.json({ ok: true });
}));

module.exports = { router };
