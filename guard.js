/* Filtrul de conținut și aprobarea automată.
   - gate():   oprește publicarea dacă textul conține telefon, e-mail, link, trimitere pe aplicații de mesagerie sau cuvinte interzise.
               Fiecare oprire e o „abatere”: 3 puncte în 24 h = publicare oprită 24 h; 10 puncte în 7 zile = cont blocat automat.
   - decide(): hotărăște dacă un anunț nou se publică direct sau merge la moderator, pe baza unui scor de încredere. */
const db = require('./db');
const config = require('./config');
const { makeScanner } = require('./guardscan');

const scan = makeScanner(config.BLOCKED_WORDS);
const CODE = { phone: 'TELEFON_IN_TEXT', email: 'EMAIL_IN_TEXT', link: 'LINK_IN_TEXT', messenger: 'MESAGERIE_IN_TEXT', banned: 'CUVINTE_INTERZISE' };
const ORDER = ['banned', 'phone', 'email', 'messenger', 'link'];
const WEIGHT = { banned: 3 };            // restul tipurilor: 1 punct
const PAUSE_AT = 3, BAN_AT = 10;
const pickCode = (hits) => CODE[ORDER.find((t) => hits.some((h) => h.type === t))];

async function ban(userId) {
  await db.query("UPDATE users SET status = 'blocked', block_reason = $2, blocked_until = NULL WHERE id = $1 AND role = 'user'", [userId, 'Blocat automat: încălcări repetate ale regulilor de conținut']);
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await db.query("UPDATE listings SET status = 'blocked', mod_note = $2, updated_at = NOW() WHERE user_id = $1 AND status IN ('approved','pending')", [userId, 'Cont blocat automat pentru încălcări repetate']);
}

async function strike(userId, hits) {
  const w = hits.reduce((n, h) => n + (WEIGHT[h.type] || 1), 0);
  await db.query('INSERT INTO guard_events(user_id, kind, weight, sample) VALUES($1,$2,$3,$4)', [userId, [...new Set(hits.map((h) => h.type))].join(','), w, hits.map((h) => h.sample).join(' | ').slice(0, 120)]);
  const r = (await db.query(
    `SELECT COALESCE(SUM(weight) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::int AS d1, COALESCE(SUM(weight), 0)::int AS d7
       FROM guard_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'`, [userId])).rows[0];
  if (r.d7 >= BAN_AT) { await ban(userId); return { banned: true }; }
  if (r.d1 >= PAUSE_AT) { await db.query("UPDATE users SET publish_blocked_until = NOW() + INTERVAL '24 hours' WHERE id = $1", [userId]); return { paused: true }; }
  return { left: PAUSE_AT - r.d1 };
}

/* Folosit în rutele care publică text (anunțuri, cereri, oferte). Întoarce true dacă a răspuns deja (publicarea se oprește). */
async function gate(req, res, texts) {
  const u = req.user;
  if (!u || u.role !== 'user') return false;                       // echipa nu e filtrată
  if (u.publish_blocked_until && new Date(u.publish_blocked_until) > new Date()) { res.status(403).json({ error: 'PUBLICARE_OPRITA' }); return true; }
  const { block } = scan(texts.filter(Boolean).join('\n'));
  if (!block.length) return false;
  const s = await strike(u.id, block);
  res.status(s.banned || s.paused ? 403 : 400).json({ error: s.banned ? 'CONT_BLOCAT_AUTO' : s.paused ? 'PUBLICARE_OPRITA' : pickCode(block) });
  return true;
}

/* verificare fără penalizare, pentru avertismentul afișat în formular în timp ce scrii */
function check(texts) {
  const { block, review } = scan(texts.filter(Boolean).join('\n'));
  return { issues: [...new Set(block.map((h) => h.type))].map((t) => ({ type: t, code: CODE[t] })), review: review.length > 0 };
}

