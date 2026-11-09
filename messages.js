const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth, requireVerified } = require('./authmw');
const { createThrottle } = require('./security');
const live = require('./live');
const crypto = require('crypto');
const imgs = require('./images');

const router = express.Router();
router.use(requireDb, requireAuth);

const sendAllow = createThrottle(60, 60 * 60 * 1000);  // max 60 mesaje/oră per utilizator
const blockAllow = createThrottle(60, 60 * 60 * 1000);
const typingAllow = createThrottle(90, 60 * 1000);
const MAX_BODY = 2000, MAX_BLOCKS = 200, CHAT_QUOTA = 40 * 1024 * 1024;
const upAllow = createThrottle(40, 60 * 60 * 1000);   // max 40 poze/oră per utilizator

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
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = $1 AND b.blocked_id = m.sender_id)
        AND NOT EXISTS (SELECT 1 FROM chat_hidden h WHERE h.user_id = $1 AND h.listing_id = m.listing_id AND h.other_id = m.sender_id AND h.cleared_at >= m.created_at)`, [req.user.id]);
  res.set('Cache-Control', 'no-store').json({ unread: r.rows[0].n });
}));

/* ---- lista conversațiilor: câte una pe (anunț, persoană), cu ultimul mesaj ---- */
router.get('/', ah(async (req, res) => {
  const r = await db.query(
    `WITH m AS (
       SELECT id, listing_id, body, (SELECT c.kind FROM chat_images c WHERE c.id = messages.image_id) AS attach, created_at, read_at, delivered_at, (sender_id = $1) AS mine,
              CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other
         FROM messages WHERE sender_id = $1 OR recipient_id = $1)
     SELECT t.listing_id, t.other, u.nickname AS other_name, l.title, t.body, t.attach, t.created_at, t.mine, t.read_at, t.delivered_at,
            (SELECT COUNT(*)::int FROM m x WHERE x.listing_id = t.listing_id AND x.other = t.other AND NOT x.mine AND x.read_at IS NULL AND x.created_at > COALESCE(h.cleared_at, 'epoch'::timestamptz)) AS unread
       FROM (SELECT DISTINCT ON (listing_id, other) * FROM m ORDER BY listing_id, other, id DESC) t
       JOIN users u ON u.id = t.other
       JOIN listings l ON l.id = t.listing_id AND l.status <> 'deleted'
       LEFT JOIN chat_hidden h ON h.user_id = $1 AND h.listing_id = t.listing_id AND h.other_id = t.other
      WHERE (h.cleared_at IS NULL OR t.created_at > h.cleared_at) AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = $1 AND b.blocked_id = t.other)
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
  const cleared = (await db.query('SELECT cleared_at FROM chat_hidden WHERE user_id = $1 AND listing_id = $2 AND other_id = $3', [me, listingId, other])).rows[0];
  const rows = (await db.query(
    `SELECT m.id, m.body, m.created_at, (m.sender_id = $2) AS mine, (m.read_at IS NOT NULL) AS read, (m.delivered_at IS NOT NULL) AS delivered,
            ci.kind AS attach, ci.name AS file_name, ci.size AS file_size,
            CASE WHEN ci.kind = 'image' THEN ci.url END AS image_url, CASE WHEN ci.kind = 'image' THEN ci.thumb_url END AS image_thumb, CASE WHEN ci.kind = 'file' THEN ci.url END AS file_url
       FROM messages m LEFT JOIN chat_images ci ON ci.id = m.image_id
      WHERE m.listing_id = $1 AND ((m.sender_id = $2 AND m.recipient_id = $3) OR (m.sender_id = $3 AND m.recipient_id = $2))
        AND m.created_at > COALESCE($4::timestamptz, 'epoch'::timestamptz)
      ORDER BY m.id DESC LIMIT 300`, [listingId, me, other, cleared ? cleared.cleared_at : null])).rows.reverse();
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
  const b = req.body || {}, body = String(b.body || '').trim(), listingId = toId(b.listing_id), me = req.user.id, imageId = b.image_id ? toId(b.image_id) : null;
  if (!listingId || (!body && !imageId) || body.length > MAX_BODY || (b.image_id && !imageId)) return res.status(400).json({ error: 'MESAJ_INVALID' });
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

  if (imageId) {   // poza trebuie să fie încărcată de tine și nefolosită încă
    const ok = await db.query('SELECT 1 FROM chat_images c WHERE c.id = $1 AND c.owner_id = $2 AND NOT EXISTS (SELECT 1 FROM messages WHERE image_id = c.id)', [imageId, me]);
    if (!ok.rowCount) return res.status(400).json({ error: 'POZA_INVALIDA' });
  }
  // dublă apăsare: același mesaj în aceeași conversație în ultimele 8 secunde nu se salvează a doua oară
  const dup = (await db.query(
    "SELECT id, created_at FROM messages WHERE listing_id = $1 AND sender_id = $2 AND recipient_id = $3 AND body = $4 AND created_at > NOW() - INTERVAL '8 seconds' ORDER BY id DESC LIMIT 1",
    [listingId, me, to, body])).rows[0];
  if (dup && !imageId) return res.json({ message: dup, duplicate: true });
  const online = live.isOnline(to);
  const r = await db.query('INSERT INTO messages(listing_id, sender_id, recipient_id, body, delivered_at, image_id) VALUES($1,$2,$3,$4, CASE WHEN $5::boolean THEN NOW() END, $6) RETURNING id, created_at', [listingId, me, to, body, online, imageId]);
  live.send(to, 'message', { id: r.rows[0].id, from: me, listing_id: listingId, body, has_attach: !!imageId, created_at: r.rows[0].created_at });
  res.status(201).json({ message: { ...r.rows[0], delivered: online } });
}));

