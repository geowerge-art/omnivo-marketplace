/* „Cere oferte” pentru piese second-hand: licitație ascunsă.
   Cumpărătorul postează o cerere; dezmembrătorii aprobați și potriviți (marcă + județ) primesc notificare și răspund cu o ofertă.
   Dezmembrătorii NU văd ofertele altora, iar identitatea cumpărătorului rămâne ascunsă până alege. Cumpărătorul compară și
   alege câștigătoarea; abia atunci se deschide un chat între cei doi. Răspunsurile sunt gratuite (fără credite) în această versiune. */
const express = require('express');
const db = require('./db');
const config = require('./config');
const { ah, requireDb } = require('./common');
const { requireAuth, requireRole, requireVerified } = require('./authmw');
const { createThrottle } = require('./security');
const { sendMail, MAIL_READY } = require('./mail');
const notifyMod = require('./notify');
const live = require('./live');

const router = express.Router();
router.use(requireDb, requireAuth);

const createAllow = createThrottle(8, 24 * 60 * 60 * 1000);     // max 8 cereri pe zi per utilizator
const quoteAllow = createThrottle(60, 60 * 60 * 1000);          // max 60 oferte / modificări pe oră
const chatAllow = createThrottle(60, 60 * 60 * 1000);
const dealerAllow = createThrottle(10, 60 * 60 * 1000);

const GRACE_DAYS = 7;       // după termen, cumpărătorul mai poate alege încă 7 zile dacă a primit oferte
const MAX_NOTIFY = 300;     // câți dezmembrători primesc notificare în aplicație per cerere
const MAX_EMAIL = 100;      // câți primesc și email
const STATES = ['excelenta', 'buna', 'uzata', 'de-reparat'];

const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ALIAS = { vw: 'volkswagen', 'mercedes-benz': 'mercedes', 'mercedes benz': 'mercedes', merc: 'mercedes', 'alfa-romeo': 'alfa romeo', 'land-rover': 'land rover' };
const brandKey = (b) => { const k = fold(b).replace(/\s+/g, ' '); return ALIAS[k] || k; };
const toId = (v) => (/^\d{1,10}$/.test(String(v)) ? Number(v) : null);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n, cur) => `${Number(n).toLocaleString('ro-RO')} ${cur === 'EUR' ? '€' : 'lei'}`;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/* ---------- validări (funcții pure, testate în requests.test.js) ---------- */
function parseRequest(b = {}) {
  const part = String(b.part || '').trim(), brand = String(b.brand || '').trim(), model = String(b.model || '').trim().slice(0, 60);
  if (part.length < 3 || part.length > 200) return { error: 'PIESA_INVALIDA' };
  if (brand.length < 2 || brand.length > 40) return { error: 'MARCA_INVALIDA' };
  let year = null;
  if (b.year !== null && b.year !== undefined && b.year !== '') {
    year = Number(b.year);
    if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) return { error: 'AN_INVALID' };
  }
  const vin = String(b.vin || '').trim().toUpperCase();
  if (vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) return { error: 'VIN_INVALID' };
  const county = String(b.county || '').trim().slice(0, 40);
  if (!county) return { error: 'JUDET_LIPSA' };
  const hours = [24, 48, 72].includes(Number(b.hours)) ? Number(b.hours) : 48;
  const details = String(b.details || '').trim();
  if (details.length > 1000) return { error: 'DETALII_PREA_LUNGI' };
  return { v: { part, brand, brand_key: brandKey(brand), model, year, engine: String(b.engine || '').trim().slice(0, 60), vin, details,
    county, city: String(b.city || '').trim().slice(0, 60), delivery: b.delivery !== false, hours } };
}

