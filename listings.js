const express = require('express');
const db = require('./db');
const config = require('./config');
const { ah, requireDb } = require('./common');
const { requireAuth, requireRole, requireVerified } = require('./authmw');
const { createThrottle, clientIp, PHONE_RE } = require('./security');
const plans = require('./plans');
const billing = require('./billing');
const { deriveDiagonals } = require('./derive');
const studio = require('./studio');
const notify = require('./notify');
const guard = require('./guard');

const router = express.Router();
const adminRouter = express.Router();
router.use(requireDb);
adminRouter.use(requireDb, requireRole('admin', 'moderator'));
const createAllow = createThrottle(30, 60 * 60 * 1000); // max 30 anunțuri/oră per utilizator
const editAllow = createThrottle(60, 60 * 60 * 1000); // max 60 editări/oră per utilizator

const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const SELECT = `SELECT l.id, l.title, l.price, l.currency, l.negotiable, l.condition, l.county, l.city, l.status, l.mod_note, l.created_at, l.bumped_at, l.seller_type, l.attributes, l.price_was, l.price_dropped_at,
                       (COALESCE(l.promoted_until, 'epoch'::timestamptz) > NOW()) AS promoted, l.promoted_until,
                       c.slug AS category_slug, c.name AS category, p.name AS parent_category,
                       (SELECT COALESCE(i.thumb_url, i.url) FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1) AS thumb,
                       (SELECT i.url FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1) AS photo,
                       (SELECT COUNT(*)::int FROM listing_images i WHERE i.listing_id = l.id) AS photo_count
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
  // contact doar pe acest anunț (ex.: postezi pentru altcineva); NULL la contact_show = telefonul din cont, ca înainte
  const contact_name = String(b.contact_name || '').trim().slice(0, 60), contact_phone = String(b.contact_phone || '').trim();
  if (contact_phone && !PHONE_RE.test(contact_phone)) return { error: 'TELEFON_INVALID' };
  const contact_show = b.contact_show == null ? null : b.contact_show === true && !!contact_phone, contact_wa = b.contact_wa === true && !!contact_phone;
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
  deriveDiagonals(attributes, defs.map((d) => d.key));
  return { v: { title, description, price, currency, condition, seller_type, county, city, address, category_id: cat.rows[0].id, attributes, negotiable: b.negotiable === true, contact_name: contact_name || null, contact_phone: contact_phone || null, contact_wa, contact_show } };
}

/* ---- public: listare cu filtre ---- */
const likeEsc = (t) => String(t).replace(/[\\%_]/g, '\\$&');
const ATTR_KEY = /^[a-z0-9_]{1,40}$/;

/* Atributele filtrabile ale unei categorii (ale ei + ale părintelui), după slug. */
async function attrDefs(slug) {
  if (!slug) return [];
  const r = await db.query(
    `SELECT DISTINCT ON (a.key) a.key, a.type, a.options
       FROM category_attributes a
      WHERE a.category_id IN (SELECT id FROM categories WHERE slug = $1
                              UNION SELECT parent_id FROM categories WHERE slug = $1 AND parent_id IS NOT NULL)
      ORDER BY a.key`, [slug]);
  return r.rows;
}

/* Construiește condițiile WHERE din cerere. `skipAttr` = atributul ignorat (pentru valorile disponibile ale unui filtru). */
async function buildWhere(req, skipAttr) {
  const sold = req.query.sold === '1' && Number(req.query.user) > 0;   // profil public: și anunțurile vândute ale vânzătorului
  const where = sold ? ["l.status = 'sold'"] : ["l.status = 'approved'", 'l.expires_at > NOW()'], vals = [];
  const add = (sql, val) => { vals.push(val); where.push(sql.split('$#').join('$' + vals.length)); };
  const addv = (sql, ...vs) => { let t = sql; for (const v of vs) { vals.push(v); t = t.replace('$#', '$' + vals.length); } where.push(t); };
  const q = fold(req.query.q).replace(/[^a-z0-9 ]+/g, ' ').trim();
  for (const w of q.split(/\s+/).filter(Boolean).slice(0, 6)) add("l.search_text LIKE '%' || $# || '%'", w);
  if (req.query.ids) {   /* „Văzute recent": anunțurile cu id-urile date (doar cele încă publice) */
    const ids = String(req.query.ids).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 48);
    if (ids.length) add('l.id = ANY($#::int[])', ids);
  }
  if (Number(req.query.user) > 0) add('l.user_id = $#', Math.floor(Number(req.query.user)));
  const slug = String(req.query.category || '').slice(0, 60);
  if (slug) add('(c.slug = $# OR p.slug = $#)', slug);
  if (req.query.country) add('LOWER(l.country) = LOWER($#)', String(req.query.country).slice(0, 40));
  if (req.query.county) add('LOWER(l.county) = LOWER($#)', String(req.query.county).slice(0, 40));
  if (req.query.city) add('LOWER(l.city) = LOWER($#)', String(req.query.city).slice(0, 60));
  if (['nou', 'folosit'].includes(req.query.condition)) add('l.condition = $#', req.query.condition);
  if (req.query.drop === '1') where.push("l.price_was IS NOT NULL AND l.price_was > l.price AND l.price_dropped_at > NOW() - INTERVAL '14 days'");
  if (req.query.trusted === '1') where.push("l.user_id IN (SELECT seller_id FROM reviews WHERE role = 'seller' GROUP BY seller_id HAVING COUNT(*) >= 3 AND AVG(rating) >= 4.5)");
  if (['persoana', 'firma'].includes(req.query.seller)) add('l.seller_type = $#', req.query.seller);
  const num = (v) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const min = num(req.query.min), max = num(req.query.max);
  if (min !== null) add('l.price >= $#', min);
  if (max !== null) add('l.price <= $#', max);
  if ((min !== null || max !== null) && ['RON', 'EUR'].includes(req.query.currency)) add('l.currency = $#', req.query.currency);   // prețul se compară doar în aceeași monedă
  /* filtre pe atribute: a_<cheie> (text/select), a_<cheie>_min / a_<cheie>_max (numere) */
  for (const d of await attrDefs(slug)) {
    if (d.key === skipAttr || !ATTR_KEY.test(d.key)) continue;
    if (d.type === 'number') {
      const lo = num(req.query['a_' + d.key + '_min']), hi = num(req.query['a_' + d.key + '_max']);
      const cell = "(CASE WHEN jsonb_typeof(l.attributes -> $#::text) = 'number' THEN (l.attributes ->> $#::text)::numeric END)";
      if (lo !== null) addv(cell + ' >= $#::numeric', d.key, d.key, lo);
      if (hi !== null) addv(cell + ' <= $#::numeric', d.key, d.key, hi);
    } else {
      const v = String(req.query['a_' + d.key] || '').trim().slice(0, 80);
      if (!v) continue;
      if (d.type === 'select') addv('(l.attributes ->> $#::text) = $#::text', d.key, v);
      else addv("LOWER(l.attributes ->> $#::text) LIKE '%' || LOWER($#::text) || '%'", d.key, likeEsc(v));
    }
  }
  return { where: where.join(' AND '), vals };
}
const FROM = 'FROM listings l JOIN categories c ON c.id = l.category_id LEFT JOIN categories p ON p.id = c.parent_id';

router.get('/', ah(async (req, res) => {
  const { where: w, vals } = await buildWhere(req);
  const order = {
    price_asc: 'l.price ASC NULLS LAST, l.id DESC',
    price_desc: 'l.price DESC NULLS LAST, l.id DESC',
    new: 'l.created_at DESC, l.id DESC'
  }[req.query.sort] || "(COALESCE(l.promoted_until, 'epoch'::timestamptz) > NOW()) DESC, COALESCE(l.bumped_at, l.created_at) DESC, l.id DESC";
  const limit = Math.min(48, Math.max(1, Math.floor(Number(req.query.limit)) || 24));
  const offset = Math.min(100000, Math.max(0, Math.floor(Number(req.query.offset)) || 0));
  const [rows, cnt] = await Promise.all([
    db.query(`${SELECT} WHERE ${w} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, vals),
    db.query(`SELECT COUNT(*)::int n ${FROM} WHERE ${w}`, vals)
  ]);
  res.json({ listings: rows.rows, total: cnt.rows[0].n, limit, offset });
}));