/* ---- poze în chat: JPG / PNG / WebP, recodate pe server (fără GPS), miniatură 480 px + poză 1280 px ---- */
router.post('/image', requireVerified, imgs.raw, ah(async (req, res) => {
  const me = req.user.id, buf = req.body, k = Buffer.isBuffer(buf) && imgs.kind(buf);
  if (!k) return res.status(400).json({ error: 'POZA_INVALIDA' });
  if (!upAllow('u' + me)) return res.status(429).json({ error: 'RATE_LIMIT' });
  // curățenie: pozele încărcate dar netrimise de peste o zi
  db.query("DELETE FROM chat_images c WHERE c.owner_id = $1 AND c.created_at < NOW() - INTERVAL '1 day' AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.image_id = c.id)", [me]).catch(() => {});
  const used = (await db.query('SELECT COALESCE(SUM(size),0)::bigint AS n FROM chat_images WHERE owner_id = $1', [me])).rows[0].n;
  if (Number(used) + buf.length > CHAT_QUOTA) return res.status(413).json({ error: 'SPATIU_POZE_DEPASIT' });
  let p;
  try { p = await imgs.process(buf, k); } catch { return res.status(400).json({ error: 'POZA_INVALIDA' }); }
  const size = p.full.length + p.thumb.length;
  let row;
  if (imgs.STORAGE) {
    const base = `chat/u${me}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    let url, thumbUrl;
    try { url = await imgs.put(`${base}.${p.ext}`, p.full, p.type); thumbUrl = await imgs.put(`${base}-t.${p.ext}`, p.thumb, p.type); }
    catch (e) { console.error('storage:', e.message); return res.status(502).json({ error: 'STORAGE_EROARE' }); }
    row = (await db.query('INSERT INTO chat_images(owner_id, url, thumb_url, size) VALUES($1,$2,$3,$4) RETURNING id, url, thumb_url', [me, url, thumbUrl, size])).rows[0];
  } else {   // fără Supabase: în Postgres, servite doar celor doi din conversație
    const ins = await db.query("INSERT INTO chat_images(owner_id, ctype, size, data, thumb) VALUES($1,$2,$3,$4,$5) RETURNING id", [me, p.type, size, p.full, p.thumb]);
    row = (await db.query("UPDATE chat_images SET url = '/api/messages/img/' || id, thumb_url = '/api/messages/img/' || id || '?t=1' WHERE id = $1 RETURNING id, url, thumb_url", [ins.rows[0].id])).rows[0];
  }
  res.status(201).json({ image: row });
}));

router.get('/img/:id(\\d+)', ah(async (req, res) => {
  const r = await db.query(
    `SELECT c.data, c.thumb, c.ctype, c.kind, c.name FROM chat_images c
      WHERE c.id = $1 AND c.data IS NOT NULL
        AND (c.owner_id = $2 OR EXISTS (SELECT 1 FROM messages m WHERE m.image_id = c.id AND (m.sender_id = $2 OR m.recipient_id = $2)))`, [req.params.id, req.user.id]);
  if (!r.rowCount) return res.status(404).end();
  const x = r.rows[0];
  res.set('Content-Type', x.ctype || 'image/webp').set('Cache-Control', 'private, max-age=86400').set('X-Content-Type-Options', 'nosniff');
  if (x.kind === 'file') {   // fișierele se descarcă, nu se rulează în pagină
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(x.name || 'fisier')}`).set('Content-Security-Policy', "default-src 'none'; sandbox");
    return res.send(x.data);
  }
  res.send(req.query.t ? x.thumb : x.data);
}));

