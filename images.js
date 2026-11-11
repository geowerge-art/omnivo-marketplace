const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const { ah, requireDb } = require('./common');
const { requireAuth } = require('./authmw');
const { createThrottle } = require('./security');

let sharp = null;
try { sharp = require('sharp'); sharp.cache(false); sharp.concurrency(1); } catch { console.warn('„sharp” lipsește: pozele se păstrează la dimensiunea trimisă.'); }

const MAX_PER_LISTING = 8, QUOTA = 60 * 1024 * 1024; // 60 MB de poze per utilizator
const STORAGE = !!(config.SUPABASE_URL && config.SUPABASE_SERVICE_KEY);
const allow = createThrottle(80, 60 * 60 * 1000);
const raw = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' });

const router = express.Router();
const publicRouter = express.Router();

/* Recunoaștem formatul după primii octeți, nu după ce declară clientul. */
function kind(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

let active = 0; const waiting = [];
const slot = () => new Promise((ok) => { const go = () => { active++; ok(() => { active--; const n = waiting.shift(); if (n) n(); }); }; active < 2 ? go() : waiting.push(go); });

/* WebP 1280 px + miniatură 480 px; sharp scoate și datele EXIF (inclusiv locația GPS). */
async function process(buf, k) {
  if (!sharp) return { full: buf, thumb: buf, type: 'image/' + k, ext: k === 'jpeg' ? 'jpg' : k };
  const release = await slot();
  try {
    const base = () => sharp(buf, { limitInputPixels: 40e6 }).rotate();
    const [full, thumb] = await Promise.all([
      base().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      base().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer()
    ]);
    return { full, thumb, type: 'image/webp', ext: 'webp' };
  } finally { release(); }
}

const objUrl = (p) => `${config.SUPABASE_URL}/storage/v1/object/${config.SUPABASE_BUCKET}/${p}`;
async function put(path, buf, type) {
  const r = await fetch(objUrl(path), { method: 'POST', headers: { Authorization: `Bearer ${config.SUPABASE_SERVICE_KEY}`, apikey: config.SUPABASE_SERVICE_KEY, 'Content-Type': type, 'Cache-Control': 'max-age=31536000' }, body: buf });
  if (!r.ok) throw new Error('storage ' + r.status);
  return `${config.SUPABASE_URL}/storage/v1/object/public/${config.SUPABASE_BUCKET}/${path}`;
}
async function removeStored(...urls) {
  if (!STORAGE) return;
  const pre = `${config.SUPABASE_URL}/storage/v1/object/public/${config.SUPABASE_BUCKET}/`;
  for (const u of urls) if (u && u.startsWith(pre)) await fetch(objUrl(u.slice(pre.length)), { method: 'DELETE', headers: { Authorization: `Bearer ${config.SUPABASE_SERVICE_KEY}`, apikey: config.SUPABASE_SERVICE_KEY } }).catch(() => {});
}

router.post('/:id(\\d+)/images', requireAuth, requireDb, raw, ah(async (req, res) => {
  if (!allow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const buf = req.body, k = Buffer.isBuffer(buf) && kind(buf);
  if (!k) return res.status(400).json({ error: 'POZA_INVALIDA' });
  const id = Number(req.params.id);
  const staff = ['admin', 'moderator'].includes(req.user.role);
  const own = await db.query("SELECT user_id FROM listings WHERE id = $1 AND status <> 'deleted'" + (staff ? '' : ' AND user_id = $2'), staff ? [id] : [id, req.user.id]);
  if (!own.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  const ownerId = own.rows[0].user_id;
  const st = await db.query(
    'SELECT (SELECT COUNT(*)::int FROM listing_images WHERE listing_id = $1) AS n, (SELECT COALESCE(SUM(i.size),0)::bigint FROM listing_images i JOIN listings l ON l.id = i.listing_id WHERE l.user_id = $2) AS used', [id, ownerId]);
  if (st.rows[0].n >= MAX_PER_LISTING) return res.status(409).json({ error: 'PREA_MULTE_POZE' });
  if (Number(st.rows[0].used) + buf.length > QUOTA) return res.status(413).json({ error: 'SPATIU_POZE_DEPASIT' });

  let p;
  try { p = await process(buf, k); } catch { return res.status(400).json({ error: 'POZA_INVALIDA' }); }
  const size = p.full.length + p.thumb.length;
  let row;
  if (STORAGE) {
    const base = `l${id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    let url, thumbUrl;
    try { url = await put(`${base}.${p.ext}`, p.full, p.type); thumbUrl = await put(`${base}-t.${p.ext}`, p.thumb, p.type); }
    catch (e) { console.error('storage:', e.message); return res.status(502).json({ error: 'STORAGE_EROARE' }); }
    row = (await db.query('INSERT INTO listing_images(listing_id, url, thumb_url, position, size) VALUES($1,$2,$3,$4,$5) RETURNING id, url', [id, url, thumbUrl, st.rows[0].n, size])).rows[0];
  } else { // fără Supabase: pozele rămân în Postgres și se servesc din /api/images/:id
    const ins = await db.query("INSERT INTO listing_images(listing_id, url, position, size, ctype, data, thumb) VALUES($1,'',$2,$3,$4,$5,$6) RETURNING id", [id, st.rows[0].n, size, p.type, p.full, p.thumb]);
    row = (await db.query("UPDATE listing_images SET url = '/api/images/' || id, thumb_url = '/api/images/' || id || '?t=1' WHERE id = $1 RETURNING id, url", [ins.rows[0].id])).rows[0];
  }
  res.status(201).json({ image: row });
}));

router.delete('/:id(\\d+)/images/:imgId(\\d+)', requireAuth, requireDb, ah(async (req, res) => {
  const staff = ['admin', 'moderator'].includes(req.user.role);
  const r = await db.query('DELETE FROM listing_images i USING listings l WHERE i.id = $1 AND i.listing_id = l.id AND l.id = $2 AND (l.user_id = $3 OR $4) RETURNING i.url, i.thumb_url, l.user_id',
    [req.params.imgId, req.params.id, req.user.id, staff]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  if (r.rows[0].user_id !== req.user.id) db.query('INSERT INTO admin_activity(admin_id, action, target_type, target_id, details) VALUES($1,$2,$3,$4,$5)', [req.user.id, 'listing_edit', 'listing', Number(req.params.id), 'poză ștearsă de echipă']).catch(() => {});
  removeStored(r.rows[0].url, r.rows[0].thumb_url);
  res.json({ ok: true });
}));

/* Poze păstrate în baza de date (doar fără Supabase). Anunțurile neaprobate le văd doar proprietarul și echipa. */
publicRouter.get('/:id(\\d+)', requireDb, ah(async (req, res) => {
  const r = await db.query('SELECT i.data, i.thumb, i.ctype, l.status, l.user_id FROM listing_images i JOIN listings l ON l.id = i.listing_id WHERE i.id = $1 AND i.data IS NOT NULL', [req.params.id]);
  if (!r.rowCount) return res.status(404).end();
  const x = r.rows[0], me = req.user;
  if (!['approved', 'sold'].includes(x.status) && !(me && (me.id === x.user_id || ['admin', 'moderator'].includes(me.role)))) return res.status(404).end();
  res.set('Content-Type', x.ctype || 'image/webp');
  res.set('Cache-Control', ['approved', 'sold'].includes(x.status) ? 'public, max-age=31536000, immutable' : 'private, no-store');
  res.send(req.query.t ? x.thumb : x.data);
}));

module.exports = { router, publicRouter, kind, process, put, removeStored, STORAGE, raw };