function parseQuote(b = {}) {
  const price = Number(b.price);
  if (b.price === '' || b.price === null || !Number.isFinite(price) || price <= 0 || price > 10000000) return { error: 'PRET_INVALID' };
  const shipping = num(b.shipping);
  if (shipping !== null && (!Number.isFinite(shipping) || shipping < 0 || shipping > 100000)) return { error: 'TRANSPORT_INVALID' };
  const warranty = b.warranty_days === '' || b.warranty_days == null ? 0 : Number(b.warranty_days);
  if (!Number.isInteger(warranty) || warranty < 0 || warranty > 730) return { error: 'GARANTIE_INVALIDA' };
  const state = STATES.includes(b.state) ? b.state : 'buna';
  const note = String(b.note || '').trim();
  if (note.length > 600) return { error: 'NOTA_PREA_LUNGA' };
  // fără telefon / email în ofertă: contactul se schimbă doar după alegere, în chat
  if (/(\+?\d[\d\s().-]{7,}\d)|@|https?:\/\/|www\./i.test(note)) return { error: 'FARA_CONTACT_IN_OFERTA' };
  return { v: { price, currency: b.currency === 'EUR' ? 'EUR' : 'RON', state, warranty_days: warranty, shipping, pickup: b.pickup !== false, note } };
}

function parseDealer(b = {}) {
  const company = String(b.company || '').trim(), cui = String(b.cui || '').trim().toUpperCase().replace(/\s+/g, '');
  if (company.length < 2 || company.length > 80) return { error: 'FIRMA_INVALIDA' };
  if (cui && !/^(RO)?\d{2,10}$/.test(cui)) return { error: 'CUI_INVALID' };
  const county = String(b.county || '').trim().slice(0, 40);
  if (!county) return { error: 'JUDET_LIPSA' };
  const list = (v, max) => (Array.isArray(v) ? v : String(v || '').split(','));
  const brands = [...new Set(list(b.brands).map(brandKey).filter((x) => x && x.length <= 40))].slice(0, 40);
  const counties = [...new Set(list(b.counties).map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 42);
  return { v: { company, cui, county, city: String(b.city || '').trim().slice(0, 60), brands, counties } };
}

/* un dezmembrător se potrivește cu o cerere dacă acoperă marca și județul (liste goale = toate) */
const dealerMatches = (d, r) => (!d.brands.length || d.brands.includes(r.brand_key)) && (!d.counties.length || d.counties.includes(r.county));

/* ---------- utilitare ---------- */
const notify = (...a) => notifyMod.notify(...a);

/* cererile fără oferte după termen, sau cele vechi de peste GRACE_DAYS după termen, expiră (verificare la citire, nu e nevoie de job) */
async function sweep() {
  await db.query(
    `UPDATE part_requests r SET status = 'expired'
      WHERE r.status = 'open' AND r.expires_at < NOW()
        AND (r.expires_at < NOW() - make_interval(days => $1) OR NOT EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = r.id AND q.status = 'sent'))`, [GRACE_DAYS]);
}

const reqTitle = (r) => [r.part, r.brand, r.model, r.year].filter(Boolean).join(' ');

async function myDealer(uid) {
  return (await db.query('SELECT * FROM dealers WHERE user_id = $1', [uid])).rows[0] || null;
}

/* ---------- dezmembrători: profil + aprobare ---------- */
router.get('/dealer/me', ah(async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ dealer: await myDealer(req.user.id) });
}));