/* ---- fișiere în chat: PDF, Word, Excel, text; până la 5 MB; tipul se verifică după conținut, nu după nume ---- */
const FILE_TYPES = {
  pdf: 'application/pdf', doc: 'application/msword', xls: 'application/vnd.ms-excel', txt: 'text/plain; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const rawFile = express.raw({ type: 'application/octet-stream', limit: '5mb' });
function fileKind(b, ext) {
  if (ext === 'pdf') return b.toString('latin1', 0, 5) === '%PDF-' ? 'pdf' : null;
  if (ext === 'docx' || ext === 'xlsx') return b[0] === 0x50 && b[1] === 0x4b && b.includes('[Content_Types].xml') && b.includes(ext === 'docx' ? 'word/' : 'xl/') ? ext : null;
  if (ext === 'doc' || ext === 'xls') return b.length > 8 && b.readUInt32BE(0) === 0xd0cf11e0 && b.readUInt32BE(4) === 0xa1b11ae1 ? ext : null;
  if (ext === 'txt') return !b.subarray(0, 4096).includes(0) && b.length <= 1024 * 1024 ? 'txt' : null;
  return null;
}
router.post('/file', requireVerified, rawFile, ah(async (req, res) => {
  const me = req.user.id, buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'FISIER_INVALID' });
  let name = '';
  try { name = decodeURIComponent(String(req.get('x-filename') || '')); } catch { /* nume invalid */ }
  name = name.replace(/[\\/\u0000-\u001f]/g, '').trim().slice(-80);
  const ext = (name.split('.').pop() || '').toLowerCase(), k = fileKind(buf, ext);
  if (!k) return res.status(400).json({ error: 'FISIER_INVALID' });
  if (!upAllow('u' + me)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const used = (await db.query('SELECT COALESCE(SUM(size),0)::bigint AS n FROM chat_images WHERE owner_id = $1', [me])).rows[0].n;
  if (Number(used) + buf.length > CHAT_QUOTA) return res.status(413).json({ error: 'SPATIU_POZE_DEPASIT' });
  const ins = await db.query("INSERT INTO chat_images(owner_id, kind, name, ctype, size, data) VALUES($1,'file',$2,$3,$4,$5) RETURNING id", [me, name || 'fisier.' + k, FILE_TYPES[k], buf.length, buf]);
  const row = (await db.query("UPDATE chat_images SET url = '/api/messages/img/' || id WHERE id = $1 RETURNING id, url, name, size", [ins.rows[0].id])).rows[0];
  res.status(201).json({ image: row });
}));

/* ---- „Șterge conversația”: dispare doar de la tine; mesajele rămân pe server (verificări la raportări) ---- */
router.post('/hide', ah(async (req, res) => {
  const items = Array.isArray((req.body || {}).items) ? req.body.items.slice(0, 50) : [];
  let n = 0;
  for (const it of items) {
    const listing = toId(it && it.listing_id), other = toId(it && it.with);
    if (!listing || !other || other === req.user.id) continue;
    const r = await db.query(
      `INSERT INTO chat_hidden(user_id, listing_id, other_id, cleared_at)
       SELECT $1, $2, $3, NOW() WHERE EXISTS (SELECT 1 FROM messages WHERE listing_id = $2 AND ((sender_id = $1 AND recipient_id = $3) OR (sender_id = $3 AND recipient_id = $1)))
       ON CONFLICT (user_id, listing_id, other_id) DO UPDATE SET cleared_at = NOW()`, [req.user.id, listing, other]);
    n += r.rowCount;
  }
  res.json({ ok: true, hidden: n });
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
