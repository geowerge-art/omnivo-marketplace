/* „Schimb”: anunțuri la care proprietarul acceptă schimb. Listă publică, anunțurile mele cu potriviri (directe și în lanț de 3). */
const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth } = require('./authmw');
const { createThrottle } = require('./security');
const { matchAll, validWants, tokens, fit, mutual } = require('./swap-match');

const router = express.Router();
router.use(requireDb);
const putAllow = createThrottle(40, 60 * 60 * 1000);
const MAX_SWAPS = 20;

const THUMB = "(SELECT COALESCE(i.thumb_url, i.url) FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1)";
const CAND = `SELECT s.listing_id AS id, s.user_id, s.wants, l.title, l.price, l.currency, l.county, l.city, u.nickname, ${THUMB} AS thumb
                FROM swaps s JOIN listings l ON l.id = s.listing_id JOIN users u ON u.id = s.user_id
               WHERE l.status = 'approved' AND u.status = 'active'`;
const toId = (v) => (/^\d{1,10}$/.test(String(v)) ? Number(v) : null);

const NOTIFY_PER_HOUR = 5;   // plafon: să nu inundăm pe nimeni
/* Un anunț la schimb tocmai a apărut / s-a schimbat / a fost aprobat: anunțăm ambele părți la fiecare potrivire dublă nouă.
   Fiecare pereche se anunță o singură dată (după listing_id-ul celuilalt), iar fiecare utilizator primește cel mult 5 pe oră. */
async function notifyMatches(listingId) {
  try {
    const notify = require('./notify').notify;
    const me = (await db.query(`${CAND} AND s.listing_id = $1`, [listingId])).rows[0];
    if (!me) return;
    const others = (await db.query(
      `${CAND} AND s.user_id <> $1
          AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = s.user_id) OR (b.blocker_id = s.user_id AND b.blocked_id = $1))
        ORDER BY s.updated_at DESC LIMIT 400`, [me.user_id])).rows;
    const allowed = async (uid, otherListing) => {
      const r = await db.query(
        `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS h, COUNT(*) FILTER (WHERE listing_id = $2)::int AS same
           FROM notifications WHERE user_id = $1 AND kind = 'swap'`, [uid, otherListing]);
      return r.rows[0].h < NOTIFY_PER_HOUR && r.rows[0].same === 0;
    };
    let sent = 0;
    for (const o of others) {
      if (sent >= 10) break;
      if (!mutual(me, o)) continue;
      if (await allowed(me.user_id, o.id)) await notify(me.user_id, 'swap', o.id, `Potrivire la schimb: ${o.title}`, `${o.nickname || 'Cineva'} caută ce ai tu („${me.title}”) și are ce cauți.`);
      if (await allowed(o.user_id, me.id)) await notify(o.user_id, 'swap', me.id, `Potrivire la schimb: ${me.title}`, `${me.nickname || 'Cineva'} caută ce ai tu („${o.title}”) și are ce cauți.`);
      sent++;
    }
  } catch (e) { console.error('notifyMatches:', e.message); }
}

/* Lista publică: ?q= caută în titlu și în „ce caută”. */
router.get('/', ah(async (req, res) => {
  const limit = Math.min(48, Math.max(1, Math.floor(Number(req.query.limit)) || 30));
  const r = await db.query(`${CAND} ORDER BY s.updated_at DESC LIMIT 300`);
  let rows = r.rows;
  const q = tokens(String(req.query.q || '').slice(0, 100));
  if (q.length) rows = rows.filter((x) => fit(q, tokens(x.title + ' ' + x.wants)) >= 0.6 || fit(q, tokens(x.wants)) > 0);
  res.json({ swaps: rows.slice(0, limit), total: rows.length });
}));

/* Schimburile mele + potriviri. */
router.get('/mine', requireAuth, ah(async (req, res) => {
  const uid = req.user.id;
  const mine = (await db.query(
    `SELECT s.listing_id AS id, s.user_id, s.wants, l.title, l.status, l.price, l.currency, ${THUMB} AS thumb
       FROM swaps s JOIN listings l ON l.id = s.listing_id WHERE s.user_id = $1 AND l.status <> 'deleted' ORDER BY s.updated_at DESC`, [uid])).rows;
  const others = (await db.query(
    `${CAND} AND s.user_id <> $1
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = s.user_id) OR (b.blocker_id = s.user_id AND b.blocked_id = $1))
      ORDER BY s.updated_at DESC LIMIT 400`, [uid])).rows;
  const m = matchAll(mine.filter((x) => x.status === 'approved'), others);
  res.set('Cache-Control', 'no-store').json({ mine, direct: m.direct, chains: m.chains });
}));

/* wants pentru un anunț (formularul de editare îl precompletează) */
router.get('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.query('SELECT wants FROM swaps WHERE listing_id = $1', [toId(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  res.json({ wants: r.rows[0].wants });
}));

router.put('/:id(\\d+)', requireAuth, ah(async (req, res) => {
  const id = toId(req.params.id), uid = req.user.id;
  const w = validWants((req.body || {}).wants);
  if (w.error) return res.status(400).json({ error: w.error });
  if (!putAllow('u' + uid)) return res.status(429).json({ error: 'PREA_MULTE_CERERI' });
  const l = (await db.query('SELECT id, status FROM listings WHERE id = $1 AND user_id = $2', [id, uid])).rows[0];
  if (!l || !['approved', 'pending'].includes(l.status)) return res.status(404).json({ error: 'NEGASIT' });
  const n = await db.query('SELECT COUNT(*)::int AS n FROM swaps WHERE user_id = $1 AND listing_id <> $2', [uid, id]);
  if (n.rows[0].n >= MAX_SWAPS) return res.status(400).json({ error: 'PREA_MULTE_SCHIMBURI' });
  await db.query(
    `INSERT INTO swaps (listing_id, user_id, wants) VALUES ($1, $2, $3)
     ON CONFLICT (listing_id) DO UPDATE SET wants = EXCLUDED.wants, updated_at = NOW()`, [id, uid, w.v]);
  res.json({ ok: true, wants: w.v });
  if (l.status === 'approved') notifyMatches(id);
}));

router.delete('/:id(\\d+)', requireAuth, ah(async (req, res) => {
  await db.query('DELETE FROM swaps WHERE listing_id = $1 AND user_id = $2', [toId(req.params.id), req.user.id]);
  res.json({ ok: true });
}));

module.exports = { router, notifyMatches };
