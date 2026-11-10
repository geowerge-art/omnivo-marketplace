/* Panou de administrare: statistici, anunțuri, utilizatori, raportări, jurnal.
   Accesibil adminilor și moderatorilor; moderatorul are limite (vezi mai jos), ca în AutoPiese. */
const express = require('express');
const db = require('./db');
const config = require('./config');
const { ah, requireDb } = require('./common');
const { requireAuth, requireRole } = require('./authmw');
const { createThrottle } = require('./security');
const { sendMail, MAIL_READY } = require('./mail');

const router = express.Router();
const publicRouter = express.Router();
router.use(requireDb, requireRole('admin', 'moderator'));

const isAdmin = (req) => req.user.role === 'admin';
const adminOnly = (req, res, next) => (isAdmin(req) ? next() : res.status(403).json({ error: 'DOAR_ADMIN' }));
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v, d, max) => Math.min(max, Math.max(1, Math.floor(Number(v)) || d));
const offset = (v) => Math.min(100000, Math.max(0, Math.floor(Number(v)) || 0));
const like = (q) => '%' + q.replace(/[%_\\]/g, '\\$&') + '%';
const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const log = (req, action, type, id, details) => db.query(
  'INSERT INTO admin_activity(admin_id, action, target_type, target_id, details) VALUES($1,$2,$3,$4,$5)',
  [req.user.id, action, type, id, String(details || '').slice(0, 900)]);

/* Vânzătorul află pe email când anunțul lui e aprobat / respins / blocat (doar dacă emailul e configurat). */
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function notifySeller(ids, status, note) {
  if (!MAIL_READY || !['approved', 'rejected', 'blocked'].includes(status)) return;
  try {
    const r = await db.query('SELECT l.title, u.email, u.nickname FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ANY($1::int[])', [ids]);
    const subj = { approved: 'Anunțul tău a fost aprobat', rejected: 'Anunțul tău a fost respins', blocked: 'Anunțul tău a fost blocat' }[status];
    for (const x of r.rows) {
      const txt = status === 'approved' ? `Anunțul „${x.title}” este acum publicat pe Omnivo.`
        : `Anunțul „${x.title}” a fost ${status === 'rejected' ? 'respins' : 'blocat'}. Motiv: ${note}.` + (status === 'rejected' ? ' Îl poți corecta din contul tău și va fi verificat din nou.' : '');
      sendMail(x.email, subj, `<p>Salut, ${esc(x.nickname)},</p><p>${esc(txt)}</p><p>Echipa Omnivo</p>`, `Salut, ${x.nickname},\n\n${txt}\n\nEchipa Omnivo`).catch(() => {});
    }
  } catch (e) { console.error('notify:', e.message); }
}

