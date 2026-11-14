/* Moderarea „Cererilor de piese” în panoul de administrare: cereri, oferte, comenzi (tabelele rq_*).
   Se montează în routerul din admin.js, care cere deja rol de admin sau moderator.
   Moderatorul poate închide/redeschide cereri și scoate oferte în așteptare; ștergerea unei cereri e doar pentru admin. */
const db = require('./db');
const { ah } = require('./common');
const notifyMod = require('./notify');

const ST = ['open', 'matched', 'closed'];
const OST = ['pending', 'accepted', 'rejected'];
const ORST = ['new', 'confirmed', 'shipped', 'done', 'cancelled'];
const REQUEST_DAYS = 7;
const lim = (v) => Math.min(50, Math.max(1, Math.floor(Number(v)) || 20));
const off = (v) => Math.min(100000, Math.max(0, Math.floor(Number(v)) || 0));
const like = (q) => '%' + String(q || '').trim().slice(0, 60).replace(/[%_\\]/g, ' ') + '%';
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

/* poze pentru admin: url-ul din storage extern sau ruta de admin (pozele ofertelor nu sunt publice) */
const IMGS = (col, id) => `(SELECT COALESCE(json_agg(json_build_object('id', i.id, 'url', COALESCE(i.url, '/api/admin/requests/img/' || i.id), 'thumb', COALESCE(i.thumb_url, i.url, '/api/admin/requests/img/' || i.id || '?t=1')) ORDER BY i.position, i.id), '[]'::json) FROM rq_images i WHERE i.${col} = ${id})`;

