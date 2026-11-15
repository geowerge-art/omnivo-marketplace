/* Potrivirea schimburilor. Fără rețea, fără bază de date, fără pachete: doar funcții pure (testate în swap.test.js).
   Un „schimb” = un anunț (title) + ce caută proprietarul în loc (wants).
   - potrivire directă:  eu caut ce are el, iar el caută ce am eu (sau cel puțin eu caut ce are el);
   - lanț de 3: A caută ce are B, B caută ce are C, C caută ce are A. Nimeni nu se potrivește direct cu altcineva, dar în trei se poate. */
const STOP = new Set(['sau', 'si', 'cu', 'de', 'din', 'la', 'in', 'pe', 'un', 'una', 'unei', 'unui', 'o', 'ori', 'cam', 'mai', 'pentru', 'fara', 'vreau', 'caut', 'schimb', 'doar', 'bun', 'buna', 'bune', 'stare', 'noua', 'nou', 'second', 'hand']);
const THRESH = 0.6;   // cât din ce caută trebuie să apară în titlul celuilalt

const fold = (t) => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/* Cuvinte-cheie: fără diacritice, fără cuvinte de legătură; cuvintele lungi se taie la 5 litere (telefon / telefoane / telefonul → „telef”). */
function tokens(text) {
  const out = [];
  for (const w of fold(text).split(/[^a-z0-9]+/)) {
    if (!w || STOP.has(w)) continue;
    const hasDigit = /\d/.test(w);
    if (w.length < 3 && !hasDigit) continue;
    const t = !hasDigit && w.length > 5 ? w.slice(0, 5) : w;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}
/* Cât din ce caută (wantTokens) se găsește în titlu (titleTokens): 0..1. */
function fit(wantTokens, titleTokens) {
  if (!wantTokens.length || !titleTokens.length) return 0;
  const set = new Set(titleTokens);
  let n = 0; for (const t of wantTokens) if (set.has(t)) n++;
  return n / wantTokens.length;
}
const wantsScore = (wants, title) => fit(tokens(wants), tokens(title));
const ok = (s) => s >= THRESH;

/* Potrivire dublă între două anunțuri la schimb: fiecare caută ce are celălalt. */
const mutual = (a, b) => a.user_id !== b.user_id && ok(wantsScore(a.wants, b.title)) && ok(wantsScore(b.wants, a.title));

const prep = (x) => ({ ...x, _w: tokens(x.wants), _t: tokens(x.title) });

/* mine, others: liste de { id, user_id, title, wants, ... }. Întoarce { direct, chains }.
   direct: [{ mine, other, fwd, back, both }] — fwd: ce are EL se potrivește cu ce caut EU; back: ce am EU se potrivește cu ce caută EL; both = ambele.
   chains: [{ mine, b, c }] — eu primesc de la b, b primește de la c, c primește de la mine. */
function matchAll(mineIn, othersIn, { maxDirect = 20, maxChains = 10 } = {}) {
  const mine = mineIn.map(prep), others = othersIn.map(prep);
  const direct = [], chains = [];
  for (const a of mine) {
    const seen = new Set();
    for (const b of others) {
      if (b.user_id === a.user_id) continue;
      const fwd = fit(a._w, b._t);
      if (!ok(fwd)) continue;
      const back = fit(b._w, a._t);
      direct.push({ mine: a, other: b, fwd, back, both: ok(back) });
      if (ok(back)) continue;   // potrivire dublă: nu mai are rost un lanț prin el
      for (const c of others) {
        if (c.user_id === a.user_id || c.user_id === b.user_id) continue;
        if (!ok(fit(b._w, c._t)) || !ok(fit(c._w, a._t))) continue;
        const key = `${a.id}:${b.id}:${c.id}`;
        if (!seen.has(key)) { seen.add(key); chains.push({ mine: a, b, c, score: fwd + fit(b._w, c._t) + fit(c._w, a._t) }); }
      }
    }
  }
  direct.sort((x, y) => (y.both - x.both) || ((y.fwd + y.back) - (x.fwd + x.back)));
  chains.sort((x, y) => y.score - x.score);
  const strip = (o) => { const { _w, _t, ...r } = o; return r; };
  return {
    direct: direct.slice(0, maxDirect).map((d) => ({ mine: strip(d.mine), other: strip(d.other), fwd: d.fwd, back: d.back, both: d.both })),
    chains: chains.slice(0, maxChains).map((c) => ({ mine: strip(c.mine), b: strip(c.b), c: strip(c.c) }))
  };
}

const CONTACT_RE = /(https?:|www\.|@|\d[\d\s().-]{6,}\d)/i;
function validWants(v) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (s.length < 3 || s.length > 120) return { error: 'CE_CAUTI_INVALID' };
  if (CONTACT_RE.test(s)) return { error: 'FARA_CONTACT_IN_SCHIMB' };
  if (!tokens(s).length) return { error: 'CE_CAUTI_INVALID' };
  return { v: s };
}

module.exports = { tokens, fit, wantsScore, matchAll, validWants, mutual, THRESH };