router.put('/dealer', ah(async (req, res) => {
  const p = parseDealer(req.body);
  if (p.error) return res.status(400).json({ error: p.error });
  if (!dealerAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const v = p.v, cur = await myDealer(req.user.id), isAdmin = req.user.role === 'admin';
  // schimbarea firmei sau a CUI-ului cere o nouă verificare; mărcile / județele se pot edita liber
  const status = isAdmin ? 'approved' : !cur ? 'pending' : (cur.company !== v.company || (cur.cui || '') !== v.cui) ? 'pending' : cur.status === 'rejected' ? 'rejected' : cur.status;
  const r = await db.query(
    `INSERT INTO dealers(user_id, company, cui, county, city, brands, counties, status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id) DO UPDATE SET company=$2, cui=$3, county=$4, city=$5, brands=$6, counties=$7, status=$8, updated_at=NOW() RETURNING *`,
    [req.user.id, v.company, v.cui || null, v.county, v.city, v.brands, v.counties, status]);
  res.json({ dealer: r.rows[0] });
}));

router.get('/admin/dealers', requireRole('admin', 'moderator'), ah(async (req, res) => {
  const st = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const r = await db.query(
    `SELECT d.user_id, d.company, d.cui, d.county, d.city, d.brands, d.counties, d.status, d.created_at, u.email, u.nickname
       FROM dealers d JOIN users u ON u.id = d.user_id WHERE d.status = $1 ORDER BY d.updated_at DESC LIMIT 200`, [st]);
  res.set('Cache-Control', 'no-store').json({ dealers: r.rows });
}));

router.post('/admin/dealers/:uid(\\d+)', requireRole('admin', 'moderator'), ah(async (req, res) => {
  const status = (req.body || {}).status;
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'DATE_INVALIDE' });
  const r = await db.query('UPDATE dealers SET status = $2, updated_at = NOW() WHERE user_id = $1 RETURNING user_id, company', [Number(req.params.uid), status]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  await db.query('INSERT INTO admin_activity(admin_id, action, target_type, target_id, details) VALUES($1,$2,$3,$4,$5)', [req.user.id, 'dealer_' + status, 'user', r.rows[0].user_id, r.rows[0].company]);
  if (status === 'approved') notify(r.rows[0].user_id, 'rfq_dealer', null, 'Contul de dezmembrător a fost aprobat', 'Vei primi cererile de piese potrivite cu mărcile tale.');
  res.json({ ok: true });
}));

/* ---------- cumpărător: cereri ---------- */
router.post('/', requireVerified, ah(async (req, res) => {
  const p = parseRequest(req.body);
  if (p.error) return res.status(400).json({ error: p.error });
  if (!createAllow('u' + req.user.id)) return res.status(429).json({ error: 'PREA_MULTE_CERERI' });
  const v = p.v;
  const ins = await db.query(
    `INSERT INTO part_requests(user_id, part, brand, brand_key, model, year, engine, vin, details, county, city, delivery, expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW() + make_interval(hours => $13)) RETURNING id, expires_at`,
    [req.user.id, v.part, v.brand, v.brand_key, v.model, v.year, v.engine, v.vin, v.details, v.county, v.city, v.delivery, v.hours]);
  const id = ins.rows[0].id;
  res.status(201).json({ request: { id, expires_at: ins.rows[0].expires_at } });
  distribute(id, req.user.id, v).catch((e) => console.error('rfq distribute:', e.message));   // după răspuns: notificările nu încetinesc cumpărătorul
}));

async function distribute(id, buyerId, r) {
  const d = await db.query(
    `SELECT d.user_id, u.email FROM dealers d JOIN users u ON u.id = d.user_id
      WHERE d.status = 'approved' AND u.status = 'active' AND d.user_id <> $1
        AND (cardinality(d.brands) = 0 OR $2 = ANY(d.brands)) AND (cardinality(d.counties) = 0 OR $3 = ANY(d.counties))
      LIMIT $4`, [buyerId, r.brand_key, r.county, MAX_NOTIFY]);
  const title = reqTitle(r), where = r.county + (r.city ? `, ${r.city}` : '');
  let mails = 0;
  for (const x of d.rows) {
    await notify(x.user_id, 'rfq_new', null, `Cerere nouă: ${title}`, `${where} · termen ${r.hours} h · răspunde cu o ofertă`);
    live.send(x.user_id, 'rfq', { request_id: id });
    if (MAIL_READY && mails < MAX_EMAIL && x.email) {
      mails++;
      const url = (config.APP_URL || '') + '/#cereri';
      sendMail(x.email, `Cerere de piesă: ${title}`,
        `<p>Cerere nouă pe Omnivo: <b>${esc(title)}</b> (${esc(where)}).</p><p>Intră în cont › Cereri de piese ca să trimiți o ofertă: <a href="${esc(url)}">${esc(url)}</a></p>`,
        `Cerere nouă pe Omnivo: ${title} (${where}). Intră în cont > Cereri de piese ca să trimiți o ofertă: ${url}`).catch(() => {});
    }
  }
}

