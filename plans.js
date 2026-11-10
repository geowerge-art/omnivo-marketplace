/* Nivelurile contului. Singurul loc unde se schimbă cifrele: tabelul PLANS de mai jos.
   Planul se acordă din panoul de admin (cu sau fără dată de expirare). Fără plan activ, contul e Basic. */
const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth } = require('./authmw');

const ORDER = ['basic', 'standard', 'silver', 'gold', 'titanium'];
const PLANS = {
  basic:    { name: 'Basic',    listings: 10,  promos: 1,  stats_days: 7,  export: false },
  standard: { name: 'Standard', listings: 25,  promos: 2,  stats_days: 28, export: false },
  silver:   { name: 'Silver',   listings: 60,  promos: 3,  stats_days: 28, export: false },
  gold:     { name: 'Gold',     listings: 150, promos: 5,  stats_days: 90, export: false },
  titanium: { name: 'Titanium', listings: 500, promos: 10, stats_days: 90, export: true }
};

/* planul real al unui rând de utilizator (cu plan și plan_until): expirat = Basic */
function effective(u) {
  const k = u && PLANS[u.plan] ? u.plan : 'basic';
  if (k !== 'basic' && u.plan_until && new Date(u.plan_until).getTime() <= Date.now()) return 'basic';
  return k;
}
const limitsOf = (u) => PLANS[effective(u)];
/* cel mai mic plan care permite o perioadă de statistici de `days` zile */
const minPlanForDays = (days) => ORDER.find((k) => PLANS[k].stats_days >= days) || 'titanium';

const router = express.Router();
router.use(requireDb, requireAuth);

router.get('/me', ah(async (req, res) => {
  const u = (await db.query('SELECT plan, plan_until FROM users WHERE id = $1', [req.user.id])).rows[0] || {};
  const key = effective(u);
  const [l, p] = await Promise.all([
    db.query("SELECT COUNT(*)::int n FROM listings WHERE user_id = $1 AND status IN ('pending','approved') AND expires_at > NOW()", [req.user.id]),
    db.query('SELECT COUNT(*)::int n FROM listings WHERE user_id = $1 AND promoted_until > NOW()', [req.user.id])
  ]);
  res.set('Cache-Control', 'no-store').json({
    plan: key, plan_until: key === 'basic' ? null : u.plan_until || null,
    usage: { listings: l.rows[0].n, promos: p.rows[0].n },
    plans: ORDER.map((k) => ({ key: k, ...PLANS[k] }))
  });
}));

module.exports = { router, PLANS, ORDER, effective, limitsOf, minPlanForDays };
