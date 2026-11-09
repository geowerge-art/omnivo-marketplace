/* Completare automată a atributelor (marcă, model, an, km, memorie…) din titlul anunțului. */
(function (root) {
  const fold = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  /* [nume afișat, [alias-uri], păstrează aliasul în model?] */
  const B = (n, a, keep) => [n, a || [fold(n)], !!keep];
  const BRANDS = [
    B("Apple", ["apple"]), B("Apple", ["iphone", "ipad", "macbook", "airpods", "imac"], true),
    B("Samsung"), B("Xiaomi", ["xiaomi", "redmi", "poco"]), B("Huawei"), B("Honor"), B("Oppo"), B("OnePlus"), B("Realme"), B("Motorola"), B("Nokia"),
    B("Google", ["google"]), B("Google", ["pixel"], true), B("Sony"), B("Asus"), B("Lenovo"), B("HP"), B("Dell"), B("Acer"), B("MSI"), B("LG"), B("Philips"), B("Panasonic"),
    B("Dacia"), B("Volkswagen", ["volkswagen", "vw"]), B("BMW"), B("Audi"), B("Mercedes-Benz", ["mercedes", "mercedes benz", "mercedes-benz"]), B("Opel"), B("Ford"), B("Skoda"), B("Renault"),
    B("Toyota"), B("Peugeot"), B("Citroen"), B("Fiat"), B("Hyundai"), B("Kia"), B("Nissan"), B("Mazda"), B("Honda"), B("Suzuki"), B("Volvo"), B("Seat"), B("Mini"), B("Jeep"),
    B("Land Rover", ["land rover", "range rover"]), B("Porsche"), B("Tesla"), B("Chevrolet"), B("Mitsubishi"), B("Lexus"), B("Alfa Romeo", ["alfa romeo", "alfa"]), B("Jaguar"), B("Lada"), B("Cupra"), B("Smart"),
    B("Yamaha"), B("Kawasaki"), B("Ducati"), B("Harley-Davidson", ["harley davidson", "harley-davidson", "harley"]), B("KTM"), B("Piaggio"), B("Vespa"),
    B("Nike"), B("Adidas"), B("Puma"), B("Zara"), B("H&M", ["h&m"]), B("Levi's", ["levis", "levi's", "levi"]), B("Reebok"), B("New Balance", ["new balance"]), B("Converse"),
    B("Tommy Hilfiger", ["tommy hilfiger", "tommy"]), B("Calvin Klein", ["calvin klein"]), B("Lacoste"), B("Ralph Lauren", ["ralph lauren"]), B("Gucci"), B("The North Face", ["north face", "the north face"]), B("Under Armour", ["under armour"]),
    B("Bosch"), B("Whirlpool"), B("Arctic"), B("Beko"), B("Electrolux"), B("Gorenje"), B("Zanussi"), B("Indesit"), B("Candy"), B("Daewoo"), B("Samsung"),
    B("Makita"), B("DeWalt", ["dewalt"]), B("Stihl"), B("Husqvarna"), B("Einhell"), B("Hilti"), B("Black+Decker", ["black+decker", "black decker"]), B("Karcher", ["karcher"]),
    B("Trek"), B("Giant"), B("Scott"), B("Cube"), B("Specialized"), B("Cannondale"), B("Pegas"), B("Carpat"),
    B("Sony", ["playstation", "ps5", "ps4"], false), B("Microsoft", ["xbox", "microsoft"]), B("Nintendo", ["nintendo", "switch"]),
    B("Chicco"), B("LEGO", ["lego"]), B("Fisher-Price", ["fisher price", "fisher-price"]), B("Cybex"), B("Maxi-Cosi", ["maxi cosi", "maxi-cosi"]), B("IKEA", ["ikea"])
  ];
  const CONT = new Set(["pro", "max", "plus", "ultra", "mini", "lite", "se", "air", "fe", "note", "galaxy", "turbo", "sport", "gt", "gti", "gtd", "tdi", "xl", "neo", "prime", "edge", "fold", "flip", "classic", "active", "cross", "city"]);
  const COLORS = { negru: "Negru", alb: "Alb", rosu: "Roșu", albastru: "Albastru", verde: "Verde", gri: "Gri", argintiu: "Argintiu", auriu: "Auriu", galben: "Galben", maro: "Maro", roz: "Roz", mov: "Mov", portocaliu: "Portocaliu", bej: "Bej" };
  const MATERIAL = { lemn: "Lemn", piele: "Piele", textil: "Textil", metal: "Metal", plastic: "Plastic", sticla: "Sticlă", catifea: "Catifea" };
  const year = (y) => y >= 1950 && y <= new Date().getFullYear() + 1;

  function findBrand(toks) {
    let best = null;
    for (const [name, aliases, keep] of BRANDS) for (const al of aliases) {
      const w = al.split(" ");
      for (let i = 0; i + w.length <= toks.length; i++) {
        if (w.every((x, j) => toks[i + j] === x) && (!best || i < best.i)) best = { name, i, len: w.length, keep };
      }
    }
    return best;
  }
  function pickModel(rawToks, toks, b) {
    const start = b.keep ? b.i : b.i + b.len;
    const out = [];
    for (let k = start; k < rawToks.length && out.length < 4; k++) {
      const t = toks[k], r = rawToks[k];
      if (!t || /^(19|20)\d\d$/.test(t) || /^\d+(gb|tb|mb|km|cmc|cp|hp)$/.test(t) || /^\d+[.,]\d+$/.test(t)) break;
      if (out.length === 0) { if (/^[a-z0-9\-]{1,}$/.test(t)) out.push(r); else break; continue; }
      if (CONT.has(t) || /^\d{1,3}$/.test(t) || /^[a-z]\d{1,3}[a-z]?$/.test(t)) out.push(r); else break;
    }
    return out.join(" ");
  }
  const opt = (def, v) => (def.options || []).find((o) => fold(o) === fold(v));

  /* defs: [{key,type,options}] ; întoarce { cheie: valoare } doar pentru ce s-a putut deduce */
  function autofillAttrs(title, defs) {
    const res = {}, has = (k) => defs.find((d) => d.key === k), d = (k) => has(k);
    let s = String(title || "").replace(/\s+/g, " ").trim(); if (s.length < 3) return res;
    const f = fold(s);
    // an
    let rest = s;
    const ym = f.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
    if (ym && year(+ym[1])) { if (d("an")) res.an = +ym[1]; rest = rest.replace(ym[1], " "); }
    // km
    const km = f.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)\s?(mii\s?km|k\s?km|km)\b/);
    if (km && d("km")) { let n = +km[1].replace(/[.,]/g, ""); if (/^mii|^k\s?km/.test(km[2])) n *= 1000; res.km = n; }
    if (km) rest = rest.replace(new RegExp(km[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
    // memorie / ram / stocare
    const mem = [...f.matchAll(/\b(\d{1,4})\s?(gb|tb)\b/g)].map((m) => ({ v: m[2] === "tb" ? +m[1] * 1024 : +m[1], txt: m[1] + m[2].toUpperCase() }));
    rest = rest.replace(/\b\d{1,4}\s?(gb|tb)\b/gi, " ");
    if (mem.length) {
      if (d("memorie")) { const o = opt(d("memorie"), mem[0].txt); if (o) res.memorie = o; }
      if (d("ram") && d("stocare")) {
        const ram = mem.find((m) => m.v <= 64 && opt(d("ram"), m.txt)), st = mem.find((m) => m.v >= 128 && opt(d("stocare"), m.txt));
        if (ram) res.ram = opt(d("ram"), ram.txt); if (st) res.stocare = opt(d("stocare"), st.txt);
      }
    }
    // marca + model
    const raw = rest.split(/[\s,;/()|]+/).filter(Boolean), toks = raw.map(fold);
    const b = findBrand(toks);
    if (b) {
      if (d("marca")) res.marca = b.name;
      if (d("model")) { const m = pickModel(raw, toks, b); if (m) res.model = m; }
    }
    // auto
    if (d("combustibil")) {
      const c = /\b(motorina|diesel|tdi|dci|cdi|hdi|crdi|jtd)\b/.test(f) ? "Motorină" : /\bgpl\b/.test(f) ? "GPL" : /\b(hibrid|hybrid|phev)\b/.test(f) ? "Hibrid" : /\belectric(a)?\b|\bev\b/.test(f) ? "Electric" : /\b(benzina|tsi|tfsi|mpi)\b/.test(f) ? "Benzină" : "";
      if (c && opt(d("combustibil"), c)) res.combustibil = c;
    }
    if (d("cutie")) { if (/\b(automata|automat|dsg|tiptronic|s-?tronic)\b/.test(f)) res.cutie = "Automată"; else if (/\bmanuala\b/.test(f)) res.cutie = "Manuală"; }
    if (d("caroserie")) {
      const m = f.match(/\b(break|combi|sedan|berlina|suv|hatchback|coupe|cabrio|cabriolet|monovolum|van|duba)\b/);
      if (m) { const map = { combi: "Break", sedan: "Berlină", cabriolet: "Cabrio", van: "Duba" }; const v = map[m[1]] || m[1]; const o = opt(d("caroserie"), v); if (o) res.caroserie = o; }
    }
    if (d("capacitate")) { const m = f.match(/\b(\d)[.,](\d)\b/); if (m && +m[1] <= 8) res.capacitate = +(m[1] + m[2]) * 100; const c = f.match(/\b(\d{3,4})\s?(cmc|cc)\b/); if (c) res.capacitate = +c[1]; }
    if (d("putere")) { const m = f.match(/\b(\d{2,3})\s?(cp|hp)\b/); if (m) res.putere = +m[1]; }
    // electronice
    if (d("diagonala")) { const m = f.match(/\b(\d{2,3})\s?("|inch|inci|'')/); if (m) res.diagonala = +m[1]; }
    if (d("procesor")) { const m = s.match(/\b(i[3579]-?\d{4,5}[A-Za-z]{0,2}|ryzen\s?[3579]\s?\d{4}[A-Za-z]{0,2}|M[1-4](?:\s?(?:Pro|Max|Ultra))?)\b/); if (m) res.procesor = m[1]; }
    if (d("platforma") && d("platforma").options) {
      const p = /\bps5|playstation ?5\b/.test(f) ? "PlayStation 5" : /\bps4|playstation ?4\b/.test(f) ? "PlayStation 4" : /xbox series/.test(f) ? "Xbox Series" : /xbox one/.test(f) ? "Xbox One" : /\bswitch\b/.test(f) ? "Nintendo Switch" : "";
      if (p) res.platforma = p;
    }
    if (d("clasa_energetica")) { const m = f.match(/\bclasa\s?([a-g])\b/); if (m) res.clasa_energetica = m[1].toUpperCase(); }
    if (d("alimentare")) { const v = /\b(acumulator|baterie|fara fir)\b/.test(f) ? "Acumulator" : /\bbenzina\b/.test(f) ? "Benzină" : /\belectric(a)?\b/.test(f) ? "Electric" : ""; if (v) res.alimentare = v; }
    // modă
    if (d("gen")) { const v = /\b(femei|dama|dame|femeie|fete)\b/.test(f) ? "Femei" : /\b(barbati|barbat|baieti)\b/.test(f) ? "Bărbați" : /\b(copii|copil|kids)\b/.test(f) ? "Copii" : ""; if (v) res.gen = v; }
    if (d("marime")) {
      const m = f.match(/\b(?:marime[a]?|nr\.?|numarul|masura)\s*:?\s*([a-z0-9]{1,4})\b/);
      const u = s.match(/(?:^|\s)(XXS|XS|S|M|L|XL|XXL|XXXL)(?=\s|$|,)/);
      if (m) res.marime = m[1].toUpperCase(); else if (u) res.marime = u[1];
    }
    if (d("culoare")) { for (const w of f.split(/[^a-z]+/)) if (COLORS[w]) { res.culoare = COLORS[w]; break; } }
    if (d("material")) { for (const w of f.split(/[^a-z]+/)) if (MATERIAL[w]) { res.material = MATERIAL[w]; break; } }
    if (d("tip") && d("tip").options) {
      const t = /\b(mtb|mountain)\b/.test(f) ? "Mountain bike" : /\belectrica\b/.test(f) ? "Electrică" : /\btrotineta\b/.test(f) ? "Trotinetă" : /\bsosea\b/.test(f) ? "Șosea" : /\b(copii|copil)\b/.test(f) ? "Copii" : "";
      if (t && opt(d("tip"), t)) res.tip = t;
    }
    return res;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { autofillAttrs };
  root.autofillAttrs = autofillAttrs;
})(typeof window !== "undefined" ? window : globalThis);
