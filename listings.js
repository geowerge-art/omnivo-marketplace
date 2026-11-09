const express = require('express');
const db = require('./db');
const config = require('./config');
const { ah, requireDb } = require('./common');
const { requireAuth, requireRole, requireVerified } = require('./authmw');
const { createThrottle, clientIp } = require('./security');

const router = express.Router();
const adminRouter = express.Router();
router.use(requireDb);
adminRouter.use(requireDb, requireRole('admin', 'moderator'));
const createAllow = createThrottle(30, 60 * 60 * 1000); // max 30 anunțuri/oră per utilizator
const editAllow = createThrottle(60, 60 * 60 * 1000); // max 60 editări/oră per utilizator

const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const SELECT = `SELECT l.id, l.title, l.price, l.currency, l.negotiable, l.condition, l.county, l.city, l.status, l.created_at,
                       c.slug AS category_slug, c.name AS category, p.name AS parent_category,
                       (SELECT COALESCE(i.thumb_url, i.url) FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1) AS thumb
                  FROM listings l JOIN categories c ON c.id = l.category_id LEFT JOIN categories p ON p.id = c.parent_id`;

/* Validează corpul cererii după categorie și atributele ei. Întoarce { error } sau { v }. */
async function parse(b) {
  const title = String(b.title || '').trim(), description = String(b.description || '').trim();
  if (title.length < 5 || title.length > 120) return { error: 'TITLU_INVALID' };
  if (description.length > 4000) return { error: 'DESCRIERE_PREA_LUNGA' };
  let price = null;
  if (b.price !== null && b.price !== undefined && b.price !== '') {
    price = Number(b.price);
    if (!Number.isFinite(price) || price < 0 || price > 10000000) return { error: 'PRET_INVALID' };
  }
  const currency = b.currency === 'EUR' ? 'EUR' : 'RON';
  const condition = ['nou', 'folosit'].includes(b.condition) ? b.condition : null;
  const seller_type = b.seller_type === 'firma' ? 'firma' : 'persoana';
  const county = String(b.county || '').trim().slice(0, 40), city = String(b.city || '').trim().slice(0, 60), address = String(b.address || '').trim().slice(0, 120);
  const cat = await db.query(
    'SELECT c.id FROM categories c WHERE c.id = $1 AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id)', [Number(b.category_id) || 0]);
  if (!cat.rowCount) return { error: 'CATEGORIE_INVALIDA' };
  const defs = (await db.query('SELECT key, type, options, required FROM category_attributes WHERE category_id = $1 OR category_id = (SELECT parent_id FROM categories WHERE id = $1)', [cat.rows[0].id])).rows;
  const attributes = {}, src = (b.attributes && typeof b.attributes === 'object') ? b.attributes : {};
  for (const d of defs) {
    const raw = src[d.key];
    if (raw === undefined || raw === null || raw === '') { if (d.required) return { error: 'ATRIBUT_LIPSA', field: d.key }; continue; }
    if (d.type === 'number') { const n = Number(raw); if (!Number.isFinite(n)) return { error: 'ATRIBUT_INVALID', field: d.key }; attributes[d.key] = n; }
    else if (d.type === 'select') { if (!(d.options || []).includes(raw)) return { error: 'ATRIBUT_INVALID', field: d.key }; attributes[d.key] = raw; }
    else attributes[d.key] = String(raw).trim().slice(0, 80);
  }
  return { v: { title, description, price, currency, condition, seller_type, county, city, address, category_id: cat.rows[0].id, attributes, negotiable: b.negotiable === true } };
}