module.exports = function mount(router, { adminOnly, log }) {
  const notify = (...a) => notifyMod.notify(...a);

  router.get('/requests/img/:id(\\d+)', ah(async (req, res) => {
    const r = await db.query('SELECT data, thumb, ctype FROM rq_images WHERE id = $1 AND data IS NOT NULL', [Number(req.params.id)]);
    if (!r.rowCount) return res.status(404).end();
    res.set('Content-Type', r.rows[0].ctype || 'image/webp').set('Cache-Control', 'private, max-age=3600').set('X-Content-Type-Options', 'nosniff');
    res.send(req.query.t ? r.rows[0].thumb : r.rows[0].data);
  }));

  router.get('/requests', ah(async (req, res) => {
    const w = [], p = [];
    if (ST.includes(req.query.status)) { p.push(req.query.status); w.push(`r.status = $${p.length}`); }
    if (String(req.query.q || '').trim()) { p.push(like(req.query.q)); w.push(`(r.title ILIKE $${p.length} OR r.make ILIKE $${p.length} OR r.model ILIKE $${p.length} OR u.nickname ILIKE $${p.length} OR r.extra_parts::text ILIKE $${p.length})`); }
    p.push(lim(req.query.limit), off(req.query.offset));
    const r = await db.query(
      `SELECT r.id, r.title, r.make, r.model, r.year, r.county, r.city, r.status, r.created_at, r.expires_at, r.user_id AS owner_id, u.nickname AS owner,
              (SELECT COUNT(*)::int FROM rq_offers o WHERE o.request_id = r.id) AS offers_count, jsonb_array_length(r.extra_parts) AS extra_n
         FROM rq_requests r JOIN users u ON u.id = r.user_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
        ORDER BY r.created_at DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p);
    res.json({ rows: r.rows });
  }));

  router.get('/requests/:id(\\d+)', ah(async (req, res) => {
    const id = Number(req.params.id);
    const r = (await db.query(
      `SELECT r.*, u.nickname AS owner, u.email AS owner_email, u.phone AS owner_phone, u.status AS owner_status, ${IMGS('request_id', 'r.id')} AS images
         FROM rq_requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1`, [id])).rows[0];
    if (!r) return res.status(404).json({ error: 'NEGASIT' });
    const offers = (await db.query(
      `SELECT o.id, o.seller_id, o.price, o.currency, o.message, o.status, o.created_at, u.nickname AS seller, ${IMGS('offer_id', 'o.id')} AS images
         FROM rq_offers o JOIN users u ON u.id = o.seller_id WHERE o.request_id = $1 ORDER BY o.created_at`, [id])).rows;
    res.json({ request: r, offers });
  }));

  /* închide (cu motiv, îl vede cumpărătorul) sau redeschide o cerere; cele rezolvate nu se ating */
  router.patch('/requests/:id(\\d+)', ah(async (req, res) => {
    const id = Number(req.params.id), status = (req.body || {}).status, reason = clip((req.body || {}).reason, 300);
    if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: 'STATUS_INVALID' });
    if (status === 'closed' && !reason) return res.status(400).json({ error: 'MOTIV_OBLIGATORIU' });
    const cur = (await db.query('SELECT id, user_id, title, status FROM rq_requests WHERE id = $1', [id])).rows[0];
    if (!cur) return res.status(404).json({ error: 'NEGASIT' });
    if (cur.status === 'matched') return res.status(409).json({ error: 'CERERE_REZOLVATA' });
    if (cur.status === status) return res.json({ ok: true });
    await db.query(status === 'open' ? `UPDATE rq_requests SET status = 'open', expires_at = NOW() + make_interval(days => $2) WHERE id = $1` : `UPDATE rq_requests SET status = 'closed' WHERE id = $1`,
      status === 'open' ? [id, REQUEST_DAYS] : [id]);
    await log(req, status === 'open' ? 'request_reopen' : 'request_close', 'request', id, `${cur.title}${reason ? ' · ' + reason : ''}`);
    await notify(cur.user_id, 'rfq_mod', null, status === 'open' ? `Cererea ta a fost redeschisă: ${cur.title}` : `Cererea ta a fost închisă de un moderator: ${cur.title}`, reason || 'Cererea e din nou activă 7 zile.');
    res.json({ ok: true });
  }));

  router.delete('/requests/:id(\\d+)', adminOnly, ah(async (req, res) => {
    const id = Number(req.params.id), reason = clip((req.body || {}).reason, 300);
    const r = await db.query('DELETE FROM rq_requests WHERE id = $1 RETURNING user_id, title', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
    await log(req, 'request_delete', 'request', id, `${r.rows[0].title}${reason ? ' · ' + reason : ''}`);
    await notify(r.rows[0].user_id, 'rfq_mod', null, `Cererea ta a fost ștearsă: ${r.rows[0].title}`, reason || 'Nu respecta regulile Omnivo.');
    res.json({ ok: true });
  }));

  router.get('/offers', ah(async (req, res) => {
    const w = [], p = [];
    if (OST.includes(req.query.status)) { p.push(req.query.status); w.push(`o.status = $${p.length}`); }
    if (String(req.query.q || '').trim()) { p.push(like(req.query.q)); w.push(`(q.title ILIKE $${p.length} OR s.nickname ILIKE $${p.length} OR b.nickname ILIKE $${p.length} OR o.message ILIKE $${p.length})`); }
    p.push(lim(req.query.limit), off(req.query.offset));
    const r = await db.query(
      `SELECT o.id, o.price, o.currency, o.message, o.status, o.created_at, o.request_id, q.title AS request_title, o.seller_id, s.nickname AS seller, q.user_id AS buyer_id, b.nickname AS buyer
         FROM rq_offers o JOIN rq_requests q ON q.id = o.request_id JOIN users s ON s.id = o.seller_id JOIN users b ON b.id = q.user_id
        ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY o.created_at DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p);
    res.json({ rows: r.rows });
  }));

  /* scoate o ofertă în așteptare (ex.: conține date de contact sau înșelăciune); cele acceptate au deja comandă */
  router.post('/offers/:id(\\d+)/remove', ah(async (req, res) => {
    const id = Number(req.params.id), reason = clip((req.body || {}).reason, 300);
    if (!reason) return res.status(400).json({ error: 'MOTIV_OBLIGATORIU' });
    const r = await db.query(
      `DELETE FROM rq_offers o USING rq_requests q WHERE o.id = $1 AND o.status = 'pending' AND q.id = o.request_id RETURNING o.seller_id, q.title, q.id AS rid, q.user_id AS buyer_id`, [id]);
    if (!r.rowCount) return res.status(409).json({ error: 'OFERTA_NU_MAI_E_DISPONIBILA' });
    await log(req, 'offer_remove', 'offer', id, `${r.rows[0].title} · ${reason}`);
    await notify(r.rows[0].seller_id, 'rfq_mod', null, `Oferta ta a fost scoasă de un moderator: ${r.rows[0].title}`, reason);
    res.json({ ok: true });
  }));

  router.get('/rfq-orders', ah(async (req, res) => {
    const w = [], p = [];
    if (ORST.includes(req.query.status)) { p.push(req.query.status); w.push(`s.status = $${p.length}`); }
    if (String(req.query.q || '').trim()) { p.push(like(req.query.q)); w.push(`(s.title ILIKE $${p.length} OR b.nickname ILIKE $${p.length} OR u.nickname ILIKE $${p.length})`); }
    p.push(lim(req.query.limit), off(req.query.offset));
    const r = await db.query(
      `SELECT s.id, s.title, s.price, s.currency, s.status, s.created_at, s.updated_at, s.request_id, b.nickname AS buyer, u.nickname AS seller
         FROM rq_orders s LEFT JOIN users b ON b.id = s.buyer_id LEFT JOIN users u ON u.id = s.seller_id
        ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY s.created_at DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p);
    res.json({ rows: r.rows });
  }));

  /* raportările primite pe cereri și oferte */
  router.get('/rfq-reports', ah(async (req, res) => {
    const st = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    const r = await db.query(
      `SELECT p.id, p.kind, p.reason, p.details, p.status, p.admin_note, p.created_at, p.target_title, p.request_id, p.offer_id,
              ru.nickname AS reporter, tu.nickname AS target_user, o.price, o.currency,
              CASE WHEN p.kind = 'request' THEN rq.status ELSE o.status END AS target_status,
              (SELECT COUNT(*)::int FROM rq_reports x WHERE x.kind = p.kind AND ((p.kind = 'request' AND x.request_id = p.request_id) OR (p.kind = 'offer' AND x.offer_id = p.offer_id))) AS same_target
         FROM rq_reports p LEFT JOIN users ru ON ru.id = p.reporter_id LEFT JOIN users tu ON tu.id = p.target_user_id
         LEFT JOIN rq_requests rq ON rq.id = p.request_id LEFT JOIN rq_offers o ON o.id = p.offer_id
        WHERE p.status = $1 ORDER BY p.created_at ${st === 'open' ? 'ASC' : 'DESC'} LIMIT $2 OFFSET $3`, [st, lim(req.query.limit), off(req.query.offset)]);
    res.json({ rows: r.rows });
  }));

  /* rezolvă / respinge o raportare; opțional închide cererea sau scoate oferta raportată (cu motiv) */
  router.patch('/rfq-reports/:id(\\d+)', ah(async (req, res) => {
    const b = req.body || {}, to = String(b.status || ''), note = clip(b.note, 300), action = String(b.action || '');
    if (!['resolved', 'dismissed'].includes(to)) return res.status(400).json({ error: 'STATUS_INVALID' });
    if (action && !['close_request', 'remove_offer'].includes(action)) return res.status(400).json({ error: 'STATUS_INVALID' });
    if (action && !note) return res.status(400).json({ error: 'MOTIV_OBLIGATORIU' });
    const p = (await db.query('SELECT id, kind, request_id, offer_id, target_title FROM rq_reports WHERE id = $1', [Number(req.params.id)])).rows[0];
    if (!p) return res.status(404).json({ error: 'NEGASIT' });
    if (action === 'close_request') {
      if (p.kind !== 'request' || !p.request_id) return res.status(409).json({ error: 'ACTIUNE_INVALIDA' });
      const c = await db.query("UPDATE rq_requests SET status = 'closed' WHERE id = $1 AND status = 'open' RETURNING user_id, title", [p.request_id]);
      if (c.rowCount) { await log(req, 'request_close', 'request', p.request_id, `${c.rows[0].title} · prin raportare: ${note}`); await notify(c.rows[0].user_id, 'rfq_mod', null, `Cererea ta a fost închisă de un moderator: ${c.rows[0].title}`, note); }
      await db.query("UPDATE rq_reports SET status = 'resolved', resolved_by = $1, resolved_at = NOW(), admin_note = $2 WHERE kind = 'request' AND request_id = $3 AND status = 'open'", [req.user.id, note, p.request_id]);
      return res.json({ ok: true });
    }
    if (action === 'remove_offer') {
      if (p.kind !== 'offer' || !p.offer_id) return res.status(409).json({ error: 'ACTIUNE_INVALIDA' });
      await db.query("UPDATE rq_reports SET status = 'resolved', resolved_by = $1, resolved_at = NOW(), admin_note = $2 WHERE kind = 'offer' AND offer_id = $3 AND status = 'open'", [req.user.id, note, p.offer_id]);
      const d = await db.query("DELETE FROM rq_offers WHERE id = $1 AND status = 'pending' RETURNING seller_id", [p.offer_id]);
      if (!d.rowCount) return res.status(409).json({ error: 'OFERTA_NU_MAI_E_DISPONIBILA' });
      await log(req, 'offer_remove', 'offer', p.offer_id, `${p.target_title} · prin raportare: ${note}`);
      await notify(d.rows[0].seller_id, 'rfq_mod', null, `Oferta ta a fost scoasă de un moderator: ${p.target_title}`, note);
      return res.json({ ok: true });
    }
    await db.query('UPDATE rq_reports SET status = $1, resolved_by = $2, resolved_at = NOW(), admin_note = $3 WHERE id = $4', [to, req.user.id, note || null, p.id]);
    await log(req, 'rfq_report_' + to, 'report', p.id, note);
    res.json({ ok: true });
  }));

  router.get('/rfq-overview', ah(async (req, res) => {
    const r = (await db.query(
      `SELECT (SELECT COUNT(*)::int FROM rq_requests WHERE status = 'open' AND expires_at > NOW()) AS open_requests,
              (SELECT COUNT(*)::int FROM rq_requests WHERE created_at > NOW() - INTERVAL '1 day') AS new_today,
              (SELECT COUNT(*)::int FROM rq_offers WHERE status = 'pending') AS pending_offers,
              (SELECT COUNT(*)::int FROM rq_orders WHERE status IN ('new','confirmed','shipped')) AS active_orders,
              (SELECT COUNT(*)::int FROM rq_reports WHERE status = 'open') AS open_reports`)).rows[0];
    res.json(r);
  }));
};