/* ---- panou ---- */
router.get('/overview', ah(async (req, res) => {
  const one = async (s) => (await db.query(s)).rows[0];
  const [users, listings, reports, msgs, recent, activity, byStatus] = await Promise.all([
    one(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int d1,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int d7, COUNT(*) FILTER (WHERE status = 'blocked')::int blocked FROM users`),
    one(`SELECT COUNT(*) FILTER (WHERE status = 'pending')::int pending, COUNT(*) FILTER (WHERE status = 'approved' AND expires_at > NOW())::int active,
                COUNT(*) FILTER (WHERE status = 'sold')::int sold, COUNT(*) FILTER (WHERE status <> 'deleted' AND created_at > NOW() - INTERVAL '24 hours')::int d1 FROM listings`),
    one("SELECT COUNT(*)::int open FROM reports WHERE status = 'open'"),
    isAdmin(req) ? one("SELECT COUNT(*)::int d1 FROM messages WHERE created_at > NOW() - INTERVAL '24 hours'") : Promise.resolve({ d1: null }),
    db.query("SELECT l.id, l.title, l.status, l.price, l.currency, l.created_at, u.nickname, (SELECT COALESCE(i.thumb_url, i.url) FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1) AS thumb FROM listings l LEFT JOIN users u ON u.id = l.user_id WHERE l.status <> 'deleted' ORDER BY l.created_at DESC LIMIT 5"),
    db.query('SELECT a.action, a.target_type, a.target_id, a.details, a.created_at, u.nickname FROM admin_activity a LEFT JOIN users u ON u.id = a.admin_id ORDER BY a.id DESC LIMIT 5'),
    db.query("SELECT status, COUNT(*)::int n FROM listings WHERE status <> 'deleted' GROUP BY status")
  ]);
  const by_status = Object.fromEntries(byStatus.rows.map((x) => [x.status, x.n]));
  res.json({ users, listings, reports, messages: msgs, recent: recent.rows, activity: activity.rows, by_status });
}));

/* ---- anunțuri ---- */
router.get('/ads', ah(async (req, res) => {
  const where = [], vals = [];
  const st = String(req.query.status || 'pending');
  if (['pending', 'approved', 'rejected', 'blocked', 'sold', 'deleted'].includes(st)) { vals.push(st); where.push(`l.status = $${vals.length}`); }
  else where.push("l.status <> 'deleted'");
  const q = clip(req.query.q, 60);
  if (q) {
    vals.push(like(q), q.replace(/\D/g, '') || '-');
    where.push(`(l.title ILIKE $${vals.length - 1} OR u.nickname ILIKE $${vals.length - 1} OR u.email ILIKE $${vals.length - 1} OR l.id::text = $${vals.length})`);
  }
  const r = await db.query(
    `SELECT l.id, l.title, l.price, l.currency, l.status, l.county, l.city, l.condition, l.views, l.created_at, l.mod_note, l.promoted_until, c.name AS category, u.id AS uid, u.nickname, u.email,
            (SELECT COALESCE(i.thumb_url, i.url) FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1) AS thumb,
            (SELECT COUNT(*)::int FROM reports r WHERE r.listing_id = l.id AND r.status = 'open') AS reports
       FROM listings l JOIN categories c ON c.id = l.category_id LEFT JOIN users u ON u.id = l.user_id
      WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT ${num(req.query.limit, 20, 50)} OFFSET ${offset(req.query.offset)}`, vals);
  res.json({ rows: r.rows });
}));

/* Aprobă toate anunțurile din coada de moderare. */
router.post('/ads/approve-all', ah(async (req, res) => {
  const r = await db.query("UPDATE listings SET status = 'approved', mod_note = NULL, expires_at = GREATEST(expires_at, NOW() + INTERVAL '30 days'), updated_at = NOW() WHERE status = 'pending' RETURNING id");
  if (r.rowCount) await log(req, 'listing_approved', 'listing', 0, `aprobate toate: ${r.rowCount} anunțuri`);
  res.json({ ok: true, approved: r.rowCount });
}));

/* Aprobă / respinge / blochează mai multe anunțuri odată (maxim 50). */
router.post('/ads/bulk', ah(async (req, res) => {
  const b = req.body || {}, s = String(b.status || ''), note = clip(b.note, 300);
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
  if (!ids.length) return res.status(400).json({ error: 'NIMIC_SELECTAT' });
  if (!['approved', 'rejected', 'blocked'].includes(s)) return res.status(400).json({ error: 'STATUS_INVALID' });
  if (s !== 'approved' && !note) return res.status(400).json({ error: 'MOTIV_OBLIGATORIU' });
  const r = await db.query(
    `UPDATE listings SET status = $1, mod_note = $2, updated_at = NOW()${s === 'approved' ? ", expires_at = GREATEST(expires_at, NOW() + INTERVAL '30 days')" : ''}
      WHERE id = ANY($3::int[]) AND status IN ('pending', 'approved', 'rejected', 'blocked') AND status <> $1 RETURNING id`, [s, s === 'approved' ? null : note, ids]);
  if (r.rowCount) { await log(req, 'listing_' + s, 'listing', 0, `în masă: ${r.rowCount} anunțuri (#${r.rows.map((x) => x.id).join(', #')})${note ? ' — ' + note : ''}`); if (s !== 'approved') notifySeller(r.rows.map((x) => x.id), s, note); }
  res.json({ ok: true, changed: r.rowCount });
}));

/* Promovare din panou: 3 / 7 / 30 / 90 de zile sau 0 = oprește. */
router.post('/ads/:id(\\d+)/promote', ah(async (req, res) => {
  const days = Number((req.body || {}).days);
  if (![0, 3, 7, 30, 90].includes(days)) return res.status(400).json({ error: 'PROMOVARE_INVALIDA' });
  const r = days === 0
    ? await db.query('UPDATE listings SET promoted_until = NULL WHERE id = $1 RETURNING id', [req.params.id])
    : await db.query("UPDATE listings SET promoted_until = GREATEST(COALESCE(promoted_until, NOW()), NOW()) + ($1 || ' days')::interval, bumped_at = NOW() WHERE id = $2 AND status = 'approved' RETURNING id", [String(days), req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  await log(req, 'listing_promote', 'listing', Number(req.params.id), days ? `promovat ${days} zile` : 'promovare oprită');
  res.json({ ok: true });
}));

/* Tot ce trebuie ca să judeci un anunț: poze, câmpuri, vânzător, raportări, istoric. */
router.get('/ads/:id(\\d+)', ah(async (req, res) => {
  const r = await db.query(
    `SELECT l.id, l.title, l.description, l.price, l.currency, l.negotiable, l.condition, l.county, l.city, l.address, l.status, l.mod_note, l.views,
            l.created_at, l.updated_at, l.expires_at, l.attributes, l.promoted_until, l.category_id, l.seller_type,
            c.name AS category, p.name AS parent_category,
            u.id AS uid, u.nickname, u.name AS uname, u.email, u.phone, u.status AS ustatus, u.role AS urole, u.created_at AS ucreated, u.email_verified,
            (SELECT COUNT(*)::int FROM listings x WHERE x.user_id = u.id AND x.status <> 'deleted') AS uads
       FROM listings l JOIN categories c ON c.id = l.category_id LEFT JOIN categories p ON p.id = c.parent_id LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`, [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  const l = r.rows[0];
  const [imgs, defs, reps, hist] = await Promise.all([
    db.query('SELECT id, url FROM listing_images WHERE listing_id = $1 ORDER BY position, id', [l.id]),
    db.query('SELECT key, label FROM category_attributes WHERE category_id = $1 OR category_id = (SELECT parent_id FROM categories WHERE id = $1)', [l.category_id]),
    db.query("SELECT r.id, r.reason, r.details, r.status, r.created_at, ru.nickname AS reporter FROM reports r LEFT JOIN users ru ON ru.id = r.reporter_id WHERE r.listing_id = $1 ORDER BY r.created_at DESC LIMIT 10", [l.id]),
    db.query("SELECT a.action, a.details, a.created_at, u.nickname FROM admin_activity a LEFT JOIN users u ON u.id = a.admin_id WHERE a.target_type = 'listing' AND a.target_id = $1 ORDER BY a.id DESC LIMIT 10", [l.id])
  ]);
  const label = Object.fromEntries(defs.rows.map((d) => [d.key, d.label]));
  const attrs = Object.entries(l.attributes || {}).map(([k, v]) => ({ label: label[k] || k, value: String(v) }));
  const { attributes, ...rest } = l;
  res.json({ listing: { ...rest, attrs, images: imgs.rows, reports: reps.rows, history: hist.rows } });
}));

router.patch('/ads/:id(\\d+)', ah(async (req, res) => {
  const cur = await db.query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
  if (!cur.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  const b = cur.rows[0], body = req.body || {}, sets = [], vals = [], ch = [];
  const set = (col, val, label) => { vals.push(val); sets.push(`${col} = $${vals.length}`); if (label) ch.push(label); };
  let title = b.title, desc = b.description, statusChanged = null;
  if ('title' in body) {
    title = clip(body.title, 120); if (title.length < 5) return res.status(400).json({ error: 'TITLU_INVALID' });
    if (title !== b.title) set('title', title, `titlu: „${b.title.slice(0, 40)}” → „${title.slice(0, 40)}”`);
  }
  if ('price' in body) {
    const p = body.price === '' || body.price === null ? null : Number(body.price);
    if (p !== null && (!Number.isFinite(p) || p < 0 || p > 10000000)) return res.status(400).json({ error: 'PRET_INVALID' });
    if (String(b.price == null ? '' : Number(b.price)) !== String(p == null ? '' : p)) set('price', p, `preț: ${b.price == null ? '—' : b.price} → ${p == null ? '—' : p}`);
  }
  if ('description' in body) { desc = clip(body.description, 4000); if (desc !== b.description) set('description', desc, 'descriere editată'); }
  if (body.status !== undefined) {
    const s = String(body.status), note = clip(body.note, 300);
    if (!['pending', 'approved', 'rejected', 'blocked'].includes(s)) return res.status(400).json({ error: 'STATUS_INVALID' });
    if (['rejected', 'blocked'].includes(s) && !note) return res.status(400).json({ error: 'MOTIV_OBLIGATORIU' });
    if (s !== b.status) { statusChanged = s; set('status', s, `status: ${b.status} → ${s}`); set('mod_note', ['rejected', 'blocked'].includes(s) ? note : null); if (note) ch.push('motiv: ' + note.slice(0, 120)); }
  }
  if (!sets.length) return res.json({ ok: true, changed: false });
  if (title !== b.title || desc !== b.description) set('search_text', fold(title + ' ' + desc).replace(/[^a-z0-9 ]+/g, ' '));
  vals.push(Number(req.params.id));
  await db.query(`UPDATE listings SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
  if (statusChanged === 'approved') await db.query("UPDATE listings SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '30 days') WHERE id = $1", [req.params.id]);
  await log(req, statusChanged ? 'listing_' + statusChanged : 'listing_edit', 'listing', Number(req.params.id), ch.join('; '));
  if (statusChanged) notifySeller([Number(req.params.id)], statusChanged, clip(body.note, 300));
  res.json({ ok: true, changed: true });
}));

router.delete('/ads/:id(\\d+)', adminOnly, ah(async (req, res) => {
  const r = await db.query('DELETE FROM listings WHERE id = $1 RETURNING title', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'NEGASIT' });
  await log(req, 'listing_delete', 'listing', Number(req.params.id), r.rows[0].title);
  res.json({ ok: true });
}));

/* ---- utilizatori ---- */
router.get('/users', ah(async (req, res) => {
  const where = ['TRUE'], vals = [];
  if (['blocked', 'active'].includes(req.query.status)) { vals.push(req.query.status); where.push(`u.status = $${vals.length}`); }
  if (['user', 'moderator', 'admin'].includes(req.query.role)) { vals.push(req.query.role); where.push(`u.role = $${vals.length}`); }
  const q = clip(req.query.q, 60);
  if (q) { vals.push(like(q), q.replace(/\D/g, '') || '-'); where.push(`(u.name ILIKE $${vals.length - 1} OR u.nickname ILIKE $${vals.length - 1} OR u.email ILIKE $${vals.length - 1} OR u.id::text = $${vals.length})`); }
  const r = await db.query(
    `SELECT u.id, u.name, u.nickname, u.email, u.phone, u.role, u.status, u.email_verified, u.created_at, u.block_reason, u.blocked_until,
            (SELECT COUNT(*)::int FROM listings l WHERE l.user_id = u.id AND l.status <> 'deleted') AS ads,
            (SELECT COUNT(*)::int FROM reports r JOIN listings l ON l.id = r.listing_id WHERE l.user_id = u.id AND r.status = 'open') AS reported
       FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ${num(req.query.limit, 20, 50)} OFFSET ${offset(req.query.offset)}`, vals);
  res.json({ rows: r.rows });
}));

/* Blocare cu motiv obligatoriu; moderatorii: doar conturi „user”, 1-30 de zile. Blocarea închide toate sesiunile contului. */
router.patch('/users/:id(\\d+)', ah(async (req, res) => {
  const uid = Number(req.params.id), status = (req.body || {}).status;
  if (!['active', 'blocked'].includes(status)) return res.status(400).json({ error: 'STATUS_INVALID' });
  if (uid === req.user.id) return res.status(400).json({ error: 'CANNOT_BLOCK_SELF' });
  const t = (await db.query('SELECT id, role FROM users WHERE id = $1', [uid])).rows[0];
  if (!t) return res.status(404).json({ error: 'NEGASIT' });
  if (!isAdmin(req) && t.role !== 'user') return res.status(403).json({ error: 'INTERZIS' });
  const reason = clip((req.body || {}).reason, 300);
  let until = null, days = null;
  if (status === 'blocked') {
    if (!reason) return res.status(400).json({ error: 'MOTIV_OBLIGATORIU' });
    const d = (req.body || {}).days;
    if (d !== null && d !== undefined && d !== '') {
      days = Math.floor(Number(d));
      if (!Number.isFinite(days) || days < 1 || days > 365) return res.status(400).json({ error: 'DATE_INVALIDE', field: 'zile' });
    }
    if (!isAdmin(req) && (days === null || days > 30)) return res.status(403).json({ error: 'BLOCARE_MAX_30_ZILE' });
    if (days) until = new Date(Date.now() + days * 86400000);
  }
  await db.query('UPDATE users SET status = $1, block_reason = $2, blocked_until = $3 WHERE id = $4', [status, status === 'blocked' ? reason : null, until, uid]);
  if (status === 'blocked') await db.query('DELETE FROM sessions WHERE user_id = $1', [uid]);
  await log(req, status === 'blocked' ? 'user_block' : 'user_unblock', 'user', uid, status === 'blocked' ? `${days ? days + ' zile' : 'definitiv'}: ${reason}` : '');
  res.json({ ok: true });
}));

router.patch('/users/:id(\\d+)/role', adminOnly, ah(async (req, res) => {
  const uid = Number(req.params.id), role = String((req.body || {}).role || '');
  if (!['user', 'moderator', 'admin'].includes(role)) return res.status(400).json({ error: 'ROL_INVALID' });
  if (uid === req.user.id) return res.status(400).json({ error: 'ROL_PROPRIU' });
  const t = (await db.query('SELECT id, email, role, status FROM users WHERE id = $1', [uid])).rows[0];
  if (!t) return res.status(404).json({ error: 'NEGASIT' });
  if (t.role === role) return res.json({ ok: true, changed: false });
  if (t.role === 'admin' && config.ADMIN_EMAIL && String(t.email).toLowerCase() === config.ADMIN_EMAIL) return res.status(400).json({ error: 'ADMIN_PRINCIPAL' });
  if (t.role === 'admin' && (await db.query("SELECT COUNT(*)::int n FROM users WHERE role = 'admin' AND status = 'active'")).rows[0].n <= 1) return res.status(400).json({ error: 'ULTIMUL_ADMIN' });
  if (role !== 'user' && t.status !== 'active') return res.status(400).json({ error: 'CONT_BLOCAT' });
  await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, uid]);
  await log(req, 'user_role', 'user', uid, `${t.role} → ${role}`);
  res.json({ ok: true, changed: true });
}));

/* Ștergerea definitivă a unui cont (dreptul la ștergere, GDPR). Jurnalul păstrează doar id-ul. */
router.delete('/users/:id(\\d+)', adminOnly, ah(async (req, res) => {
  const uid = Number(req.params.id);
  if (uid === req.user.id) return res.status(400).json({ error: 'CANNOT_DELETE_SELF' });
  const t = (await db.query('SELECT role FROM users WHERE id = $1', [uid])).rows[0];
  if (!t) return res.status(404).json({ error: 'NEGASIT' });
  if (t.role === 'admin') return res.status(400).json({ error: 'CANNOT_DELETE_ADMIN' });
  await db.query('DELETE FROM users WHERE id = $1', [uid]);
  await log(req, 'user_delete', 'user', uid, 'cont șters');
  res.json({ ok: true });
}));

/* ---- raportări ---- */
router.get('/reports', ah(async (req, res) => {
  const st = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const r = await db.query(
    `SELECT r.id, r.reason, r.details, r.status, r.created_at, r.admin_note, l.id AS listing_id, l.title, l.status AS listing_status,
            ru.nickname AS reporter, su.nickname AS seller,
            (SELECT COUNT(*)::int FROM reports x WHERE x.listing_id = r.listing_id) AS same_listing
       FROM reports r JOIN listings l ON l.id = r.listing_id LEFT JOIN users ru ON ru.id = r.reporter_id LEFT JOIN users su ON su.id = l.user_id
      WHERE r.status = $1 ORDER BY r.created_at ${st === 'open' ? 'ASC' : 'DESC'} LIMIT ${num(req.query.limit, 20, 50)} OFFSET ${offset(req.query.offset)}`, [st]);
  res.json({ rows: r.rows });
}));

router.patch('/reports/:id(\\d+)', ah(async (req, res) => {
  const body = req.body || {}, to = String(body.status || ''), note = clip(body.note, 300);
  if (!['resolved', 'dismissed'].includes(to)) return res.status(400).json({ error: 'STATUS_INVALID' });
  const rep = (await db.query('SELECT id, listing_id FROM reports WHERE id = $1', [req.params.id])).rows[0];
  if (!rep) return res.status(404).json({ error: 'NEGASIT' });
  if (body.block_listing) {
    if (!note) return res.status(400).json({ error: 'MOTIV_OBLIGATORIU' });
    await db.query("UPDATE listings SET status = 'blocked', mod_note = $1, updated_at = NOW() WHERE id = $2", [note, rep.listing_id]);
    await db.query("UPDATE reports SET status = 'resolved', resolved_by = $1, resolved_at = NOW(), admin_note = $2 WHERE listing_id = $3 AND status = 'open'", [req.user.id, note, rep.listing_id]);
    await log(req, 'listing_blocked', 'listing', rep.listing_id, 'prin raportare: ' + note);
    return res.json({ ok: true });
  }
  await db.query('UPDATE reports SET status = $1, resolved_by = $2, resolved_at = NOW(), admin_note = $3 WHERE id = $4', [to, req.user.id, note || null, rep.id]);
  await log(req, 'report_' + to, 'report', rep.id, note);
  res.json({ ok: true });
}));

/* ---- jurnal ---- */
router.get('/activity', ah(async (req, res) => {
  const r = await db.query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, u.nickname
       FROM admin_activity a LEFT JOIN users u ON u.id = a.admin_id ORDER BY a.id DESC LIMIT ${num(req.query.limit, 20, 50)} OFFSET ${offset(req.query.offset)}`);
  res.json({ rows: r.rows });
}));

/* ---- raportarea unui anunț, de către orice utilizator ---- */
const REASONS = ['inselatorie', 'interzis', 'duplicat', 'gresit', 'vandut', 'altul'];
const reportAllow = createThrottle(10, 60 * 60 * 1000);
publicRouter.post('/', requireDb, requireAuth, ah(async (req, res) => {
  const id = Number((req.body || {}).listing_id), reason = String((req.body || {}).reason || '');
  if (!id || !REASONS.includes(reason)) return res.status(400).json({ error: 'RAPORT_MOTIV' });
  if (!reportAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const l = (await db.query("SELECT user_id FROM listings WHERE id = $1 AND status IN ('approved','sold')", [id])).rows[0];
  if (!l) return res.status(404).json({ error: 'NEGASIT' });
  if (l.user_id === req.user.id) return res.status(400).json({ error: 'REPORT_PROPRIU' });
  const dup = await db.query("SELECT 1 FROM reports WHERE listing_id = $1 AND reporter_id = $2 AND status = 'open'", [id, req.user.id]);
  if (!dup.rowCount) await db.query('INSERT INTO reports(listing_id, reporter_id, reason, details) VALUES($1,$2,$3,$4)', [id, req.user.id, reason, clip((req.body || {}).details, 500)]);
  res.status(201).json({ ok: true });
}));

module.exports = { router, publicRouter };
