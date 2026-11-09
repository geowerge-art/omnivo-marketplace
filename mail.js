const config = require('./config');

const MAIL_READY = !!(config.RESEND_API_KEY && config.RESEND_FROM);

/* Trimite prin Resend. Fără configurare, linkul se scrie în log (util în dezvoltare). */
async function sendMail(to, subject, html, text) {
  if (!MAIL_READY) {
    console.log(`[mail dezactivat] către ${to}: ${subject}\n${text || ''}`);
    return false;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.RESEND_FROM, to: [to], subject, html, text })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
  return true;
}

const baseUrl = (req) => config.APP_URL || `${req.protocol}://${req.get('host')}`;

module.exports = { sendMail, MAIL_READY, baseUrl };