router.get('/mine', ah(async (req, res) => {
  await sweep();
  const r = await db.query(
    `SELECT r.id, r.part, r.brand, r.model, r.year, r.county, r.status, r.expires_at, r.created_at, (r.expires_at > NOW()) AS accepting,
            (SELECT COUNT(*)::int FROM quotes q WHERE q.request_id = r.id AND q.status IN ('sent','won','lost')) AS quotes,
            (SELECT MIN(q.price + COALESCE(q.shipping,0)) FROM quotes q WHERE q.request_id = r.id AND q.status IN ('sent','won') AND q.currency = 'RON') AS best_ron
       FROM part_requests r WHERE r.user_id = $1 ORDER BY r.id DESC LIMIT 100`, [req.user.id]);
  res.set('Cache-Control', 'no-store').json({ requests: r.rows });
}));

/* cererea cu ofertele ei, doar pentru cumpărător; ofertele sunt sortate după preț + transport */
router.get('/:id(\\d+)', ah(async (req, res) => {
  await sweep();
  const r = (await db.query('SELECT *, (expires_at > NOW()) AS accepting FROM part_requests WHERE id = $1 AND user_id = $2', [Number(req.params.id), req.user.id])).rows[0];
  if (!r) return res.status(404).json({ error: 'NEGASIT' });
  const q = await db.query(
    `SELECT q.id, q.price, q.currency, q.state, q.warranty_days, q.shipping, q.pickup, q.note, q.status, q.created_at, q.updated_at,
            d.company, d.county AS dealer_county, d.city AS dealer_city, d.status AS dealer_status,
            (SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE seller_id = q.dealer_id) AS rating,
            (SELECT COUNT(*)::int FROM reviews WHERE seller_id = q.dealer_id) AS rating_count,
            CASE WHEN q.status = 'won' THEN q.dealer_id END AS dealer_id,
            CASE WHEN q.status = 'won' AND u.show_phone THEN u.phone END AS phone,
            (q.status = 'won' AND u.whatsapp) AS whatsapp
       FROM quotes q JOIN dealers d ON d.user_id = q.dealer_id JOIN users u ON u.id = q.dealer_id
      WHERE q.request_id = $1 AND q.status IN ('sent','won','lost')
      ORDER BY (q.status = 'won') DESC, (CASE WHEN q.currency = 'EUR' THEN 5 ELSE 1 END) * (q.price + COALESCE(q.shipping, 0)), q.id`, [r.id]);
  res.set('Cache-Control', 'no-store').json({ request: r, quotes: q.rows });
}));