/* „Oferte bune": anunțuri cu prețul sub piață. Piața = mediana prețurilor comparabile (aceeași categorie, stare, monedă; fără bugetul ales),
   iar oferta = între 40% și 80% din mediană (sub 40% e de obicei greșeală sau înșelătorie). Fără cel puțin 8 anunțuri comparabile nu răspundem. */
const DEAL_MIN_N = 8, DEAL_HI = 0.8, DEAL_LO = 0.4;
router.get('/deals', ah(async (req, res) => {
  const cur = req.query.currency === 'EUR' ? 'EUR' : 'RON';
  const limit = Math.min(24, Math.max(1, Math.floor(Number(req.query.limit)) || 10));
  const base = { query: { ...req.query } }; delete base.query.min; delete base.query.max; delete base.query.ids; delete base.query.sold;
  const { where: bw, vals: bv } = await buildWhere(base);
  bv.push(cur);
  const m = (await db.query(
    `SELECT COUNT(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY l.price)::float AS median
       ${FROM} WHERE ${bw} AND l.price > 0 AND l.currency = $${bv.length}`, bv)).rows[0];
  if (!m || m.n < DEAL_MIN_N || !m.median) return res.json({ listings: [], n: m ? m.n : 0, median: null, currency: cur });
  const { where: w, vals } = await buildWhere({ query: { ...req.query, currency: cur } });
  vals.push(cur, m.median * DEAL_LO, m.median * DEAL_HI);
  const k = vals.length;
  const rows = (await db.query(
    `${SELECT} WHERE ${w} AND l.price > 0 AND l.currency = $${k - 2} AND l.price >= $${k - 1} AND l.price <= $${k}
      ORDER BY l.price ASC, l.id DESC LIMIT ${limit}`, vals)).rows;
  res.json({ listings: rows.map((l) => ({ ...l, deal_pct: Math.round((1 - Number(l.price) / m.median) * 100) })), n: m.n, median: Math.round(m.median), currency: cur });
}));

