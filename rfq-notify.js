/* Notificări pentru cereri/oferte/comenzi: mereu în aplicație (clopoțel + timp real) și, pentru evenimentele importante, și pe email.
   Semnătura e aceeași ca la notify.notify: notify(userId, kind, listingId, title, body, { email, path }).
   Emailul pleacă doar dacă mailul e configurat, adresa e verificată, contul e activ și utilizatorul nu l-a oprit (users.rfq_email).
   Interval de liniște (implicit 22:00-08:00, ora României; RFQ_QUIET_START / RFQ_QUIET_END / RFQ_MAIL_TZ): emailurile din timpul nopții
   se rețin în rfq_mail_queue și pleacă dimineața (flushQueue, apelat periodic din server.js); dacă sunt mai multe pentru același om, într-un singur email. */
const db = require('./db');
const config = require('./config');
const notifyMod = require('./notify');
const mail = require('./mail');

const clock = { now: () => new Date() };   // înlocuibil în teste
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* evenimentele care merită și email; restul (modificări, retragere, refuzuri) rămân doar în aplicație */
const EMAIL = new Set(['rfq_new', 'rfq_quote', 'rfq_won', 'rfq_q', 'rfq_a', 'rfq_ship', 'rfq_done', 'rfq_mod', 'rfq_expired', 'review']);
const PATH = { rfq_new: '/cereri', rfq_quote: '/cererile-mele', rfq_won: '/ofertele-mele', rfq_q: '/intrebari-oferte', rfq_a: '/cererile-mele', rfq_ship: '/comenzi-piese', rfq_done: '/comenzi-piese', rfq_mod: '/cererile-mele', rfq_expired: '/cererile-mele', review: '/comenzi-piese' };
const DIGEST_MAX = 20;

/* ---------- interval de liniște ---------- */
const hourEnv = (k, d) => { const v = Number(process.env[k]); return Number.isInteger(v) && v >= 0 && v <= 23 ? v : d; };
function hourIn(d, tz) {
  try { return parseInt(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(d), 10) % 24; } catch { return d.getUTCHours(); }
}
function quiet(d = clock.now()) {
  const from = hourEnv('RFQ_QUIET_START', 22), to = hourEnv('RFQ_QUIET_END', 8);
  if (from === to) return false;   // același număr = fără interval de liniște
  const h = hourIn(d, process.env.RFQ_MAIL_TZ || 'Europe/Bucharest');
  return from > to ? (h >= from || h < to) : (h >= from && h < to);
}

/* ---------- conținut ---------- */
const FOOT_HTML = (settings) => `<p style="color:#777;font-size:12px">Nu mai vrei emailuri despre cereri și oferte? Le oprești din Oferte piese${settings ? ` (<a href="${esc(settings)}">${esc(settings)}</a>)` : ''}, jos pe pagină.</p>`;
const FOOT_TEXT = 'Nu mai vrei emailuri despre cereri și oferte? Le oprești din Oferte piese, jos pe pagină.';
function render(u, items) {
  const base = config.APP_URL || '', link = (p) => (base ? base + (p || '/cereri') : '');
  const hi = `<p>Salut, ${esc(u.nickname || '')},</p>`, hiT = `Salut, ${u.nickname || ''},\n\n`, settings = base ? base + '/cereri' : '';
  if (items.length === 1) {
    const it = items[0], url = link(it.path);
    return { subject: it.title,
      html: `${hi}<p><b>${esc(it.title)}</b></p>${it.body ? `<p>${esc(it.body)}</p>` : ''}${url ? `<p><a href="${esc(url)}">Deschide în Omnivo</a></p>` : ''}${FOOT_HTML(settings)}`,
      text: `${hiT}${it.title}${it.body ? '\n' + it.body : ''}${url ? `\n\nDeschide în Omnivo: ${url}` : ''}\n\n${FOOT_TEXT}` };
  }
  const shown = items.slice(0, DIGEST_MAX), more = items.length - shown.length;   // mai multe notificări din timpul nopții: un singur email
  const li = shown.map((it) => { const url = link(it.path); return `<li>${url ? `<a href="${esc(url)}">${esc(it.title)}</a>` : esc(it.title)}${it.body ? `<br><span style="color:#555">${esc(it.body)}</span>` : ''}</li>`; }).join('');
  return { subject: `Ai ${items.length} notificări noi în Omnivo`,
    html: `${hi}<p>Cât ai fost offline s-au adunat ${items.length} notificări despre cereri, oferte și comenzi:</p><ul>${li}</ul>${more > 0 ? `<p>… și încă ${more}.</p>` : ''}${settings ? `<p><a href="${esc(settings)}">Deschide în Omnivo</a></p>` : ''}${FOOT_HTML(settings)}`,
    text: `${hiT}Cât ai fost offline s-au adunat ${items.length} notificări:\n\n${shown.map((it) => `- ${it.title}${it.body ? ' (' + it.body + ')' : ''}`).join('\n')}${more > 0 ? `\n… și încă ${more}.` : ''}${settings ? `\n\nDeschide în Omnivo: ${settings}` : ''}\n\n${FOOT_TEXT}` };
}
async function deliver(u, items) { const m = render(u, items); await mail.sendMail(u.email, m.subject, m.html, m.text); }

