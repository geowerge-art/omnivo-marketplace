/* „Studio”: statistici pe zile pentru vânzători (vizualizări, favorite, mesaje, numere afișate)
   și pentru moderatori (coada de moderare, timp de verificare, raportări). */
const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth, requireRole } = require('./authmw');
const { clientIp } = require('./security');
const plans = require('./plans');

const TZ = "'Europe/Bucharest'";
const TODAY = `(NOW() AT TIME ZONE ${TZ})::date`;
const DAYS = [7, 28, 90];

/* ---- numărare: un rând pe (anunț, zi); aceeași persoană nu mai numără aceeași acțiune în 30 de minute ---- */
const seen = new Map();
function fresh(key, ttl = 30 * 60 * 1000) {
  const now = Date.now(), t = seen.get(key);
  if (t && now - t < ttl) return false;
  seen.set(key, now);
  if (seen.size > 20000) { for (const [k, v] of seen) if (now - v > ttl) seen.delete(k); if (seen.size > 20000) seen.clear(); }
  return true;
}
function bump(listingId, col, who) {
  if (!['views', 'favs', 'chats', 'phones'].includes(col) || !listingId) return;
  if (who && !fresh(`${col}:${listingId}:${who}`)) return;
  db.query(`INSERT INTO listing_daily(listing_id, day, ${col}) VALUES($1, ${TODAY}, 1)
            ON CONFLICT (listing_id, day) DO UPDATE SET ${col} = listing_daily.${col} + 1`, [listingId]).catch(() => {});
}
const whoOf = (req) => (req.user ? 'u' + req.user.id : 'i' + clientIp(req));

const router = express.Router();
router.use(requireDb);

function pickDays(req) {
  const max = plans.limitsOf(req.user).stats_days;
  let d = DAYS.includes(Number(req.query.days)) ? Number(req.query.days) : 28;
  if (d > max) d = [...DAYS].reverse().find((x) => x <= max) || 7;
  return d;
}
const listingFilter = (req) => (/^\d{1,10}$/.test(String(req.query.listing || '')) ? Number(req.query.listing) : null);

/* seria zilnică pentru perioada curentă + cea anterioară (2 × days zile), ca să putem arăta tendința */
async function sellerSeries(uid, days, listing) {
  const r = await db.query(
    `WITH mine AS (
       SELECT d.day, d.views, d.favs, d.chats, d.phones FROM listing_daily d JOIN listings l ON l.id = d.listing_id
        WHERE l.user_id = $1 AND ($3::int IS NULL OR l.id = $3) AND d.day > ${TODAY} - ($2::int * 2))
     SELECT to_char(g.day::date, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(m.views), 0)::int AS views, COALESCE(SUM(m.favs), 0)::int AS favs,
            COALESCE(SUM(m.chats), 0)::int AS chats, COALESCE(SUM(m.phones), 0)::int AS phones
       FROM generate_series(${TODAY} - ($2::int * 2 - 1), ${TODAY}, '1 day') AS g(day)
       LEFT JOIN mine m ON m.day = g.day::date GROUP BY g.day ORDER BY g.day`, [uid, days, listing]);
  return r.rows;
}

router.get('/seller', requireAuth, ah(async (req, res) => {
  const days = pickDays(req), listing = listingFilter(req), uid = req.user.id, lim = plans.limitsOf(req.user);
  const [series, top, mine] = await Promise.all([
    sellerSeries(uid, days, listing),
    db.query(
      `SELECT l.id, l.title, l.status, COALESCE(SUM(d.views),0)::int AS views, COALESCE(SUM(d.favs),0)::int AS favs,
              COALESCE(SUM(d.chats),0)::int AS chats, COALESCE(SUM(d.phones),0)::int AS phones,
              (SELECT COALESCE(i.thumb_url, i.url) FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1) AS thumb
         FROM listings l LEFT JOIN listing_daily d ON d.listing_id = l.id AND d.day > ${TODAY} - $2::int
        WHERE l.user_id = $1 AND l.status <> 'deleted' GROUP BY l.id ORDER BY views DESC, l.id DESC LIMIT 10`, [uid, days]),
    db.query("SELECT id, title FROM listings WHERE user_id = $1 AND status IN ('approved','sold','pending') ORDER BY created_at DESC LIMIT 100", [uid])
  ]);
  res.set('Cache-Control', 'no-store').json({
    days, listing, series, top: top.rows, listings: mine.rows, export: lim.export,
    max_days: lim.stats_days, unlock: Object.fromEntries(DAYS.filter((d) => d > lim.stats_days).map((d) => [d, plans.PLANS[plans.minPlanForDays(d)].name]))
  });
}));