/* Valorile disponibile pentru filtrele de tip text (marcă, model...), cu numărul de anunțuri, după filtrele deja alese.
   Ex.: după ce alegi marca Audi, la model apar doar modelele Audi care există. */
router.get('/facets', ah(async (req, res) => {
  const slug = String(req.query.category || '').slice(0, 60);
  const texts = (await attrDefs(slug)).filter((d) => d.type === 'text' && ATTR_KEY.test(d.key)).slice(0, 8);
  const facets = {};
  await Promise.all(texts.map(async (d) => {
    const { where: w, vals } = await buildWhere(req, d.key);
    vals.push(d.key);
    const k = '$' + vals.length;
    const r = await db.query(
      `SELECT INITCAP(TRIM(l.attributes ->> ${k}::text)) AS v, COUNT(*)::int n ${FROM}
        WHERE ${w} AND COALESCE(TRIM(l.attributes ->> ${k}::text), '') <> ''
        GROUP BY 1 ORDER BY n DESC, v LIMIT 60`, vals);
    facets[d.key] = r.rows;
  }));
  res.set('Cache-Control', 'no-store').json({ facets });
}));

/* Numărul de telefon se dezvăluie la cerere, doar dacă vânzătorul a ales să-l arate; limitat ca să nu se poată strânge în masă. */
const phoneAllow = createThrottle(40, 60 * 60 * 1000);
router.get('/:id(\\d+)/phone', ah(async (req, res) => {
  if (!phoneAllow('p' + clientIp(req))) return res.status(429).json({ error: 'RATE_LIMIT' });
  const r = await db.query(
    "SELECT l.contact_phone, l.contact_wa, l.contact_show, u.phone, u.whatsapp, u.show_phone FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = $1 AND l.status IN ('approved','sold')", [req.params.id]);
  const x = r.rows[0];
  let phone = null, wa = false;
  if (x) {
    if (x.contact_show !== null) { if (x.contact_show && x.contact_phone) { phone = x.contact_phone; wa = !!x.contact_wa; } }   // contactul ales pe anunț
    else if (x.show_phone && x.phone) { phone = x.phone; wa = !!x.whatsapp; }                                                   // anunț mai vechi: telefonul din cont
  }
  if (!phone) return res.status(404).json({ error: 'NEGASIT' });
  studio.bump(Number(req.params.id), 'phones', studio.whoOf(req));
  res.json({ phone, whatsapp: wa });
}));

