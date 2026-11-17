/* Notificări pentru cereri/oferte/comenzi: mereu în aplicație (clopoțel + timp real) și, pentru evenimentele importante, și pe email.
   Semnătura e aceeași ca la notify.notify: notify(userId, kind, listingId, title, body, { email, path }).
   Emailul pleacă doar dacă mailul e configurat, adresa e verificată, contul e activ și utilizatorul nu l-a oprit (users.rfq_email). */
const db = require('./db');
const config = require('./config');
const notifyMod = require('./notify');
const mail = require('./mail');

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* evenimentele care merită și email; restul (modificări, retrageri, refuzuri) rămân doar în aplicație */
const EMAIL = new Set(['rfq_new', 'rfq_quote', 'rfq_won', 'rfq_q', 'rfq_a', 'rfq_ship', 'rfq_done', 'rfq_mod', 'rfq_expired', 'review']);
const PATH = { rfq_new: '/cereri', rfq_quote: '/cererile-mele', rfq_won: '/ofertele-mele', rfq_q: '/intrebari-oferte', rfq_a: '/cererile-mele', rfq_ship: '/comenzi-piese', rfq_done: '/comenzi-piese', rfq_mod: '/cererile-mele', rfq_expired: '/cererile-mele', review: '/comenzi-piese' };

async function sendEmail(userId, title, body, path) {
  if (!mail.MAIL_READY) return false;
  const u = (await db.query("SELECT email, nickname FROM users WHERE id = $1 AND status = 'active' AND email_verified = TRUE AND rfq_email = TRUE", [userId])).rows[0];
  if (!u || !u.email) return false;
  const url = config.APP_URL ? config.APP_URL + (path || '/cereri') : '';
  const settings = config.APP_URL ? config.APP_URL + '/cereri' : '';
  const html = `<p>Salut, ${esc(u.nickname || '')},</p><p><b>${esc(title)}</b></p>${body ? `<p>${esc(body)}</p>` : ''}${url ? `<p><a href="${esc(url)}">Deschide în Omnivo</a></p>` : ''}`
    + `<p style="color:#777;font-size:12px">Nu mai vrei emailuri despre cereri și oferte? Le oprești din Oferte piese${settings ? ` (<a href="${esc(settings)}">${esc(settings)}</a>)` : ''}, jos pe pagină.</p>`;
  const text = `Salut, ${u.nickname || ''},\n\n${title}${body ? '\n' + body : ''}${url ? `\n\nDeschide în Omnivo: ${url}` : ''}\n\nNu mai vrei emailuri despre cereri și oferte? Le oprești din Oferte piese, jos pe pagină.`;
  await mail.sendMail(u.email, title, html, text);
  return true;
}

async function notify(userId, kind, listingId, title, body = '', opts = {}) {
  await notifyMod.notify(userId, kind, listingId, title, body);   // în aplicație (+ SSE), mereu
  const want = opts.email !== undefined ? opts.email : EMAIL.has(kind);
  if (want) sendEmail(userId, title, body, opts.path || PATH[kind]).catch((e) => console.error('rfq mail:', e.message));
}

module.exports = { notify, sendEmail, EMAIL, PATH };
