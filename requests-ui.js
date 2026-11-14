/* „Cere oferte piese” / „Ofertează piesele”, ca la AutoParts. Pagini: Ofertează piesele (lista publică cu filtre), Cere oferte piese (formular),
   Cererile mele, Ofertele primite, Ofertele mele (răspunsuri la cereri), Comenzi, Întrebări.
   Folosește din script.js: $, api, me, COUNTIES, showMessage, errText, ERR, openAuth, openLightbox. Backend: requests.js. */
(() => {
  Object.assign(ERR, {
    PIESA_INVALIDA: "Scrie ce piesă cauți (minimum 3 caractere).", MARCA_INVALIDA: "Scrie marca mașinii.", AN_INVALID: "Anul nu e valid.",
    VIN_INVALID: "Seria de șasiu (VIN) are 11-17 caractere, fără I, O sau Q.", JUDET_LIPSA: "Alege județul.", PIESE_INVALIDE: "Lista de piese nu e validă.",
    PREA_MULTE_PIESE: "Poți adăuga cel mult 9 piese în plus.", PREA_MULTE_CERERI: "Ai trimis prea multe cereri azi. Încearcă mâine.",
    FARA_CONTACT_IN_CERERE: "Cererea e publică: nu scrie telefon, email sau linkuri. Contactul se dă după ce alegi o ofertă.",
    FARA_CONTACT_IN_OFERTA: "Nu scrie telefon, email sau linkuri în ofertă. Contactul se dă după ce cumpărătorul acceptă oferta.",
    FARA_CONTACT_IN_INTREBARE: "Nu scrie telefon, email sau linkuri.", PRET_INVALID: "Scrie un preț valid.", MESAJ_PREA_LUNG: "Mesajul e prea lung (maximum 2000 de caractere).",
    CERERE_INCHISA: "Cererea s-a închis între timp.", CERERE_PROPRIE: "Nu poți oferta la propria cerere.", OFERTA_EXISTA: "Ai deja o ofertă la această cerere.",
    OFERTA_NU_MAI_E_DISPONIBILA: "Oferta nu mai e disponibilă.", OFERTA_NEGASITA: "Oferta nu mai e disponibilă.", PREA_MULTE_OFERTE: "Ai trimis prea multe oferte. Încearcă mai târziu.",
    EDITARE_EXPIRATA: "Cererea se poate modifica doar în primele 10 minute.", CERERE_NU_SE_POATE_REACTIVA: "Cererea nu se poate reactiva.",
    INTREBARE_INVALIDA: "Scrie întrebarea (între 3 și 300 de caractere).", PREA_MULTE_INTREBARI: "Ai pus numărul maxim de întrebări la această ofertă.",
    RASPUNS_INVALID: "Scrie răspunsul (maximum 500 de caractere).", DEJA_RASPUNS: "Ai răspuns deja la această întrebare.", COMANDA_INCHEIATA: "Comanda e deja încheiată.",
    POZA_INVALIDA: "Poza nu e bună. Alege un JPG, PNG sau WebP.", PREA_MULTE_POZE: "Ai prea multe poze neatașate. Trimite formularul sau scoate câteva.",
    STORAGE_EROARE: "Pozele nu se pot salva acum. Încearcă din nou.", SPATIU_POZE_DEPASIT: "Ai depășit spațiul pentru poze (60 MB)."
  });
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const nf = (n) => Number(n).toLocaleString("ro-RO");
  const money = (n, c) => `${nf(n)} ${c === "EUR" ? "€" : "lei"}`;
  const when = (d) => new Date(d).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const left = (d) => { const ms = new Date(d) - Date.now(); if (ms <= 0) return "expirată"; const h = Math.floor(ms / 3600000); return h >= 48 ? `mai sunt ${Math.floor(h / 24)} zile` : h >= 1 ? `mai sunt ${h} h` : "expiră curând"; };
  const KIND = { ambele: "Noi sau second-hand", noi: "Doar piese noi", "second-hand": "Doar second-hand" };
  const RS = { open: ["Deschisă", "ok"], matched: ["Rezolvată", "sold"], closed: ["Închisă", "wait"] };
  const OS = { pending: ["În așteptare", "wait"], accepted: ["Acceptată", "ok"], rejected: ["Refuzată", "bad"] };
  const ORD = { new: "Nouă", confirmed: "Confirmată", shipped: "Expediată", done: "Finalizată", cancelled: "Anulată" };
  const BRANDS = ["Audi", "BMW", "Dacia", "Ford", "Opel", "Renault", "Skoda", "Volkswagen", "Mercedes", "Toyota", "Peugeot", "Citroen", "Fiat", "Hyundai", "Kia", "Seat", "Honda", "Mazda", "Nissan", "Volvo"];
  const car = (r) => [r.make, r.model, r.year, r.variant, r.engine].filter(Boolean).join(" ");
  const stars = (x, n) => (x ? `★ ${x}${n ? ` (${n})` : ""}` : "");

  const st = { view: "board", id: 0, timer: null, mineTab: "open", mineQ: "", filt: { seen: "new", q: "", make: "", county: "", kind: "" } };
  const rfqSum = { open: 0, waiting: 0, new_quotes: 0, new_answers: 0, open_questions: 0 }; window.rfqSummary = rfqSum;
  let dlg = null, body = null, head = null;

  const CHEV = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  function build() {
    if (dlg) return;
    dlg = el("dialog", "chatpage rfq-page"); dlg.id = "rfqDialog"; dlg.setAttribute("aria-label", "Oferte piese");
    const top = el("header", "cp-head"); head = el("h2", "", "Oferte piese");
    const x = el("button", "cp-back"); x.type = "button"; x.setAttribute("aria-label", "Înapoi"); x.innerHTML = CHEV;
    x.onclick = () => { if (st.view === "detail") go(st.from || "board"); else dlg.close(); };
    top.append(x, head);
    const tabs = el("nav", "rfq-tabs"); tabs.id = "rfqTabs";
    body = el("div", "rfq-body"); body.id = "rfqBody";
    dlg.append(top, tabs, body); document.body.append(dlg);
    dlg.addEventListener("close", () => { clearInterval(st.timer); st.timer = null; try { if (!st.pop && parsePath(location.pathname)) history.pushState(null, "", "/"); } catch { /* fără istoric */ } });
  }
  function tabs() {
    const n = rfqSum.new_quotes + rfqSum.new_answers;
    const items = [["board", "Ofertează piesele"], ["new", "Cere oferte piese"]];
    if (me) items.push(["mine", "Cererile mele" + (n ? ` (${n})` : "")], ["received", "Ofertele primite"], ["offers", "Ofertele mele"], ["orders", "Comenzi"], ["questions", "Întrebări" + (rfqSum.open_questions ? ` (${rfqSum.open_questions})` : "")]);
    const on = (k) => st.view === k || (st.view === "detail" && k === (st.from || "board"));
    $("rfqTabs").replaceChildren(...items.map(([k, t]) => { const b = el("button", "rfq-tab" + (on(k) ? " on" : ""), t); b.type = "button"; b.onclick = () => go(k); return b; }));
  }
  const ROUTES = { board: "/cereri", new: "/cerere-noua", mine: "/cererile-mele", received: "/oferte-primite", offers: "/ofertele-mele", orders: "/comenzi-piese", questions: "/intrebari-oferte" };
  const LEGACY = { "/cere-oferte": "board", "/piese-cautate": "board", "/piese-cautate/noua": "new", "/oferte-primite": "received", "/ofertele-mele": "offers" };
  const pathFor = (v, a) => (v === "detail" ? "/cererea/" + a : ROUTES[v] || ROUTES.board);
  function parsePath(p) {
    p = String(p || "").replace(/\/+$/, "") || "/";
    for (const [k, v] of Object.entries(ROUTES)) if (v === p) return [k];
    if (LEGACY[p]) return [LEGACY[p]];
    const m = /^\/cererea\/(\d+)$/.exec(p); if (m) return ["detail", Number(m[1])];
    return null;
  }
  const PUBLIC = ["board", "detail", "new"];
  function go(view, arg) {
    if (!me && !PUBLIC.includes(view)) return openAuth();
    clearInterval(st.timer); st.timer = null;
    if (view === "detail") { if (st.view !== "detail") st.from = ["mine", "received", "offers", "board"].includes(st.view) ? st.view : "board"; st.id = arg; }
    st.view = view; st.edit = view === "new" && arg && typeof arg === "object" ? arg : null;
    try { const url = pathFor(view, st.id); if (!st.pop && typeof history !== "undefined" && location.pathname !== url) history.pushState({ rfq: 1 }, "", url); } catch { /* fără istoric */ }
    tabs(); setTimeout(() => window.rfqSummaryRefresh && rfqSummaryRefresh(), 800);
    ({ board: viewBoard, new: viewNew, detail: viewDetail, mine: viewMine, received: viewReceived, offers: viewOffers, orders: viewOrders, questions: viewQuestions })[view](arg);
    body.scrollTop = 0;
  }
  const loading = () => body.replaceChildren(el("p", "muted", "Se încarcă…"));
  const fail = (e) => body.replaceChildren(el("p", "err", errText(e)));
  const field = (label, input, hint) => { const l = el("label", "rfq-f"); l.append(el("span", "", label), input); if (hint) l.append(el("small", "muted", hint)); return l; };
  const inp = (type, ph, val) => { const i = el("input"); i.type = type; if (ph) i.placeholder = ph; if (val != null) i.value = val; return i; };
  const area = (ph, val, rows) => { const t = el("textarea"); t.rows = rows || 3; if (ph) t.placeholder = ph; t.value = val || ""; return t; };
  const countySel = (val, ph) => { const s = el("select"); s.append(new Option(ph || "Alege județul", "")); COUNTIES.forEach((c) => s.append(new Option(c, c))); s.value = val || ""; return s; };
  const msgBox = () => { const m = el("p", "err"); m.hidden = true; m.setAttribute("role", "alert"); m.show = (t) => { m.textContent = t; m.hidden = false; }; return m; };
  const btn = (txt, cls, fn) => { const b = el("button", cls || "ghost", txt); b.type = "button"; if (fn) b.onclick = fn; return b; };
  const guarded = (b, msg, fn) => async (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); b.disabled = true; msg.hidden = true; try { await fn(); } catch (e) { msg.show(errText(e)); } b.disabled = false; };

  /* ---------- poze: se micșorează în browser, apoi serverul le recodează și scoate datele GPS ---------- */
  async function shrink(file) {
    try {
      const bm = await createImageBitmap(file), sc = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement("canvas");
      c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc); c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height);
      return (await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85))) || file;
    } catch { return file; }
  }
  async function uploadPhoto(file) {
    const blob = await shrink(file);
    const r = await fetch("/api/requests/image", { method: "POST", headers: { "content-type": blob.type || "image/jpeg" }, body: blob });
    let d = {}; try { d = await r.json(); } catch { /* fără JSON */ }
    if (!r.ok) throw Object.assign(new Error(d.error || "EROARE"), { code: d.error, status: r.status });
    return d.image;
  }
  function photoPicker(max, initial, msg) {
    const photos = (initial || []).map((i) => ({ id: i.id, thumb: i.thumb || i.url })), strip = el("div", "rfq-photos"), file = el("input");
    file.type = "file"; file.accept = "image/*"; file.multiple = true; file.hidden = true;
    const label = `Adaugă poze (max ${max})`, add = el("button", "ghost rfq-addph", label); add.type = "button"; add.onclick = () => file.click();
    const paint = () => {
      strip.replaceChildren(...photos.map((p, i) => { const w = el("span", "rfq-ph"), g = el("img"), x = el("button", "rfq-phx", "×"); g.src = p.thumb; g.alt = ""; x.type = "button"; x.setAttribute("aria-label", "Scoate poza"); x.onclick = () => { photos.splice(i, 1); paint(); }; w.append(g, x); return w; }));
      add.hidden = photos.length >= max;
    };
    file.onchange = async () => {
      const list = [...file.files].slice(0, max - photos.length); file.value = ""; if (!list.length) return;
      add.disabled = true; add.textContent = "Se încarcă pozele…";
      for (const fl of list) { try { const im = await uploadPhoto(fl); photos.push({ id: im.id, thumb: im.thumb || im.url }); paint(); } catch (e) { msg.show(errText(e)); break; } }
      add.disabled = false; add.textContent = label; paint();
    };
    paint();
    return { nodes: [strip, add, file], ids: () => photos.map((p) => p.id), busy: () => add.disabled };
  }
  function photoStrip(list, alt) {
    if (!list || !list.length) return null;
    const strip = el("div", "rfq-photos sm");
    list.forEach((im, i) => { const b = el("button", "rfq-ph"); b.type = "button"; b.setAttribute("aria-label", `Poza ${i + 1}`); const g = el("img"); g.src = im.thumb || im.url; g.alt = ""; g.loading = "lazy"; b.append(g); b.onclick = () => openLightbox(list.map((x) => x.url), i, alt); strip.append(b); });
    return strip;
  }

  /* ---------- carduri ---------- */
  function row(r, opts = {}) {
    const d = el("div", "rfq-row" + (opts.hot ? " new" : "")); d.tabIndex = 0; d.setAttribute("role", "button");
    const mid = el("div", "rfq-mid");
    if (r.thumb) { const t = el("div", "rfq-rth"), g = el("img"); g.src = r.thumb; g.alt = ""; g.loading = "lazy"; t.append(g); d.append(t); }
    const extra = (r.extra_parts || []).length;
    mid.append(el("b", "", r.title + (extra ? ` +${extra} ${extra === 1 ? "piesă" : "piese"}` : "")));
    const tags = el("div", "rfq-tags"); if (car(r)) tags.append(el("span", "rfq-tag car", car(r))); if (r.kind && r.kind !== "ambele") tags.append(el("span", "rfq-tag kind", KIND[r.kind]));
    tags.append(el("span", "rfq-tag", [r.county, r.city].filter(Boolean).join(", ") || "România")); mid.append(tags);
    if (opts.sub) mid.append(el("small", "muted", opts.sub));
    if (opts.actions) mid.append(opts.actions);
    const right = el("div", "rfq-right"); (opts.chips || []).forEach(([t, c]) => right.append(el("em", "rfq-chip " + (c || ""), t))); if (opts.note) right.append(el("small", "muted", opts.note));
    d.append(mid, right);
    d.onclick = () => go("detail", opts.rid || r.id); d.onkeydown = (e) => { if (e.key === "Enter" && e.target === d) d.click(); };
    return d;
  }
  const priceEl = (t) => { const p = el("p", "rfq-price"); p.append(el("b", "", t)); return p; };
  const empty = (t) => el("p", "muted", t);

  /* ---------- „Ofertează piesele”: lista publică cu filtre ---------- */
  async function viewBoard() {
    head.textContent = "Ofertează piesele"; loading();
    const f = st.filt; if (!me && f.seen !== "all") f.seen = "all";
    const qs = new URLSearchParams({ seen: f.seen }); ["q", "make", "county", "kind"].forEach((k) => f[k] && qs.set(k, f[k]));
    let d; try { d = await api("/api/requests?" + qs); } catch (e) { return fail(e); }
    const box = el("div"), c = d.counts || {};
    box.append(el("p", "rfq-intro", "Cereri de piese de la cumpători. Trimite un preț la cele pe care le ai și, dacă te alege, primești datele de contact."));
    if (me) {
      const bar = el("div", "rqx-chips");
      [["new", "Nu am ofertat încă", c.new], ["all", "Toate", c.all], ["offered", "Am ofertat", c.offered], ["later", "Ofertez mai târziu", c.later], ["ignored", "Ignorate", c.ignored]].forEach(([k, t, n]) => {
        const b = el("button", "rfq-tab" + (f.seen === k ? " on" : ""), t + (n ? ` (${n})` : "")); b.type = "button"; b.onclick = () => { f.seen = k; viewBoard(); }; bar.append(b);
      });
      box.append(bar);
    }
    const form = el("form", "rqx-search"), q = inp("search", "Caută piesă, marcă, model…", f.q), mk = inp("text", "Marca"), cs = countySel(f.county, "Tot județul"), kd = el("select");
    mk.value = f.make; mk.setAttribute("list", "rfqBrands"); const dl = el("datalist"); dl.id = "rfqBrands"; BRANDS.forEach((b) => dl.append(new Option(b, b)));
    kd.append(new Option("Noi și second-hand", "")); [["noi", "Piese noi"], ["second-hand", "Second-hand"]].forEach(([v, t]) => kd.append(new Option(t, v))); kd.value = f.kind;
    const go1 = el("button", "", "Filtrează"); go1.type = "submit";
    form.append(q, mk, cs, kd, go1, dl);
    form.onsubmit = (e) => { e.preventDefault(); Object.assign(f, { q: q.value.trim(), make: mk.value.trim(), county: cs.value, kind: kd.value }); viewBoard(); };
    box.append(form);
    if (!d.requests.length) box.append(empty(f.seen === "new" && me ? "Nu mai sunt cereri la care să nu fi ofertat." : "Nu sunt cereri pentru filtrele alese."));
    d.requests.forEach((r) => {
      const acts = el("div", "rfq-ask-acts");
      if (me && !r.mine) {
        if (r.my_mark) acts.append(btn("Scoate marcajul", "ghost", async (ev) => { ev.stopPropagation(); try { await api(`/api/requests/${r.id}/mark`, "DELETE"); viewBoard(); } catch (e) { showMessage("Eroare", errText(e)); } }));
        else if (!r.my_offer_id) {
          acts.append(btn("Ofertez mai târziu", "ghost", async (ev) => { ev.stopPropagation(); try { await api(`/api/requests/${r.id}/mark`, "POST", { mark: "later" }); viewBoard(); } catch (e) { showMessage("Eroare", errText(e)); } }));
          acts.append(btn("Ignoră", "ghost", async (ev) => { ev.stopPropagation(); try { await api(`/api/requests/${r.id}/mark`, "POST", { mark: "ignored" }); viewBoard(); } catch (e) { showMessage("Eroare", errText(e)); } }));
        }
      }
      const chips = r.mine ? [["Cererea ta" + (r.offers_count ? ` · ${r.offers_count} oferte` : ""), "sold"]] : r.my_offer_id ? [["Ai ofertat " + money(r.my_price, r.my_currency), "ok"]] : [["Nicio ofertă", "wait"]];
      box.append(row(r, { chips, note: `${left(r.expires_at)} · ${when(r.created_at)}`, actions: acts.children.length ? acts : null }));
    });
    body.replaceChildren(box);
  }

  /* ---------- detaliul cererii: cumpărătorul își vede ofertele, ceilalți pot oferta ---------- */
  function requestCard(r, owner) {
    const c = el("div", "rqx-card");
    c.append(el("h3", "", r.title));
    const tags = el("div", "rfq-tags"); if (car(r)) tags.append(el("span", "rfq-tag car", car(r))); tags.append(el("span", "rfq-tag kind", KIND[r.kind] || KIND.ambele));
    tags.append(el("span", "rfq-tag", [r.county, r.city].filter(Boolean).join(", "))); const [rt, rc] = RS[r.status] || RS.open; tags.append(el("em", "rfq-chip " + rc, rt)); c.append(tags);
    if ((r.extra_parts || []).length) { const ul = el("ul", "rfq-parts-list"); [{ title: r.title }, ...r.extra_parts].forEach((p) => ul.append(el("li", "", p.title + (p.details ? " · " + p.details : "")))); c.append(ul); }
    if (r.description) c.append(el("p", "rfq-note", r.description));
    if (owner && r.vin) c.append(el("small", "muted", "Serie șasiu (VIN): " + r.vin));
    if (owner && r.ship_address) c.append(el("small", "muted", "Adresă de livrare: " + r.ship_address));
    const ph = photoStrip(r.images, r.title); if (ph) c.append(ph);
    c.append(el("small", "muted", `Cerută de ${r.buyer_name || "un cumpărător"} · ${when(r.created_at)}${r.status === "open" ? " · " + left(r.expires_at) : ""}`));
    return c;
  }

  function offerForm(rid, existing, done) {
    const f = el("form", "rfq-quote"), msg = msgBox();
    const price = inp("number", "Preț", existing ? existing.price : ""); price.min = "1"; price.step = "0.01"; price.inputMode = "decimal";
    const cur = el("select"); cur.append(new Option("lei", "RON"), new Option("€", "EUR")); cur.value = existing ? existing.currency : "RON";
    const note = area("Stare, garanție, termen de livrare, compatibilitate… (fără telefon sau linkuri)", existing ? existing.message : "", 4);
    const pp = photoPicker(6, existing ? existing.images : [], msg);
    const row1 = el("div", "rqx-pricerow"); row1.append(price, cur);
    const sub = el("button", "", existing ? "Salvează oferta" : "Trimite oferta"); sub.type = "submit";
    f.append(field("Prețul tău", row1), field("Mesaj pentru cumpărător", note), ...pp.nodes, msg, sub);
    f.onsubmit = (e) => {
      e.preventDefault(); if (pp.busy()) return;
      guarded(sub, msg, async () => {
        const payload = { price: price.value, currency: cur.value, message: note.value.trim(), image_ids: pp.ids() };
        if (existing) await api("/api/offers/" + existing.id, "PATCH", payload); else await api(`/api/requests/${rid}/offers`, "POST", payload);
        done();
      })();
    };
    return f;
  }

  async function viewDetail(id) {
    head.textContent = "Cerere"; loading();
    let d; try { d = await api("/api/requests/" + id); } catch (e) { return fail(e); }
    if (d.request.mine) return viewOwner(id);
    const r = d.request, box = el("div"); box.append(requestCard(r, false));
    const open = r.status === "open" && new Date(r.expires_at) > Date.now();
    if (!open) box.append(el("p", "muted", "Cererea nu mai primește oferte."));
    else if (!me) { box.append(el("p", "rfq-intro", "Ai piesa? Conectează-te ca să trimiți o ofertă.")); box.append(btn("Conectează-te", "", openAuth)); }
    else if (d.my_offer) {
      const o = d.my_offer, c = el("div", "rfq-facts"), [t, cl] = OS[o.status];
      c.append(el("h3", "", "Oferta ta"), el("em", "rfq-chip " + cl, t), priceEl(money(o.price, o.currency)));
      if (o.message) c.append(el("p", "rfq-note", o.message)); const ph = photoStrip(o.images, r.title); if (ph) c.append(ph);
      box.append(c);
      if (o.status === "pending") {
        const msg = msgBox(), editBox = el("div"), acts = el("div", "rfq-ask-acts");
        acts.append(btn("Modifică oferta", "ghost", () => { editBox.replaceChildren(offerForm(r.id, o, () => viewDetail(id))); }));
        const w = btn("Retrage oferta", "ghost"); w.onclick = guarded(w, msg, async () => { if (!confirm("Retragi oferta?")) return; await api("/api/offers/" + o.id, "DELETE"); viewDetail(id); });
        acts.append(w); box.append(acts, msg, editBox, qaBox(o.id, false));
      }
    } else { box.append(el("h3", "", "Trimite o ofertă")); box.append(offerForm(r.id, null, () => viewDetail(id))); }
    body.replaceChildren(box);
  }

  /* întrebările de pe o ofertă; cumpărătorul poate întreba, vânzătorul răspunde din „Întrebări” */
  function qaBox(offerId, canAsk) {
    const w = el("div", "rfq-qa-wrap"), list = el("div"), msg = msgBox();
    const load = async () => {
      try { const d = await api(`/api/offers/${offerId}/questions`); list.replaceChildren(...d.questions.map((q) => { const it = el("div", "rfq-qa-it"); it.append(el("div", "rqx-q", "Întrebare: " + q.body), el("div", q.answer ? "rqx-a" : "rqx-wait", q.answer ? "Răspuns: " + q.answer : "Așteaptă răspunsul vânzătorului")); return it; })); } catch { /* fără întrebări */ }
    };
    w.append(list); load();
    if (canAsk) {
      const f = el("form", "rfq-qform"), t = inp("text", "Pune o întrebare vânzătorului (max. 300 de caractere)"); t.maxLength = 300;
      const b = el("button", "", "Întreabă"); b.type = "submit"; f.append(t, b);
      f.onsubmit = (e) => { e.preventDefault(); if (!t.value.trim()) return; guarded(b, msg, async () => { await api(`/api/offers/${offerId}/questions`, "POST", { body: t.value.trim() }); t.value = ""; await load(); })(); };
      w.append(f, msg);
    }
    return w;
  }

  async function viewOwner(id) {
    loading(); let d; try { d = await api("/api/requests/mine/" + id); } catch (e) { return fail(e); }
    const r = d.request, box = el("div"), msg = msgBox(); box.append(requestCard(r, true));
    const acts = el("div", "rfq-ask-acts");
    if (r.status === "open" && d.editable) acts.append(btn("Modifică cererea", "ghost", () => go("new", { ...r })));
    if (r.status === "open") { const b = btn("Închide cererea", "ghost"); b.onclick = guarded(b, msg, async () => { if (!confirm("Închizi cererea? Nu va mai primi oferte.")) return; await api("/api/requests/" + id, "DELETE"); viewDetail(id); }); acts.append(b); }
    if (r.status === "closed") { const b = btn("Reactivează cererea", "", null); b.onclick = guarded(b, msg, async () => { await api(`/api/requests/${id}/reactivate`, "POST"); viewDetail(id); }); acts.append(b); }
    box.append(acts, msg, el("h3", "", `Oferte primite (${d.offers.length})`));
    if (!d.offers.length) box.append(empty("Încă nu ai primit nicio ofertă. Te anunțăm când apare."));
    d.offers.forEach((o) => {
      const c = el("div", "rfq-quote"), [t, cl] = OS[o.status], m2 = msgBox();
      const hd = el("div", "rqx-hd"), nm = el("b", "", o.seller_name || "Vânzător");
      if (window.openProfile) { nm.className = "linklike"; nm.style.cursor = "pointer"; nm.onclick = () => { dlg.close(); openProfile(o.seller_id); }; }
      hd.append(nm, el("small", "muted", stars(o.seller_rating, o.seller_rating_n)), el("em", "rfq-chip " + cl, t)); c.append(hd, priceEl(money(o.price, o.currency)));
      if (o.message) c.append(el("p", "rfq-note", o.message)); const ph = photoStrip(o.images, r.title); if (ph) c.append(ph);
      if (o.status === "accepted") {
        const k = el("div", "rfq-deal"); k.append(el("b", "", "Contact vânzător"), el("p", "", [o.seller_full_name || o.seller_name, o.seller_phone].filter(Boolean).join(" · ") || "Vânzătorul nu a completat telefonul în cont. Scrie-i în Mesaje."));
        if (o.seller_phone) { const a = el("a", "rfq-call", "Sună"); a.href = "tel:" + o.seller_phone.replace(/[^\d+]/g, ""); k.append(a); } c.append(k);
      } else if (o.status === "pending" && r.status === "open") {
        const a = el("div", "rfq-ask-acts"), ok = btn("Acceptă oferta", "", null), no = btn("Refuză", "ghost", null);
        ok.onclick = guarded(ok, m2, async () => { if (!confirm(`Accepți oferta de ${money(o.price, o.currency)}? Celelalte oferte se refuză.`)) return; await api(`/api/offers/${o.id}/accept`, "POST"); viewDetail(id); });
        no.onclick = guarded(no, m2, async () => { await api(`/api/offers/${o.id}/reject`, "POST"); viewDetail(id); });
        a.append(ok, no); c.append(a);
      }
      if (o.status !== "rejected") c.append(qaBox(o.id, o.status === "pending" && r.status === "open"));
      c.append(m2); box.append(c);
    });
    body.replaceChildren(box);
  }

  /* ---------- „Cere oferte piese”: formularul ---------- */
  function viewNew(ed) {
    ed = st.edit || null;
    head.textContent = ed && ed.id ? "Modifică cererea" : "Cere oferte piese";
    if (!me) { body.replaceChildren(el("p", "rfq-intro", "Conectează-te ca să ceri oferte pentru piese."), btn("Conectează-te", "", openAuth)); return; }
    const f = el("form", "rfq-form"), msg = msgBox(), pre = !ed && window.rfqPre ? window.rfqPre : null; window.rfqPre = null;
    const title = inp("text", "Ce piesă cauți? Ex.: far stânga, alternator, caseta direcție", ed ? ed.title : pre ? String(pre.part || "").slice(0, 150) : ""); title.maxLength = 150;
    const extraBox = el("div"), extras = (ed && ed.extra_parts ? ed.extra_parts : []).map((x) => ({ ...x }));
    const paintExtra = () => {
      extraBox.replaceChildren(...extras.map((x, i) => {
        const w = el("div", "rqx-part"), a = inp("text", "Altă piesă", x.title), b = inp("text", "Detalii (opțional)", x.details || ""), rm = btn("Scoate", "ghost", () => { extras.splice(i, 1); paintExtra(); });
        a.maxLength = 150; b.maxLength = 300; a.oninput = () => { x.title = a.value; }; b.oninput = () => { x.details = b.value; }; w.append(a, b, rm); return w;
      }));
      addP.hidden = extras.length >= 9;
    };
    const addP = btn("+ Adaugă încă o piesă", "ghost", () => { extras.push({ title: "", details: "" }); paintExtra(); });
    const make = inp("text", "Marca (ex.: Audi)", ed ? ed.make : ""); make.setAttribute("list", "rfqBrands2"); const dl = el("datalist"); dl.id = "rfqBrands2"; BRANDS.forEach((b) => dl.append(new Option(b, b)));
    const model = inp("text", "Model (ex.: A4)", ed ? ed.model : ""), year = inp("number", "An", ed ? ed.year : ""); year.min = "1950"; year.max = String(new Date().getFullYear() + 1);
    const variant = inp("text", "Versiune / caroserie (opțional)", ed ? ed.variant : ""), engine = inp("text", "Motor (ex.: 2.0 TDI 140 CP)", ed ? ed.engine : ""), vin = inp("text", "Serie șasiu (VIN, opțional)", ed ? ed.vin : ""); vin.maxLength = 17;
    const kind = el("select"); Object.entries(KIND).forEach(([v, t]) => kind.append(new Option(t, v))); kind.value = ed ? ed.kind : "ambele";
    const county = countySel(ed ? ed.county : me.county || ""), city = inp("text", "Localitatea", ed ? ed.city : me.city || "");
    const desc = area("Detalii: cod piesă (OEM), simptome, ce mai trebuie să știe vânzătorul. Fără telefon sau linkuri: cererea e publică.", ed ? ed.description : pre ? String(pre.details || "").slice(0, 1000) : "", 4); desc.maxLength = 2000;
    const ship = inp("text", "Adresa de livrare (o văd doar vânzătorul ales)", ed ? ed.ship_address : "");
    const pp = photoPicker(6, ed ? ed.images : [], msg);
    const sub = el("button", "", ed ? "Salvează modificările" : "Trimite cererea"); sub.type = "submit";
    f.append(el("p", "rfq-intro", "Descrie piesa și mașina. Vânzătorii îți trimit oferte, tu o alegi pe cea mai bună. Cererea rămâne deschisă 7 zile."),
      field("Piesa căutată", title), extraBox, addP, dl, field("Marca", make), field("Model", model), field("An", year), field("Versiune", variant), field("Motor", engine), field("Serie șasiu (VIN)", vin, "Ajută la potrivirea exactă. Se vede doar de vânzătorul pe care îl alegi."),
      field("Ce fel de piese accepți", kind), field("Județ", county), field("Localitate", city), field("Detalii", desc), field("Adresă de livrare", ship), el("span", "rfq-lbl", "Poze (opțional)"), ...pp.nodes, msg, sub);
    paintExtra();
    f.onsubmit = (e) => {
      e.preventDefault(); if (pp.busy()) return;
      guarded(sub, msg, async () => {
        const payload = { title: title.value.trim(), extra_parts: extras.filter((x) => String(x.title).trim()).map((x) => ({ title: x.title.trim(), details: String(x.details || "").trim() })), make: make.value.trim(), model: model.value.trim(), year: year.value, variant: variant.value.trim(), engine: engine.value.trim(), vin: vin.value.trim(), kind: kind.value, county: county.value, city: city.value.trim(), description: desc.value.trim(), ship_address: ship.value.trim(), image_ids: pp.ids() };
        if (ed) { await api("/api/requests/" + ed.id, "PATCH", payload); go("detail", ed.id); } else { const r = await api("/api/requests", "POST", payload); go("detail", r.request.id); }
        window.rfqSummaryRefresh && rfqSummaryRefresh();
      })();
    };
    body.replaceChildren(f);
  }

  /* ---------- Cererile mele ---------- */
  async function viewMine() {
    head.textContent = "Cererile mele"; loading();
    let d; try { d = await api("/api/requests/mine"); } catch (e) { return fail(e); }
    const box = el("div"), bar = el("div", "rqx-chips"), TABS = [["open", "Active"], ["closed", "Inactive"], ["matched", "Rezolvate"]];
    TABS.forEach(([k, t]) => { const n = d.requests.filter((r) => r.status === k).length, b = el("button", "rfq-tab" + (st.mineTab === k ? " on" : ""), `${t} (${n})`); b.type = "button"; b.onclick = () => { st.mineTab = k; viewMine(); }; bar.append(b); });
    const q = inp("search", "Caută în cererile mele…", st.mineQ); q.oninput = () => { st.mineQ = q.value; paint(); };
    const list = el("div"); box.append(bar, q, list);
    const paint = () => {
      const t = st.mineQ.trim().toLowerCase(), rs = d.requests.filter((r) => r.status === st.mineTab && (!t || (r.title + " " + car(r)).toLowerCase().includes(t)));
      if (!rs.length) { list.replaceChildren(empty(st.mineTab === "open" ? "Nu ai cereri active. Apasă „Cere oferte piese”." : "Nimic aici.")); return; }
      list.replaceChildren(...rs.map((r) => {
        const chips = [[`${r.offers_count} ${r.offers_count === 1 ? "ofertă" : "oferte"}`, r.new_offers ? "ok" : "wait"]]; if (r.new_offers) chips.unshift([`${r.new_offers} noi`, "ok"]);
        let acts = null; if (r.status === "closed") { acts = el("div", "rfq-ask-acts"); acts.append(btn("Reactivează", "ghost", async (ev) => { ev.stopPropagation(); try { await api(`/api/requests/${r.id}/reactivate`, "POST"); viewMine(); } catch (e) { showMessage("Eroare", errText(e)); } })); }
        return row(r, { chips, hot: r.new_offers > 0, note: r.best_price ? "de la " + money(r.best_price, "RON") : left(r.expires_at), actions: acts });
      }));
    };
    paint(); body.replaceChildren(box);
  }

  async function viewReceived() {
    head.textContent = "Ofertele primite"; loading();
    let d; try { d = await api("/api/offers/received"); } catch (e) { return fail(e); }
    const box = el("div"); if (!d.offers.length) box.append(empty("Nu ai primit încă nicio ofertă."));
    d.offers.forEach((o) => { const [t, c] = OS[o.status]; box.append(row({ id: o.request_id, title: o.request_title, thumb: o.thumb || o.req_thumb, extra_parts: [], county: "", city: "" }, { rid: o.request_id, chips: [[money(o.price, o.currency), "sold"], [t, c]], sub: `${o.seller_name}${o.seller_rating ? " · " + stars(o.seller_rating) : ""}`, note: when(o.created_at) })); });
    body.replaceChildren(box);
  }

  /* ---------- Ofertele mele (răspunsuri la cereri) ---------- */
  async function viewOffers() {
    head.textContent = "Ofertele mele"; loading();
    let d; try { d = await api("/api/offers/mine"); } catch (e) { return fail(e); }
    const box = el("div"); if (!d.offers.length) box.append(empty("Nu ai trimis nicio ofertă. Deschide „Ofertează piesele”."));
    d.offers.forEach((o) => {
      const [t, c] = OS[o.status], acts = el("div");
      if (o.status === "accepted") {
        const k = el("div", "rfq-deal"); k.append(el("b", "", "Cumpărător"), el("p", "", [o.buyer_full_name || o.buyer_name, o.buyer_phone].filter(Boolean).join(" · ") || "Scrie-i în Mesaje."));
        if (o.ship_address) k.append(el("p", "", "Livrare: " + o.ship_address)); if (o.vin) k.append(el("p", "", "VIN: " + o.vin)); k.onclick = (e) => e.stopPropagation(); acts.append(k);
      }
      box.append(row({ id: o.request_id, title: o.request_title, make: o.make, model: o.model, year: o.year, county: o.county, city: o.city, thumb: o.req_thumb, extra_parts: [], kind: "ambele" }, { rid: o.request_id, chips: [[money(o.price, o.currency), "sold"], [t, c]], sub: o.message ? o.message.slice(0, 90) : "", note: when(o.created_at), actions: acts.children.length ? acts : null }));
    });
    body.replaceChildren(box);
  }

  /* ---------- Comenzi ---------- */
  async function viewOrders() {
    head.textContent = "Comenzi"; loading();
    let d; try { d = await api("/api/orders"); } catch (e) { return fail(e); }
    const box = el("div"); if (!d.orders.length) box.append(empty("Nu ai comenzi încă. Apar când o ofertă e acceptată."));
    d.orders.forEach((s) => {
      const c = el("div", "rfq-quote"), msg = msgBox(), hd = el("div", "rqx-hd");
      hd.append(el("b", "", s.title), el("em", "rfq-chip " + (s.status === "done" ? "ok" : s.status === "cancelled" ? "bad" : "wait"), ORD[s.status]));
      c.append(hd, priceEl(money(s.price, s.currency)), el("small", "muted", `${s.i_buy ? "Vânzător" : "Cumpărător"}: ${s.other_name || "—"}${s.other_phone ? " · " + s.other_phone : ""} · ${when(s.created_at)}`));
      if (s.status !== "done" && s.status !== "cancelled") {
        const a = el("div", "rfq-ask-acts"), set = (b, st2, ask) => { b.onclick = guarded(b, msg, async () => { if (ask && !confirm(ask)) return; await api(`/api/orders/${s.id}/status`, "PATCH", { status: st2 }); viewOrders(); }); return b; };
        if (!s.i_buy && s.status === "new") a.append(set(btn("Confirmă comanda", ""), "confirmed"));
        if (!s.i_buy && s.status !== "shipped") a.append(set(btn("Marchează expediată", "ghost"), "shipped"));
        if (s.i_buy) a.append(set(btn("Am primit piesa", ""), "done"));
        a.append(set(btn("Anulează", "ghost"), "cancelled", "Anulezi comanda?")); c.append(a);
      }
      c.append(msg); box.append(c);
    });
    body.replaceChildren(box);
  }

  /* ---------- Întrebări primite pe ofertele mele ---------- */
  async function viewQuestions() {
    head.textContent = "Întrebări"; loading();
    let d; try { d = await api("/api/offer-questions"); } catch (e) { return fail(e); }
    const box = el("div"); if (!d.questions.length) box.append(empty("Nu ai primit întrebări pe oferte."));
    d.questions.forEach((q) => {
      const c = el("div", "rfq-quote"), msg = msgBox(); c.append(el("b", "", q.request_title), el("small", "muted", ` · oferta ta ${money(q.price, q.currency)}`), el("div", "rqx-q", "Întrebare: " + q.body));
      if (q.answer) c.append(el("div", "rqx-a", "Răspunsul tău: " + q.answer));
      else { const f = el("form", "rfq-qform"), t = inp("text", "Răspunsul tău (max. 500 de caractere)"); t.maxLength = 500; const b = el("button", "", "Răspunde"); b.type = "submit"; f.append(t, b);
        f.onsubmit = (e) => { e.preventDefault(); if (!t.value.trim()) return; guarded(b, msg, async () => { await api(`/api/offer-questions/${q.id}/answer`, "POST", { answer: t.value.trim() }); viewQuestions(); })(); }; c.append(f); }
      c.append(msg); box.append(c);
    });
    body.replaceChildren(box);
  }

  /* ---------- puncte de intrare folosite de script.js ---------- */
  window.openRequests = (view, pre) => {
    if (!view) view = pre ? "new" : "board";
    window.rfqPre = me && pre && typeof pre === "object" ? pre : null;
    build(); if (typeof accClosePage === "function" && typeof accIsOpen === "function" && accIsOpen()) accClosePage();
    if (!dlg.open) dlg.showModal(); go(view);
  };
  window.rfqSummaryRefresh = async () => {
    if (!me) Object.assign(rfqSum, { open: 0, waiting: 0, new_quotes: 0, new_answers: 0, open_questions: 0 });
    else { try { Object.assign(rfqSum, await api("/api/requests/summary")); } catch { return; } }
    const n = rfqSum.new_quotes + rfqSum.new_answers, c = document.getElementById("accRfqN");
    if (c) { const t = n ? `${n} ${n === 1 ? "nou" : "noi"}` : (rfqSum.waiting ? String(rfqSum.waiting) : ""); c.textContent = t; c.hidden = !t; c.classList.toggle("hot", n > 0); }
    const tl = document.getElementById("accTileRfq"); if (tl) tl.textContent = n || rfqSum.waiting || 0;
    const bb = document.getElementById("accBarBuy"); if (bb) bb.classList.toggle("hot", n > 0);
    if (dlg && dlg.open) tabs();
  };
  window.rfqRefresh = () => { window.rfqSummaryRefresh(); if (dlg && dlg.open && ["mine", "received", "offers", "orders", "questions", "detail"].includes(st.view) && !body.contains(document.activeElement)) go(st.view, st.id); };
  window.rfqMsg = () => {};

  const nav = document.getElementById("mainMenu");
  if (nav) { const a = el("a", "", "Oferte piese"); a.href = ROUTES.board; a.addEventListener("click", (e) => { e.preventDefault(); openRequests(); }); nav.append(a); }
  const startRoute = parsePath(location.pathname) || (location.hash === "#cereri" ? ["board"] : null);
  if (startRoute) setTimeout(() => { build(); if (typeof accClosePage === "function" && typeof accIsOpen === "function" && accIsOpen()) accClosePage(); if (!dlg.open) dlg.showModal(); st.pop = true; try { go(startRoute[0], startRoute[1]); } finally { st.pop = false; } }, 0);
  if (typeof window.addEventListener === "function") window.addEventListener("popstate", () => {
    const r = parsePath(location.pathname); st.pop = true;
    try { if (r) { build(); if (!dlg.open) dlg.showModal(); go(r[0], r[1]); } else if (dlg && dlg.open) dlg.close(); } finally { st.pop = false; }
  });
})();