router.get('/mine', requireAuth, ah(async (req, res) => {
  // + data expirării, vizualizări, salvări la favorite și mesaje primite, pentru cardurile din „Anunțurile mele”
  const r = await db.query(
    `SELECT x.*, l2.expires_at, l2.views, l2.updated_at, l2.deleted_at,
            (SELECT COUNT(*)::int FROM favorites f WHERE f.listing_id = x.id) AS favs,
            (SELECT COUNT(*)::int FROM messages m WHERE m.listing_id = x.id AND m.recipient_id = $1) AS msgs
       FROM (${SELECT} WHERE l.user_id = $1 AND (l.status <> 'deleted' OR l.deleted_at > NOW() - INTERVAL '30 days') ORDER BY l.created_at DESC LIMIT 200) x
       JOIN listings l2 ON l2.id = x.id ORDER BY x.created_at DESC`, [req.user.id]);
  res.json({ listings: r.rows });
}));

/* Statistici pentru anunțurile mele: vizualizări și de câte ori au fost salvate la favorite. */
router.get('/stats', requireAuth, ah(async (req, res) => {
  const r = await db.query(
    `SELECT l.id, l.title, l.status, l.views, (SELECT COUNT(*)::int FROM favorites f WHERE f.listing_id = l.id) AS favs
       FROM listings l WHERE l.user_id = $1 AND l.status <> 'deleted' ORDER BY l.created_at DESC LIMIT 200`, [req.user.id]);
  res.json({ listings: r.rows });
}));

router.get('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.query(
    `SELECT l.*, c.name AS category, p.name AS parent_category, u.nickname AS seller, u.created_at AS seller_since, u.show_phone, u.phone AS seller_phone, u.plan, u.plan_until
       FROM listings l JOIN categories c ON c.id = l.category_id LEFT JOIN categories p ON p.id = c.parent_id
       LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`, [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  const l = r.rows[0], me = req.user;
  const staff = me && ['admin', 'moderator'].includes(me.role), owner = me && me.id === l.user_id;
  if (!['approved', 'sold'].includes(l.status) && !staff && !owner) return res.status(404).json({ error: 'NEGASIT' });
  if (!owner && !staff) { db.query('UPDATE listings SET views = views + 1 WHERE id = $1', [l.id]).catch(() => {}); studio.bump(l.id, 'views', studio.whoOf(req)); }
  const defs = await db.query('SELECT key, label FROM category_attributes WHERE category_id = $1 OR category_id = (SELECT parent_id FROM categories WHERE id = $1)', [l.category_id]);
  const label = Object.fromEntries(defs.rows.map((d) => [d.key, d.label]));
  const imgs = await db.query('SELECT id, url FROM listing_images WHERE listing_id = $1 ORDER BY position, id', [l.id]);
  res.json({ listing: {
    images: imgs.rows.map((i) => i.url),
    seller_id: l.user_id, seller_since: l.seller_since, seller_rating: (await db.query('SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS avg, COUNT(*)::int AS n FROM reviews WHERE seller_id = $1 AND role = \'seller\'', [l.user_id]).catch(() => ({ rows: [{ avg: 0, n: 0 }] }))).rows[0], mine: !!owner, seller_presence: owner ? undefined : await require('./live').presenceOf(l.user_id).catch(() => undefined),
    // datele brute de care are nevoie formularul de editare; le primește doar proprietarul
    edit: (owner || staff) ? { category_id: l.category_id, attributes: l.attributes || {}, images: imgs.rows, contact: { name: l.contact_name, phone: l.contact_phone, wa: l.contact_wa, show: l.contact_show } } : undefined,
    id: l.id, title: l.title, description: l.description, price: l.price, currency: l.currency, negotiable: l.negotiable,
    condition: l.condition, county: l.county, city: l.city, status: l.status, created_at: l.created_at,
    category: l.category, parent_category: l.parent_category, seller: l.seller, seller_type: l.seller_type, seller_plan: plans.effective(l),
    address: l.address || null,
    // doar proprietarul: datele din bara de acțiuni de pe pagina anunțului
    owner_info: owner ? { favs: (await db.query('SELECT COUNT(*)::int n FROM favorites WHERE listing_id = $1', [l.id])).rows[0].n, msgs: (await db.query('SELECT COUNT(*)::int n FROM messages WHERE listing_id = $1 AND recipient_id = $2', [l.id, me.id])).rows[0].n, views: l.views, expires_at: l.expires_at, bumped_at: l.bumped_at, updated_at: l.updated_at, promoted_until: l.promoted_until } : undefined,
    has_phone: l.contact_show !== null ? !!(l.contact_show && l.contact_phone) : !!(l.show_phone && l.seller_phone), contact_name: l.contact_name || null, // numărul se cere separat (GET /:id/phone), nu stă în pagină
    attributes: Object.entries(l.attributes || {}).map(([k, v]) => ({ label: label[k] || k, value: v }))
  } });
}));

