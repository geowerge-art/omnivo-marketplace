/* Preț sugerat pentru un anunț nou: din anunțurile asemănătoare deja publicate (aceeași categorie și monedă). Funcții pure, testate în price-hint.test.js.
   Nu e o evaluare: e un interval (sfertul de jos și cel de sus) și mediana, ca vânzătorul să nu pună un preț complet pe lângă. */
const { tokens, titleTokens, fit } = require('./swap-match');

const MIN_SIMILAR = 5, MIN_CATEGORY = 8;   // câte anunțuri trebuie să existe ca să avem curajul să răspundem

const pct = (sorted, p) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
/* rotunjire la o treaptă „omenească”: 500 → 10, 5.000 → 50, 50.000 → 500 */
const nice = (x) => { const step = x < 100 ? 5 : x < 1000 ? 10 : x < 10000 ? 50 : 500; return Math.max(step, Math.round(x / step) * step); };

/* rows: [{ title, price, condition }]; întoarce { n, low, mid, high, scope } sau null */
function suggest(rows, title, condition) {
  const clean = rows.filter((r) => Number(r.price) > 0);
  const t = tokens(title);
  let pool = clean, scope = 'category', min = MIN_CATEGORY;
  if (t.length) {
    const similar = clean.filter((r) => fit(t, titleTokens(r.title)) >= 0.6);
    if (similar.length >= MIN_SIMILAR) { pool = similar; scope = 'similar'; min = MIN_SIMILAR; }
  }
  if (condition) { const same = pool.filter((r) => r.condition === condition); if (same.length >= min) pool = same; }
  if (pool.length < min) return null;
  const v = pool.map((r) => Number(r.price)).sort((a, b) => a - b);
  return { n: v.length, low: nice(pct(v, 0.25)), mid: nice(pct(v, 0.5)), high: nice(pct(v, 0.75)), scope };
}

module.exports = { suggest, nice, pct, MIN_SIMILAR, MIN_CATEGORY };
