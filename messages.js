const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth, requireVerified } = require('./authmw');
const { createThrottle } = require('./security');
const live = require('./live');

const router = express.Router();
router.use(requireDb, requireAuth);

const sendAllow = createThrottle(60, 60 * 60 * 1000);  // max 60 mesaje/oră per utilizator
const blockAllow = createThrottle(60, 60 * 60 * 1000);
const typingAllow = createThrottle(90, 60 * 1000);
const MAX_BODY = 2000, MAX_BLOCKS = 200;

const toId = (v) => (/^\d{1,10}$/.test(String(v)) ? Number(v) : null);

/* { byMe, byThem }: cine pe cine a blocat între cei doi utilizatori. */
async function blockState(me, other) {
  const r = await db.query(
    `SELECT COUNT(*) FILTER (WHERE blocker_id = $1)::int AS by_me, COUNT(*) FILTER (WHERE blocker_id = $2)::int AS by_them
       FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`, [me, other]);
  return { byMe: r.rows[0].by_me > 0, byThem: r.rows[0].by_them > 0 };
}

/* ---- număr de mesaje necitite (pentru insigna din meniu) ---- */
router.get('/unread', ah(async (req, res) => {
  const r = await db.query(
    `SELECT COUNT(*)::int AS n FROM messages m
      WHERE m.recipient_id = $1 AND m.read_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = $1 AND b.blocked_id = m.sender_id)`, [req.user.id]);
  res.set('Cache-Control', 'no-store').json({ unread: r.rows[0].n });
}));

/* ---- lista conversațiilor: câte una pe (anunț, persoană), cu ultimul mesaj ---- */
router.get('/', ah(async (req, res) => {
  const r = await db.query(
    `WITH m AS (
       SELECT id, listing_id, body, created_at, read_at, delivered_at, (sender_id = $1) AS mine,
              CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other
         FROM messages WHERE sender_id = $1 OR recipient_id = $1)
     SELECT t.listing_id, t.other, u.nickname AS other_name, l.title, t.body, t.created_at, t.mine, t.read_at, t.delivered_at,
            (SELECT COUNT(*)::int FROM m x WHERE x.listing_id = t.listing_id AND x.other = t.other AND NOT x.mine AND x.read_at IS NULL) AS unread
       FROM (SELECT DISTINCT ON (listing_id, other) * FROM m ORDER BY listing_id, other, id DESC) t
       JOIN users u ON u.id = t.other
       JOIN listings l ON l.id = t.listing_id AND l.status <> 'deleted'
      WHERE NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = $1 AND b.blocked_id = t.other)
      ORDER BY t.id DESC LIMIT 100`, [req.user.id]);
  res.set('Cache-Control', 'no-store').json({ threads: r.rows });
}));

/* ---- o conversație; deschiderea ei marchează mesajele primite ca citite ---- */
router.get('/thread', ah(async (req, res) => {
  const listingId = toId(req.query.listing), other = toId(req.query.with), me = req.user.id;
  if (!listingId || !other || other === me) return res.status(400).json({ error: 'DATE_INVALIDE' });
  const [lr, ur] = await Promise.all([
    db.query("SELECT id, user_id, title, status FROM listings WHERE id = $1 AND status <> 'deleted'", [listingId]),
    db.query("SELECT id, nickname FROM users WHERE id = $1 AND status = 'active'", [other])
  ]);
  const l = lr.rows[0];
  // conversația există doar între proprietarul anunțului și altcineva
  if (!l || !ur.rowCount || (l.user_id !== me && l.user_id !== other)) return res.status(404).json({ error: 'NEGASIT' });
  const rows = (await db.query(
    `SELECT id, body, created_at, (sender_id = $2) AS mine, (read_at IS NOT NULL) AS read, (delivered_at IS NOT NULL) AS delivered FROM messages
      WHERE listing_id = $1 AND ((sender_id = $2 AND recipient_id = $3) OR (sender_id = $3 AND recipient_id = $2))
      ORDER BY id DESC LIMIT 300`, [listingId, me, other])).rows.reverse();
  // deschiderea conversației = „citit": expeditorul vede bifele albastre
  const rd = await db.query('UPDATE messages SET read_at = NOW(), delivered_at = COALESCE(delivered_at, NOW()) WHERE listing_id = $1 AND sender_id = $2 AND recipient_id = $3 AND read_at IS NULL RETURNING id', [listingId, other, me]);
  if (rd.rowCount) live.send(other, 'msg_status', { with: me, listing: listingId, ids: rd.rows.map((x) => x.id), status: 'read' });
  const bs = await blockState(me, other);
  res.set('Cache-Control', 'no-store').json({
    listing: { id: l.id, title: l.title, status: l.status },
    other: ur.rows[0], messages: rows, blocked_by_me: bs.byMe, presence: await live.presenceOf(other)
  });
}));

/* ---- trimitere ----
   Cumpărătorul scrie vânzătorului anunțului. Vânzătorul poate doar să răspundă cuiva care i-a scris deja,
   ca să nu poată trimite mesaje nesolicitate. */
