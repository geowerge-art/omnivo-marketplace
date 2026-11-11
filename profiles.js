/* Profil public (ca la OLX / Vinted): date de încredere, anunțuri, recenzii. Recenziile merg în ambele sensuri:
   - ca vânzător (role 'seller'): le lasă cine i-a scris vânzătorului pe un anunț al lui;
   - ca cumpărător (role 'buyer'): le lasă vânzătorul unui cumpărător care i-a scris pe un anunț și căruia i-a răspuns.
   Una per (cine recenzează, cine e recenzat, anunț). Recenziile de la „Cere oferte” se lasă din chatul ofertei (requests.js). */
const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth } = require('./authmw');
const { createThrottle } = require('./security');
const { notify } = require('./notify');

const router = express.Router();
router.use(requireDb);
const reviewAllow = createThrottle(10, 60 * 60 * 1000);
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const uid = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
const isStaff = (u) => !!u && ['admin', 'moderator'].includes(u.role);
const roleOf = (v) => (v === 'buyer' ? 'buyer' : 'seller');

/* anunțul pentru care „eu” îl pot recenza pe „celălalt” în rolul cerut (null = nu pot) */
async function reviewable(me, other, role) {
  if (role === 'buyer') {
    // eu sunt vânzătorul: celălalt mi-a scris pe un anunț al meu și i-am răspuns
    return (await db.query(
      `SELECT l.id AS listing_id FROM listings l
        WHERE l.user_id = $1
          AND EXISTS (SELECT 1 FROM messages m WHERE m.listing_id = l.id AND m.sender_id = $2 AND m.recipient_id = $1)
          AND EXISTS (SELECT 1 FROM messages m WHERE m.listing_id = l.id AND m.sender_id = $1 AND m.recipient_id = $2)
          AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.reviewer_id = $1 AND r.seller_id = $2 AND r.listing_id = l.id)
        ORDER BY l.id DESC LIMIT 1`, [me, other])).rows[0];
  }
  // eu sunt cumpărătorul: i-am scris celuilalt pe un anunț al lui
  return (await db.query(
    `SELECT m.listing_id FROM messages m JOIN listings l ON l.id = m.listing_id
      WHERE l.user_id = $2 AND m.sender_id = $1 AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.reviewer_id = $1 AND r.seller_id = $2 AND r.listing_id = m.listing_id)
      ORDER BY m.listing_id DESC LIMIT 1`, [me, other])).rows[0];
}

const avgOf = (id, role) => db.query(
  "SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS avg, COUNT(*)::int AS n FROM reviews WHERE seller_id = $1 AND role = $2", [id, role]);

router.get('/:id(\\d+)/profile', ah(async (req, res) => {
  const id = uid(req.params.id);
  const u = (await db.query("SELECT id, nickname, about, email_verified, created_at FROM users WHERE id = $1 AND status = 'active'", [id])).rows[0];
  if (!u) return res.status(404).json({ error: 'NEGASIT' });
  const [cnt, county, rat, ratB] = await Promise.all([
    db.query(`SELECT COUNT(*) FILTER (WHERE status = 'approved' AND expires_at > NOW())::int AS active, COUNT(*) FILTER (WHERE status = 'sold')::int AS sold FROM listings WHERE user_id = $1`, [id]),
    db.query("SELECT county FROM listings WHERE user_id = $1 AND county <> '' AND status <> 'deleted' GROUP BY county ORDER BY COUNT(*) DESC LIMIT 1", [id]),
    avgOf(id, 'seller'), avgOf(id, 'buyer')
  ]);
  const me = req.user, other = !!me && me.id !== id;
  res.json({ profile: {
    id: u.id, nickname: u.nickname, about: u.about || '', since: u.created_at, email_verified: !!u.email_verified,
    county: county.rows[0] ? county.rows[0].county : '', active: cnt.rows[0].active, sold: cnt.rows[0].sold,
    rating: rat.rows[0], rating_buyer: ratB.rows[0],
    presence: await require('./live').presenceOf(id).catch(() => undefined),
    mine: !!me && me.id === id,
    can_review: other && !!(await reviewable(me.id, id, 'seller')),
    can_review_buyer: other && !!(await reviewable(me.id, id, 'buyer'))
  } });
}));

