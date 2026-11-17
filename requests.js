/* „Cere oferte piese” / „Ofertează piesele”, ca la AutoParts: cererile sunt publice (le vede oricine), orice utilizator conectat poate
   trimite o ofertă (preț + mesaj + poze), ofertele le vede doar cumpărătorul. Când acceptă o ofertă, celelalte se refuză, cererea devine
   „rezolvată” și se creează o comandă; abia atunci cei doi își văd datele de contact. Cumpărătorul poate pune întrebări pe oferte.
   Tabelele rq_* (038_… / 039_rfq_autoparts.sql); tabelele vechi (part_requests, quotes, dealers) nu mai sunt folosite. */
const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const { ah, requireDb } = require('./common');
const { requireAuth, requireVerified } = require('./authmw');
const { createThrottle } = require('./security');
const rfqNotify = require('./rfq-notify');
const live = require('./live');
const guard = require('./guard');
const imgs = require('./images');

const router = express.Router();          // /api/requests
const offersRouter = express.Router();    // /api/offers
const questionsRouter = express.Router(); // /api/offer-questions
const ordersRouter = express.Router();    // /api/orders
for (const r of [router, offersRouter, questionsRouter, ordersRouter]) r.use(requireDb);

const createAllow = createThrottle(8, 24 * 60 * 60 * 1000);   // max 8 cereri pe zi
const offerAllow = createThrottle(30, 60 * 60 * 1000);        // max 30 oferte / modificări pe oră
const questionAllow = createThrottle(30, 60 * 60 * 1000);
const photoAllow = createThrottle(40, 60 * 60 * 1000);
const reportAllow = createThrottle(10, 60 * 60 * 1000);
const MAX_PHOTOS = 6, PHOTO_QUOTA = 60 * 1024 * 1024, MAX_EXTRA = 9, EDIT_MIN = 10, REQUEST_DAYS = 7, MAX_NOTIFY = 300;
const KINDS = ['ambele', 'noi', 'second-hand'];
const MARKS = ['later', 'ignored'];
const SEEN = ['new', 'all', 'offered', 'later', 'ignored'];
const REASONS = ['inselatorie', 'contact', 'interzis', 'spam', 'duplicat', 'altul'];
const AUTO_CLOSE_REPORTS = 3;   // 3 utilizatori diferiți în 24 h -> cererea se închide până o verifică un moderator
const ORDER_STATUS = ['new', 'confirmed', 'shipped', 'done', 'cancelled', 'suspended'];
const MAX_NEW_EMAILS = 100, NEW_EMAILS_PER_DAY = 10;   // câte emailuri „cerere nouă” pleacă la o cerere / pe zi la același vânzător

const toId = (v) => (/^\d{1,10}$/.test(String(v)) ? Number(v) : null);
const notify = (...a) => rfqNotify.notify(...a);   // în aplicație + email (vezi rfq-notify.js)
const money = (n, cur) => `${Number(n).toLocaleString('ro-RO')} ${cur === 'EUR' ? '€' : 'lei'}`;
const likeEsc = (s) => String(s || '').replace(/[%_\\]/g, ' ').trim().slice(0, 60);

// telefon / email / link în texte publice: contactul se dă doar după ce cumpărătorul acceptă oferta
const CONTACT_RE = /@|https?:\/\/|www\.|(?:\+|\b00)\s?\d[\d\s().-]{8,}\d|\b0[\s.-]?7(?:[\s.-]?\d){8}\b/i;

/* ---------- blocări (tabela user_blocks, aceeași ca la Mesaje) ---------- */
/* { byMe, byThem }: cine pe cine a blocat între cei doi utilizatori */
async function blockState(me, other, q = (s, p) => db.query(s, p)) {
  if (!me || !other) return { byMe: false, byThem: false };
  const r = await q(
    `SELECT COUNT(*) FILTER (WHERE blocker_id = $1)::int AS by_me, COUNT(*) FILTER (WHERE blocker_id = $2)::int AS by_them
       FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`, [me, other]);
  const x = (r.rows && r.rows[0]) || {};
  return { byMe: Number(x.by_me) > 0, byThem: Number(x.by_them) > 0 };
}
const blockError = (bs) => (bs.byMe ? 'RQ_BLOCAT_DE_TINE' : bs.byThem ? 'RQ_BLOCAT' : null);
/* cererile pe care cei doi nu și le văd (în oricare sens) */
const REQ_NOT_BLOCKED = (uid, owner) => `NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = ${uid} AND b.blocked_id = ${owner}) OR (b.blocker_id = ${owner} AND b.blocked_id = ${uid}))`;
/* ofertele vânzătorilor pe care cumpărătorul i-a blocat nu se mai afișează și nu se mai numără */
const OFFER_NOT_BLOCKED = (o, buyer) => `NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = ${buyer} AND b.blocked_id = ${o}.seller_id)`;

/* ---------- validări (funcții pure, testate în requests.test.js) ---------- */
function parseRequest(b = {}) {
  const t = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const title = t(b.title, 150), description = t(b.description, 2000);
  if (title.length < 3) return { error: 'PIESA_INVALIDA' };
  const make = t(b.make, 40), model = t(b.model, 60), variant = t(b.variant, 80), engine = t(b.engine, 60);
  if (make.length < 2) return { error: 'MARCA_INVALIDA' };
  let year = t(b.year, 4);
  if (year) { const y = Number(year); if (!/^\d{4}$/.test(year) || y < 1950 || y > new Date().getFullYear() + 1) return { error: 'AN_INVALID' }; }
  const vin = t(b.vin, 17).toUpperCase();
  if (vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) return { error: 'VIN_INVALID' };
  const county = t(b.county, 40);
  if (!county) return { error: 'JUDET_LIPSA' };
  const extra = [];
  if (b.extra_parts !== undefined && b.extra_parts !== null) {
    if (!Array.isArray(b.extra_parts)) return { error: 'PIESE_INVALIDE' };
    if (b.extra_parts.length > MAX_EXTRA) return { error: 'PREA_MULTE_PIESE' };
    for (const x of b.extra_parts) {
      const xt = t(x && x.title, 150), xd = t(x && x.details, 300);
      if (xt.length < 3) return { error: 'PIESA_INVALIDA' };
      extra.push({ title: xt, details: xd });
    }
  }
  const pub = [title, description, model, variant, engine, ...extra.flatMap((x) => [x.title, x.details])];
  if (pub.some((s) => CONTACT_RE.test(s))) return { error: 'FARA_CONTACT_IN_CERERE' };
  return { v: { title, description, make, model, year, variant, engine, vin, kind: KINDS.includes(b.kind) ? b.kind : 'ambele', county, city: t(b.city, 60), ship_address: t(b.ship_address, 300), extra_parts: extra } };
}

function parseOffer(b = {}) {
  const price = Number(b.price);
  if (b.price === '' || b.price === null || b.price === undefined || !Number.isFinite(price) || price <= 0 || price > 10000000) return { error: 'PRET_INVALID' };
  const message = String(b.message || '').trim();
  if (message.length > 2000) return { error: 'MESAJ_PREA_LUNG' };
  if (CONTACT_RE.test(message)) return { error: 'FARA_CONTACT_IN_OFERTA' };
  const v = { price: Math.round(price * 100) / 100, currency: b.currency === 'EUR' ? 'EUR' : 'RON', message };
  if (b.listing_id !== undefined) {   // anunț atașat: absent = neatins, null/"" = scos, număr = atașat
    if (b.listing_id === null || b.listing_id === '') v.listing_id = null;
    else { const id = toId(b.listing_id); if (!id) return { error: 'ANUNT_INVALID' }; v.listing_id = id; }
  }
  return { v };
}

/* ---------- expirare ---------- */
async function sweep() {
  const ex = await db.query("UPDATE rq_requests SET status = 'closed' WHERE status = 'open' AND expires_at < NOW() RETURNING id, user_id, title");
  for (const r of ex.rows) {
    notify(r.user_id, 'rfq_expired', null, `Cerere expirată: ${r.title}`, 'Poți s-o reactivezi din „Cererile mele”.');
    live.send(r.user_id, 'rfq', { request_id: r.id });
  }
}