/* ---- verificare în timp ce scrii: avertisment în formular, fără penalizare ---- */
const checkAllow = createThrottle(90, 60 * 1000);
router.post('/check', requireAuth, ah(async (req, res) => {
  if (req.user.role !== 'user' || !checkAllow('u' + req.user.id)) return res.json({ issues: [], review: false });
  const b = req.body || {};
  res.set('Cache-Control', 'no-store').json(guard.check([String(b.title || '').slice(0, 200), String(b.description || '').slice(0, 4000)]));
}));

/* ---- creare ---- */
router.post('/', requireAuth, requireVerified, ah(async (req, res) => {
  if (!createAllow('u' + req.user.id + ':' + clientIp(req))) return res.status(429).json({ error: 'PREA_MULTE_ANUNTURI' });
  const p = await parse(req.body || {});
  if (p.error) return res.status(400).json({ error: p.error, field: p.field });
  const v = p.v;
  if (await guard.gate(req, res, [v.title, v.description])) return;   // telefon / e-mail / link / cuvinte interzise
  if (req.user.role === 'user') {   // limita de anunțuri active a planului (adminii și moderatorii sunt scutiți)
    const act = await db.query("SELECT COUNT(*)::int n FROM listings WHERE user_id = $1 AND status IN ('pending','approved') AND expires_at > NOW()", [req.user.id]);
    if (act.rows[0].n >= plans.limitsOf(req.user).listings) return res.status(403).json({ error: 'LIMITA_ANUNTURI' });
  }
  const dec = await guard.decide(req.user, v, v.title + '\n' + v.description);   // se publică direct sau merge la moderator, pe scor de încredere
  const r = await db.query(
    `INSERT INTO listings(user_id, category_id, title, description, price, currency, negotiable, condition, seller_type, county, city, attributes, status, search_text, address, auto_approved, trust_score, trust_note, contact_name, contact_phone, contact_wa, contact_show)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id, status`,
    [req.user.id, v.category_id, v.title, v.description, v.price, v.currency, v.negotiable, v.condition, v.seller_type, v.county, v.city,
     JSON.stringify(v.attributes), dec.status, fold(v.title + ' ' + v.description).replace(/[^a-z0-9 ]+/g, ' '), v.address, dec.auto, dec.score, dec.note, v.contact_name, v.contact_phone, v.contact_wa, v.contact_show]);
  if (r.rows[0].status === 'approved') notify.matchSaved(r.rows[0].id);   // anunț nou → căutări salvate care se potrivesc
  res.status(201).json({ listing: r.rows[0] });
}));

/* ---- editarea unui anunț existent (doar proprietarul) ----
   Câmpurile lipsă din cerere (oraș, tip vânzător) se păstrează. Dacă se schimbă titlul, descrierea, categoria sau atributele,
   un anunț respins revine la moderare, iar unul publicat/vândut revine la moderare doar când moderarea e activă (NEW_LISTING_STATUS=pending). */
