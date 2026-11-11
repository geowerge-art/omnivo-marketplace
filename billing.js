/* Portofel cu credite + plata cu cardul prin Stripe Checkout (pagină găzduită de Stripe: datele cardului nu trec niciodată pe serverul nostru).
   Fără cheie Stripe, plata cu cardul e oprită, dar creditele se pot da manual din panoul de admin. */
const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth } = require('./authmw');
const { createThrottle } = require('./security');
const { baseUrl } = require('./mail');
const plans = require('./plans');
const PRICING = require('./pricing');

const enabled = () => config.BILLING;
const stripeOn = () => !!config.STRIPE_SECRET_KEY;
const freeBumpHours = () => (enabled() ? PRICING.bump.free_hours : 24);

/* ---- Stripe, fără bibliotecă: cerere HTTPS către API + verificarea semnăturii webhook-ului ---- */
function form(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) { const key = prefix ? `${prefix}[${k}]` : k; if (v && typeof v === 'object') form(v, key, out); else if (v != null) out.push([key, String(v)]); }
  return out;
}
async function stripe(method, path, params) {
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method, headers: { Authorization: 'Bearer ' + config.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : new URLSearchParams(form(params || {})).toString(), signal: AbortSignal.timeout(15000)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((j.error && j.error.message) || 'stripe ' + res.status), { status: res.status });
  return j;
}
function verifySig(raw, header, secret, nowMs = Date.now()) {
  const parts = String(header || '').split(',').map((p) => p.trim().split('='));
  const t = (parts.find((p) => p[0] === 't') || [])[1], sigs = parts.filter((p) => p[0] === 'v1').map((p) => p[1]);
  if (!t || !sigs.length || !Buffer.isBuffer(raw) || Math.abs(nowMs / 1000 - Number(t)) > 300) return false;
  const exp = crypto.createHmac('sha256', secret).update(Buffer.concat([Buffer.from(t + '.'), raw])).digest('hex');
  return sigs.some((s) => s && s.length === exp.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp)));
}

/* ---- mișcări de credite (toate atomice; soldul nu poate coborî sub 0) ---- */
async function withTx(fn) {
  const c = await db.pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
async function spend(c, uid, amount, kind, refId, note) {
  if (!(amount > 0)) return null;
  const u = await c.query('UPDATE users SET credits = credits - $2 WHERE id = $1 AND credits >= $2 RETURNING credits', [uid, amount]);
  if (!u.rowCount) return null;
  await c.query('INSERT INTO credit_tx(user_id, amount, balance_after, kind, ref_id, note) VALUES($1,$2,$3,$4,$5,$6)', [uid, -amount, u.rows[0].credits, kind, refId || null, String(note || '').slice(0, 200)]);
  return u.rows[0].credits;
}
const adjust = (uid, amount, kind, note) => withTx(async (c) => {
  const u = await c.query('UPDATE users SET credits = credits + $2 WHERE id = $1 AND credits + $2 >= 0 RETURNING credits', [uid, amount]);
  if (!u.rowCount) return null;
  await c.query('INSERT INTO credit_tx(user_id, amount, balance_after, kind, note) VALUES($1,$2,$3,$4,$5)', [uid, amount, u.rows[0].credits, kind, String(note || '').slice(0, 200)]);
  return u.rows[0].credits;
});

/* Creditează o sesiune Stripe plătită. Idempotent: pagina de succes ȘI webhook-ul o pot apela, creditele intră o singură dată. */
async function fulfill(s) {
  if (!s || s.payment_status !== 'paid') return 'ignored';
  const pack = PRICING.packs[(s.metadata || {}).pack], uid = Number(s.client_reference_id);
  if (!pack || !uid || String(s.currency).toLowerCase() !== 'ron' || Number(s.amount_total) !== pack.lei * 100) { console.error('billing: sesiune ignorată', s.id); return 'ignored'; }
  return withTx(async (c) => {
    const u = await c.query('UPDATE users SET credits = credits + $2 WHERE id = $1 RETURNING credits', [uid, pack.credits]);
    if (!u.rowCount) return 'ignored';
    const t = await c.query(
      'INSERT INTO credit_tx(user_id, amount, balance_after, kind, note, amount_lei, stripe_session) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (stripe_session) WHERE stripe_session IS NOT NULL DO NOTHING RETURNING id',
      [uid, pack.credits, u.rows[0].credits, 'purchase', `Încărcare ${pack.lei} lei`, pack.lei, s.id]);
    if (!t.rowCount) throw Object.assign(new Error('dublura'), { dup: true });   // anulează creditarea dublă
    return 'credited';
  }).catch((e) => { if (e.dup) return 'duplicate'; throw e; });
}

async function webhook(req, res) {
  const secret = config.STRIPE_WEBHOOK_SECRET;
  if (!secret || !db.hasDb()) return res.status(503).json({ error: 'WEBHOOK_INDISPONIBIL' });
  if (!verifySig(req.body, req.get('stripe-signature'), secret)) return res.status(400).json({ error: 'SEMNATURA_INVALIDA' });
  let ev; try { ev = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: 'JSON_INVALID' }); }
  try {
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)) await fulfill(ev.data && ev.data.object);
    res.json({ received: true });
  } catch (e) { console.error('billing webhook:', e.message); res.status(500).json({ error: 'EROARE' }); }   // Stripe reîncearcă singur
}

