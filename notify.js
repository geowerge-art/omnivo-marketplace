/* Notificări în aplicație. Se creează din: reducere de preț la un anunț salvat, anunț nou care se potrivește cu o căutare salvată,
   rezultatul moderării. Fiecare notificare e trimisă și în timp real (SSE, evenimentul „notify”) dacă utilizatorul e conectat. */
const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth } = require('./authmw');
const live = require('./live');

const KEEP = 100;                  // câte notificări se păstrează per utilizator
const MATCH_PER_HOUR = 10;         // plafon ca o căutare largă să nu inunde utilizatorul
const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const money = (n, cur) => `${Number(n).toLocaleString('ro-RO')} ${cur === 'EUR' ? '€' : 'lei'}`;

async function notify(userId, kind, listingId, title, body = '') {
  try {
    const r = await db.query('INSERT INTO notifications(user_id, kind, listing_id, title, body) VALUES($1,$2,$3,$4,$5) RETURNING id', [userId, kind, listingId || null, String(title).slice(0, 200), String(body).slice(0, 300)]);
    live.send(userId, 'notify', { id: r.rows[0].id, kind, listing_id: listingId || null, title, body });
    db.query('DELETE FROM notifications WHERE user_id = $1 AND id NOT IN (SELECT id FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2)', [userId, KEEP]).catch(() => {});
  } catch (e) { console.error('notify:', e.message); }
}

/* un anunț salvat la favorite și-a redus prețul */
async function priceDrop(listingId, title, oldPrice, newPrice, currency) {
  try {
    const r = await db.query('SELECT f.user_id FROM favorites f JOIN listings l ON l.id = f.listing_id WHERE f.listing_id = $1 AND f.user_id <> l.user_id LIMIT 500', [listingId]);
    for (const u of r.rows) await notify(u.user_id, 'price', listingId, `Preț redus: ${title}`, `${money(oldPrice, currency)} → ${money(newPrice, currency)}`);
  } catch (e) { console.error('priceDrop:', e.message); }
}

/* un anunț tocmai a fost publicat: anunțăm persoanele cu o căutare salvată care i se potrivește */
async function matchSaved(listingId) {
  try {
    const l = (await db.query(
      `SELECT l.id, l.user_id, l.title, l.search_text, l.price, l.currency, c.slug AS cslug, p.slug AS pslug
         FROM listings l JOIN categories c ON c.id = l.category_id LEFT JOIN categories p ON p.id = c.parent_id
        WHERE l.id = $1 AND l.status = 'approved'`, [listingId])).rows[0];
    if (!l) return;
    const hay = fold(l.title + ' ' + (l.search_text || ''));
    const cats = [l.cslug, l.pslug].filter(Boolean);
    const cand = await db.query(
      "SELECT id, user_id, q, label FROM saved_searches WHERE user_id <> $1 AND (category_slug = '' OR category_slug = ANY($2::text[])) ORDER BY id DESC LIMIT 3000", [l.user_id, cats]);
    const done = new Set();
    for (const s of cand.rows) {
      if (done.size >= 200) break;
      if (done.has(s.user_id)) continue;
      const words = fold(s.q).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
      if (words.some((w) => !hay.includes(w))) continue;
      const recent = await db.query("SELECT COUNT(*)::int n FROM notifications WHERE user_id = $1 AND kind = 'match' AND created_at > NOW() - INTERVAL '1 hour'", [s.user_id]);
      if (recent.rows[0].n >= MATCH_PER_HOUR) continue;
      done.add(s.user_id);
      await notify(s.user_id, 'match', l.id, `Anunț nou: ${l.title}`, `Se potrivește cu căutarea ta „${String(s.label || s.q || 'salvată').slice(0, 80)}”` + (l.price != null ? ` · ${money(l.price, l.currency)}` : ''));
    }
  } catch (e) { console.error('matchSaved:', e.message); }
}

/* rezultatul moderării, pentru vânzător */
async function moderation(ids, status, note) {
  try {
    const r = await db.query('SELECT id, user_id, title FROM listings WHERE id = ANY($1::int[])', [ids]);
    const t = { approved: 'Anunțul tău a fost aprobat', rejected: 'Anunțul tău a fost respins', blocked: 'Anunțul tău a fost blocat' }[status];
    if (!t) return;
    for (const x of r.rows) await notify(x.user_id, 'mod_' + status, x.id, t, status === 'approved' ? x.title : `${x.title}${note ? ' · Motiv: ' + note : ''}`);
  } catch (e) { console.error('moderation notify:', e.message); }
}

const router = express.Router();
router.use(requireDb, requireAuth);

router.get('/', ah(async (req, res) => {
  const r = await db.query('SELECT id, kind, listing_id, title, body, created_at, (read_at IS NOT NULL) AS read FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2', [req.user.id, KEEP]);
  res.set('Cache-Control', 'no-store').json({ notifications: r.rows, unread: r.rows.filter((x) => !x.read).length });
}));
router.get('/count', ah(async (req, res) => {
  const r = await db.query('SELECT COUNT(*)::int n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.set('Cache-Control', 'no-store').json({ unread: r.rows[0].n });
}));
router.post('/read', ah(async (req, res) => {
  await db.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

module.exports = { router, notify, priceDrop, matchSaved, moderation };