router.post('/:id(\\d+)/cancel', ah(async (req, res) => {
  const r = await db.query("UPDATE part_requests SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'open' RETURNING id", [Number(req.params.id), req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  await db.query("UPDATE quotes SET status = 'lost', updated_at = NOW() WHERE request_id = $1 AND status = 'sent'", [r.rows[0].id]);
  res.json({ ok: true });
}));

/* alegerea câștigătoarei: o singură dată, atomic */
router.post('/:id(\\d+)/award/:qid(\\d+)', ah(async (req, res) => {
  const rid = Number(req.params.id), qid = Number(req.params.qid);
  const c = await db.pool.connect();
  let won, losers, title;
  try {
    await c.query('BEGIN');
    const r = (await c.query('SELECT * FROM part_requests WHERE id = $1 AND user_id = $2 FOR UPDATE', [rid, req.user.id])).rows[0];
    if (!r) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'NEGASIT' }); }
    if (r.status !== 'open') { await c.query('ROLLBACK'); return res.status(409).json({ error: 'CERERE_INCHISA' }); }
    const q = (await c.query("SELECT id, dealer_id, price, currency FROM quotes WHERE id = $1 AND request_id = $2 AND status = 'sent' FOR UPDATE", [qid, rid])).rows[0];
    if (!q) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'OFERTA_NEGASITA' }); }
    await c.query("UPDATE quotes SET status = 'won', updated_at = NOW() WHERE id = $1", [qid]);
    losers = (await c.query("UPDATE quotes SET status = 'lost', updated_at = NOW() WHERE request_id = $1 AND id <> $2 AND status = 'sent' RETURNING dealer_id", [rid, qid])).rows;
    await c.query("UPDATE part_requests SET status = 'awarded', awarded_quote_id = $2 WHERE id = $1", [rid, qid]);
    await c.query('COMMIT');
    won = q; title = reqTitle(r);
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  notify(won.dealer_id, 'rfq_won', null, `Ofertă câștigătoare: ${title}`, `Cumpărătorul a ales oferta ta de ${money(won.price, won.currency)}. Scrie-i în Cereri de piese.`);
  for (const l of losers) notify(l.dealer_id, 'rfq_lost', null, `Cerere închisă: ${title}`, 'Cumpărătorul a ales o altă ofertă.');
  res.json({ ok: true, quote_id: qid });
}));

/* ---------- dezmembrător: cereri potrivite + oferta mea ---------- */
router.get('/inbox', ah(async (req, res) => {
  await sweep();
  const d = await myDealer(req.user.id);
  if (!d) return res.json({ dealer: null, requests: [] });
  const r = await db.query(
    `SELECT r.id, r.part, r.brand, r.model, r.year, r.engine, r.vin, r.details, r.county, r.city, r.delivery, r.status, r.expires_at, r.created_at,
            (r.expires_at > NOW() AND r.status = 'open') AS accepting,
            q.id AS quote_id, q.price, q.currency, q.state, q.warranty_days, q.shipping, q.pickup, q.note, q.status AS quote_status,
            CASE WHEN q.status = 'won' THEN u.nickname END AS buyer, CASE WHEN q.status = 'won' THEN r.user_id END AS buyer_id
       FROM part_requests r JOIN users u ON u.id = r.user_id LEFT JOIN quotes q ON q.request_id = r.id AND q.dealer_id = $1
      WHERE r.user_id <> $1 AND (q.id IS NOT NULL AND q.status <> 'withdrawn'
            OR ($2 = 'approved' AND r.status = 'open' AND r.expires_at > NOW()
                AND (cardinality($3::text[]) = 0 OR r.brand_key = ANY($3::text[])) AND (cardinality($4::text[]) = 0 OR r.county = ANY($4::text[]))))
      ORDER BY r.id DESC LIMIT 100`, [req.user.id, d.status, d.brands, d.counties]);
  res.set('Cache-Control', 'no-store').json({ dealer: d, requests: r.rows });
}));