/* ---- scor de încredere ---- */
async function trust(userId, v, excludeId) {
  const u = (await db.query('SELECT created_at, email_verified, phone FROM users WHERE id = $1', [userId])).rows[0] || {};
  const h = (await db.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('approved','sold'))::int AS ok,
            COUNT(*) FILTER (WHERE status IN ('rejected','blocked') AND updated_at > NOW() - INTERVAL '90 days')::int AS bad
       FROM listings WHERE user_id = $1`, [userId])).rows[0];
  const strikes = (await db.query("SELECT COALESCE(SUM(weight), 0)::int AS n FROM guard_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'", [userId])).rows[0].n;
  const days = u.created_at ? (Date.now() - new Date(u.created_at).getTime()) / 86400000 : 0;
  let score = 0;
  score += days >= 30 ? 30 : days >= 7 ? 20 : days >= 1 ? 8 : 0;
  if (u.email_verified) score += 10;
  if (u.phone) score += 5;
  score += h.ok >= 5 ? 30 : h.ok >= 1 ? 20 : 0;
  score -= Math.min(60, h.bad * 30);
  score -= Math.min(45, strikes * 15);
  if (v.price != null) score += 5;
  if ((v.description || '').length >= 40) score += 5;
  const force = [];
  const dup = await db.query("SELECT 1 FROM listings WHERE user_id = $1 AND lower(title) = lower($2) AND status IN ('pending','approved','sold') AND created_at > NOW() - INTERVAL '7 days' AND id <> $3 LIMIT 1", [userId, v.title, excludeId || 0]);
  if (dup.rowCount) force.push('titlu repetat');
  if (v.price != null && Number(v.price) > 0) {
    const m = (await db.query("SELECT COUNT(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS med FROM listings WHERE category_id = $1 AND currency = $2 AND status = 'approved' AND price IS NOT NULL AND price > 0", [v.category_id, v.currency])).rows[0];
    if (m && m.n >= 8 && Number(m.med) > 0 && Number(v.price) < Number(m.med) * 0.2) force.push('preț mult sub media categoriei');
  }
  return { score, force, ok: h.ok, days };
}

/* hotărâre pentru un anunț nou sau modificat */
async function decide(user, v, text, opts = {}) {
  if (!user || user.role !== 'user') return { status: 'approved', auto: false, score: null, note: null };
  const t = await trust(user.id, v, opts.excludeId);
  const forced = [...t.force];
  const fraud = scan(text).review;
  if (fraud.length) forced.push(`formulă de fraudă („${fraud[0].sample}”)`);
  const moderation = config.NEW_LISTING_STATUS === 'pending';
  let approve = !forced.length && (!moderation || t.score >= config.AUTO_APPROVE_SCORE);
  if (approve && moderation && Math.random() * 100 < config.AUTO_SPOT_PCT) { approve = false; forced.push('control aleatoriu'); }
  if (approve) return { status: 'approved', auto: moderation, score: t.score, note: moderation ? `Aprobat automat · scor ${t.score}` : null };
  const why = [...forced];
  if (!forced.length) {
    if (!t.ok) why.push('primul anunț');
    if (t.days < 7) why.push(`cont nou (${Math.floor(t.days)} zile)`);
    why.push(`scor ${t.score} din ${config.AUTO_APPROVE_SCORE}`);
  }
  return { status: 'pending', auto: false, score: t.score, note: `În verificare: ${why.join(', ')}` };
}

/* un anunț raportat de cel puțin 2 persoane într-o zi se ascunde până îl verifică un moderator */
async function hideIfReported(listingId, notify) {
  const c = (await db.query("SELECT COUNT(DISTINCT reporter_id)::int AS n FROM reports WHERE listing_id = $1 AND status = 'open' AND created_at > NOW() - INTERVAL '24 hours'", [listingId])).rows[0].n;
  if (c < 2) return false;
  const u = await db.query("UPDATE listings SET status = 'pending', auto_approved = FALSE, trust_note = $2, updated_at = NOW() WHERE id = $1 AND status = 'approved' RETURNING user_id", [listingId, `Ascuns automat: raportat de ${c} persoane`]);
  if (u.rowCount && notify) notify(u.rows[0].user_id, 'mod_pending', listingId, 'Anunțul tău e în verificare', 'A fost raportat de mai mulți utilizatori; un moderator îl verifică.');
  return u.rowCount > 0;
}

module.exports = { gate, check, decide, hideIfReported, strike, scan, CODE, PAUSE_AT, BAN_AT };
