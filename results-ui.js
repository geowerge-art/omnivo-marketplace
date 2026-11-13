/* Pagina de rezultate Omnivo.
   Se deschide la o căutare sau când alegi o categorie, pe adresa /cauta?q=...&category=...
   Filtrele (județ, țară, preț, stare, marcă, an, rulaj...) se adaptează la categoria aleasă.
   Folosește din script.js: api, cats, loadCats, me, favBtn, price, openDetail, trackInterest, fold, COUNTIES,
   icon, showMessage, openAuth, errText, spSave, baseTitle. */
(function () {
  "use strict";
  if (window.Results) return;

  const COUNTRIES = ["România", "Republica Moldova", "Germania", "Italia", "Spania", "Franța", "Austria", "Ungaria", "Regatul Unit"];
  const SORTS = [["", "Oferte pentru tine"], ["new", "Noi"], ["price_asc", "Ieftine"], ["price_desc", "Scumpe"]];
  const VIEWS = [["gallery", "Galerie"], ["list", "Listă"], ["grid", "Tabel"]];
  const SELLERS = [["", "Vezi toate"], ["firma", "Firmă"], ["persoana", "Privat"]];
  /* ordinea filtrelor pe atribute (ce nu e aici vine după, în ordinea din baza de date) */
  const ATTR_ORDER = ["marca", "model", "caroserie", "tip", "categorie_piesa", "cod_piesa", "an", "km", "combustibil", "cutie", "capacitate", "putere", "norma",
    "culoare", "volan", "memorie", "ram", "procesor", "stocare", "placa_video", "diagonala", "rezolutie", "smart", "platforma", "gen", "marime", "roata", "varsta", "material", "alimentare", "clasa_energetica", "tarif"];
  const ATTR_LABEL = { km: "Rulaj (km)", an: "An de fabricație", capacitate: "Capacitate motor (cmc)", putere: "Putere (CP)", marca: "Marcă", model: "Model" };
  const HIDE = { "piese-auto": ["km"] };                       // atribute fără sens la categoria respectivă
  /* ce arătăm pe card, în ordinea asta (primele 4 care există) */
  const SPEC_ORDER = ["an", "km", "combustibil", "cutie", "capacitate", "putere", "memorie", "ram", "stocare", "procesor", "diagonala", "platforma", "marime", "gen", "marca", "material", "culoare", "tip", "categorie_piesa", "alimentare", "varsta", "clasa_energetica"];
  const SPEC_FMT = {
    km: (v) => fmtN(v) + " km", capacitate: (v) => fmtN(v) + " cmc", putere: (v) => fmtN(v) + " CP",
    diagonala: (v) => v + "\"", clasa_energetica: (v) => "Clasa " + v, an: (v) => String(v)
  };
  const REC_PLACES = "omnivoRecentPlaces", VIEW_KEY = "omnivoResultsView";

  /* ---------- mici utilitare ---------- */
  const fmtN = (n) => Number(n).toLocaleString("ro-RO");
  const svg = (d, sz = 22, sw = 2) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
  const P = {
    back: '<path d="M15 5l-7 7 7 7"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.6 15.6L21 21"/>',
    heart: '<path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 4.8 6.9 4.8c1.9 0 3.5 1 5.1 3 1.6-2 3.2-3 5.1-3 3.3 0 5.2 3.2 4.1 6.4-1.7 4.7-9.2 9.3-9.2 9.3z"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    chevD: '<path d="M6 9l6 6 6-6"/>', chevR: '<path d="M9 5l7 7-7 7"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    sort: '<path d="M8 4v16M8 4L4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5"/>',
    gallery: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.8" cy="6" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="18" r="1"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    camera: '<path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.3"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" fill="currentColor"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };

  /* creează un element: h("div", { class, text, onclick, ... }, ...copii). `html` doar pentru pictograme proprii. */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c !== undefined && c !== null && c !== false) e.append(c);
    return e;
  }
  const ico = (d, sz, sw) => h("span", { class: "rs-i", html: svg(d, sz, sw) });
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fără stocare */ } };
  const nRez = (n) => { const m = n % 100; return n === 1 ? "1 rezultat" : (n === 0 || (m >= 1 && m <= 19)) ? `${fmtN(n)} rezultate` : `${fmtN(n)} de rezultate`; };
  const clean = (v) => String(v == null ? "" : v).trim();
  const num = (v) => String(v).replace(/[^\d.,]/g, "").replace(",", ".").slice(0, 10);

  /* ---------- starea căutării ---------- */
  const blank = () => ({ q: "", category: "", country: "", county: "", city: "", min: "", max: "", currency: "", condition: "", seller: "", sort: "", attrs: {} });
  const copy = (s) => ({ ...s, attrs: { ...s.attrs } });
  let S = blank();                      // căutarea aplicată
  let view = VIEWS.some(([k]) => k === lsGet(VIEW_KEY, "")) ? lsGet(VIEW_KEY, "") : "gallery";
  let items = [], total = 0, offset = 0, busy = false, seq = 0, pushed = false, isOpen = false, built = false;

  function toQuery(st) {
    const p = new URLSearchParams();
    const put = (k, v) => { if (clean(v)) p.set(k, clean(v)); };
    put("q", st.q); put("category", st.category); put("country", st.country); put("county", st.county); put("city", st.city);
    put("min", st.min); put("max", st.max);
    if (clean(st.min) || clean(st.max)) put("currency", st.currency || defCurrency(st.category));
    put("condition", st.condition); put("seller", st.seller); put("sort", st.sort);
    if (st.category) for (const [k, v] of Object.entries(st.attrs)) put(k, v);   // atributele au sens doar într-o categorie
    return p;
  }
  function fromQuery(search) {
    const p = new URLSearchParams(search), st = blank();
    for (const k of ["q", "category", "country", "county", "city", "min", "max"]) st[k] = clean(p.get(k)).slice(0, 100);
    st.currency = ["RON", "EUR"].includes(p.get("currency")) ? p.get("currency") : "";
    st.condition = ["nou", "folosit"].includes(p.get("condition")) ? p.get("condition") : "";
    st.seller = ["firma", "persoana"].includes(p.get("seller")) ? p.get("seller") : "";
    st.sort = ["new", "price_asc", "price_desc"].includes(p.get("sort")) ? p.get("sort") : "";
    for (const [k, v] of p) if (/^a_[a-z0-9_]{1,40}$/.test(k) && clean(v)) st.attrs[k] = clean(v).slice(0, 80);
    return st;
  }
  const hasFilters = (st) => !!(st.q || st.category || st.county || st.city || st.country || st.min || st.max || st.condition || st.seller || Object.keys(st.attrs).length);

  /* ---------- categorii ---------- */
  function node(slug) {
    for (const c of cats) { if (c.slug === slug) return { n: c, parent: null }; for (const k of c.children || []) if (k.slug === slug) return { n: k, parent: c }; }
    return null;
  }
  const rootSlug = (slug) => { const f = node(slug); return f ? (f.parent ? f.parent.slug : f.n.slug) : ""; };
  const defCurrency = (slug) => (rootSlug(slug) === "auto-moto" ? "EUR" : "RON");
  const rank = (k) => { const i = ATTR_ORDER.indexOf(k); return i < 0 ? 100 : i; };
  function defsFor(slug) {
    const f = node(slug); if (!f) return [];
    const seen = new Set(), out = [];
    for (const a of [...(f.parent ? f.parent.attributes : []), ...f.n.attributes]) {
      if (!a.filterable || seen.has(a.key) || (HIDE[slug] || []).includes(a.key)) continue;
      seen.add(a.key); out.push(a);
    }
    return out.sort((a, b) => rank(a.key) - rank(b.key));
  }
  const catPath = (slug) => { const f = node(slug); return f ? (f.parent ? `${f.parent.name} / ${f.n.name}` : f.n.name) : ""; };
  const condLabel = (slug) => (slug === "piese-auto" ? "Second-hand" : "Folosit");
  async function ensureCats() {
    if (cats.length) return;
    for (let i = 0; i < 20 && !cats.length; i++) await new Promise((r) => setTimeout(r, 150));   // așteaptă încărcarea de pornire
    if (!cats.length) await loadCats();
  }

  /* ---------- rezumate pentru card ---------- */
  function specText(l) {
    const a = l.attributes || {}, out = [];
    for (const k of SPEC_ORDER) {
      if (out.length >= 4) break;
      const v = a[k]; if (v === undefined || v === null || v === "") continue;
      out.push((SPEC_FMT[k] || ((x) => String(x)))(v));
    }
    return out;
  }
  function dateText(l) {
    const d = new Date(l.bumped_at || l.created_at), now = new Date();
    if (isNaN(d)) return "";
    const verb = l.bumped_at && new Date(l.bumped_at) - new Date(l.created_at) > 60000 ? "Reactualizat" : "Postat";
    const hm = d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return `${verb} azi la ${hm}`;
    if (d.toDateString() === y.toDateString()) return `${verb} ieri`;
    return `${verb} pe ${d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}`;
  }

  /* ---------- structura paginii ---------- */
  let rfqBand, rfqBlock, rfqBlockT, rfqBlockP;
  let page, elTitle, elCrumbs, qInput, fBtn, fBadge, locBtn, locLabel, locPop, sortBtn, sortPop, viewBtn, catRow, elCount, list, more, empty, saveBtn, io;
  let dlgF, fMain, fCat, fApply, dlgL, lCountry, lCounty, lCity, lCityList;
  let Dr = blank(), Dview = view;       // ciorna din fereastra de filtre

  function build() {
    if (built) return; built = true;
    elTitle = h("h1", { class: "rs-title" });
    elCrumbs = h("p", { class: "rs-crumbs" });
    qInput = h("input", { type: "search", class: "rs-q", placeholder: "Ce cauți?", "aria-label": "Ce cauți?", autocomplete: "off", enterkeyhint: "search", maxlength: "100" });
    const heart = h("button", { type: "button", class: "rs-heart", "aria-label": "Salvează căutarea", onclick: saveSearch, html: svg(P.heart, 24) });
    fBadge = h("b", { class: "rs-badge", hidden: true });
    fBtn = h("button", { type: "button", class: "rs-chip dark", onclick: openFilters }, ico(P.sliders, 20), "Filtre", fBadge);
    locLabel = h("span", { class: "rs-ellip", text: "Locația" });
    locBtn = h("button", { type: "button", class: "rs-chip", "aria-haspopup": "true", "aria-expanded": "false", onclick: () => togglePop("loc") }, ico(P.pin, 18), locLabel, ico(P.chevD, 18));
    locPop = h("div", { class: "rs-pop", hidden: true });
    sortBtn = h("button", { type: "button", class: "rs-tool", "aria-label": "Ordonează", title: "Ordonează", "aria-haspopup": "true", onclick: () => togglePop("sort"), html: svg(P.sort, 22) });
    sortPop = h("div", { class: "rs-pop right", hidden: true });
    viewBtn = h("button", { type: "button", class: "rs-tool", onclick: cycleView });
    catRow = h("div", { class: "rs-cats", "aria-label": "Categorii" });
    elCount = h("h2", { class: "rs-count", "aria-live": "polite" });
    list = h("div", { class: "rs-list" });
    more = h("button", { type: "button", class: "rs-more", hidden: true, onclick: () => load(false) }, "Arată mai multe");
    empty = h("div", { class: "rs-empty", hidden: true });
    saveBtn = h("button", { type: "button", class: "rs-save", onclick: saveSearch, hidden: true }, ico(P.heart, 20), "Salvează căutarea");
    /* Piese auto: „Cere oferte" (modulul din requests-ui.js), o bandă subțire sus și un bloc când sunt puține rezultate */
    rfqBand = h("button", { type: "button", class: "rs-rfq", hidden: true, onclick: askOffers }, h("span", { class: "rs-rfq-t" }, "Nu găsești piesa? ", h("b", { text: "Cere oferte" })), ico(P.chevR, 18));
    rfqBlockT = h("strong"); rfqBlockP = h("p", { text: "Spune ce piesă cauți și primești oferte de la vânzători, fără să mai suni pe rând." });
    rfqBlock = h("div", { class: "rs-rfqblock", hidden: true }, rfqBlockT, rfqBlockP, h("button", { type: "button", class: "rs-pill on", onclick: askOffers }, "Cere oferte"));

    const form = h("form", { class: "rs-search", role: "search", onsubmit: (e) => { e.preventDefault(); submitQ(); } },
      h("span", { class: "rs-search-ic", html: svg(P.search, 22) }), qInput, heart);
    page = h("section", { class: "rs-page", hidden: true, "aria-label": "Rezultate căutare" },
      h("header", { class: "rs-hero" },
        h("div", { class: "rs-wrap rs-hero-in" },
          h("button", { type: "button", class: "rs-back", "aria-label": "Înapoi", onclick: () => close(false), html: svg(P.back, 24, 2.4) }),
          h("div", { class: "rs-head" }, elTitle, elCrumbs))),
      h("div", { class: "rs-wrap" },
        form,
        h("div", { class: "rs-bar" },
          fBtn,
          h("div", { class: "rs-anchor" }, locBtn, locPop),
          h("span", { class: "rs-grow" }),
          h("div", { class: "rs-anchor" }, sortBtn, sortPop),
          viewBtn),
        catRow,
        rfqBand,
        elCount,
        list, empty, rfqBlock, more),
      saveBtn);
    document.body.append(page);
    page.addEventListener("scroll", () => saveBtn.classList.toggle("show", page.scrollTop > 400), { passive: true });   // „Salvează căutarea" apare abia după ce derulezi, ca să nu acopere cardurile

    io = "IntersectionObserver" in window ? new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting) && !more.hidden) load(false); }, { root: page, rootMargin: "700px" }) : null;
    if (io) io.observe(more);
    document.addEventListener("click", (e) => { if (!e.target.closest(".rs-anchor")) closePops(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePops(); });
    buildFilters(); buildLocation();
  }

  /* ---------- deschidere / închidere / istoric ---------- */
  async function open(opts, how) {
    await ensureCats();
    build();
    const st = Object.assign(blank(), opts || {});
    st.attrs = { ...((opts && opts.attrs) || {}) };
    S = st;
    const wasOpen = isOpen;
    isOpen = true; page.hidden = false; document.body.style.overflow = "hidden";
    page.scrollTop = 0;
    const url = "/cauta" + (qs().length ? "?" + qs() : "");
    try {
      if (how === "replace" || wasOpen || how === "none") { if (how !== "none") history.replaceState({ res: 1 }, "", url); }
      else { history.pushState({ res: 1 }, "", url); pushed = true; }
    } catch { /* fără istoric */ }
    if (S.q) spSave(S.q);
    syncUI(); load(true);
  }
  const qs = () => toQuery(S).toString();
  function close(fromPop) {
    if (!isOpen) return;
    isOpen = false; page.hidden = true; closePops();
    document.body.style.overflow = accOpen() ? "hidden" : "";
    document.title = baseTitle;
    seq++; busy = false;
    if (fromPop) return;
    try { if (pushed) { pushed = false; history.back(); } else if (location.pathname === "/cauta") history.replaceState(null, "", "/"); } catch { /* fără istoric */ }
  }
  const accOpen = () => { const a = document.getElementById("accountPage"); return !!a && !a.hidden; };
  function apply() {
    try { history.replaceState({ res: 1 }, "", "/cauta" + (qs().length ? "?" + qs() : "")); } catch { /* fără istoric */ }
    syncUI(); load(true);
  }
  window.addEventListener("popstate", (e) => {
    const st = e.state;
    if (st && st.res) { if (!isOpen && location.pathname === "/cauta") open(fromQuery(location.search), "none"); return; }
    if (isOpen && !(st && st.det) && !/^\/anunt\//.test(location.pathname)) close(true);
    else if (!isOpen && location.pathname === "/cauta") { try { history.replaceState(null, "", "/"); } catch { /* nimic */ } }
  });

  /* ---------- antet, chips de categorie, numărătoare ---------- */
  function titleText() {
    const f = S.category ? node(S.category) : null;
    return f ? f.n.name : S.q ? `Rezultate pentru „${S.q}”` : "Toate anunțurile";
  }
  function syncUI() {
    const f = S.category ? node(S.category) : null;
    elTitle.textContent = titleText();
    elCrumbs.textContent = f ? (f.parent ? `${f.parent.name} / ${f.n.name}` : S.q ? `Rezultate pentru „${S.q}”` : "Toate subcategoriile") : (S.q ? "Căutare în toate categoriile" : "Din toate categoriile");
    if (f && f.parent && S.q) elCrumbs.textContent += ` · „${S.q}”`;
    document.title = `${titleText()} | Omnivo`;
    qInput.value = S.q;
    const n = filterCount(S);
    fBadge.textContent = n ? `· ${n}` : ""; fBadge.hidden = !n;
    locLabel.textContent = placeLabel(S) || "Locația";
    locBtn.classList.toggle("on", !!placeLabel(S));
    paintView(); paintSortBtn();
    saveBtn.hidden = !hasFilters(S);
    rfqBand.hidden = S.category !== "piese-auto"; if (rfqBand.hidden) rfqBlock.hidden = true;
    renderCatChips();
  }
  function filterCount(st) {
    let n = 0;
    if (st.category) n++;
    if (clean(st.min) || clean(st.max)) n++;
    if (st.condition) n++;
    if (st.seller) n++;
    if (st.sort) n++;
    const grp = new Set(Object.keys(st.attrs).map((k) => k.replace(/_(min|max)$/, "")));
    return n + grp.size;
  }
  function chip(label, on, fn, extra) {
    return h("button", { type: "button", class: "rs-pill" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false", onclick: fn }, extra || null, label);
  }
  let chipSeq = 0;
  async function renderCatChips() {
    const mine = ++chipSeq, f = S.category ? node(S.category) : null, kids = [];
    if (f && f.n.slug === "piese-auto") {   // în Piese auto: tipurile de piese (atributul „Tip piesă"), nu categoriile surori
      const def = (f.n.attributes || []).find((a) => a.key === "categorie_piesa"), cur = S.attrs.a_categorie_piesa || "";
      kids.push(chip("Toate piesele", !cur, () => { const a = { ...S.attrs }; delete a.a_categorie_piesa; S.attrs = a; apply(); }));
      for (const t of (def && def.options) || []) kids.push(chip(t, cur === t, () => { const a = { ...S.attrs }; if (cur === t) delete a.a_categorie_piesa; else a.a_categorie_piesa = t; S.attrs = a; apply(); }));
      if (f.parent) kids.push(h("button", { type: "button", class: "rs-pill ghost", onclick: () => setCategory(f.parent.slug) }, ico(P.back, 16, 2.4), f.parent.name));
    } else if (f) {
      const parent = f.parent || f.n;
      kids.push(chip(`Toate din ${parent.name}`, !f.parent, () => setCategory(parent.slug)));
      for (const k of parent.children) kids.push(chip(k.name, f.n.slug === k.slug, () => setCategory(k.slug)));
      kids.push(h("button", { type: "button", class: "rs-pill ghost", onclick: () => setCategory("") }, ico(P.close, 16, 2.4), "Toate categoriile"));
    } else {
      let sug = [];
      if (S.q.length >= 3) { try { sug = (await api("/api/categories/suggest?title=" + encodeURIComponent(S.q))).suggestions || []; } catch { /* fără sugestii */ } }
      if (mine !== chipSeq) return;
      const list2 = sug.length ? sug.map((x) => ({ slug: x.slug, name: x.name })) : cats.map((c) => ({ slug: c.slug, name: c.name }));
      for (const c of list2.slice(0, 8)) kids.push(chip(c.name, false, () => setCategory(c.slug)));
    }
    if (mine === chipSeq) { catRow.replaceChildren(...kids); catRow.hidden = !kids.length; }
  }
  function askOffers() {
    if (!window.openRequests) return;
    const t = (S.attrs && S.attrs.a_categorie_piesa) || "";
    window.openRequests("new", { part: S.q || "", details: t && !S.q ? "Tip piesă: " + t : "" });   // formularul se deschide deja completat
  }
  /* banda „Cere oferte": pulsează o dată (de mai multe ori dacă sunt puține rezultate), apoi stă liniștită */
  function paintRfq(reset) {
    const on = S.category === "piese-auto";
    rfqBand.hidden = !on;
    if (!on) { rfqBlock.hidden = true; return; }
    if (reset) { rfqBand.classList.remove("pulse", "few"); void rfqBand.offsetWidth; rfqBand.classList.add("pulse"); if (total < 3) rfqBand.classList.add("few"); }
    rfqBlock.hidden = total >= 3;
    rfqBlockT.textContent = total === 0 ? "Nu ai găsit piesa?" : "Mai puține rezultate decât te așteptai?";
  }
  function setCategory(slug) { S.category = slug; S.attrs = {}; apply(); }
  function submitQ() { S.q = clean(qInput.value); if (S.q) spSave(S.q); qInput.blur(); apply(); }

  /* ---------- încărcarea rezultatelor ---------- */
  function skeletons() {
    return Array.from({ length: view === "grid" ? 6 : 3 }, () => h("div", { class: "rs-card rs-skel", "aria-hidden": "true" }, h("div", { class: "rs-photo" }), h("div", { class: "rs-info" }, h("i"), h("i"), h("i"))));
  }
  async function load(reset) {
    if (!isOpen || (busy && !reset)) return;
    const my = ++seq; busy = true;
    if (reset) { offset = 0; items = []; list.className = "rs-list rs-v-" + view; list.replaceChildren(...skeletons()); more.hidden = true; empty.hidden = true; elCount.textContent = ""; }
    try {
      const p = toQuery(S); p.set("limit", "24"); p.set("offset", String(offset));
      const d = await api("/api/listings?" + p);
      if (my !== seq) return;
      if (reset) list.replaceChildren();
      items.push(...d.listings); list.append(...d.listings.map((l) => card(l)));
      total = d.total; offset += d.listings.length;
      elCount.textContent = total ? `Am găsit ${total >= 1000 ? "peste 1.000 de rezultate" : nRez(total)} pentru tine` : "";
      more.hidden = offset >= total || !d.listings.length;
      if (!total) showEmpty();
      paintRfq(reset);
      busy = false;
    } catch (err) {
      if (my !== seq) return;
      busy = false; if (reset) list.replaceChildren();
      empty.replaceChildren(h("p", { text: errText(err) }), h("button", { type: "button", class: "rs-pill on", onclick: () => load(true) }, "Încearcă din nou"));
      empty.hidden = false;
    }
  }
  function showEmpty() {
    const n = filterCount(S) + (S.county || S.city || S.country ? 1 : 0);
    empty.replaceChildren(
      h("strong", { text: "Nu am găsit anunțuri" }),
      h("p", { text: n ? "Încearcă să scoți unele filtre sau să cauți într-o zonă mai largă." : "Verifică ortografia sau caută altceva." }),
      n ? h("button", { type: "button", class: "rs-pill on", onclick: () => { S = Object.assign(blank(), { q: S.q }); apply(); } }, "Șterge filtrele") : null);
    empty.hidden = false;
  }

  /* ---------- cardul de anunț (poză mare) ---------- */
  /* reducere recentă de preț (ultimele 14 zile), în procente */
  function dropPct(l) {
    const was = Number(l.price_was), now = Number(l.price);
    if (!l.price_was || !Number.isFinite(was) || !Number.isFinite(now) || was <= now || !l.price_dropped_at) return 0;
    if (Date.now() - new Date(l.price_dropped_at).getTime() > 14 * 864e5) return 0;
    return Math.max(1, Math.round((1 - now / was) * 100));
  }
  function card(l, v) {
    v = v || view;
    const photo = h("div", { class: "rs-photo" });
    const src = v === "gallery" ? (l.photo || l.thumb) : (l.thumb || l.photo);
    if (src) photo.append(h("img", { src, alt: l.title, loading: "lazy", decoding: "async" }));
    else photo.append(h("span", { class: "rs-noph", html: typeof icon === "function" ? icon(iconOf[l.category_slug] || "alt", 56) : "" }));
    if (l.promoted) photo.append(h("span", { class: "rs-tag rs-promo" }, ico(P.star, 14), "Promovat"));
    if (l.condition) photo.append(h("span", { class: "rs-tag rs-cond " + l.condition, text: l.condition === "nou" ? "Nou" : condLabel(l.category_slug) }));
    if (l.photo_count > 1) photo.append(h("span", { class: "rs-tag rs-pics" }, ico(P.camera, 15), String(l.photo_count)));
    photo.append(favBtn(l.id, false, l));
    const place = [l.city, l.county].filter(Boolean).join(", "), when = dateText(l), specs = specText(l);
    const info = h("div", { class: "rs-info" },
      h("h3", { class: "rs-ttl", text: l.title }),
      h("div", { class: "rs-price" }, h("strong", { text: price(l) }), dropPct(l) ? h("small", { class: "rs-drop", text: "−" + dropPct(l) + "%" }) : null, l.deal_pct ? h("small", { class: "rs-drop", text: "−" + l.deal_pct + "% sub piață" }) : null, l.negotiable ? h("small", { text: "Negociabil" }) : null),
      specs.length ? h("p", { class: "rs-specs" }, specs.map((s) => h("span", { text: s }))) : null,
      h("p", { class: "rs-where" }, place ? ico(P.pin, 15) : null, h("span", { text: [place, when].filter(Boolean).join(" · ") })),
      l.seller_type === "firma" ? h("span", { class: "rs-firm", text: "Firmă" }) : null);
    const a = h("article", { class: "rs-card rs-m-" + v, tabindex: "0", role: "link", "aria-label": l.title }, photo, info);
    const go = () => { trackInterest({ cat: l.category_slug, w: 3, id: l.id, title: l.title, price: l.price, cur: l.currency }); openDetail(l.id); };
    a.addEventListener("click", go);
    a.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === a) { e.preventDefault(); go(); } });
    return a;
  }

  /* ---------- afișare + sortare ---------- */
  function paintView() {
    const v = VIEWS.find(([k]) => k === view) || VIEWS[0];
    viewBtn.innerHTML = svg(P[v[0]], 22); viewBtn.setAttribute("aria-label", `Afișare: ${v[1]}. Schimbă`); viewBtn.title = `Afișare: ${v[1]}`;
    list.className = "rs-list rs-v-" + view;
  }
  function cycleView() {
    const i = VIEWS.findIndex(([k]) => k === view); view = VIEWS[(i + 1) % VIEWS.length][0]; lsSet(VIEW_KEY, view);
    paintView();
    if (items.length) list.replaceChildren(...items.map((l) => card(l)));   // alt format de poză, fără să reîncarce lista de pe server
  }
  function paintSortBtn() { sortBtn.classList.toggle("on", !!S.sort); }
  function closePops() {
    for (const [pop, btn] of [[locPop, locBtn], [sortPop, sortBtn]]) { if (!pop) continue; pop.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  }
  function togglePop(which) {
    const pop = which === "loc" ? locPop : sortPop, btn = which === "loc" ? locBtn : sortBtn, show = pop.hidden;
    closePops(); if (!show) return;
    if (which === "loc") renderLocPop(); else renderSortPop();
    pop.hidden = false; btn.setAttribute("aria-expanded", "true");
  }
  function renderSortPop() {
    sortPop.replaceChildren(h("b", { class: "rs-pop-h", text: "Ordonează după" }), ...SORTS.map(([k, lab]) =>
      h("button", { type: "button", class: "rs-opt" + (S.sort === k ? " on" : ""), onclick: () => { S.sort = k; closePops(); apply(); } }, h("span", { text: lab }), S.sort === k ? ico(P.check, 18, 2.6) : null)));
  }

  /* ---------- locația: buton + locuri recente + fereastră ---------- */
  const placeLabel = (st) => (st.city ? `${st.city}${st.county ? ", " + st.county : ""}` : st.county || st.country || "");
  const recents = () => lsGet(REC_PLACES, []).filter((x) => x && (x.city || x.county || x.country)).slice(0, 5);
  function pushRecent(st) {
    if (!(st.city || st.county || st.country)) return;
    const it = { country: st.country, county: st.county, city: st.city }, key = JSON.stringify(it);
    lsSet(REC_PLACES, [it, ...recents().filter((x) => JSON.stringify({ country: x.country, county: x.county, city: x.city }) !== key)].slice(0, 5));
  }
  function renderLocPop() {
    const rec = recents(), rows = [];
    rows.push(h("b", { class: "rs-pop-h", text: rec.length ? "Locuri recente" : "Locația" }));
    for (const r of rec) {
      const main = r.city || r.county || r.country, sub = r.city ? r.county : r.county ? "Tot județul" : "Toată țara";
      rows.push(h("button", { type: "button", class: "rs-opt two", onclick: () => { S.country = r.country || ""; S.county = r.county || ""; S.city = r.city || ""; closePops(); pushRecent(S); apply(); } },
        ico(P.clock, 18), h("span", {}, h("b", { text: main }), sub ? h("small", { text: sub }) : null)));
    }
    if (placeLabel(S)) rows.push(h("button", { type: "button", class: "rs-opt", onclick: () => { S.country = S.county = S.city = ""; closePops(); apply(); } }, h("span", { text: "Șterge locația" })));
    rows.push(h("button", { type: "button", class: "rs-opt strong", onclick: () => { closePops(); openLocation(); } }, h("span", { text: "Alege alt loc" })));
    locPop.replaceChildren(...rows);
  }
  function fillCities(county) {
    const cl = (window.CITIES || {})[county] || [];
    lCityList.replaceChildren(...cl.map((c) => h("option", { value: c })));
  }
  function selectEl(options, value, onchange, placeholder) {
    const s = h("select", { class: "rs-select", onchange: (e) => onchange(e.target.value) },
      placeholder !== undefined ? h("option", { value: "", text: placeholder }) : null,
      ...options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h("option", { value: v, text: t }); }));
    s.value = value || "";
    return s;
  }
  function buildLocation() {
    lCityList = h("datalist", { id: "rsCities" });
    lCountry = selectEl(COUNTRIES, "", () => { lCounty.value = ""; lCity.value = ""; syncLoc(); }, "Toate țările");
    lCounty = selectEl(typeof COUNTIES !== "undefined" ? COUNTIES : [], "", () => { lCity.value = ""; syncLoc(); }, "Toate județele");
    lCity = h("input", { class: "rs-input", list: "rsCities", placeholder: "Alege localitatea", autocomplete: "off", "aria-label": "Localitate" });
    dlgL = h("dialog", { class: "rs-dlg rs-dlg-s", "aria-label": "Alege locația" },
      h("div", { class: "rs-dh" }, h("button", { type: "button", class: "rs-ic", "aria-label": "Închide", onclick: () => dlgL.close(), html: svg(P.close, 24) }), h("h2", { text: "Locația" }),
        h("button", { type: "button", class: "rs-clear", onclick: () => { lCountry.value = lCounty.value = lCity.value = ""; syncLoc(); } }, "Șterge")),
      h("div", { class: "rs-db" },
        field("Țara", lCountry), h("div", { class: "rs-loc-ro" }, field("Județ", lCounty), field("Localitate", lCity, lCityList))),
      h("div", { class: "rs-df" }, h("button", { type: "button", class: "rs-go", onclick: () => {
        S.country = lCountry.value; S.county = lCountry.value && lCountry.value !== "România" ? "" : lCounty.value; S.city = S.county ? clean(lCity.value) : "";
        pushRecent(S); dlgL.close(); apply();
      } }, "Aplică locația")));
    document.body.append(dlgL);
  }
  function syncLoc() {
    const ro = !lCountry.value || lCountry.value === "România";
    dlgL.querySelector(".rs-loc-ro").hidden = !ro;
    fillCities(lCounty.value);
  }
  function openLocation() {
    lCountry.value = S.country || ""; lCounty.value = S.county || ""; lCity.value = S.city || ""; syncLoc();
    dlgL.showModal();
  }

  /* ---------- fereastra de filtre ---------- */
  function field(label, control, extra) { return h("div", { class: "rs-field" }, h("label", { text: label }), control, extra || null); }
  function pills(options, value, onpick) {
    const box = h("div", { class: "rs-pills", role: "group" });
    const paint = () => box.replaceChildren(...options.map(([k, lab, ic]) => h("button", { type: "button", class: "rs-pill" + (value === k ? " on" : ""), "aria-pressed": value === k ? "true" : "false", onclick: () => { value = k; onpick(k); paint(); } }, ic ? ico(P[ic], 18) : null, lab)));
    paint(); return box;
  }
  function range(label, kMin, kMax, store, unit) {
    const mk = (k, ph) => h("input", { class: "rs-input", inputmode: "decimal", placeholder: ph, "aria-label": `${label} ${ph}`, value: store[k] || "",
      oninput: (e) => { const v = num(e.target.value); e.target.value = v; if (v) store[k] = v; else delete store[k]; schedule(); } });
    return h("div", { class: "rs-field" }, h("label", { text: unit ? `${label} (${unit})` : label }), h("div", { class: "rs-range" }, mk(kMin, "De la"), mk(kMax, "până la")));
  }
  function buildFilters() {
    fMain = h("div", { class: "rs-pane" }); fCat = h("div", { class: "rs-pane", hidden: true });
    dlgF = h("dialog", { class: "rs-dlg", "aria-label": "Filtre" }, fMain, fCat);
    dlgF.addEventListener("click", (e) => { if (e.target === dlgF) dlgF.close(); });
    document.body.append(dlgF);
  }
  function showPane(which) {
    fMain.hidden = which !== "main"; fCat.hidden = which !== "cat";
    if (which === "main") renderMain(); else renderCatPane(null);
  }
  function openFilters() {
    Dr = copy(S); Dview = view;
    showPane("main"); dlgF.showModal(); loadFacets(); refreshCount();
  }
  let facetTimer = null, countSeq = 0;
  function schedule() { clearTimeout(facetTimer); facetTimer = setTimeout(() => { refreshCount(); }, 350); }
  async function refreshCount() {
    if (!fApply) return;
    const my = ++countSeq;
    try {
      const p = toQuery(Dr); p.set("limit", "1");
      const d = await api("/api/listings?" + p);
      if (my === countSeq && dlgF.open) fApply.textContent = d.total ? `Arată ${nRez(d.total)}` : "Arată rezultatele";
    } catch { if (my === countSeq && fApply) fApply.textContent = "Arată rezultatele"; }
  }
  async function loadFacets() {
    if (!Dr.category) return;
    const my = ++facetSeq;
    try {
      const p = toQuery(Dr), { facets } = await api("/api/listings/facets?" + p);
      if (my !== facetSeq) return;
      for (const [k, rows] of Object.entries(facets || {})) {
        const dl = document.getElementById("rsdl_" + k); if (!dl) continue;
        dl.replaceChildren(...rows.map((r) => h("option", { value: r.v, label: `${r.v} (${r.n})` })));
      }
    } catch { /* fără sugestii: câmpul rămâne liber */ }
  }
  let facetSeq = 0;

  function attrField(d) {
    const key = "a_" + d.key, label = ATTR_LABEL[d.key] || d.label;
    if (d.type === "number") return range(ATTR_LABEL[d.key] ? ATTR_LABEL[d.key] : d.label, key + "_min", key + "_max", Dr.attrs);
    if (d.type === "select") return field(label, selectEl(d.options || [], Dr.attrs[key], (v) => { if (v) Dr.attrs[key] = v; else delete Dr.attrs[key]; schedule(); }, "Alege"));
    const dl = h("datalist", { id: "rsdl_" + d.key });
    const inp = h("input", { class: "rs-input", list: "rsdl_" + d.key, placeholder: "Alege sau scrie", autocomplete: "off", "aria-label": label, value: Dr.attrs[key] || "",
      oninput: (e) => { const v = clean(e.target.value); if (v) Dr.attrs[key] = v; else delete Dr.attrs[key]; schedule(); },
      onchange: () => { loadFacets(); schedule(); } });
    return field(label, inp, dl);
  }
  function renderMain() {
    const defs = defsFor(Dr.category), head = defs.slice(0, 3), tail = defs.slice(3);
    const catField = field("Categoria", h("div", { class: "rs-pickrow" },
      h("button", { type: "button", class: "rs-pick", onclick: () => showPane("cat") }, h("span", { class: "rs-ellip", text: Dr.category ? catPath(Dr.category) : "Toate categoriile" }), ico(P.chevR, 20)),
      Dr.category ? h("button", { type: "button", class: "rs-xbtn", "aria-label": "Șterge categoria", onclick: () => { Dr.category = ""; Dr.attrs = {}; renderMain(); refreshCount(); }, html: svg(P.close, 20) }) : null));

    const ro = !Dr.country || Dr.country === "România", cityList = h("datalist", { id: "rsCities2" });
    const fill = () => cityList.replaceChildren(...((window.CITIES || {})[Dr.county] || []).map((c) => h("option", { value: c })));
    const cityIn = h("input", { class: "rs-input", list: "rsCities2", placeholder: "Alege localitatea", autocomplete: "off", "aria-label": "Localitate", value: Dr.city || "", oninput: (e) => { Dr.city = clean(e.target.value); schedule(); } });
    const countySel = selectEl(typeof COUNTIES !== "undefined" ? COUNTIES : [], Dr.county, (v) => { Dr.county = v; Dr.city = ""; cityIn.value = ""; fill(); schedule(); }, "Toate județele");
    fill();
    const place = h("div", { class: "rs-grp" },
      field("Țara", selectEl(COUNTRIES, Dr.country, (v) => { Dr.country = v; if (v && v !== "România") { Dr.county = ""; Dr.city = ""; } renderMain(); schedule(); }, "Toate țările")),
      ro ? field("Județ", countySel) : null,
      ro ? field("Localitate", cityIn, cityList) : null);

    const cur = Dr.currency || defCurrency(Dr.category), root = rootSlug(Dr.category);
    const priceBox = h("div", { class: "rs-grp" },
      h("div", { class: "rs-field" }, h("label", { text: "Moneda" }), pills([["RON", "lei"], ["EUR", "€"]], cur, (v) => { Dr.currency = v; schedule(); })),
      h("div", { class: "rs-field" }, h("label", { text: "Preț" }), h("div", { class: "rs-range" },
        ...[["min", "De la"], ["max", "până la"]].map(([k, ph]) => h("input", { class: "rs-input", inputmode: "decimal", placeholder: ph, "aria-label": `Preț ${ph}`, value: Dr[k] || "", oninput: (e) => { Dr[k] = num(e.target.value); e.target.value = Dr[k]; schedule(); } })))));

    fApply = h("button", { type: "button", class: "rs-go", onclick: applyFilters }, "Arată rezultatele");
    fMain.replaceChildren(
      h("div", { class: "rs-dh" },
        h("button", { type: "button", class: "rs-ic", "aria-label": "Închide", onclick: () => dlgF.close(), html: svg(P.close, 24) }),
        h("h2", { text: "Filtre" }),
        h("button", { type: "button", class: "rs-clear", onclick: () => { const q = Dr.q; Dr = Object.assign(blank(), { q }); Dview = "gallery"; renderMain(); refreshCount(); } }, "Șterge")),
      h("div", { class: "rs-db" },
        catField, place, ...head.map(attrField), priceBox, ...tail.map(attrField),
        field("Stare", pills([["", "Toate"], ["nou", "Nou"], ["folosit", root === "auto-moto" && Dr.category === "piese-auto" ? "Second-hand" : "Folosit"]], Dr.condition, (v) => { Dr.condition = v; schedule(); })),
        field("Ordonează după", pills(SORTS, Dr.sort, (v) => { Dr.sort = v; schedule(); })),
        field("Persoană fizică sau firmă", pills(SELLERS, Dr.seller, (v) => { Dr.seller = v; schedule(); })),
        field("Afișare", pills(VIEWS.map(([k, l]) => [k, l, k]), Dview, (v) => { Dview = v; }))),
      h("div", { class: "rs-df" }, fApply));
    loadFacets(); refreshCount();
  }
  function renderCatPane(rootS) {
    const r = rootS ? node(rootS) : null;
    const row = (label, sub, on, fn, ic, arrow) => h("button", { type: "button", class: "rs-row" + (on ? " on" : ""), onclick: fn },
      ic ? h("span", { class: "rs-row-ic", html: ic }) : null, h("span", { class: "rs-row-t" }, h("b", { text: label }), sub ? h("small", { text: sub }) : null), on ? ico(P.check, 20, 2.6) : arrow ? ico(P.chevR, 20) : null);
    const pick = (slug) => { if (slug !== Dr.category) { Dr.category = slug; Dr.attrs = {}; } showPane("main"); };
    const body = h("div", { class: "rs-db" });
    if (!r) {
      body.append(row("Toate categoriile", "", !Dr.category, () => { Dr.category = ""; Dr.attrs = {}; showPane("main"); }));
      for (const c of cats) body.append(row(c.name, c.children.length ? `${c.children.length} subcategorii` : "", Dr.category === c.slug, () => (c.children.length ? renderCatPane(c.slug) : pick(c.slug)), typeof icon === "function" ? icon(c.slug, 24) : "", c.children.length > 0));
    } else {
      body.append(row(`Toate din ${r.n.name}`, "", Dr.category === r.n.slug, () => pick(r.n.slug)));
      for (const k of r.n.children) body.append(row(k.name, "", Dr.category === k.slug, () => pick(k.slug)));
    }
    fCat.replaceChildren(
      h("div", { class: "rs-dh" }, h("button", { type: "button", class: "rs-ic", "aria-label": "Înapoi", onclick: () => (r ? renderCatPane(null) : showPane("main")), html: svg(P.back, 24) }), h("h2", { text: r ? r.n.name : "Alege categoria" }), h("span", { class: "rs-ic" })),
      body);
  }
  function applyFilters() {
    const q = S.q; S = copy(Dr); S.q = q;
    S.min = clean(S.min); S.max = clean(S.max);
    view = Dview; lsSet(VIEW_KEY, view);
    if (S.country || S.county || S.city) pushRecent(S);
    dlgF.close(); apply();
  }

  /* ---------- căutare salvată ---------- */
  async function saveSearch() {
    if (!me) return openAuth("Intră în cont ca să salvezi căutarea.");
    const p = toQuery(S); p.delete("q"); p.delete("category");
    try {
      await api("/api/saved-searches", "POST", { q: S.q, category: S.category, label: [S.q ? `„${S.q}”` : "", S.category ? catPath(S.category) : ""].filter(Boolean).join(" · ") || "Căutare", params: p.toString() });
      showMessage("Căutare salvată", "O găsești în Cont › Căutări salvate. Te anunțăm când apar anunțuri noi.");
    } catch (err) { showMessage("Eroare", err.code === "PREA_MULTE_CAUTARI" ? "Poți salva maximum 30 de căutări. Șterge una veche." : errText(err)); }
  }

  /* ---------- API public ---------- */
  window.Results = {
    open: (opts) => open(opts, "push"),
    close: () => close(false),
    isOpen: () => isOpen,
    card: (l, v) => card(l, v),   // același card și pe prima pagină
    fromParams(q, category, params) { const st = fromQuery(params || ""); st.q = clean(q); st.category = clean(category); return st; }
  };
  if (location.pathname === "/cauta") open(fromQuery(location.search), "replace");
})();