router.get('/:id(\\d+)/reviews', ah(async (req, res) => {
  const lim = Math.min(30, Math.max(1, Math.floor(Number(req.query.limit)) || 10)), off = Math.min(100000, Math.max(0, Math.floor(Number(req.query.offset)) || 0));
  const role = roleOf(req.query.role);
  const r = await db.query(
    `SELECT r.id, r.rating, r.body, r.created_at, r.reviewer_id, u.nickname AS reviewer, l.title AS listing,
            CASE WHEN pr.id IS NOT NULL THEN concat_ws(' ', pr.part, pr.brand, pr.model) END AS request
       FROM reviews r LEFT JOIN users u ON u.id = r.reviewer_id LEFT JOIN listings l ON l.id = r.listing_id
       LEFT JOIN quotes q ON q.id = r.quote_id LEFT JOIN part_requests pr ON pr.id = q.request_id
      WHERE r.seller_id = $1 AND r.role = $2 ORDER BY r.created_at DESC LIMIT ${lim} OFFSET ${off}`, [uid(req.params.id), role]);
  const me = req.user;
  res.json({ role, rows: r.rows.map((x) => ({ ...x, can_delete: !!me && (me.id === x.reviewer_id || isStaff(me)) })) });
}));

router.post('/:id(\\d+)/reviews', requireAuth, ah(async (req, res) => {
  if (!reviewAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const target = uid(req.params.id), b = req.body || {}, rating = Number(b.rating), body = clip(b.body, 500), role = roleOf(b.role);
  if (target === req.user.id) return res.status(400).json({ error: 'RECENZIE_PROPRIE' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'RECENZIE_STELE' });
  if (body && /(https?:\/\/|www\.|\S+@\S+\.\S+)/i.test(body)) return res.status(400).json({ error: 'LINK_INTERZIS' });
  const ok = (await db.query("SELECT 1 FROM users WHERE id = $1 AND status = 'active'", [target])).rowCount;
  if (!ok) return res.status(404).json({ error: 'NEGASIT' });
  const t = await reviewable(req.user.id, target, role);
  if (!t) {
    const talked = role === 'buyer'
      ? (await db.query('SELECT 1 FROM messages m JOIN listings l ON l.id = m.listing_id WHERE l.user_id = $1 AND m.sender_id = $2 AND m.recipient_id = $1 LIMIT 1', [req.user.id, target])).rowCount
      : (await db.query('SELECT 1 FROM messages m JOIN listings l ON l.id = m.listing_id WHERE l.user_id = $2 AND m.sender_id = $1 LIMIT 1', [req.user.id, target])).rowCount;
    return res.status(409).json({ error: talked ? 'RECENZIE_EXISTENTA' : role === 'buyer' ? 'FARA_CONVERSATIE_CUMPARATOR' : 'FARA_CONVERSATIE' });
  }
  const r = await db.query('INSERT INTO reviews(seller_id, reviewer_id, listing_id, rating, body, role) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [target, req.user.id, t.listing_id, rating, body || null, role]);
  notify(target, 'review', null, `Ai primit o recenzie de ${rating} ${rating === 1 ? 'stea' : 'stele'}`, `De la @${req.user.nickname}, ca ${role === 'buyer' ? 'cumpărător' : 'vânzător'}.`);
  res.status(201).json({ ok: true, id: r.rows[0].id });
}));

router.delete('/reviews/:rid(\\d+)', requireAuth, ah(async (req, res) => {
  const cur = (await db.query('SELECT id, seller_id, reviewer_id, rating FROM reviews WHERE id = $1', [req.params.rid])).rows[0];
  if (!cur) return res.status(404).json({ error: 'NEGASIT' });
  if (cur.reviewer_id !== req.user.id && !isStaff(req.user)) return res.status(403).json({ error: 'INTERZIS' });
  await db.query('DELETE FROM reviews WHERE id = $1', [cur.id]);
  if (isStaff(req.user) && cur.reviewer_id !== req.user.id)
    db.query('INSERT INTO admin_activity(admin_id, action, target_type, target_id, details) VALUES($1,$2,$3,$4,$5)', [req.user.id, 'review_delete', 'user', cur.seller_id, `recenzie de ${cur.rating}★ ștearsă`]).catch(() => {});
  res.json({ ok: true });
}));

router.put('/me/about', requireAuth, ah(async (req, res) => {
  await db.query('UPDATE users SET about = $2 WHERE id = $1', [req.user.id, clip((req.body || {}).about, 300) || null]);
  res.json({ ok: true });
}));

module.exports = { router };