/* oferte în așteptare al căror anunț atașat nu mai e disponibil (vândut, șters, blocat, expirat...): cumpărătorul e anunțat o singură dată, în aplicație */
const GONE = { sold: 'a fost vândut', deleted: 'a fost șters', rejected: 'a fost respins', blocked: 'a fost blocat', pending: 'e în verificare' };
async function sweepListings() {
  const r = await db.query(
    `UPDATE rq_offers o SET listing_notified = TRUE FROM listings l, rq_requests q
      WHERE l.id = o.listing_id AND q.id = o.request_id AND o.status = 'pending' AND q.status = 'open' AND NOT o.listing_notified
        AND NOT (${LIVE('l')})
      RETURNING q.user_id AS buyer_id, q.id AS request_id, q.title AS request_title, l.title AS listing_title, l.status AS listing_status`);
  for (const x of r.rows) {
    const why = GONE[x.listing_status] || 'a expirat';
    await notify(x.buyer_id, 'rfq_edit', null, `Anunțul din oferta pentru „${x.request_title}” ${why}`, `„${x.listing_title}” nu mai e disponibil. Oferta rămâne valabilă: poți să-i scrii vânzătorului înainte să o accepți.`, { email: false, path: '/cererile-mele' });
    live.send(x.buyer_id, 'rfq', { request_id: x.request_id });
  }
  return r.rowCount;
}

/* ---------- poze ---------- */
const IMG_FIELDS = (own) => `(SELECT COALESCE(json_agg(json_build_object('id', i.id, 'url', COALESCE(i.url, '/api/requests/img/' || i.id), 'thumb', COALESCE(i.thumb_url, i.url, '/api/requests/img/' || i.id || '?t=1')) ORDER BY i.position, i.id), '[]'::json) FROM rq_images i WHERE ${own})`;
const REQ_IMGS = (rid) => IMG_FIELDS(`i.request_id = ${rid}`);
const OFF_IMGS = (oid) => IMG_FIELDS(`i.offer_id = ${oid}`);
const REQ_THUMB = (rid) => `(SELECT COALESCE(i.thumb_url, i.url, '/api/requests/img/' || i.id || '?t=1') FROM rq_images i WHERE i.request_id = ${rid} ORDER BY i.position, i.id LIMIT 1)`;
const OFF_THUMB = (oid) => `(SELECT COALESCE(i.thumb_url, i.url, '/api/requests/img/' || i.id || '?t=1') FROM rq_images i WHERE i.offer_id = ${oid} ORDER BY i.position, i.id LIMIT 1)`;
/* anunțul atașat la o ofertă (doar dacă e încă public) */
/* anunț care se mai vede pe site: publicat și neexpirat */
const LIVE = (l) => `${l}.status = 'approved' AND (${l}.expires_at IS NULL OR ${l}.expires_at > NOW())`;
/* marca din cerere apare în titlul, descrierea sau atributul „Marca mașinii” al anunțului (r = cererea, l = anunțul) */
const MAKE_IN = (r, l) => `(position(lower(${r}.make) IN lower(${l}.title)) > 0 OR position(lower(${r}.make) IN lower(${l}.description)) > 0 OR position(lower(${r}.make) IN lower(COALESCE(${l}.attributes->>'marca_auto', ''))) > 0)`;
const LISTING_JSON = (o) => `(SELECT json_build_object('id', l.id, 'title', l.title, 'price', l.price, 'currency', l.currency, 'status', l.status,
    'thumb', (SELECT COALESCE(i.thumb_url, i.url) FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1))
  FROM listings l WHERE l.id = ${o}.listing_id AND (l.status = 'sold' OR (${LIVE('l')})))`;
const ownListing = async (uid, id) => (await db.query(`SELECT 1 FROM listings l WHERE l.id = $1 AND l.user_id = $2 AND ${LIVE('l')}`, [id, uid])).rowCount > 0;
const RATING = (uid) => `(SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE seller_id = ${uid} AND role = 'seller')`;
const RATING_N = (uid) => `(SELECT COUNT(*)::int FROM reviews WHERE seller_id = ${uid} AND role = 'seller')`;

async function attachImages(col, id, uid, ids) {
  const keep = ids.length ? ids : [0];
  const gone = await db.query(`DELETE FROM rq_images WHERE ${col} = $1 AND owner_id = $2 AND NOT (id = ANY($3::int[])) RETURNING url, thumb_url`, [id, uid, keep]);
  for (const g of gone.rows) if (g.url) imgs.removeStored(g.url, g.thumb_url).catch(() => {});
  for (let i = 0; i < ids.length; i++) await db.query(`UPDATE rq_images SET ${col} = $1, position = $4 WHERE id = $2 AND owner_id = $3 AND (${col} IS NULL OR ${col} = $1)`, [id, ids[i], uid, i]);
}
const imageIds = (v) => (Array.isArray(v) ? [...new Set(v.map(toId).filter(Boolean))].slice(0, MAX_PHOTOS) : []);