router.post('/', requireVerified, ah(async (req, res) => {
  const b = req.body || {}, body = String(b.body || '').trim(), listingId = toId(b.listing_id), me = req.user.id;
  if (!listingId || !body || body.length > MAX_BODY) return res.status(400).json({ error: 'MESAJ_INVALID' });
  const l = (await db.query('SELECT id, user_id, status FROM listings WHERE id = $1', [listingId])).rows[0];
  if (!l || !l.user_id || l.status === 'deleted') return res.status(404).json({ error: 'NEGASIT' });

  let to;
  if (l.user_id !== me) {
    if (!['approved', 'sold'].includes(l.status)) return res.status(404).json({ error: 'NEGASIT' });
    to = l.user_id;
  } else {
    to = toId(b.to);
    if (!to || to === me) return res.status(400).json({ error: 'DESTINATAR_INVALID' });
    const had = await db.query('SELECT 1 FROM messages WHERE listing_id = $1 AND sender_id = $2 AND recipient_id = $3 LIMIT 1', [listingId, to, me]);
    if (!had.rowCount) return res.status(403).json({ error: 'INTERZIS' });
  }
  if (!(await db.query("SELECT 1 FROM users WHERE id = $1 AND status = 'active'", [to])).rowCount) return res.status(404).json({ error: 'NEGASIT' });
  if (!sendAllow('u' + me)) return res.status(429).json({ error: 'PREA_MULTE_MESAJE' });
  const bs = await blockState(me, to);
  if (bs.byMe) return res.status(403).json({ error: 'BLOCAT_DE_TINE' });
  if (bs.byThem) return res.status(403).json({ error: 'BLOCAT' });

  // dublă apăsare: același mesaj în aceeași conversație în ultimele 8 secunde nu se salvează a doua oară
  const dup = (await db.query(
    "SELECT id, created_at FROM messages WHERE listing_id = $1 AND sender_id = $2 AND recipient_id = $3 AND body = $4 AND created_at > NOW() - INTERVAL '8 seconds' ORDER BY id DESC LIMIT 1",
    [listingId, me, to, body])).rows[0];
  if (dup) return res.json({ message: dup, duplicate: true });
  const online = live.isOnline(to);
  const r = await db.query('INSERT INTO messages(listing_id, sender_id, recipient_id, body, delivered_at) VALUES($1,$2,$3,$4, CASE WHEN $5::boolean THEN NOW() END) RETURNING id, created_at', [listingId, me, to, body, online]);
  live.send(to, 'message', { id: r.rows[0].id, from: me, listing_id: listingId, body, created_at: r.rows[0].created_at });
  res.status(201).json({ message: { ...r.rows[0], delivered: online } });
}));

/* ---- „scrie…": semnal efemer, nu se salvează nimic ---- */
router.post('/typing', ah(async (req, res) => {
  const to = toId((req.body || {}).to), listing = toId((req.body || {}).listing_id);
  if (!to || to === req.user.id) return res.status(400).json({ error: 'DESTINATAR_INVALID' });
  if (!typingAllow('u' + req.user.id)) return res.json({ ok: true });
  const me = (await db.query('SELECT show_presence FROM users WHERE id = $1', [req.user.id])).rows[0];
  if (me && me.show_presence === false) return res.json({ ok: true });
  const bs = await blockState(req.user.id, to);
  if (!bs.byMe && !bs.byThem) live.send(to, 'typing', { from: req.user.id, listing });
  res.json({ ok: true });
}));

/* ---- „Arată când sunt online și când scriu" ---- */
router.get('/prefs', ah(async (req, res) => {
  const u = (await db.query('SELECT show_presence FROM users WHERE id = $1', [req.user.id])).rows[0];
  res.set('Cache-Control', 'no-store').json({ show_presence: !u || u.show_presence !== false });
}));
router.put('/prefs', ah(async (req, res) => {
  await db.query('UPDATE users SET show_presence = $2 WHERE id = $1', [req.user.id, (req.body || {}).show_presence !== false]);
  res.json({ ok: true });
}));

/* ---- blocare / deblocare ---- */
router.post('/block', ah(async (req, res) => {
  if (!blockAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const id = toId((req.body || {}).user_id);
  if (!id || id === req.user.id) return res.status(400).json({ error: 'DATE_INVALIDE' });
  const t = (await db.query('SELECT role FROM users WHERE id = $1', [id])).rows[0];
  if (!t) return res.status(404).json({ error: 'NEGASIT' });
  if (['admin', 'moderator'].includes(t.role)) return res.status(400).json({ error: 'NU_SE_POATE_BLOCA' });
  const n = (await db.query('SELECT COUNT(*)::int AS n FROM user_blocks WHERE blocker_id = $1', [req.user.id])).rows[0].n;
  if (n >= MAX_BLOCKS) return res.status(400).json({ error: 'PREA_MULTE_BLOCARI' });
  await db.query('INSERT INTO user_blocks(blocker_id, blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
  res.json({ ok: true });
}));

router.delete('/block/:uid(\\d+)', ah(async (req, res) => {
  await db.query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.user.id, Number(req.params.uid)]);
  res.json({ ok: true });
}));

module.exports = { router };