router.post('/:id(\\d+)/quotes', ah(async (req, res) => {
  const d = await myDealer(req.user.id);
  if (!d || d.status !== 'approved') return res.status(403).json({ error: 'DEZMEMBRATOR_NEAPROBAT' });
  const p = parseQuote(req.body);
  if (p.error) return res.status(400).json({ error: p.error });
  if (!quoteAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const r = (await db.query("SELECT * FROM part_requests WHERE id = $1 AND status = 'open' AND expires_at > NOW() AND user_id <> $2", [Number(req.params.id), req.user.id])).rows[0];
  if (!r || !dealerMatches(d, r)) return res.status(404).json({ error: 'NEGASIT' });
  const v = p.v;
  const q = await db.query(
    `INSERT INTO quotes(request_id, dealer_id, price, currency, state, warranty_days, shipping, pickup, note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (request_id, dealer_id) DO UPDATE SET price=$3, currency=$4, state=$5, warranty_days=$6, shipping=$7, pickup=$8, note=$9, status='sent', updated_at=NOW()
       WHERE quotes.status IN ('sent','withdrawn') RETURNING id, (xmax = 0) AS created`,
    [r.id, req.user.id, v.price, v.currency, v.state, v.warranty_days, v.shipping, v.pickup, v.note]);
  if (!q.rowCount) return res.status(409).json({ error: 'CERERE_INCHISA' });
  if (q.rows[0].created) {
    notify(r.user_id, 'rfq_quote', null, `Ofertă nouă: ${reqTitle(r)}`, `${d.company} · ${money(v.price, v.currency)}`);
    live.send(r.user_id, 'rfq', { request_id: r.id });
  }
  res.status(201).json({ quote_id: q.rows[0].id });
}));

router.delete('/:id(\\d+)/quotes', ah(async (req, res) => {
  const r = await db.query("UPDATE quotes SET status = 'withdrawn', updated_at = NOW() WHERE request_id = $1 AND dealer_id = $2 AND status = 'sent' RETURNING id", [Number(req.params.id), req.user.id]);
  res.json({ ok: r.rowCount > 0 });
}));

/* ---------- chatul ofertei câștigătoare (doar cei doi) ---------- */
async function chatCtx(qid, me) {
  const r = (await db.query(
    `SELECT q.id, q.dealer_id, r.user_id AS buyer_id, r.part, r.brand, r.model, r.year, d.company, ub.nickname AS buyer
       FROM quotes q JOIN part_requests r ON r.id = q.request_id JOIN dealers d ON d.user_id = q.dealer_id JOIN users ub ON ub.id = r.user_id
      WHERE q.id = $1 AND q.status = 'won'`, [qid])).rows[0];
  if (!r || (r.dealer_id !== me && r.buyer_id !== me)) return null;
  return r;
}

router.get('/quote/:qid(\\d+)/chat', ah(async (req, res) => {
  const c = await chatCtx(Number(req.params.qid), req.user.id);
  if (!c) return res.status(404).json({ error: 'NEGASIT' });
  const rows = (await db.query('SELECT id, body, created_at, (sender_id = $2) AS mine FROM quote_messages WHERE quote_id = $1 ORDER BY id DESC LIMIT 300', [c.id, req.user.id])).rows.reverse();
  await db.query('UPDATE quote_messages SET read_at = NOW() WHERE quote_id = $1 AND sender_id <> $2 AND read_at IS NULL', [c.id, req.user.id]);
  res.set('Cache-Control', 'no-store').json({ with: req.user.id === c.buyer_id ? c.company : c.buyer, title: [c.part, c.brand, c.model, c.year].filter(Boolean).join(' '), messages: rows });
}));

router.post('/quote/:qid(\\d+)/chat', ah(async (req, res) => {
  const c = await chatCtx(Number(req.params.qid), req.user.id), body = String((req.body || {}).body || '').trim();
  if (!c) return res.status(404).json({ error: 'NEGASIT' });
  if (!body || body.length > 2000) return res.status(400).json({ error: 'MESAJ_INVALID' });
  if (!chatAllow('u' + req.user.id)) return res.status(429).json({ error: 'PREA_MULTE_MESAJE' });
  const m = (await db.query('INSERT INTO quote_messages(quote_id, sender_id, body) VALUES($1,$2,$3) RETURNING id, created_at', [c.id, req.user.id, body])).rows[0];
  const to = req.user.id === c.buyer_id ? c.dealer_id : c.buyer_id;
  if (live.isOnline(to)) live.send(to, 'rfq_msg', { quote_id: c.id });
  else notify(to, 'rfq_msg', null, `Mesaj nou: ${[c.part, c.brand].join(' ')}`, body.slice(0, 120));
  res.status(201).json({ message: { id: m.id, created_at: m.created_at, body, mine: true } });
}));

module.exports = { router, parseRequest, parseQuote, parseDealer, dealerMatches, brandKey };