/* ---- public: listare cu filtre ---- */
router.get('/', ah(async (req, res) => {
  const where = ["l.status = 'approved'", 'l.expires_at > NOW()'], vals = [];
  const add = (sql, val) => { vals.push(val); where.push(sql.split('$#').join('$' + vals.length)); };
  const q = fold(req.query.q).replace(/[^a-z0-9 ]+/g, ' ').trim();
  for (const w of q.split(/\s+/).filter(Boolean).slice(0, 6)) add("l.search_text LIKE '%' || $# || '%'", w);
  if (req.query.category) add('(c.slug = $# OR p.slug = $#)', String(req.query.category).slice(0, 60));
  if (req.query.county) add('LOWER(l.county) = LOWER($#)', String(req.query.county).slice(0, 40));
  if (Number.isFinite(Number(req.query.min)) && req.query.min !== undefined && req.query.min !== '') add('l.price >= $#', Number(req.query.min));
  if (Number.isFinite(Number(req.query.max)) && req.query.max !== undefined && req.query.max !== '') add('l.price <= $#', Number(req.query.max));
  const order = { price_asc: 'l.price ASC NULLS LAST, l.id DESC', price_desc: 'l.price DESC NULLS LAST, l.id DESC' }[req.query.sort] || 'l.created_at DESC, l.id DESC';
  const limit = Math.min(48, Math.max(1, Math.floor(Number(req.query.limit)) || 24));
  const offset = Math.min(100000, Math.max(0, Math.floor(Number(req.query.offset)) || 0));
  const w = where.join(' AND ');
  const [rows, cnt] = await Promise.all([
    db.query(`${SELECT} WHERE ${w} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, vals),
    db.query(`SELECT COUNT(*)::int n FROM listings l JOIN categories c ON c.id = l.category_id LEFT JOIN categories p ON p.id = c.parent_id WHERE ${w}`, vals)
  ]);
  res.json({ listings: rows.rows, total: cnt.rows[0].n, limit, offset });
}));

/* Numărul de telefon se dezvăluie la cerere, doar dacă vânzătorul a ales să-l arate; limitat ca să nu se poată strânge în masă. */
const phoneAllow = createThrottle(40, 60 * 60 * 1000);
router.get('/:id(\\d+)/phone', ah(async (req, res) => {
  if (!phoneAllow('p' + clientIp(req))) return res.status(429).json({ error: 'RATE_LIMIT' });
  const r = await db.query(
    "SELECT u.phone, u.whatsapp FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = $1 AND l.status IN ('approved','sold') AND u.show_phone AND u.phone IS NOT NULL", [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  res.json({ phone: r.rows[0].phone, whatsapp: !!r.rows[0].whatsapp });
}));

router.get('/mine', requireAuth, ah(async (req, res) => {
  const r = await db.query(`${SELECT} WHERE l.user_id = $1 AND l.status <> 'deleted' ORDER BY l.created_at DESC LIMIT 200`, [req.user.id]);
  res.json({ listings: r.rows });
}));

router.get('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.query(
    `SELECT l.*, c.name AS category, p.name AS parent_category, u.nickname AS seller, u.show_phone, u.phone AS seller_phone
       FROM listings l JOIN categories c ON c.id = l.category_id LEFT JOIN categories p ON p.id = c.parent_id
       LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`, [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  const l = r.rows[0], me = req.user;
  const staff = me && ['admin', 'moderator'].includes(me.role), owner = me && me.id === l.user_id;
  if (!['approved', 'sold'].includes(l.status) && !staff && !owner) return res.status(404).json({ error: 'NEGASIT' });
  const defs = await db.query('SELECT key, label FROM category_attributes WHERE category_id = $1 OR category_id = (SELECT parent_id FROM categories WHERE id = $1)', [l.category_id]);
  const label = Object.fromEntries(defs.rows.map((d) => [d.key, d.label]));
  const imgs = await db.query('SELECT id, url FROM listing_images WHERE listing_id = $1 ORDER BY position, id', [l.id]);
  res.json({ listing: {
    images: imgs.rows.map((i) => i.url),
    seller_id: l.user_id, mine: !!owner,
    // datele brute de care are nevoie formularul de editare; le primește doar proprietarul
    edit: owner ? { category_id: l.category_id, attributes: l.attributes || {}, images: imgs.rows } : undefined,
    id: l.id, title: l.title, description: l.description, price: l.price, currency: l.currency, negotiable: l.negotiable,
    condition: l.condition, county: l.county, city: l.city, status: l.status, created_at: l.created_at,
    category: l.category, parent_category: l.parent_category, seller: l.seller, seller_type: l.seller_type,
    address: l.address || null,
    has_phone: !!(l.show_phone && l.seller_phone), // numărul se cere separat (GET /:id/phone), nu stă în pagină
    attributes: Object.entries(l.attributes || {}).map(([k, v]) => ({ label: label[k] || k, value: v }))
  } });
}));

/* ---- creare ---- */
router.post('/', requireAuth, requireVerified, ah(async (req, res) => {
  if (!createAllow('u' + req.user.id + ':' + clientIp(req))) return res.status(429).json({ error: 'PREA_MULTE_ANUNTURI' });
  const p = await parse(req.body || {});
  if (p.error) return res.status(400).json({ error: p.error, field: p.field });
  const v = p.v;
  const r = await db.query(
    `INSERT INTO listings(user_id, category_id, title, description, price, currency, negotiable, condition, seller_type, county, city, attributes, status, search_text, address)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, status`,
    [req.user.id, v.category_id, v.title, v.description, v.price, v.currency, v.negotiable, v.condition, v.seller_type, v.county, v.city,
     JSON.stringify(v.attributes), config.NEW_LISTING_STATUS, fold(v.title + ' ' + v.description).replace(/[^a-z0-9 ]+/g, ' '), v.address]);
  res.status(201).json({ listing: r.rows[0] });
}));

/* ---- editarea unui anunț existent (doar proprietarul) ----
   Câmpurile lipsă din cerere (oraș, tip vânzător) se păstrează. Dacă se schimbă titlul, descrierea, categoria sau atributele,
   un anunț respins revine la moderare, iar unul publicat/vândut revine la moderare doar când moderarea e activă (NEW_LISTING_STATUS=pending). */
const same = (a) => JSON.stringify(Object.keys(a || {}).sort().map((k) => [k, a[k]]));
router.patch('/:id(\\d+)', requireAuth, requireVerified, ah(async (req, res) => {
  if (!editAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const cur = (await db.query('SELECT * FROM listings WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id])).rows[0];
  if (!cur || cur.status === 'deleted') return res.status(404).json({ error: 'NEGASIT' });
  if (cur.status === 'blocked') return res.status(403).json({ error: 'INTERZIS' });
  const p = await parse({ seller_type: cur.seller_type, city: cur.city, address: cur.address, ...(req.body || {}) });
  if (p.error) return res.status(400).json({ error: p.error, field: p.field });
  const v = p.v;
  const changed = cur.title !== v.title || (cur.description || '') !== v.description || cur.category_id !== v.category_id || same(cur.attributes) !== same(v.attributes);
  let status = cur.status;
  if (changed && ['approved', 'sold', 'rejected'].includes(cur.status) && (config.NEW_LISTING_STATUS === 'pending' || cur.status === 'rejected')) {
    const pend = await db.query("SELECT COUNT(*)::int AS n FROM listings WHERE user_id = $1 AND status = 'pending'", [req.user.id]);
    if (pend.rows[0].n >= 20) return res.status(429).json({ error: 'PREA_MULTE_ANUNTURI' });
    status = 'pending';
  }
  const r = await db.query(
    `UPDATE listings SET category_id=$1, title=$2, description=$3, price=$4, currency=$5, negotiable=$6, condition=$7, seller_type=$8,
            county=$9, city=$10, attributes=$11, status=$12, search_text=$13, address=$16, updated_at=NOW()
      WHERE id=$14 AND user_id=$15 RETURNING id, status`,
    [v.category_id, v.title, v.description, v.price, v.currency, v.negotiable, v.condition, v.seller_type, v.county, v.city,
     JSON.stringify(v.attributes), status, fold(v.title + ' ' + v.description).replace(/[^a-z0-9 ]+/g, ' '), cur.id, req.user.id, v.address]);
  res.json({ listing: r.rows[0], resubmitted: status === 'pending' && cur.status !== 'pending' });
}));

/* ---- proprietar: vândut / repus la vânzare; ștergere în doi pași ---- */
router.patch('/:id(\\d+)/status', requireAuth, ah(async (req, res) => {
  const to = String((req.body || {}).status || '');
  if (!['sold', 'approved'].includes(to)) return res.status(400).json({ error: 'STATUS_INVALID' });
  // doar între „publicat” și „vândut”; anunțurile respinse/blocate nu pot fi repuse de proprietar
  const r = await db.query(
    "UPDATE listings SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND status IN ('approved','sold') RETURNING id, status",
    [to, req.params.id, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  res.json({ listing: r.rows[0] });
}));

router.delete('/:id(\\d+)', requireAuth, ah(async (req, res) => {
  const soft = await db.query("UPDATE listings SET status = 'deleted' WHERE id = $1 AND user_id = $2 AND status <> 'deleted' RETURNING id", [req.params.id, req.user.id]);
  if (soft.rowCount) return res.json({ ok: true, deleted: 'soft' });
  const hard = await db.query("DELETE FROM listings WHERE id = $1 AND user_id = $2 AND status = 'deleted' RETURNING id", [req.params.id, req.user.id]);
  if (!hard.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  res.json({ ok: true, deleted: 'hard' });
}));

/* ---- moderare (admin / moderator) ---- */
adminRouter.get('/', ah(async (req, res) => {
  const st = ['pending', 'approved', 'rejected', 'blocked', 'sold'].includes(req.query.status) ? req.query.status : 'pending';
  const r = await db.query(`${SELECT} WHERE l.status = $1 ORDER BY l.created_at ASC LIMIT 100`, [st]);
  res.json({ listings: r.rows });
}));

adminRouter.patch('/:id(\\d+)', ah(async (req, res) => {
  const to = String((req.body || {}).status || '');
  if (!['approved', 'rejected', 'blocked'].includes(to)) return res.status(400).json({ error: 'STATUS_INVALID' });
  const r = await db.query('UPDATE listings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status', [to, req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  await db.query('INSERT INTO admin_activity(admin_id, action, target_type, target_id, details) VALUES($1,$2,$3,$4,$5)',
    [req.user.id, 'listing_' + to, 'listing', r.rows[0].id, String((req.body || {}).note || '').slice(0, 300)]);
  res.json({ listing: r.rows[0] });
}));

module.exports = { router, adminRouter };