/* ---------- trimitere ---------- */
async function sendEmail(userId, title, body, path, kind = '') {
  if (!mail.MAIL_READY) return false;
  if (quiet()) {   // noaptea: se rețin pentru dimineață, dar numai pentru cei care ar primi oricum emailul
    await db.query(
      `INSERT INTO rfq_mail_queue(user_id, kind, title, body, path)
       SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM users WHERE id = $1 AND status = 'active' AND email_verified = TRUE AND rfq_email = TRUE)`,
      [userId, kind, title, body || '', path || '/cereri']);
    return 'queued';
  }
  const u = (await db.query("SELECT email, nickname FROM users WHERE id = $1 AND status = 'active' AND email_verified = TRUE AND rfq_email = TRUE", [userId])).rows[0];
  if (!u || !u.email) return false;
  await deliver(u, [{ title, body, path }]);
  return true;
}

/* dimineața: trimite ce s-a adunat peste noapte (un email per om; mai multe notificări = un rezumat). Se apelează din server.js la câteva minute. */
async function flushQueue() {
  if (!mail.MAIL_READY || quiet()) return 0;
  const claimed = (await db.query(
    `UPDATE rfq_mail_queue SET sent_at = NOW() WHERE sent_at IS NULL AND id IN (SELECT id FROM rfq_mail_queue WHERE sent_at IS NULL ORDER BY id LIMIT 500)
     RETURNING id, user_id, title, body, path`)).rows;
  if (!claimed.length) return 0;
  const by = new Map(); for (const r of claimed.sort((a, b) => a.id - b.id)) { if (!by.has(r.user_id)) by.set(r.user_id, []); by.get(r.user_id).push(r); }
  const users = (await db.query("SELECT id, email, nickname FROM users WHERE id = ANY($1::int[]) AND status = 'active' AND email_verified = TRUE AND rfq_email = TRUE", [[...by.keys()]])).rows;
  let sent = 0;
  for (const u of users) {
    const items = by.get(u.id);
    try { await deliver(u, items); sent++; }
    catch (e) { console.error('rfq mail flush:', e.message); await db.query('UPDATE rfq_mail_queue SET sent_at = NULL WHERE id = ANY($1::int[])', [items.map((x) => x.id)]).catch(() => {}); }
  }
  await db.query("DELETE FROM rfq_mail_queue WHERE sent_at < NOW() - INTERVAL '3 days'").catch(() => {});
  return sent;
}

async function notify(userId, kind, listingId, title, body = '', opts = {}) {
  await notifyMod.notify(userId, kind, listingId, title, body);   // în aplicație (+ SSE), mereu
  const want = opts.email !== undefined ? opts.email : EMAIL.has(kind);
  if (want) sendEmail(userId, title, body, opts.path || PATH[kind], kind).catch((e) => console.error('rfq mail:', e.message));
}

module.exports = { notify, sendEmail, flushQueue, quiet, clock, EMAIL, PATH };