router.get('/seller.csv', requireAuth, ah(async (req, res) => {
  if (!plans.limitsOf(req.user).export) return res.status(403).json({ error: 'DOAR_TITANIUM' });
  const days = pickDays(req), rows = (await sellerSeries(req.user.id, days, listingFilter(req))).slice(-days);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="omnivo-statistici-${days}-zile.csv"`, 'Cache-Control': 'no-store' });
  res.send('\ufeffzi,vizualizari,salvari_favorite,mesaje_noi,numere_afisate\n' + rows.map((r) => `${r.day},${r.views},${r.favs},${r.chats},${r.phones}`).join('\n') + '\n');
}));

/* ---- Studio moderare (moderator și admin) ---- */
router.get('/moderation', requireAuth, requireRole('admin', 'moderator'), ah(async (req, res) => {
  const days = DAYS.includes(Number(req.query.days)) ? Number(req.query.days) : 28;
  const d = (col) => `(${col} AT TIME ZONE ${TZ})::date`;
  const [series, queue, review, leaders] = await Promise.all([
    db.query(
      `SELECT to_char(g.day::date, 'YYYY-MM-DD') AS day,
              (SELECT COUNT(*)::int FROM listings WHERE status <> 'deleted' AND ${d('created_at')} = g.day::date) AS new_listings,
              (SELECT COUNT(*)::int FROM users WHERE ${d('created_at')} = g.day::date) AS new_users,
              (SELECT COUNT(*)::int FROM admin_activity WHERE action = 'listing_approved' AND ${d('created_at')} = g.day::date) AS approved,
              (SELECT COUNT(*)::int FROM admin_activity WHERE action IN ('listing_rejected','listing_blocked') AND ${d('created_at')} = g.day::date) AS rejected,
              (SELECT COUNT(*)::int FROM reports WHERE ${d('created_at')} = g.day::date) AS reports,
              (SELECT COUNT(*)::int FROM listings WHERE auto_approved AND ${d('created_at')} = g.day::date) AS auto_approved,
              (SELECT COUNT(*)::int FROM guard_events WHERE ${d('created_at')} = g.day::date) AS guard_blocks
         FROM generate_series(${TODAY} - ($1::int * 2 - 1), ${TODAY}, '1 day') AS g(day) ORDER BY g.day`, [days]),
    db.query(`SELECT COUNT(*) FILTER (WHERE l.status = 'pending')::int AS pending,
                     EXTRACT(EPOCH FROM (NOW() - MIN(l.created_at) FILTER (WHERE l.status = 'pending'))) / 3600 AS oldest_h,
                     (SELECT COUNT(*)::int FROM reports WHERE status = 'open') AS open_reports,
                     (SELECT COUNT(*)::int FROM reports WHERE resolved_at > NOW() - $1::int * INTERVAL '1 day') AS resolved_reports
                FROM listings l`, [days]),
    db.query(`SELECT AVG(EXTRACT(EPOCH FROM (a.created_at - l.created_at)) / 3600) AS avg_h
                FROM admin_activity a JOIN listings l ON l.id = a.target_id
               WHERE a.target_type = 'listing' AND a.target_id > 0 AND a.action IN ('listing_approved','listing_rejected')
                 AND a.created_at > NOW() - $1::int * INTERVAL '1 day'`, [days]),
    db.query(`SELECT u.nickname, COUNT(*)::int AS n FROM admin_activity a JOIN users u ON u.id = a.admin_id
               WHERE a.action LIKE 'listing_%' AND a.created_at > NOW() - $1::int * INTERVAL '1 day'
               GROUP BY u.nickname ORDER BY n DESC LIMIT 8`, [days])
  ]);
  const q = queue.rows[0];
  res.set('Cache-Control', 'no-store').json({
    days, series: series.rows, leaders: leaders.rows,
    queue: { pending: q.pending, oldest_h: q.oldest_h == null ? null : Number(q.oldest_h), open_reports: q.open_reports, resolved_reports: q.resolved_reports, avg_review_h: review.rows[0].avg_h == null ? null : Number(review.rows[0].avg_h) }
  });
}));

module.exports = { router, bump, whoOf };