const same = (a) => JSON.stringify(Object.keys(a || {}).sort().map((k) => [k, a[k]]));
router.patch('/:id(\\d+)', requireAuth, requireVerified, ah(async (req, res) => {
  if (!editAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const staff = ['admin', 'moderator'].includes(req.user.role);   // echipa poate edita orice anunț (se scrie în jurnal)
  const cur = (await db.query('SELECT * FROM listings WHERE id = $1' + (staff ? '' : ' AND user_id = $2'), staff ? [req.params.id] : [req.params.id, req.user.id])).rows[0];
  if (!cur || cur.status === 'deleted') return res.status(404).json({ error: 'NEGASIT' });
  const asStaff = staff && cur.user_id !== req.user.id;
  if (cur.status === 'blocked' && !staff) return res.status(403).json({ error: 'INTERZIS' });
  const p = await parse({ seller_type: cur.seller_type, city: cur.city, address: cur.address, contact_name: cur.contact_name, contact_phone: cur.contact_phone, contact_wa: cur.contact_wa, contact_show: cur.contact_show, ...(req.body || {}) });
  if (p.error) return res.status(400).json({ error: p.error, field: p.field });
  const v = p.v;
  const changed = cur.title !== v.title || (cur.description || '') !== v.description || cur.category_id !== v.category_id || same(cur.attributes) !== same(v.attributes);
  if (!asStaff && changed && await guard.gate(req, res, [v.title, v.description])) return;
  let status = cur.status, dec = null;
  if (!asStaff && changed && ['approved', 'sold', 'rejected'].includes(cur.status)) {
    // rejectat → revine mereu la moderator; publicat/vândut → rămâne dacă scorul de încredere permite și textul e curat
    dec = cur.status === 'rejected' ? { status: 'pending', auto: false, score: null, note: 'În verificare: anunț corectat după respingere' } : await guard.decide(req.user, v, v.title + '\n' + v.description, { excludeId: cur.id });
    if (dec.status === 'pending') {
      const pend = await db.query("SELECT COUNT(*)::int AS n FROM listings WHERE user_id = $1 AND status = 'pending'", [cur.user_id]);
      if (pend.rows[0].n >= 20) return res.status(429).json({ error: 'PREA_MULTE_ANUNTURI' });
      status = 'pending';
    }
  }
  const r = await db.query(
    `UPDATE listings SET category_id=$1, title=$2, description=$3, price=$4, currency=$5, negotiable=$6, condition=$7, seller_type=$8,
            county=$9, city=$10, attributes=$11, status=$12, search_text=$13, address=$16, contact_name=$17, contact_phone=$18, contact_wa=$19, contact_show=$20, updated_at=NOW()
      WHERE id=$14 AND user_id=$15 RETURNING id, status`,
    [v.category_id, v.title, v.description, v.price, v.currency, v.negotiable, v.condition, v.seller_type, v.county, v.city,
     JSON.stringify(v.attributes), status, fold(v.title + ' ' + v.description).replace(/[^a-z0-9 ]+/g, ' '), cur.id, cur.user_id, v.address, v.contact_name, v.contact_phone, v.contact_wa, v.contact_show]);
  if (r.rowCount && cur.price != null && v.price != null && cur.currency === v.currency && Number(cur.price) !== Number(v.price)) {
    if (Number(v.price) < Number(cur.price)) db.query('UPDATE listings SET price_was = $2, price_dropped_at = NOW() WHERE id = $1', [cur.id, cur.price]).catch(() => {});
    else db.query('UPDATE listings SET price_was = NULL, price_dropped_at = NULL WHERE id = $1', [cur.id]).catch(() => {});   // preț crescut: nu mai e „redus"
  } else if (r.rowCount && cur.currency !== v.currency) db.query('UPDATE listings SET price_was = NULL, price_dropped_at = NULL WHERE id = $1', [cur.id]).catch(() => {});
  if (dec && r.rowCount) db.query('UPDATE listings SET auto_approved = $2, trust_score = $3, trust_note = $4 WHERE id = $1', [cur.id, status !== 'pending' && dec.auto, dec.score, dec.note]).catch(() => {});
  if (asStaff) {
    const ch = [];
    if (cur.title !== v.title) ch.push('titlu'); if ((cur.description || '') !== v.description) ch.push('descriere');
    if (String(cur.price == null ? '' : Number(cur.price)) !== String(v.price == null ? '' : v.price)) ch.push('preț');
    if (cur.category_id !== v.category_id) ch.push('categorie'); if (same(cur.attributes) !== same(v.attributes)) ch.push('atribute');
    if (cur.county !== v.county || cur.city !== v.city) ch.push('locație'); if (cur.condition !== v.condition) ch.push('stare');
    db.query('INSERT INTO admin_activity(admin_id, action, target_type, target_id, details) VALUES($1,$2,$3,$4,$5)',
      [req.user.id, 'listing_edit', 'listing', cur.id, ('editat de echipă: ' + (ch.join(', ') || 'fără schimbări')).slice(0, 900)]).catch(() => {});
  }
  if (r.rowCount && r.rows[0].status === 'approved' && cur.price != null && v.price != null && cur.currency === v.currency && Number(v.price) < Number(cur.price)) notify.priceDrop(cur.id, v.title, cur.price, v.price, v.currency);   // preț redus → cei care au anunțul la favorite
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

/* ---- urcare în listă (UP): gratuită o dată la câteva ore; mai des, costă credite (doar dacă BILLING=on și clientul a confirmat cu pay:true) ---- */
router.post('/:id(\\d+)/bump', requireAuth, ah(async (req, res) => {
  const hours = billing.freeBumpHours();
  const r = await db.query(
    "UPDATE listings SET bumped_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'approved' AND COALESCE(bumped_at, 'epoch'::timestamptz) < NOW() - ($3 || ' hours')::interval RETURNING id, bumped_at", [req.params.id, req.user.id, String(hours)]);
  if (r.rowCount) return res.json({ ok: true, bumped_at: r.rows[0].bumped_at, paid: 0 });
  const ex = (await db.query("SELECT title, status FROM listings WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id])).rows[0];
  if (!ex) return res.status(404).json({ error: 'NEGASIT' });
  const price = billing.enabled() && ex.status === 'approved' ? billing.PRICING.bump.price : 0;
  if (!price) return res.status(429).json({ error: 'REACTUALIZARE_PREA_DEVREME', hours });
  if ((req.body || {}).pay !== true) return res.status(429).json({ error: 'REACTUALIZARE_PREA_DEVREME', hours, price });   // clientul întreabă omul înainte să scadă credite
  const out = await billing.withTx(async (c) => {
    const bal = await billing.spend(c, req.user.id, price, 'bump', Number(req.params.id), 'Urcare în listă: ' + ex.title);
    if (bal === null) return { err: 'CREDITE_INSUFICIENTE' };
    await c.query("UPDATE listings SET bumped_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'approved'", [req.params.id, req.user.id]);
    return { balance: bal };
  });
  if (out.err) return res.status(402).json({ error: out.err });
  res.json({ ok: true, paid: price, balance: out.balance });
}));

/* ---- reînnoire: încă 30 de zile; se poate cu cel mult 7 zile înainte de expirare sau după ce a expirat ---- */
router.post('/:id(\\d+)/renew', requireAuth, ah(async (req, res) => {
  const r = await db.query(
    "UPDATE listings SET expires_at = NOW() + INTERVAL '30 days', bumped_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'approved' AND expires_at < NOW() + INTERVAL '7 days' RETURNING expires_at", [req.params.id, req.user.id]);
  if (r.rowCount) return res.json({ ok: true, expires_at: r.rows[0].expires_at });
  const ex = await db.query("SELECT status FROM listings WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  if (!ex.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  res.status(409).json({ error: ex.rows[0].status === 'approved' ? 'REINNOIRE_PREA_DEVREME' : 'REINNOIRE_INDISPONIBILA' });
}));

/* ---- promovare: anunțul apare primul, cu insigna „Promovat” ---- */
const PROMO_DAYS = [3, 7, 30];
router.post('/:id(\\d+)/promote', requireAuth, ah(async (req, res) => {
  if (config.PROMO_MODE === 'off') return res.status(503).json({ error: 'PROMOVARE_INDISPONIBILA' });
  const days = Number((req.body || {}).days);
  if (!PROMO_DAYS.includes(days)) return res.status(400).json({ error: 'PROMOVARE_INVALIDA' });
  const own = await db.query("SELECT id, promoted_until FROM listings WHERE id = $1 AND user_id = $2 AND status = 'approved'", [req.params.id, req.user.id]);
  if (!own.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  const active = await db.query("SELECT COUNT(*)::int n FROM listings WHERE user_id = $1 AND id <> $2 AND promoted_until > NOW()", [req.user.id, req.params.id]);
  if (active.rows[0].n >= plans.limitsOf(req.user).promos) return res.status(409).json({ error: 'PREA_MULTE_PROMOVARI' });
  const price = billing.enabled() ? billing.PRICING.promo[days] : 0;
  const sql = "UPDATE listings SET promoted_until = GREATEST(COALESCE(promoted_until, NOW()), NOW()) + ($1 || ' days')::interval, bumped_at = NOW() WHERE id = $2 RETURNING promoted_until";
  if (!price) { const r = await db.query(sql, [String(days), req.params.id]); return res.json({ ok: true, promoted_until: r.rows[0].promoted_until, paid: 0 }); }
  const out = await billing.withTx(async (c) => {
    const bal = await billing.spend(c, req.user.id, price, 'promo', Number(req.params.id), `Promovare ${days} zile`);
    if (bal === null) return { err: 'CREDITE_INSUFICIENTE' };
    const r = await c.query(sql, [String(days), req.params.id]);
    return { balance: bal, promoted_until: r.rows[0].promoted_until };
  });
  if (out.err) return res.status(402).json({ error: out.err });
  res.json({ ok: true, paid: price, balance: out.balance, promoted_until: out.promoted_until });
}));

router.delete('/:id(\\d+)', requireAuth, ah(async (req, res) => {
  // prima ștergere = mutare în „Șterse” (30 de zile); a doua, pe un anunț deja șters = ștergere definitivă
  const soft = await db.query("UPDATE listings SET status = 'deleted', deleted_at = NOW(), deleted_from = status WHERE id = $1 AND user_id = $2 AND status <> 'deleted' RETURNING id", [req.params.id, req.user.id]);
  if (soft.rowCount) return res.json({ ok: true, deleted: 'soft' });
  const ok = await hardDelete(req.params.id, req.user.id);
  if (!ok) return res.status(404).json({ error: 'NEGASIT' });
  res.json({ ok: true, deleted: 'hard' });
}));

/* Ștergere definitivă (anunț, poze din Storage, iar mesajele din chat dispar odată cu anunțul). */
async function hardDelete(id, userId) {
  const im = await db.query("SELECT i.url, i.thumb_url FROM listing_images i JOIN listings l ON l.id = i.listing_id WHERE l.id = $1 AND l.status = 'deleted' AND ($2::int IS NULL OR l.user_id = $2)", [id, userId]);
  const hard = await db.query("DELETE FROM listings WHERE id = $1 AND status = 'deleted' AND ($2::int IS NULL OR user_id = $2) RETURNING id", [id, userId]);
  if (!hard.rowCount) return false;
  try { await require('./images').removeStored(...im.rows.flatMap((r) => [r.url, r.thumb_url]).filter(Boolean)); } catch (e) { console.error('hardDelete: poze rămase în Storage:', e.message); }
  return true;
}

/* Reactivare din „Șterse”: anunțul revine direct, cu statusul de dinainte (fără moderare nouă). */
router.post('/:id(\\d+)/restore', requireAuth, ah(async (req, res) => {
  const cur = (await db.query("SELECT id, deleted_from FROM listings WHERE id = $1 AND user_id = $2 AND status = 'deleted' AND deleted_at > NOW() - INTERVAL '30 days'", [req.params.id, req.user.id])).rows[0];
  if (!cur) return res.status(404).json({ error: 'NEGASIT' });
  const to = ['approved', 'pending', 'sold', 'rejected', 'blocked'].includes(cur.deleted_from) ? cur.deleted_from : 'approved';
  if (to === 'approved' || to === 'pending') {
    const act = await db.query("SELECT COUNT(*)::int n FROM listings WHERE user_id = $1 AND status IN ('pending','approved') AND expires_at > NOW()", [req.user.id]);
    if (act.rows[0].n >= plans.limitsOf(req.user).listings) return res.status(403).json({ error: 'LIMITA_ANUNTURI' });
  }
  const r = await db.query("UPDATE listings SET status = $1, deleted_at = NULL, deleted_from = NULL, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND status = 'deleted' RETURNING id, status", [to, cur.id, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  res.json({ ok: true, listing: r.rows[0] });
}));

/* Curățenie: anunțurile șterse de peste 30 de zile se elimină definitiv. Apelată periodic din server.js. */
async function purgeDeleted() {
  const old = await db.query("SELECT id FROM listings WHERE status = 'deleted' AND deleted_at < NOW() - INTERVAL '30 days' LIMIT 200");
  for (const r of old.rows) await hardDelete(r.id, null);
  return old.rowCount;
}

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

module.exports = { router, adminRouter, purgeDeleted };
