/* Omni (varianta fără AI plătit): înțelege o căutare scrisă liber.
   „audi a4 sub 8000 € în Timiș” -> text „audi a4”, preț maxim 8000 EUR, județ Timiș.
   Funcție pură: OmniParse.parse(text, { counties, cities, skipPrice, skipLocation }).
   Fără lookbehind (merge și pe telefoane mai vechi). Se testează cu omni.test.js. */
(function (root) {
  "use strict";

  // literă simplă, 1 la 1 (lungimea rămâne aceeași, ca să putem tăia din textul original); „-” devine spațiu
  const foldC = (s) => {
    s = String(s == null ? "" : s); let o = "";
    for (let i = 0; i < s.length; i++) { const c = s[i]; o += (((c.normalize("NFD")[0] || c).toLowerCase())[0]) || " "; }
    return o.replace(/-/g, " ").replace(/\s/g, " ");
  };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const UNIT = "km|cp|cmc|mp|gb|tb|inch|inci|cm|mm|kg|ani|an|camere|cam|kw|w|l|litri|buc|ore|mc|ha|m|g|ml";
  const NUM = "(\\d{1,3}(?:[. ]\\d{3})+|\\d+(?:[.,]\\d+)?)(?!\\d)";
  const SUF = "(?:\\s?(k|mii|mie)(?![a-z]))?";
  const CUR = "(?:\\s?(€|euro|eur|ron|lei|leu)(?![a-z]))?";
  const AMT = NUM + SUF + CUR + "(?!\\s?(?:" + UNIT + ")(?![a-z]))";
  const MAX_T = "(?:sub|pana\\s+la|pana\\s+in|maxim(?:um)?|max\\.?|cel\\s+mult|buget(?:ul)?(?:\\s+de)?|<=?|mai\\s+ieftin\\s+de|mai\\s+putin\\s+de)";
  const MIN_T = "(?:peste|minim(?:um)?|min\\.?|cel\\s+putin|mai\\s+mult\\s+de|mai\\s+scump\\s+de|>=?)";
  const RE_RANGE = new RegExp("(^|[^a-z0-9])(?:intre|de\\s+la)\\s+" + AMT + "\\s+(?:si|pana\\s+la|pana\\s+in|la)\\s+" + AMT + "(?![a-z0-9])");
  const RE_MAX = new RegExp("(^|[^a-z0-9])" + MAX_T + "\\s*" + AMT + "(?![a-z0-9])");
  const RE_MIN = new RegExp("(^|[^a-z0-9])" + MIN_T + "\\s*" + AMT + "(?![a-z0-9])");

  // cuvinte care sunt și nume de localitate: se iau ca loc doar după „în / din / la / jud.”
  const AMBIG = new Set(["alba", "roman", "victoria", "vulcan", "bals", "mare", "ocna", "dej", "cugir"]);

  function toNum(n, suf) {
    let v = /^\d{1,3}([. ]\d{3})+$/.test(n) ? Number(n.replace(/[. ]/g, "")) : Number(n.replace(",", "."));
    if (suf) v *= 1000;
    return Math.round(v);
  }
  const curOf = (c) => (!c ? "" : /^(€|euro|eur)$/.test(c) ? "EUR" : "RON");
  const okAmt = (v, cur) => Number.isFinite(v) && v > 0 && v <= 100000000 && (cur || v >= 10);

  let cache = null;
  function dict(counties, cities) {
    if (cache && cache.c === counties && cache.t === cities) return cache;
    const map = new Map();
    const add = (name, county, city) => { const k = foldC(name).replace(/\s+/g, " ").trim(); if (k && !map.has(k)) map.set(k, { county, city }); };
    (counties || []).forEach((c) => add(c, c, ""));
    for (const county of Object.keys(cities || {})) (cities[county] || []).forEach((c) => add(c, county, foldC(c).trim() === foldC(county).trim() ? "" : c));
    const keys = Array.from(map.keys()).sort((a, b) => b.length - a.length);
    const alt = keys.map((k) => esc(k).replace(/ /g, "\\s+")).join("|");
    cache = {
      c: counties, t: cities, map,
      reTrig: alt ? new RegExp("(^|[^a-z0-9])(?:in|din|la|langa|zona|judetul|judet|jud)\\.?\\s+(?:judetul\\s+|judet\\s+|jud\\.?\\s+)?(" + alt + ")(?![a-z0-9])") : null,
      reBare: alt ? new RegExp("(^|[^a-z0-9])(" + alt + ")(?![a-z0-9])", "g") : null
    };
    return cache;
  }

  function parse(text, opts) {
    opts = opts || {};
    const orig = String(text == null ? "" : text);
    let f = foldC(orig);
    const cuts = [];
    const take = (m, pre) => {
      const a = m.index + pre.length, b = m.index + m[0].length;
      cuts.push([a, b]); f = f.slice(0, a) + " ".repeat(b - a) + f.slice(b);
    };
    const out = { q: orig.trim(), min: "", max: "", currency: "", county: "", city: "", changed: false };

    if (!opts.skipPrice) {
      let m = RE_RANGE.exec(f);
      if (m) {
        const a = toNum(m[2], m[3]), ca = curOf(m[4]), b = toNum(m[5], m[6]), cb = curOf(m[7]), cur = ca || cb;
        if (okAmt(a, cur) && okAmt(b, cur)) { out.min = String(Math.min(a, b)); out.max = String(Math.max(a, b)); out.currency = cur; take(m, m[1]); }
      }
      if (!out.max) {
        m = RE_MAX.exec(f);
        if (m) { const v = toNum(m[2], m[3]), c = curOf(m[4]); if (okAmt(v, c)) { out.max = String(v); out.currency = out.currency || c; take(m, m[1]); } }
      }
      if (!out.min) {
        m = RE_MIN.exec(f);
        if (m) {
          const v = toNum(m[2], m[3]), c = curOf(m[4]);
          const isYear = !c && v >= 1950 && v <= 2035;   // „peste 2010” e anul, nu prețul
          if (okAmt(v, c) && !isYear) { out.min = String(v); out.currency = out.currency || c; take(m, m[1]); }
        }
      }
      if (out.min && out.max && Number(out.min) > Number(out.max)) { const t = out.min; out.min = out.max; out.max = t; }
    }

    if (!opts.skipLocation) {
      const d = dict(opts.counties, opts.cities);
      let hit = null;
      if (d.reTrig) { const m = d.reTrig.exec(f); if (m) { hit = { m, pre: m[1], key: m[2].replace(/\s+/g, " ") }; } }
      if (!hit && d.reBare) {
        d.reBare.lastIndex = 0; let m;
        while ((m = d.reBare.exec(f))) {
          const key = m[2].replace(/\s+/g, " "), a = m.index + m[1].length, b = m.index + m[0].length;
          const atEdge = !f.slice(0, a).trim() || !f.slice(b).trim();
          const rest = f.slice(0, a) + " " + f.slice(b);
          const inf = d.map.get(key), long = key.length >= 5 || (inf && inf.city === "" && key.length >= 3);   // județele scurte (Cluj, Arad, Iași) merg și singure
          if (long && !AMBIG.has(key) && atEdge && /[a-z0-9]/.test(rest)) { hit = { m, pre: m[1], key }; break; }
          if (m[0].length === 0) d.reBare.lastIndex++;
        }
      }
      const info = hit && d.map.get(hit.key);
      if (info) { out.county = info.county; out.city = info.city; take(hit.m, hit.pre); }
    }

    if (cuts.length) {
      let s = orig;
      cuts.sort((x, y) => y[0] - x[0]).forEach(([a, b]) => { s = s.slice(0, a) + " " + s.slice(b); });
      s = s.replace(/\s+/g, " ").trim();
      const LINK = "(?:si|și|sau|cu|de|in|în|din|la|pe)";
      s = s.replace(new RegExp("^(?:" + LINK + "\\s+)+", "i"), "").replace(new RegExp("(?:\\s+" + LINK + ")+$", "i"), "");
      s = s.replace(/^[\s,;.\-–]+|[\s,;.\-–]+$/g, "");
      out.q = s; out.changed = true;
    }
    return out;
  }

  const api = { parse };
  root.OmniParse = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