const router = express.Router();
router.use(requireDb, requireAuth);
const checkoutAllow = createThrottle(10, 60 * 60 * 1000);

router.get('/me', ah(async (req, res) => {
  const [b, t] = await Promise.all([
    db.query('SELECT credits FROM users WHERE id = $1', [req.user.id]),
    db.query('SELECT id, amount, balance_after, kind, note, amount_lei, created_at FROM credit_tx WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [req.user.id])
  ]);
  res.set('Cache-Control', 'no-store').json({
    enabled: enabled(), stripe: stripeOn(), balance: (b.rows[0] || {}).credits || 0, tx: t.rows,
    pricing: {
      bump: { free_hours: freeBumpHours(), price: PRICING.bump.price },
      promo: Object.entries(PRICING.promo).map(([days, price]) => ({ days: Number(days), price })),
      packs: Object.entries(PRICING.packs).map(([key, p]) => ({ key, lei: p.lei, credits: p.credits, bonus: p.credits - p.lei })),
      plans: Object.entries(PRICING.plans).map(([key, price]) => ({ key, name: plans.PLANS[key].name, price, days: PRICING.plan_days }))
    }
  });
}));

router.post('/checkout', ah(async (req, res) => {
  if (!stripeOn()) return res.status(503).json({ error: 'PLATA_INDISPONIBILA' });
  if (!checkoutAllow('u' + req.user.id)) return res.status(429).json({ error: 'RATE_LIMIT' });
  const key = String((req.body || {}).pack || ''), pack = PRICING.packs[key];
  if (!pack) return res.status(400).json({ error: 'PACHET_INVALID' });
  try {
    const base = baseUrl(req);
    const s = await stripe('POST', '/checkout/sessions', {
      mode: 'payment', locale: 'ro', client_reference_id: req.user.id, customer_email: req.user.email || undefined,
      line_items: { 0: { quantity: 1, price_data: { currency: 'ron', unit_amount: pack.lei * 100, product_data: { name: `Omnivo — ${pack.credits} credite` } } } },
      metadata: { pack: key },
      success_url: base + '/api/billing/success?session_id={CHECKOUT_SESSION_ID}', cancel_url: base + '/?plata=anulat'
    });
    res.json({ url: s.url });
  } catch (e) { console.error('billing checkout:', e.message); res.status(502).json({ error: 'PLATA_INDISPONIBILA' }); }
}));

/* Stripe întoarce clientul aici: verificăm sesiunea direct la Stripe (nu avem încredere în adresa din browser). */
router.get('/success', ah(async (req, res) => {
  const sid = String(req.query.session_id || '').slice(0, 120), base = baseUrl(req);
  if (!stripeOn() || !/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.redirect(302, base + '/');
  let s; try { s = await stripe('GET', '/checkout/sessions/' + sid); } catch (e) { console.error('billing success:', e.message); return res.status(502).json({ error: 'PLATA_INDISPONIBILA' }); }
  if (s.payment_status !== 'paid') return res.redirect(302, base + '/?plata=anulat');
  if (String(s.client_reference_id) !== String(req.user.id)) return res.status(403).json({ error: 'SESIUNE_INVALIDA' });
  await fulfill(s);
  res.redirect(302, base + '/?plata=ok');
}));

/* Cumpără un plan de cont cu credite. Același plan activ = se prelungește; unul mai mare = începe acum; unul mai mic cât timp e activ unul mai mare = refuzat. */
router.post('/plan', ah(async (req, res) => {
  if (!enabled()) return res.status(503).json({ error: 'FACTURARE_INACTIVA' });
  const key = String((req.body || {}).plan || ''), price = PRICING.plans[key];
  if (!price) return res.status(400).json({ error: 'PLAN_INVALID' });
  const out = await withTx(async (c) => {
    const cur = (await c.query('SELECT plan, plan_until FROM users WHERE id = $1 FOR UPDATE', [req.user.id])).rows[0] || {};
    const now = plans.effective(cur);
    if (now !== 'basic' && !cur.plan_until) return { err: 'PLAN_FARA_EXPIRARE' };
    if (plans.ORDER.indexOf(key) < plans.ORDER.indexOf(now)) return { err: 'PLAN_MAI_MIC_ACTIV' };
    const bal = await spend(c, req.user.id, price, 'plan', null, `Plan ${plans.PLANS[key].name} · ${PRICING.plan_days} zile`);
    if (bal === null) return { err: 'CREDITE_INSUFICIENTE' };
    const r = await c.query("UPDATE users SET plan = $2, plan_until = (CASE WHEN $3 THEN plan_until ELSE NOW() END) + ($4 || ' days')::interval WHERE id = $1 RETURNING plan_until",
      [req.user.id, key, now === key, String(PRICING.plan_days)]);
    return { balance: bal, plan_until: r.rows[0].plan_until };
  });
  if (out.err) return res.status(out.err === 'CREDITE_INSUFICIENTE' ? 402 : 409).json({ error: out.err });
  res.json({ ok: true, ...out });
}));

module.exports = { router, webhook, enabled, stripeOn, freeBumpHours, withTx, spend, adjust, fulfill, verifySig, form, PRICING };