router.post('/image', requireVerified, imgs.raw, ah(async (req, res) => {
  const me = req.user.id, buf = req.body, k = Buffer.isBuffer(buf) && imgs.kind(buf);
  if (!k) return res.status(400).json({ error: 'POZA_INVALIDA' });
  if (!photoAllow('u' + me)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const old = await db.query("DELETE FROM rq_images WHERE owner_id = $1 AND request_id IS NULL AND offer_id IS NULL AND created_at < NOW() - INTERVAL '1 day' RETURNING url, thumb_url", [me]);
  for (const o of old.rows) if (o.url) imgs.removeStored(o.url, o.thumb_url).catch(() => {});
  const used = (await db.query('SELECT COALESCE(SUM(size),0)::bigint AS n FROM rq_images WHERE owner_id = $1', [me])).rows[0].n;
  if (Number(used) + buf.length > PHOTO_QUOTA) return res.status(413).json({ error: 'SPATIU_POZE_DEPASIT' });
  const pending = (await db.query('SELECT COUNT(*)::int AS n FROM rq_images WHERE owner_id = $1 AND request_id IS NULL AND offer_id IS NULL', [me])).rows[0].n;
  if (pending >= MAX_PHOTOS * 3) return res.status(409).json({ error: 'PREA_MULTE_POZE' });
  let p;
  try { p = await imgs.process(buf, k); } catch { return res.status(400).json({ error: 'POZA_INVALIDA' }); }
  const size = p.full.length + p.thumb.length;
  let row;
  if (imgs.STORAGE) {
    const base = `rfq/u${me}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    let url, thumbUrl;
    try { url = await imgs.put(`${base}.${p.ext}`, p.full, p.type); thumbUrl = await imgs.put(`${base}-t.${p.ext}`, p.thumb, p.type); }
    catch (e) { console.error('storage:', e.message); return res.status(502).json({ error: 'STORAGE_EROARE' }); }
    row = (await db.query('INSERT INTO rq_images(owner_id, url, thumb_url, size) VALUES($1,$2,$3,$4) RETURNING id, url, thumb_url AS thumb', [me, url, thumbUrl, size])).rows[0];
  } else {
    const ins = await db.query('INSERT INTO rq_images(owner_id, ctype, size, data, thumb) VALUES($1,$2,$3,$4,$5) RETURNING id', [me, p.type, size, p.full, p.thumb]);
    row = { id: ins.rows[0].id, url: '/api/requests/img/' + ins.rows[0].id, thumb: '/api/requests/img/' + ins.rows[0].id + '?t=1' };
  }
  res.status(201).json({ image: row });
}));

/* pozele cererii sunt publice; pozele ofertei le văd doar ofertantul și cumpărătorul */
router.get('/img/:id(\\d+)', ah(async (req, res) => {
  const uid = req.user ? req.user.id : 0;
  const r = await db.query(
    `SELECT i.data, i.thumb, i.ctype, i.request_id FROM rq_images i LEFT JOIN rq_offers o ON o.id = i.offer_id LEFT JOIN rq_requests q ON q.id = o.request_id
      WHERE i.id = $1 AND i.data IS NOT NULL AND (i.request_id IS NOT NULL OR i.owner_id = $2 OR q.user_id = $2)`, [Number(req.params.id), uid]);
  if (!r.rowCount) return res.status(404).end();
  res.set('Content-Type', r.rows[0].ctype || 'image/webp').set('Cache-Control', r.rows[0].request_id ? 'public, max-age=86400' : 'private, max-age=86400').set('X-Content-Type-Options', 'nosniff');
  res.send(req.query.t ? r.rows[0].thumb : r.rows[0].data);
}));

/* ---------- lista publică: „Ofertează piesele” ---------- */
const LIST_SQL = `SELECT r.id, r.title, r.description, r.make, r.model, r.year, r.variant, r.engine, r.kind, r.county, r.city, r.extra_parts, r.status, r.expires_at, r.created_at,
        (r.user_id = $1::int) AS mine, ${REQ_THUMB('r.id')} AS thumb,
        (SELECT COUNT(*)::int FROM rq_offers o WHERE o.request_id = r.id AND o.status <> 'rejected' AND r.user_id = $1::int AND ${OFFER_NOT_BLOCKED('o', '$1::int')}) AS offers_count,
        mo.id AS my_offer_id, mo.price AS my_price, mo.currency AS my_currency, mk.mark AS my_mark
   FROM rq_requests r
   LEFT JOIN rq_offers mo ON mo.request_id = r.id AND mo.seller_id = $1::int AND mo.status <> 'rejected'
   LEFT JOIN rq_marks mk ON mk.request_id = r.id AND mk.user_id = $1::int`;

router.get('/', ah(async (req, res) => {
  await sweep();
  const uid = req.user ? req.user.id : 0, q = likeEsc(req.query.q), make = likeEsc(req.query.make), county = likeEsc(req.query.county);
  const seen = SEEN.includes(req.query.seen) ? req.query.seen : 'all';
  const kind = KINDS.includes(req.query.kind) ? req.query.kind : '';
  const w = ["r.status = 'open'", 'r.expires_at > NOW()', REQ_NOT_BLOCKED('$1::int', 'r.user_id')], p = [uid];
  if (q) { p.push('%' + q + '%'); w.push(`(r.title ILIKE $${p.length} OR r.description ILIKE $${p.length} OR r.make ILIKE $${p.length} OR r.model ILIKE $${p.length} OR r.extra_parts::text ILIKE $${p.length})`); }
  if (make) { p.push(make); w.push(`r.make ILIKE $${p.length}`); }
  if (county) { p.push(county); w.push(`r.county = $${p.length}`); }
  if (kind) { p.push(kind); w.push(`(r.kind = $${p.length} OR r.kind = 'ambele')`); }
  if (seen === 'new') w.push('mo.id IS NULL AND mk.mark IS NULL');
  else if (seen === 'offered') w.push('mo.id IS NOT NULL');
  else if (seen === 'later' || seen === 'ignored') w.push(`mk.mark = '${seen}'`);
  else w.push("(mk.mark IS NULL OR mk.mark <> 'ignored')");
  const r = await db.query(`${LIST_SQL} WHERE ${w.join(' AND ')} ORDER BY r.created_at DESC LIMIT 100`, p);
  const counts = uid ? (await db.query(
    `SELECT COUNT(*) FILTER (WHERE mo.id IS NULL AND mk.mark IS NULL AND r.user_id <> $1)::int AS new, COUNT(*) FILTER (WHERE mo.id IS NOT NULL)::int AS offered,
            COUNT(*) FILTER (WHERE mk.mark = 'later')::int AS later, COUNT(*) FILTER (WHERE mk.mark = 'ignored')::int AS ignored, COUNT(*) FILTER (WHERE mk.mark IS DISTINCT FROM 'ignored')::int AS "all"
       FROM rq_requests r LEFT JOIN rq_offers mo ON mo.request_id = r.id AND mo.seller_id = $1 AND mo.status <> 'rejected' LEFT JOIN rq_marks mk ON mk.request_id = r.id AND mk.user_id = $1
      WHERE r.status = 'open' AND r.expires_at > NOW() AND ${REQ_NOT_BLOCKED('$1::int', 'r.user_id')}`, [uid])).rows[0] : null;
  res.set('Cache-Control', 'no-store').json({ requests: r.rows, counts });
}));

/* ---------- cererile mele ---------- */
router.get('/mine', requireAuth, ah(async (req, res) => {
  await sweep();
  const r = await db.query(
    `SELECT r.id, r.title, r.make, r.model, r.year, r.kind, r.county, r.city, r.status, r.expires_at, r.created_at, r.extra_parts, ${REQ_THUMB('r.id')} AS thumb,
            (SELECT COUNT(*)::int FROM rq_offers o WHERE o.request_id = r.id AND o.status <> 'rejected' AND ${OFFER_NOT_BLOCKED('o', 'r.user_id')}) AS offers_count,
            (SELECT COUNT(*)::int FROM rq_offers o WHERE o.request_id = r.id AND o.status = 'pending' AND o.created_at > COALESCE(r.buyer_seen_at, r.created_at) AND ${OFFER_NOT_BLOCKED('o', 'r.user_id')}) AS new_offers,
            (SELECT MIN(o.price) FROM rq_offers o WHERE o.request_id = r.id AND o.status <> 'rejected' AND o.currency = 'RON' AND ${OFFER_NOT_BLOCKED('o', 'r.user_id')}) AS best_price
       FROM rq_requests r WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 200`, [req.user.id]);
  res.set('Cache-Control', 'no-store').json({ requests: r.rows });
}));

/* cererile deschise potrivite cu anunțurile mele de piese (categoria piese-auto, anunțuri publicate): marca din cerere apare în titlul/descrierea anunțului,
   sau un cuvânt din piesa cerută apare în titlu. Fără cererile mele, cele ignorate, cele la care am ofertat deja și cele dintre utilizatori blocați.
   ?listing_id=ID limitează la un anunț. Răspuns: by_listing (câte potriviri are fiecare anunț) și requests (unice, cu cel mai bun anunț potrivit). */
router.get('/matching', requireAuth, ah(async (req, res) => {
  const me = req.user.id, lid = toId(req.query.listing_id);
  const r = await db.query(
    `SELECT l.id AS listing_id, l.title AS listing_title, r.id, r.title, r.make, r.model, r.year, r.county, r.city, r.kind, r.created_at, r.expires_at,
            jsonb_array_length(r.extra_parts) AS extra_n, ${REQ_THUMB('r.id')} AS thumb,
            ${MAKE_IN('r', 'l')} AS by_make
       FROM listings l JOIN categories c ON c.id = l.category_id AND c.slug = 'piese-auto'
       JOIN rq_requests r ON r.status = 'open' AND r.expires_at > NOW() AND r.user_id <> $1
       LEFT JOIN rq_marks mk ON mk.request_id = r.id AND mk.user_id = $1
       LEFT JOIN rq_offers mo ON mo.request_id = r.id AND mo.seller_id = $1 AND mo.status <> 'rejected'
      WHERE l.user_id = $1 AND ${LIVE('l')} AND ($2::int IS NULL OR l.id = $2)
        AND mk.mark IS DISTINCT FROM 'ignored' AND mo.id IS NULL AND ${REQ_NOT_BLOCKED('$1::int', 'r.user_id')}
        AND (${MAKE_IN('r', 'l')}
             OR EXISTS (SELECT 1 FROM unnest(regexp_split_to_array(lower(r.title || ' ' || COALESCE((SELECT string_agg(x->>'title', ' ') FROM jsonb_array_elements(r.extra_parts) x), '')), '[^[:alnum:]ăâîșțşţ]+')) w
                         WHERE length(w) >= 4 AND w <> ALL($3::text[]) AND position(w IN lower(l.title)) > 0))
      ORDER BY by_make DESC, r.created_at DESC LIMIT 300`, [me, lid, [...STOP]]);
  const by = new Map(), seen = new Set(), requests = [];
  for (const x of r.rows) {
    by.set(x.listing_id, (by.get(x.listing_id) || 0) + 1);
    if (!seen.has(x.id) && requests.length < 100) { seen.add(x.id); requests.push(x); }
  }
  res.set('Cache-Control', 'no-store').json({ by_listing: [...by].map(([listing_id, count]) => ({ listing_id, count })), requests });
}));

router.get('/summary', requireAuth, ah(async (req, res) => {
  await sweep();
  const me = req.user.id;
  const r = (await db.query(
    `SELECT (SELECT COUNT(*)::int FROM rq_requests r WHERE r.user_id = $1 AND r.status = 'open') AS open,
            (SELECT COUNT(*)::int FROM rq_offers o JOIN rq_requests r ON r.id = o.request_id WHERE r.user_id = $1 AND r.status = 'open' AND o.status = 'pending' AND ${OFFER_NOT_BLOCKED('o', '$1')}) AS waiting,
            (SELECT COUNT(*)::int FROM rq_offers o JOIN rq_requests r ON r.id = o.request_id WHERE r.user_id = $1 AND r.status = 'open' AND o.status = 'pending' AND o.created_at > COALESCE(r.buyer_seen_at, r.created_at) AND ${OFFER_NOT_BLOCKED('o', '$1')}) AS new_quotes,
            (SELECT COUNT(*)::int FROM rq_questions q WHERE q.buyer_id = $1 AND q.answered_at IS NOT NULL AND q.answered_at > NOW() - INTERVAL '3 days') AS new_answers,
            (SELECT COUNT(*)::int FROM rq_questions q WHERE q.seller_id = $1 AND q.answer IS NULL) AS open_questions,
            (SELECT COUNT(*)::int FROM rq_orders s WHERE s.buyer_id = $1 AND s.buyer_seen_status IS DISTINCT FROM s.status) AS order_updates,
            (SELECT rfq_email FROM users WHERE id = $1) AS email_on`, [me])).rows[0];
  res.set('Cache-Control', 'no-store').json(r);
}));

async function loadDetail(id, uid) {
  const r = (await db.query(
    `SELECT r.*, u.nickname AS buyer_name, (r.user_id = $2::int) AS mine, ${REQ_IMGS('r.id')} AS images FROM rq_requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1`, [id, uid || 0])).rows[0];
  return r || null;
}

router.get('/mine/:id(\\d+)', requireAuth, ah(async (req, res) => {
  const me = req.user.id, id = Number(req.params.id);
  const r = await loadDetail(id, me);
  if (!r || r.user_id !== me) return res.status(404).json({ error: 'NEGASIT' });
  const offers = (await db.query(
    `SELECT o.id, o.seller_id, o.price, o.currency, o.message, o.status, o.created_at, o.updated_at, u.nickname AS seller_name, ${RATING('o.seller_id')} AS seller_rating, ${RATING_N('o.seller_id')} AS seller_rating_n,
            ${OFF_IMGS('o.id')} AS images, (SELECT COUNT(*)::int FROM rq_questions q WHERE q.offer_id = o.id) AS questions_count,
            CASE WHEN o.status = 'accepted' THEN u.phone END AS seller_phone, CASE WHEN o.status = 'accepted' THEN u.name END AS seller_full_name,
            CASE WHEN o.status = 'accepted' THEN (SELECT s.id FROM rq_orders s WHERE s.offer_id = o.id) END AS order_id, ${LISTING_JSON('o')} AS listing,
            EXISTS (SELECT 1 FROM rq_reports p WHERE p.kind = 'offer' AND p.offer_id = o.id AND p.reporter_id = $2 AND p.status = 'open') AS reported
       FROM rq_offers o JOIN users u ON u.id = o.seller_id WHERE o.request_id = $1 AND ${OFFER_NOT_BLOCKED('o', '$2')} ORDER BY (o.status = 'accepted') DESC, (o.status = 'rejected'), o.price ASC, o.created_at`, [id, me])).rows;
  db.query('UPDATE rq_requests SET buyer_seen_at = NOW() WHERE id = $1', [id]).catch(() => {});
  res.set('Cache-Control', 'no-store').json({ request: r, offers, editable: r.status === 'open' && Date.now() - new Date(r.created_at).getTime() < EDIT_MIN * 60000 });
}));

router.get('/:id(\\d+)', ah(async (req, res) => {
  await sweep();
  const id = Number(req.params.id), uid = req.user ? req.user.id : 0;
  const r = await loadDetail(id, uid);
  if (!r) return res.status(404).json({ error: 'NEGASIT' });
  delete r.vin; delete r.ship_address; delete r.buyer_seen_at;
  let my_offer = null, my_mark = null, blocked = null, reported = false;
  if (uid && !r.mine) { const bs = await blockState(uid, r.user_id); blocked = bs.byMe ? 'me' : bs.byThem ? 'them' : null; }
  if (uid) {
    reported = (await db.query("SELECT 1 FROM rq_reports WHERE kind = 'request' AND request_id = $1 AND reporter_id = $2 AND status = 'open'", [id, uid])).rowCount > 0;
    my_offer = (await db.query(`SELECT o.id, o.price, o.currency, o.message, o.status, o.listing_id, ${LISTING_JSON('o')} AS listing, ${OFF_IMGS('o.id')} AS images FROM rq_offers o WHERE o.request_id = $1 AND o.seller_id = $2 AND o.status <> 'rejected'`, [id, uid])).rows[0] || null;
    my_mark = ((await db.query('SELECT mark FROM rq_marks WHERE user_id = $1 AND request_id = $2', [uid, id])).rows[0] || {}).mark || null;
  }
  res.set('Cache-Control', 'no-store').json({ request: r, my_offer, my_mark, blocked, reported });
}));

/* ---------- marcaje, reactivare, ștergere, editare, creare ---------- */
router.post('/:id(\\d+)/mark', requireAuth, ah(async (req, res) => {
  const mark = (req.body || {}).mark;
  if (!MARKS.includes(mark)) return res.status(400).json({ error: 'MARCAJ_INVALID' });
  const r = await db.query("SELECT 1 FROM rq_requests WHERE id = $1 AND user_id <> $2", [Number(req.params.id), req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  await db.query('INSERT INTO rq_marks(user_id, request_id, mark) VALUES($1,$2,$3) ON CONFLICT (user_id, request_id) DO UPDATE SET mark = EXCLUDED.mark, created_at = NOW()', [req.user.id, Number(req.params.id), mark]);
  res.json({ ok: true });
}));
router.delete('/:id(\\d+)/mark', requireAuth, ah(async (req, res) => {
  await db.query('DELETE FROM rq_marks WHERE user_id = $1 AND request_id = $2', [req.user.id, Number(req.params.id)]);
  res.json({ ok: true });
}));

router.post('/:id(\\d+)/reactivate', requireAuth, ah(async (req, res) => {
  if ((await db.query("SELECT 1 FROM rq_reports WHERE request_id = $1 AND status = 'open' AND kind = 'request'", [Number(req.params.id)])).rowCount) return res.status(409).json({ error: 'CERERE_RAPORTATA' });
  const r = await db.query(`UPDATE rq_requests SET status = 'open', expires_at = NOW() + make_interval(days => $3) WHERE id = $1 AND user_id = $2 AND status = 'closed' RETURNING id`, [Number(req.params.id), req.user.id, REQUEST_DAYS]);
  if (!r.rowCount) return res.status(409).json({ error: 'CERERE_NU_SE_POATE_REACTIVA' });
  res.json({ ok: true });
}));

router.delete('/:id(\\d+)', requireAuth, ah(async (req, res) => {
  const r = await db.query("UPDATE rq_requests SET status = 'closed' WHERE id = $1 AND user_id = $2 AND status = 'open' RETURNING id", [Number(req.params.id), req.user.id]);
  if (!r.rowCount) return res.status(409).json({ error: 'CERERE_INCHISA' });
  res.json({ ok: true });
}));

router.patch('/:id(\\d+)', requireVerified, ah(async (req, res) => {
  const id = Number(req.params.id), cur = (await db.query("SELECT id, created_at FROM rq_requests WHERE id = $1 AND user_id = $2 AND status = 'open'", [id, req.user.id])).rows[0];
  if (!cur) return res.status(404).json({ error: 'NEGASIT' });
  if (Date.now() - new Date(cur.created_at).getTime() > EDIT_MIN * 60000) return res.status(403).json({ error: 'EDITARE_EXPIRATA' });
  const p = parseRequest(req.body);
  if (p.error) return res.status(400).json({ error: p.error });
  const v = p.v;
  await db.query(
    `UPDATE rq_requests SET title=$2, description=$3, make=$4, model=$5, year=$6, variant=$7, engine=$8, vin=$9, kind=$10, county=$11, city=$12, ship_address=$13, extra_parts=$14::jsonb WHERE id = $1`,
    [id, v.title, v.description, v.make, v.model, v.year, v.variant, v.engine, v.vin, v.kind, v.county, v.city, v.ship_address, JSON.stringify(v.extra_parts)]);
  if ((req.body || {}).image_ids !== undefined) await attachImages('request_id', id, req.user.id, imageIds(req.body.image_ids));
  res.json({ ok: true });
}));

router.post('/', requireVerified, ah(async (req, res) => {
  const p = parseRequest(req.body);
  if (p.error) return res.status(400).json({ error: p.error });
  if (await guard.gate(req, res, [p.v.title, p.v.description])) return;
  if (!createAllow('u' + req.user.id)) return res.status(429).json({ error: 'PREA_MULTE_CERERI' });
  const v = p.v;
  const ins = await db.query(
    `INSERT INTO rq_requests(user_id, title, description, make, model, year, variant, engine, vin, kind, county, city, ship_address, extra_parts, expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb, NOW() + make_interval(days => $15)) RETURNING id`,
    [req.user.id, v.title, v.description, v.make, v.model, v.year, v.variant, v.engine, v.vin, v.kind, v.county, v.city, v.ship_address, JSON.stringify(v.extra_parts), REQUEST_DAYS]);
  const id = ins.rows[0].id, ids = imageIds((req.body || {}).image_ids);
  if (ids.length) await attachImages('request_id', id, req.user.id, ids);
  res.status(201).json({ request: { id } });
  distribute(id, req.user.id, v).catch((e) => console.error('rfq distribute:', e.message));
}));

/* vânzătorii de PIESE (categoria piese-auto) care au un anunț potrivit primesc notificare: marca în titlu/descriere, sau un cuvânt din piesa cerută în titlu.
   Cei care vând mașini întregi sau alte lucruri nu sunt anunțați; mai întâi cei care se potrivesc și la marcă, și la piesă. */
const STOP = new Set(['pentru', 'stanga', 'stânga', 'dreapta', 'fata', 'față', 'spate', 'noua', 'nouă', 'noul', 'second', 'hand', 'piesa', 'piese', 'original', 'originala', 'originală', 'auto', 'masina', 'mașina']);
const partWords = (v) => [...new Set([v.title, ...(v.extra_parts || []).map((x) => x.title)].join(' ').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w)))].slice(0, 8);
async function distribute(id, buyerId, v) {
  if (!v.make) return;
  const mk = '%' + likeEsc(v.make) + '%', words = partWords(v).map((w) => '%' + likeEsc(w) + '%').filter((w) => w.length > 2);
  const d = await db.query(
    `SELECT l.user_id FROM listings l JOIN users u ON u.id = l.user_id JOIN categories c ON c.id = l.category_id
      WHERE c.slug = 'piese-auto' AND ${LIVE('l')} AND u.status = 'active' AND l.user_id <> $1
        AND (l.title ILIKE $2 OR l.description ILIKE $2 OR COALESCE(l.attributes->>'marca_auto', '') ILIKE $2 OR l.title ILIKE ANY($3::text[]))
      GROUP BY l.user_id
      ORDER BY MAX(CASE WHEN (l.title ILIKE $2 OR l.description ILIKE $2 OR COALESCE(l.attributes->>'marca_auto', '') ILIKE $2) AND l.title ILIKE ANY($3::text[]) THEN 2 ELSE 1 END) DESC, MAX(l.created_at) DESC LIMIT $4`,
    [buyerId, mk, words, MAX_NOTIFY]);
  const title = [v.title, v.make, v.model, v.year].filter(Boolean).join(' ');
  const ids = d.rows.map((x) => x.user_id);
  const today = ids.length ? (await db.query("SELECT user_id, COUNT(*)::int AS n FROM notifications WHERE kind = 'rfq_new' AND created_at > NOW() - INTERVAL '1 day' AND user_id = ANY($1::int[]) GROUP BY user_id", [ids])).rows : [];
  const had = new Map(today.map((x) => [x.user_id, x.n]));
  let mails = 0;
  for (const x of d.rows) {
    const mail = mails < MAX_NEW_EMAILS && (had.get(x.user_id) || 0) < NEW_EMAILS_PER_DAY;
    if (mail) mails++;
    await notify(x.user_id, 'rfq_new', null, `Cerere nouă: ${title}`, `${v.county}${v.city ? ', ' + v.city : ''} · trimite o ofertă`, { email: mail });
    live.send(x.user_id, 'rfq', { request_id: id });
  }
}

/* ---------- oferte ---------- */
router.post('/:id(\\d+)/offers', requireVerified, ah(async (req, res) => {
  const id = Number(req.params.id), p = parseOffer(req.body);
  if (p.error) return res.status(400).json({ error: p.error });
  if (await guard.gate(req, res, [p.v.message])) return;
  if (!offerAllow('u' + req.user.id)) return res.status(429).json({ error: 'PREA_MULTE_OFERTE' });
  const r = (await db.query("SELECT id, user_id, title FROM rq_requests WHERE id = $1 AND status = 'open' AND expires_at > NOW()", [id])).rows[0];
  if (!r) return res.status(404).json({ error: 'CERERE_INCHISA' });
  if (r.user_id === req.user.id) return res.status(400).json({ error: 'CERERE_PROPRIE' });
  const be = blockError(await blockState(req.user.id, r.user_id));
  if (be) return res.status(403).json({ error: be });
  if ((await db.query("SELECT 1 FROM rq_offers WHERE request_id = $1 AND seller_id = $2 AND status = 'pending'", [id, req.user.id])).rowCount) return res.status(409).json({ error: 'OFERTA_EXISTA' });
  if (p.v.listing_id && !(await ownListing(req.user.id, p.v.listing_id))) return res.status(400).json({ error: 'ANUNT_INVALID' });
  const o = (await db.query('INSERT INTO rq_offers(request_id, seller_id, price, currency, message, listing_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [id, req.user.id, p.v.price, p.v.currency, p.v.message, p.v.listing_id || null])).rows[0];
  const ids = imageIds((req.body || {}).image_ids);
  if (ids.length) await attachImages('offer_id', o.id, req.user.id, ids);
  db.query("DELETE FROM rq_marks WHERE user_id = $1 AND request_id = $2", [req.user.id, id]).catch(() => {});
  await notify(r.user_id, 'rfq_quote', null, `Ofertă nouă: ${r.title}`, money(p.v.price, p.v.currency));
  live.send(r.user_id, 'rfq', { request_id: id });
  res.status(201).json({ ok: true, id: o.id });
}));

offersRouter.get('/mine', requireAuth, ah(async (req, res) => {
  const me = req.user.id;
  const r = await db.query(
    `SELECT o.id, o.price, o.currency, o.message, o.status, o.created_at, o.updated_at, o.listing_id, ${LISTING_JSON('o')} AS listing, ${OFF_THUMB('o.id')} AS thumb, ${OFF_IMGS('o.id')} AS images,
            q.id AS request_id, q.title AS request_title, q.make, q.model, q.year, q.county, q.city, q.status AS request_status, q.user_id AS buyer_id,
            u.nickname AS buyer_name, ${REQ_THUMB('q.id')} AS req_thumb,
            CASE WHEN o.status = 'accepted' THEN q.vin END AS vin, CASE WHEN o.status = 'accepted' THEN q.ship_address END AS ship_address,
            CASE WHEN o.status = 'accepted' THEN u.phone END AS buyer_phone, CASE WHEN o.status = 'accepted' THEN u.name END AS buyer_full_name,
            (SELECT s.id FROM rq_orders s WHERE s.offer_id = o.id) AS order_id
       FROM rq_offers o JOIN rq_requests q ON q.id = o.request_id JOIN users u ON u.id = q.user_id WHERE o.seller_id = $1 ORDER BY o.created_at DESC LIMIT 200`, [me]);
  res.set('Cache-Control', 'no-store').json({ offers: r.rows });
}));

offersRouter.get('/received', requireAuth, ah(async (req, res) => {
  const r = await db.query(
    `SELECT o.id, o.price, o.currency, o.message, o.status, o.created_at, o.seller_id, u.nickname AS seller_name, ${RATING('o.seller_id')} AS seller_rating, ${OFF_THUMB('o.id')} AS thumb,
            q.id AS request_id, q.title AS request_title, ${REQ_THUMB('q.id')} AS req_thumb
       FROM rq_offers o JOIN rq_requests q ON q.id = o.request_id JOIN users u ON u.id = o.seller_id WHERE q.user_id = $1 AND ${OFFER_NOT_BLOCKED('o', '$1')} ORDER BY o.created_at DESC LIMIT 200`, [req.user.id]);
  res.set('Cache-Control', 'no-store').json({ offers: r.rows });
}));

offersRouter.patch('/:id(\\d+)', requireVerified, ah(async (req, res) => {
  if (!offerAllow('u' + req.user.id)) return res.status(429).json({ error: 'PREA_MULTE_OFERTE' });
  const p = parseOffer(req.body);
  if (p.error) return res.status(400).json({ error: p.error });
  const id = Number(req.params.id), hasL = Object.prototype.hasOwnProperty.call(p.v, 'listing_id');
  if (hasL && p.v.listing_id && !(await ownListing(req.user.id, p.v.listing_id))) return res.status(400).json({ error: 'ANUNT_INVALID' });
  const r = await db.query(
    `UPDATE rq_offers o SET price=$1, currency=$5, message=$2, listing_id = CASE WHEN $6::boolean THEN $7::int ELSE o.listing_id END, listing_notified = CASE WHEN $6::boolean THEN FALSE ELSE o.listing_notified END, updated_at=NOW() FROM rq_requests q
      WHERE o.id=$3 AND o.seller_id=$4 AND o.status='pending' AND q.id=o.request_id AND q.status='open' RETURNING o.id, q.user_id AS buyer_id, q.title`,
    [p.v.price, p.v.message, id, req.user.id, p.v.currency, hasL, hasL ? p.v.listing_id : null]);
  if (!r.rowCount) return res.status(409).json({ error: 'OFERTA_NU_MAI_E_DISPONIBILA' });
  if ((req.body || {}).image_ids !== undefined) await attachImages('offer_id', id, req.user.id, imageIds(req.body.image_ids));
  await notify(r.rows[0].buyer_id, 'rfq_edit', null, `Ofertă modificată: ${r.rows[0].title}`, money(p.v.price, p.v.currency));
  live.send(r.rows[0].buyer_id, 'rfq', { request_id: r.rows[0].id });
  res.json({ ok: true });
}));

offersRouter.delete('/:id(\\d+)', requireAuth, ah(async (req, res) => {
  const r = await db.query("DELETE FROM rq_offers o USING rq_requests q WHERE o.id=$1 AND o.seller_id=$2 AND o.status='pending' AND q.id=o.request_id RETURNING q.user_id AS buyer_id, q.id AS rid, q.title", [Number(req.params.id), req.user.id]);
  if (!r.rowCount) return res.status(409).json({ error: 'OFERTA_NU_MAI_E_DISPONIBILA' });
  await notify(r.rows[0].buyer_id, 'rfq_lost', null, `Ofertă retrasă: ${r.rows[0].title}`, 'Vânzătorul și-a retras oferta.');
  live.send(r.rows[0].buyer_id, 'rfq', { request_id: r.rows[0].rid });
  res.json({ ok: true });
}));

offersRouter.post('/:id(\\d+)/reject', requireAuth, ah(async (req, res) => {
  const r = await db.query("UPDATE rq_offers o SET status='rejected', updated_at=NOW() FROM rq_requests q WHERE o.id=$1 AND q.id=o.request_id AND q.user_id=$2 AND o.status='pending' RETURNING o.seller_id, q.title", [Number(req.params.id), req.user.id]);
  if (!r.rowCount) return res.status(409).json({ error: 'OFERTA_NU_MAI_E_DISPONIBILA' });
  await notify(r.rows[0].seller_id, 'rfq_lost', null, `Ofertă refuzată: ${r.rows[0].title}`, 'Cumpărătorul a refuzat oferta ta.');
  res.json({ ok: true });
}));

offersRouter.post('/:id(\\d+)/accept', requireAuth, ah(async (req, res) => {
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const o = (await c.query('SELECT o.*, q.user_id AS buyer_id, q.status AS rstatus, q.title FROM rq_offers o JOIN rq_requests q ON q.id = o.request_id WHERE o.id = $1 FOR UPDATE OF o, q', [Number(req.params.id)])).rows[0];
    if (!o) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'NEGASIT' }); }
    if (o.buyer_id !== req.user.id) { await c.query('ROLLBACK'); return res.status(403).json({ error: 'INTERZIS' }); }
    if (o.status !== 'pending' || o.rstatus !== 'open') { await c.query('ROLLBACK'); return res.status(409).json({ error: 'OFERTA_NU_MAI_E_DISPONIBILA' }); }
    const be = blockError(await blockState(o.buyer_id, o.seller_id, (q, p) => c.query(q, p)));
    if (be) { await c.query('ROLLBACK'); return res.status(403).json({ error: be }); }
    await c.query("UPDATE rq_offers SET status = 'accepted', updated_at = NOW() WHERE id = $1", [o.id]);
    const lost = await c.query("UPDATE rq_offers SET status = 'rejected', updated_at = NOW() WHERE request_id = $1 AND id <> $2 AND status = 'pending' RETURNING seller_id", [o.request_id, o.id]);
    await c.query("UPDATE rq_requests SET status = 'matched' WHERE id = $1", [o.request_id]);
    const ord = await c.query("INSERT INTO rq_orders(offer_id, request_id, buyer_id, seller_id, title, price, currency, buyer_seen_status) VALUES($1,$2,$3,$4,$5,$6,$7,'new') RETURNING id", [o.id, o.request_id, o.buyer_id, o.seller_id, o.title, o.price, o.currency]);
    await c.query('COMMIT');
    await notify(o.seller_id, 'rfq_won', null, `Ofertă acceptată: ${o.title}`, 'Comandă nouă. Contactul cumpărătorului e în „Ofertele mele”.');
    live.send(o.seller_id, 'rfq', { request_id: o.request_id });
    await notify(o.buyer_id, 'rfq_done', null, `Comandă creată: ${o.title}`, `${money(o.price, o.currency)} · contactul vânzătorului e în „Cererile mele” și în „Comenzi”.`, { email: false, path: '/comenzi-piese' });
    for (const l of lost.rows) await notify(l.seller_id, 'rfq_lost', null, `Cerere încheiată: ${o.title}`, 'Cumpărătorul a ales altă ofertă.');
    res.json({ ok: true, order_id: ord.rows[0].id });
  } catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; } finally { c.release(); }
}));

/* ---------- întrebări pe oferte ---------- */
offersRouter.get('/:id(\\d+)/questions', requireAuth, ah(async (req, res) => {
  const o = (await db.query('SELECT o.seller_id, q.user_id AS buyer_id FROM rq_offers o JOIN rq_requests q ON q.id = o.request_id WHERE o.id = $1', [Number(req.params.id)])).rows[0];
  if (!o || (o.seller_id !== req.user.id && o.buyer_id !== req.user.id)) return res.status(404).json({ error: 'OFERTA_NEGASITA' });
  const r = await db.query('SELECT q.id, q.body, q.answer, q.answered_at, q.created_at FROM rq_questions q WHERE q.offer_id = $1 ORDER BY q.created_at', [Number(req.params.id)]);
  res.json({ questions: r.rows });
}));

offersRouter.post('/:id(\\d+)/questions', requireVerified, ah(async (req, res) => {
  const body = String((req.body || {}).body || '').trim();
  if (body.length < 3 || body.length > 300) return res.status(400).json({ error: 'INTREBARE_INVALIDA' });
  if (CONTACT_RE.test(body)) return res.status(400).json({ error: 'FARA_CONTACT_IN_INTREBARE' });
  if (!questionAllow('u' + req.user.id)) return res.status(429).json({ error: 'PREA_MULTE_INTREBARI' });
  const o = (await db.query(`SELECT o.id, o.seller_id, q.user_id AS buyer_id, q.title FROM rq_offers o JOIN rq_requests q ON q.id = o.request_id WHERE o.id = $1 AND q.status = 'open'`, [Number(req.params.id)])).rows[0];
  if (!o) return res.status(404).json({ error: 'OFERTA_NEGASITA' });
  if (o.buyer_id !== req.user.id) return res.status(403).json({ error: 'INTERZIS' });
  const be = blockError(await blockState(req.user.id, o.seller_id));
  if (be) return res.status(403).json({ error: be });
  if ((await db.query('SELECT COUNT(*)::int AS n FROM rq_questions WHERE offer_id = $1', [o.id])).rows[0].n >= 5) return res.status(409).json({ error: 'PREA_MULTE_INTREBARI' });
  const q = (await db.query('INSERT INTO rq_questions(offer_id, buyer_id, seller_id, body) VALUES($1,$2,$3,$4) RETURNING id, created_at', [o.id, req.user.id, o.seller_id, body])).rows[0];
  await notify(o.seller_id, 'rfq_q', null, `Întrebare la oferta ta: ${o.title}`, body.slice(0, 120));
  live.send(o.seller_id, 'rfq', {});
  res.status(201).json({ ok: true, question: q });
}));

questionsRouter.get('/', requireAuth, ah(async (req, res) => {
  const r = await db.query(
    `SELECT q.id, q.offer_id, q.body, q.answer, q.answered_at, q.created_at, r.title AS request_title, r.id AS request_id, o.price, o.currency, o.status AS offer_status
       FROM rq_questions q JOIN rq_offers o ON o.id = q.offer_id JOIN rq_requests r ON r.id = o.request_id WHERE q.seller_id = $1 ORDER BY (q.answer IS NULL) DESC, q.created_at DESC LIMIT 100`, [req.user.id]);
  res.set('Cache-Control', 'no-store').json({ questions: r.rows });
}));

questionsRouter.post('/:id(\\d+)/answer', requireVerified, ah(async (req, res) => {
  const answer = String((req.body || {}).answer || '').trim();
  if (!answer || answer.length > 500) return res.status(400).json({ error: 'RASPUNS_INVALID' });
  if (CONTACT_RE.test(answer)) return res.status(400).json({ error: 'FARA_CONTACT_IN_INTREBARE' });
  const q = (await db.query('SELECT id, buyer_id, seller_id, answer FROM rq_questions WHERE id = $1', [Number(req.params.id)])).rows[0];
  if (!q || q.seller_id !== req.user.id) return res.status(404).json({ error: 'NEGASIT' });
  if (q.answer) return res.status(409).json({ error: 'DEJA_RASPUNS' });
  await db.query('UPDATE rq_questions SET answer = $1, answered_at = NOW() WHERE id = $2', [answer, q.id]);
  await notify(q.buyer_id, 'rfq_a', null, 'Ai primit răspuns la întrebare', answer.slice(0, 120));
  live.send(q.buyer_id, 'rfq', {});
  res.json({ ok: true });
}));

/* ---------- raportări (către moderatori) ---------- */
async function addReport(req, res, kind, id) {
  const reason = String((req.body || {}).reason || ''), details = String((req.body || {}).details || '').trim().slice(0, 500);
  if (!REASONS.includes(reason)) return res.status(400).json({ error: 'RQ_RAPORT_MOTIV' });
  if (!reportAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const me = req.user.id;
  const t = (await db.query(
    kind === 'request' ? "SELECT r.id AS request_id, NULL::int AS offer_id, r.user_id AS owner_id, r.title, r.status FROM rq_requests r WHERE r.id = $1"
      : "SELECT q.id AS request_id, o.id AS offer_id, o.seller_id AS owner_id, q.title, q.status, q.user_id AS buyer_id FROM rq_offers o JOIN rq_requests q ON q.id = o.request_id WHERE o.id = $1", [id])).rows[0];
  if (!t) return res.status(404).json({ error: 'NEGASIT' });
  if (t.owner_id === me) return res.status(400).json({ error: 'RQ_REPORT_PROPRIU' });
  if (kind === 'offer' && t.buyer_id !== me) return res.status(403).json({ error: 'INTERZIS' });   // ofertele le vede doar cumpărătorul
  const col = kind === 'request' ? 'request_id' : 'offer_id';
  const dup = await db.query(`SELECT 1 FROM rq_reports WHERE kind = $1 AND ${col} = $2 AND reporter_id = $3 AND status = 'open'`, [kind, id, me]);
  if (!dup.rowCount) {
    await db.query('INSERT INTO rq_reports(kind, request_id, offer_id, reporter_id, target_user_id, target_title, reason, details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [kind, t.request_id, t.offer_id, me, t.owner_id, t.title, reason, details]);
    if (kind === 'request' && t.status === 'open') {
      const n = (await db.query("SELECT COUNT(DISTINCT reporter_id)::int AS n FROM rq_reports WHERE kind = 'request' AND request_id = $1 AND status = 'open' AND created_at > NOW() - INTERVAL '24 hours'", [id])).rows[0].n;
      if (n >= AUTO_CLOSE_REPORTS) {
        const c = await db.query("UPDATE rq_requests SET status = 'closed' WHERE id = $1 AND status = 'open' RETURNING user_id", [id]);
        if (c.rowCount) { notify(c.rows[0].user_id, 'rfq_mod', null, `Cererea ta e în verificare: ${t.title}`, 'A fost raportată de mai mulți utilizatori; un moderator o verifică.'); live.send(c.rows[0].user_id, 'rfq', { request_id: id }); }
      }
    }
  }
  res.status(201).json({ ok: true });
}
router.post('/:id(\\d+)/report', requireAuth, ah((req, res) => addReport(req, res, 'request', Number(req.params.id))));
offersRouter.post('/:id(\\d+)/report', requireAuth, ah((req, res) => addReport(req, res, 'offer', Number(req.params.id))));

/* ---------- contact pe cerere și preferința de email ---------- */
const phonesOf = (u) => [...(u.phone ? [{ phone: u.phone, whatsapp: !!u.whatsapp }] : []), ...(Array.isArray(u.extra_phones) ? u.extra_phones : []).filter((x) => x && x.phone).map((x) => ({ phone: x.phone, whatsapp: !!x.wa }))];
const contactAllow = createThrottle(60, 60 * 60 * 1000);

/* telefonul cumpărătorului, doar dacă și l-a făcut vizibil în cont (users.show_phone), ca la AutoParts */
router.get('/:id(\\d+)/contact', requireAuth, ah(async (req, res) => {
  if (!contactAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const q = (await db.query("SELECT user_id FROM rq_requests WHERE id = $1 AND status = 'open' AND expires_at > NOW()", [Number(req.params.id)])).rows[0];
  if (!q) return res.status(404).json({ error: 'NEGASIT' });
  if (q.user_id === req.user.id) return res.status(400).json({ error: 'CERERE_PROPRIE' });
  const be = blockError(await blockState(req.user.id, q.user_id));
  if (be) return res.status(403).json({ error: be });
  const u = (await db.query('SELECT phone, whatsapp, extra_phones, show_phone FROM users WHERE id = $1', [q.user_id])).rows[0] || {};
  res.set('Cache-Control', 'no-store').json({ phones: u.show_phone ? phonesOf(u) : [], shown: !!u.show_phone });
}));

router.put('/email-pref', requireAuth, ah(async (req, res) => {
  await db.query('UPDATE users SET rfq_email = $1 WHERE id = $2', [(req.body || {}).on !== false, req.user.id]);
  res.json({ ok: true });
}));

/* ---------- comenzi (după acceptarea unei oferte) ---------- */
const LINK_RE = /(https?:\/\/|www\.|\S+@\S+\.\S+)/i;
/* tranziții permise, ca la AutoParts; cumpărătorul doar anulează o comandă nouă sau confirmă primirea după expediere */
const NEXT = { new: ['confirmed', 'shipped', 'done', 'suspended', 'cancelled'], confirmed: ['shipped', 'done', 'suspended', 'cancelled'], shipped: ['done', 'suspended', 'cancelled'], suspended: ['confirmed', 'shipped', 'done', 'cancelled'] };
const ORDER_LBL = { confirmed: 'confirmată', shipped: 'expediată', done: 'finalizată', suspended: 'suspendată', cancelled: 'anulată' };
const ratingAllow = createThrottle(30, 60 * 60 * 1000);
const detailsAllow = createThrottle(60, 60 * 60 * 1000);

ordersRouter.get('/', requireAuth, ah(async (req, res) => {
  const me = req.user.id;
  const r = await db.query(
    `SELECT s.id, s.title, s.price, s.currency, s.status, s.status_reason, s.awb, CASE WHEN s.seller_id = $1 THEN s.seller_note END AS seller_note, s.created_at, s.updated_at, s.request_id, s.offer_id, (s.buyer_id = $1) AS i_buy,
            CASE WHEN s.buyer_id = $1 THEN s.seller_id ELSE s.buyer_id END AS other_id,
            CASE WHEN s.buyer_id = $1 THEN us.nickname ELSE ub.nickname END AS other_name, CASE WHEN s.buyer_id = $1 THEN us.name ELSE ub.name END AS other_full_name,
            CASE WHEN s.buyer_id = $1 THEN us.phone ELSE ub.phone END AS phone, CASE WHEN s.buyer_id = $1 THEN us.whatsapp ELSE ub.whatsapp END AS whatsapp,
            CASE WHEN s.buyer_id = $1 THEN us.extra_phones ELSE ub.extra_phones END AS extra_phones,
            (s.buyer_id = $1 AND s.buyer_seen_status IS DISTINCT FROM s.status) AS unseen,
            q.make, q.model, q.year, q.variant, q.engine, q.county, q.city, q.ship_address, q.vin, q.extra_parts, q.description, o.message AS offer_message,
            COALESCE(${REQ_THUMB('s.request_id')}, ${OFF_THUMB('s.offer_id')}) AS thumb, ${LISTING_JSON('o')} AS listing,
            (SELECT json_build_object('stars', v.rating, 'comment', v.body) FROM reviews v WHERE v.order_id = s.id AND v.reviewer_id = $1) AS my_rating,
            (SELECT json_build_object('stars', v.rating, 'comment', v.body) FROM reviews v WHERE v.order_id = s.id AND v.reviewer_id <> $1) AS their_rating
       FROM rq_orders s LEFT JOIN users ub ON ub.id = s.buyer_id LEFT JOIN users us ON us.id = s.seller_id LEFT JOIN rq_requests q ON q.id = s.request_id LEFT JOIN rq_offers o ON o.id = s.offer_id
      WHERE s.buyer_id = $1 OR s.seller_id = $1 ORDER BY s.created_at DESC LIMIT 200`, [me]);
  // cumpărătorul a deschis „Comenzi”: starea curentă devine „văzută” (după ce am citit, ca insigna să ajungă o dată la el)
  if (req.query.seen === 'buyer') await db.query('UPDATE rq_orders SET buyer_seen_status = status WHERE buyer_id = $1 AND buyer_seen_status IS DISTINCT FROM status', [me]);
  res.set('Cache-Control', 'no-store').json({ orders: r.rows.map(({ phone, whatsapp, extra_phones, ...x }) => ({ ...x, phones: phonesOf({ phone, whatsapp, extra_phones }) })) });
}));

ordersRouter.patch('/:id(\\d+)/status', requireAuth, ah(async (req, res) => {
  const status = String((req.body || {}).status || ''), reason = String((req.body || {}).reason || '').trim().slice(0, 500);
  if (!ORDER_STATUS.includes(status) || status === 'new') return res.status(400).json({ error: 'STATUS_INVALID' });
  const s = (await db.query('SELECT id, buyer_id, seller_id, status, title FROM rq_orders WHERE id = $1', [Number(req.params.id)])).rows[0];
  const me = req.user.id;
  if (!s || (s.buyer_id !== me && s.seller_id !== me)) return res.status(404).json({ error: 'NEGASIT' });
  if (s.status === 'done' || s.status === 'cancelled') return res.status(409).json({ error: 'COMANDA_INCHEIATA' });
  const seller = s.seller_id === me;
  if (!seller && !((status === 'cancelled' && s.status === 'new') || (status === 'done' && s.status === 'shipped'))) return res.status(403).json({ error: 'INTERZIS' });
  if (!(NEXT[s.status] || []).includes(status)) return res.status(409).json({ error: 'STATUS_INVALID' });
  if (reason && LINK_RE.test(reason)) return res.status(400).json({ error: 'LINK_INTERZIS' });
  if (seller && ['suspended', 'cancelled'].includes(status) && reason.length < 3) return res.status(400).json({ error: 'MOTIV_OBLIGATORIU' });
  const u = await db.query('UPDATE rq_orders SET status = $1, status_reason = $4, updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING id', [status, s.id, s.status, ['suspended', 'cancelled', 'done'].includes(status) && reason ? reason : null]);
  if (!u.rowCount) return res.status(409).json({ error: 'COMANDA_INCHEIATA' });
  const other = seller ? s.buyer_id : s.seller_id;
  const kind = status === 'shipped' ? 'rfq_ship' : status === 'done' || status === 'confirmed' ? 'rfq_done' : 'rfq_lost';
  if (other) {
    await notify(other, kind, null, `Comandă ${ORDER_LBL[status]}: ${s.title}`, [reason && `Mesaj: ${reason}`, status === 'done' ? 'Poți acorda un calificativ din „Comenzi”.' : ''].filter(Boolean).join(' · '), { email: true, path: '/comenzi-piese' });
    live.send(other, 'rfq', {});
  }
  res.json({ ok: true, status });
}));

/* AWB și notă privată (doar vânzătorul); cumpărătorul primește notificare când apare un AWB nou */
ordersRouter.patch('/:id(\\d+)/details', requireAuth, ah(async (req, res) => {
  if (!detailsAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const o = (await db.query('SELECT id, buyer_id, title, awb FROM rq_orders WHERE id = $1 AND seller_id = $2', [Number(req.params.id), req.user.id])).rows[0];
  if (!o) return res.status(404).json({ error: 'NEGASIT' });
  const b = req.body || {}, sets = [], vals = [o.id];
  let newAwb = null;
  if (Object.prototype.hasOwnProperty.call(b, 'awb')) {
    const awb = String(b.awb || '').replace(/\s+/g, '').slice(0, 40);
    if (awb && !/^[A-Za-z0-9._-]{3,40}$/.test(awb)) return res.status(400).json({ error: 'AWB_INVALID' });
    vals.push(awb || null); sets.push('awb = $' + vals.length);
    if (awb && awb !== o.awb) newAwb = awb;
  }
  if (Object.prototype.hasOwnProperty.call(b, 'seller_note')) { vals.push(String(b.seller_note || '').trim().slice(0, 1000) || null); sets.push('seller_note = $' + vals.length); }
  if (!sets.length) return res.status(400).json({ error: 'NIMIC_DE_SALVAT' });
  await db.query(`UPDATE rq_orders SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, vals);
  if (newAwb && o.buyer_id) { await notify(o.buyer_id, 'rfq_ship', null, `Comanda „${o.title}” are AWB: ${newAwb}`, '', { email: true, path: '/comenzi-piese' }); live.send(o.buyer_id, 'rfq', {}); }
  res.json({ ok: true });
}));

/* calificativ după comandă finalizată: cumpărătorul îl califică pe vânzător și invers; se poate modifica; apare în profil (tabela reviews) */
ordersRouter.put('/:id(\\d+)/rating', requireAuth, ah(async (req, res) => {
  if (!ratingAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const b = req.body || {}, stars = Number(b.stars), comment = String(b.comment || '').trim().slice(0, 500);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ error: 'CALIFICATIV_INVALID' });
  if (comment && LINK_RE.test(comment)) return res.status(400).json({ error: 'LINK_INTERZIS' });
  const o = (await db.query('SELECT id, buyer_id, seller_id, status, title FROM rq_orders WHERE id = $1', [Number(req.params.id)])).rows[0];
  const me = req.user.id;
  if (!o || !o.buyer_id || !o.seller_id || (o.buyer_id !== me && o.seller_id !== me)) return res.status(404).json({ error: 'NEGASIT' });
  if (o.status !== 'done') return res.status(409).json({ error: 'COMANDA_NEFINALIZATA' });
  const asBuyer = o.buyer_id === me, rated = asBuyer ? o.seller_id : o.buyer_id, role = asBuyer ? 'seller' : 'buyer';   // role = în ce rol e calificat cel evaluat
  const r = await db.query(
    `INSERT INTO reviews(seller_id, reviewer_id, rating, body, role, order_id) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (reviewer_id, order_id) WHERE order_id IS NOT NULL DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = NOW() RETURNING (xmax = 0) AS created`,
    [rated, me, stars, comment || null, role, o.id]);
  if (r.rows[0] && r.rows[0].created) {
    await notify(rated, 'review', null, `Ai primit un calificativ de ${stars} ${stars === 1 ? 'stea' : 'stele'}`, `Pentru comanda „${o.title}”, ca ${role === 'seller' ? 'vânzător' : 'cumpărător'}.`, { email: true, path: '/comenzi-piese' });
    live.send(rated, 'rfq', {});
  }
  res.json({ ok: true, stars, comment });
}));

module.exports = { router, offersRouter, questionsRouter, ordersRouter, sweep, sweepListings, parseRequest, parseOffer, LISTING_JSON, blockState, blockError, REASONS, KINDS, CONTACT_RE };
