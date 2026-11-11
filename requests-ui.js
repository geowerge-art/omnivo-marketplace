/* „Cere oferte” pentru piese: cumpărătorul cere, dezmembrătorii oferă (în ascuns), cumpărătorul alege.
   Folosește din script.js: $, api, me, COUNTIES, showMessage, errText, ERR, openAuth. Backend: requests.js. */
(() => {
  Object.assign(ERR, {
    PIESA_INVALIDA: "Scrie ce piesă cauți (minimum 3 caractere).", MARCA_INVALIDA: "Scrie marca mașinii.", AN_INVALID: "Anul mașinii nu pare corect.",
    VIN_INVALID: "Seria de șasiu (VIN) are 11-17 caractere, fără I, O sau Q.", JUDET_LIPSA: "Alege județul.", DETALII_PREA_LUNGI: "Detaliile sunt prea lungi (maximum 1000 de caractere).",
    PREA_MULTE_CERERI: "Ai trimis prea multe cereri azi. Încearcă mâine.", PRET_INVALID: "Scrie un preț valid.", TRANSPORT_INVALID: "Costul transportului nu e valid.",
    GARANTIE_INVALIDA: "Garanția poate fi între 0 și 730 de zile.", NOTA_PREA_LUNGA: "Nota e prea lungă (maximum 600 de caractere).",
    FARA_CONTACT_IN_OFERTA: "Nu scrie telefon, email sau linkuri în ofertă. Vă puteți scrie în chat după ce cumpărătorul alege oferta.",
    DEZMEMBRATOR_NEAPROBAT: "Contul tău de dezmembrător nu e încă aprobat.", CERERE_INCHISA: "Cererea s-a închis între timp.", OFERTA_NEGASITA: "Oferta nu mai e disponibilă.",
    POZA_INVALIDA: "Poza nu e bună. Alege un JPG, PNG sau WebP.", PREA_MULTE_POZE: "Ai prea multe poze neatașate. Trimite oferta sau scoate câteva.", STORAGE_EROARE: "Pozele nu se pot salva acum. Încearcă din nou.",
    FARA_CONTACT_IN_CERERE: "Cererea e publică: nu scrie telefon, email sau linkuri. Contactul se dă în chat, după ce alegi o ofertă.",
    FIRMA_INVALIDA: "Scrie numele firmei.", CUI_INVALID: "CUI-ul trebuie să aibă doar cifre (cu sau fără RO în față)."
  });
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const nf = (n) => Number(n).toLocaleString("ro-RO");
  const cur = (c) => (c === "EUR" ? "€" : "lei");
  const money = (n, c) => `${nf(n)} ${cur(c)}`;
  const when = (d) => new Date(d).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const left = (d) => { const ms = new Date(d) - Date.now(); if (ms <= 0) return "termen depășit"; const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h >= 1 ? `mai ai ${h} h` : `mai ai ${m} min`; };
  const STATE = { noua: "Piesă nouă", excelenta: "Stare excelentă", buna: "Stare bună", uzata: "Uzată, funcțională", "de-reparat": "De reparat" };
  const KIND = { oricare: "Noi sau second-hand", "second-hand": "Doar second-hand", noi: "Doar piese noi" };
  const RS = { open: ["Deschisă", "ok"], awarded: ["Câștigător ales", "sold"], expired: ["Expirată", "wait"], cancelled: ["Anulată", "bad"] };
  const BRANDS = ["Audi", "BMW", "Dacia", "Ford", "Opel", "Renault", "Skoda", "Volkswagen", "Mercedes", "Toyota", "Peugeot", "Citroen", "Fiat", "Hyundai", "Kia", "Seat", "Honda", "Mazda", "Nissan", "Volvo"];
  const title = (r) => [r.part, r.brand, r.model, r.year].filter(Boolean).join(" ");

  const st = { view: "mine", id: 0, quote: 0, timer: null };
  let dlg = null, body = null, head = null;

  const CHEV = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  /* aceeași pagină pe tot ecranul ca „Mesaje” (clasa chatpage): pe telefon ocupă tot ecranul, pe calculator e un panou centrat */
  function build() {
    if (dlg) return;
    dlg = el("dialog", "chatpage rfq-page"); dlg.id = "rfqDialog"; dlg.setAttribute("aria-label", "Oferte piese");
    const top = el("header", "cp-head"); head = el("h2", "", "Oferte piese");
    const x = el("button", "cp-back"); x.type = "button"; x.setAttribute("aria-label", "Înapoi"); x.innerHTML = CHEV;
    x.onclick = () => { if (st.view === "detail") go("mine"); else if (st.view === "chat") go(st.from === "offers" ? "offers" : "detail", st.id); else dlg.close(); };
    top.append(x, head);
    const tabs = el("nav", "rfq-tabs"); tabs.id = "rfqTabs";
    body = el("div", "rfq-body"); body.id = "rfqBody";
    dlg.append(top, tabs, body); document.body.append(dlg);
    dlg.addEventListener("close", () => { clearInterval(st.timer); st.timer = null; });
  }

  function tabs() {
    const items = [["board", "Piese căutate"]];
    if (me) items.push(["mine", "Cererile mele"], ["new", "Cerere nouă"], ["offers", "Ofertele mele"], ["dealer", "Profil firmă"]);
    if (me && ["admin", "moderator"].includes(me.role)) items.push(["admin", "Aprobări"]);
    const on = (k) => st.view === k || (k === "mine" && (st.view === "detail" || (st.view === "chat" && st.from !== "offers"))) || (k === "offers" && st.view === "chat" && st.from === "offers");
    $("rfqTabs").replaceChildren(...items.map(([k, n]) => { const b = el("button", "rfq-tab" + (on(k) ? " on" : ""), n); b.type = "button"; b.onclick = () => go(k); return b; }));
  }

  function go(view, arg) {
    if (!me && view !== "board") return openAuth();
    clearInterval(st.timer); st.timer = null; st.view = view;
    if (view === "detail") st.id = arg;
    if (view !== "chat") st.from = view === "offers" ? "offers" : view === "detail" || view === "mine" ? "buyer" : st.from;
    tabs();
    ({ board: viewBoard, mine: viewMine, new: viewNew, detail: viewDetail, offers: viewOffers, dealer: viewDealer, admin: viewAdmin, chat: viewChat })[view](arg);
    body.scrollTop = 0;
  }
  const loading = () => body.replaceChildren(el("p", "muted", "Se încarcă…"));
  const fail = (e) => body.replaceChildren(el("p", "err", errText(e)));
  const field = (label, input, hint) => { const l = el("label", "rfq-f"); l.append(el("span", "", label), input); if (hint) l.append(el("small", "muted", hint)); return l; };
  const inp = (type, ph, val) => { const i = el("input"); i.type = type; if (ph) i.placeholder = ph; if (val != null) i.value = val; return i; };
  const countySel = (val, ph) => { const s = el("select"); s.append(new Option(ph || "Alege județul", "")); COUNTIES.forEach((c) => s.append(new Option(c, c))); s.value = val || ""; return s; };

  /* ---------- poze: se micșorează în browser (max 1600 px), apoi serverul le recodează și scoate datele GPS ---------- */
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

  /* selector de poze (max `max`): încarcă imediat, apoi id-urile se trimit odată cu formularul */
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
      for (const fl of list) { try { const im = await uploadPhoto(fl); photos.push({ id: im.id, thumb: im.thumb || im.url }); paint(); } catch (e) { msg.textContent = errText(e); msg.hidden = false; break; } }
      add.disabled = false; add.textContent = label; paint();
    };
    paint();
    return { nodes: [strip, add, file], ids: () => photos.map((p) => p.id), busy: () => add.disabled };
  }
  /* poze mici pe o cerere (se deschid mari la atingere) */
  function photoStrip(list, alt) {
    if (!list || !list.length) return null;
    const strip = el("div", "rfq-photos sm");
    list.forEach((im, i) => { const b = el("button", "rfq-ph"); b.type = "button"; b.setAttribute("aria-label", `Poza ${i + 1}`); const g = el("img"); g.src = im.thumb || im.url; g.alt = ""; g.loading = "lazy"; b.append(g); b.onclick = () => openLightbox(list.map((x) => x.url), i, alt); strip.append(b); });
    return strip;
  }

  /* ---------- cumpărător: lista cererilor ---------- */
  async function viewMine() {
    loading();
    let d; try { d = await api("/api/requests/mine"); } catch (e) { return fail(e); }
    const out = [el("p", "muted rfq-intro", "Descrii piesa, iar dezmembrători și persoane din toată țara îți trimit oferte în ascuns. Tu o alegi pe cea mai bună.")];
    const nb = el("button", "primary", "Cere oferte pentru o piesă"); nb.type = "button"; nb.onclick = () => go("new"); out.push(nb);
    if (!d.requests.length) out.push(el("p", "muted", "Nu ai nicio cerere încă."));
    d.requests.forEach((r) => {
      const b = el("button", "rfq-row"); b.type = "button";
      const m = el("span", "rfq-mid"); m.append(el("b", "", title(r)), el("small", "muted", `${r.county} · ${r.status === "open" ? (r.accepting ? left(r.expires_at) : "se așteaptă alegerea ta") : when(r.created_at)}`));
      const right = el("span", "rfq-right"); const [t, c] = RS[r.status] || [r.status, ""]; right.append(el("em", "rfq-chip " + c, t));
      right.append(el("small", "", r.quotes ? `${r.quotes} ${r.quotes === 1 ? "ofertă" : "oferte"}${r.best_ron ? " · de la " + money(r.best_ron, "RON") : ""}` : "nicio ofertă încă"));
      if (r.thumb) { const th = el("span", "rfq-rth"), g = el("img"); g.src = r.thumb; g.alt = ""; g.loading = "lazy"; th.append(g); b.append(th); }
      b.append(m, right); b.onclick = () => go("detail", r.id); out.push(b);
    });
    body.replaceChildren(...out);
  }

  /* ---------- cumpărător: cerere nouă ---------- */
  function viewNew() {
    const part = el("textarea"); part.rows = 2; part.maxLength = 200; part.placeholder = "Ex.: far stânga, cutie de viteze automată, bară față…";
    const brand = inp("text", "Ex.: Volkswagen"); brand.setAttribute("list", "rfqBrands"); brand.maxLength = 40;
    const dl = el("datalist"); dl.id = "rfqBrands"; BRANDS.forEach((b) => dl.append(new Option(b)));
    const model = inp("text", "Ex.: Golf 7"), year = inp("number", "2015"); year.min = 1950; year.max = new Date().getFullYear() + 1;
    const engine = inp("text", "Ex.: 2.0 TDI 150 CP"), vin = inp("text", "Opțional, dar duce la ofertă potrivită"); vin.maxLength = 17;
    const county = countySel(), city = inp("text", "Localitate (opțional)");
    const det = el("textarea"); det.rows = 3; det.maxLength = 1000; det.placeholder = "Culoare, variantă de echipare, defecte acceptate…";
    const hours = el("select"); [[24, "24 de ore"], [48, "48 de ore"], [72, "72 de ore"]].forEach(([v, t]) => hours.append(new Option(t, v))); hours.value = 48;
    const del = el("input"); del.type = "checkbox"; del.checked = true; const delL = el("label", "rfq-chk"); delL.append(del, " Accept și livrare prin curier");
    const kind = el("select"); Object.entries(KIND).forEach(([v, t]) => kind.append(new Option(t, v)));
    const msg = el("p", "err"); msg.hidden = true;
    const pp = photoPicker(6, [], msg), phWrap = el("div"); phWrap.append(...pp.nodes);
    const go1 = el("button", "primary", "Trimite cererea"); go1.type = "button";
    go1.onclick = async () => {
      if (pp.busy()) { msg.textContent = "Așteaptă să se termine încărcarea pozelor."; msg.hidden = false; return; }
      go1.disabled = true; msg.hidden = true;
      try { const r = await api("/api/requests", "POST", { part: part.value, brand: brand.value, model: model.value, year: year.value, engine: engine.value, vin: vin.value, county: county.value, city: city.value, details: det.value, kind: kind.value, delivery: del.checked, hours: Number(hours.value), image_ids: pp.ids() }); go("detail", r.request.id); }
      catch (e) { msg.textContent = errText(e); msg.hidden = false; go1.disabled = false; }
    };
    body.replaceChildren(el("p", "muted rfq-intro", "Cererea e publică: oricine o poate vedea și poate oferi, iar dezmembrătorii potriviți sunt anunțați. Ofertanții nu văd ofertele celorlalți, iar contactul tău rămâne ascuns până alegi tu."),
      field("Ce piesă cauți?", part), field("Marca", brand), dl, field("Modelul", model), field("Anul fabricației", year), field("Motorizare", engine), field("Serie de șasiu (VIN)", vin),
      field("Ce fel de piese accepți?", kind), field("Județ", county), field("Localitate", city), field("Detalii", det), field("Poze (opțional)", phWrap, "Maximum 6 poze · JPG, PNG sau WebP. Ajută ofertanții să recunoască piesa."), delL, field("Cât timp primești oferte?", hours), msg, go1);
  }

  /* ---------- cumpărător: o cerere cu ofertele ei ---------- */
  async function viewDetail(id) {
    id = id || st.id; loading();
    let d; try { d = await api("/api/requests/" + id); } catch (e) { return fail(e); }
    const r = d.request, out = [], back = el("button", "link-btn", "‹ Toate cererile"); back.type = "button"; back.onclick = () => go("mine"); out.push(back);
    const hd = el("section", "rfq-head"); hd.append(el("h3", "", title(r)));
    hd.append(el("p", "muted", [r.engine, r.vin && "VIN " + r.vin, r.county + (r.city ? ", " + r.city : ""), r.delivery ? "acceptă livrare" : "doar ridicare", KIND[r.kind]].filter(Boolean).join(" · ")));
    if (r.details) hd.append(el("p", "", r.details));
    { const ph = photoStrip(d.photos, r.part); if (ph) hd.append(ph); }
    const [t, c] = RS[r.status] || [r.status, ""];
    const sp = el("p"); sp.append(el("em", "rfq-chip " + c, t));
    if (r.status === "open") sp.append(el("small", "muted", r.accepting ? ` ${left(r.expires_at)} ca să primești oferte` : " termenul pentru oferte a trecut; poți alege dintre cele primite"));
    hd.append(sp);
    out.push(hd);
    if (!d.quotes.length) out.push(el("p", "muted rfq-empty", r.status === "open" ? "Nicio ofertă încă. Dezmembrătorii au fost anunțați; te anunțăm când sosește prima ofertă." : "Cererea nu a primit oferte."));
    d.quotes.forEach((q, i) => out.push(quoteCard(r, q, i === 0 && q.status !== "won" && d.quotes.filter((x) => x.status === "sent").length > 1)));
    if (["expired", "cancelled"].includes(r.status) && !r.awarded_quote_id) {
      const re = el("button", "primary", "Redeschide cererea pentru încă 48 h"); re.type = "button";
      re.onclick = async () => { re.disabled = true; try { await api(`/api/requests/${r.id}/reactivate`, "POST"); viewDetail(r.id); } catch (e) { showMessage("Eroare", errText(e)); re.disabled = false; } };
      out.push(re);
    }
    if (r.status === "open") {
      const cn = el("button", "ghost", "Anulează cererea"); cn.type = "button";
      cn.onclick = async () => { if (!confirm("Anulezi cererea? Ofertele primite se închid.")) return; try { await api(`/api/requests/${r.id}/cancel`, "POST"); go("mine"); } catch (e) { showMessage("Eroare", errText(e)); } };
      out.push(cn);
      st.timer = setInterval(() => { if (!dlg.open || st.view !== "detail") return clearInterval(st.timer); if (!document.activeElement || !body.contains(document.activeElement)) viewDetail(r.id); }, 20000);
    }
    body.replaceChildren(...out);
  }

  function quoteCard(r, q, best) {
    const card = el("article", "rfq-quote" + (q.status === "won" ? " won" : q.status === "lost" ? " lost" : ""));
    const top = el("div", "rfq-qtop"); const nm = el("b", "", q.company);
    const rate = q.rating ? ` · ★ ${q.rating} (${q.rating_count})` : "";
    top.append(nm, el("small", "muted", [q.dealer_city, q.dealer_county].filter(Boolean).join(", ") + rate));
    top.append(el("em", "rfq-chip", q.verified ? "Firmă verificată" : "Persoană fizică"));
    if (q.status === "won") top.append(el("em", "rfq-chip sold", "Câștigătoare")); else if (best) top.append(el("em", "rfq-chip ok", "Cel mai mic total"));
    const pr = el("div", "rfq-price"); pr.append(el("b", "", money(q.price, q.currency)));
    pr.append(el("span", "muted", q.shipping == null ? " + transport de stabilit" : q.shipping === 0 ? " · transport gratuit" : ` + ${money(q.shipping, q.currency)} transport`));
    const facts = el("ul", "rfq-facts"); [STATE[q.state], q.warranty_days ? `Garanție ${q.warranty_days} zile` : "Fără garanție", q.pickup ? "Ridicare din parc" : "Doar livrare"].forEach((f) => facts.append(el("li", "", f)));
    card.append(top, pr, facts); if (q.note) card.append(el("p", "rfq-note", q.note));
    if (q.images && q.images.length) {
      const strip = el("div", "rfq-photos");
      q.images.forEach((im, i) => { const b = el("button", "rfq-ph"); b.type = "button"; b.setAttribute("aria-label", `Poza ${i + 1}`); const g = el("img"); g.src = im.thumb || im.url; g.alt = ""; g.loading = "lazy"; b.append(g); b.onclick = () => openLightbox(q.images.map((x) => x.url), i, q.company); strip.append(b); });
      card.append(strip);
    }
    if (q.status === "sent" && r.status === "open") {
      const b = el("button", "primary", "Alege această ofertă"); b.type = "button";
      b.onclick = async () => {
        if (!confirm(`Alegi oferta ${q.company} de ${money(q.price, q.currency)}? Celelalte oferte se închid.`)) return; b.disabled = true;
        try { await api(`/api/requests/${r.id}/award/${q.id}`, "POST"); st.quote = q.id; go("chat", q.id); } catch (e) { showMessage("Eroare", errText(e)); b.disabled = false; }
      };
      card.append(b);
    }
    if (q.status === "won") {
      if (q.phone) { const a = el("a", "ghost rfq-call", "Sună: " + q.phone); a.href = "tel:" + q.phone.replace(/[^\d+]/g, ""); card.append(a); }
      const c = el("button", "primary", "Deschide chatul"); c.type = "button"; c.onclick = () => go("chat", q.id); card.append(c);
    }
    return card;
  }

  /* ---------- chatul ofertei câștigătoare ---------- */
  async function viewChat(qid) {
    qid = qid || st.quote; st.quote = qid;
    const list = el("div", "rfq-chat"), ta = el("textarea"); ta.rows = 2; ta.maxLength = 2000; ta.placeholder = "Scrie un mesaj…";
    const send = el("button", "primary", "Trimite"); send.type = "button";
    const back = el("button", "link-btn", "‹ Înapoi"); back.type = "button"; back.onclick = () => go(st.from === "offers" ? "offers" : "detail", st.id);
    const ttl = el("h3", "");
    body.replaceChildren(back, ttl, list, ta, send);
    let sig = "";
    const load = async () => {
      try {
        const d = await api(`/api/requests/quote/${qid}/chat`); const s = d.messages.map((m) => m.id).join(",");
        ttl.textContent = `${d.title} · ${d.with}`; if (s === sig) return; sig = s;
        list.replaceChildren(...(d.messages.length ? d.messages.map((m) => { const b = el("div", "rfq-msg" + (m.mine ? " mine" : "")); b.append(el("span", "", m.body), el("small", "", when(m.created_at))); return b; }) : [el("p", "muted", "Scrie primul mesaj: stabiliți livrarea, plata și ridicarea.")]));
        list.scrollTop = list.scrollHeight;
      } catch (e) { list.replaceChildren(el("p", "err", errText(e))); }
    };
    send.onclick = async () => { const t = ta.value.trim(); if (!t) return; send.disabled = true; try { await api(`/api/requests/quote/${qid}/chat`, "POST", { body: t }); ta.value = ""; await load(); } catch (e) { showMessage("Eroare", errText(e)); } send.disabled = false; };
    await load();
    st.timer = setInterval(() => { if (!dlg.open || st.view !== "chat") return clearInterval(st.timer); load(); }, 8000);
  }

  /* ---------- dezmembrător ---------- */
  /* panoul public: cererile deschise, vizibile și fără cont; oricine conectat poate oferi */
  async function viewBoard() {
    const q = inp("search", "Caută: piesă, marcă, model"), brand = inp("text", "Marca"), county = countySel("", "Toate județele");
    brand.setAttribute("list", "rfqBrands"); const dl = el("datalist"); dl.id = "rfqBrands"; BRANDS.forEach((b) => dl.append(new Option(b)));
    const seen = el("select"); [["new", "Încă n-am răspuns"], ["all", "Toate cererile"], ["offered", "Am trimis ofertă"], ["later", "Pentru mai târziu"], ["ignored", "Nu mă interesează"]].forEach(([v, t]) => seen.append(new Option(t, v)));
    const list = el("div", "rfq-list"), bar = el("div", "rfq-filters"); bar.append(q, brand, county, dl); if (me) bar.append(seen);
    const nb = el("button", "primary", me ? "Caut o piesă" : "Intră în cont ca să ceri sau să oferi"); nb.type = "button"; nb.onclick = () => (me ? go("new") : openAuth());
    body.replaceChildren(el("p", "muted rfq-intro", "Piese căutate chiar acum de cumpărători din toată țara. Ai piesa? Trimite o ofertă; ceilalți ofertanți nu o văd."), nb, bar, list);
    let seq = 0, tm = null;
    const load = async () => {
      const my = ++seq; list.replaceChildren(el("p", "muted", "Se încarcă…"));
      let d; try { d = await api("/api/requests/open?" + new URLSearchParams({ q: q.value, brand: brand.value, county: county.value, state: me ? seen.value : "all" })); } catch (e) { if (my === seq) list.replaceChildren(el("p", "err", errText(e))); return; }
      if (my !== seq) return;
      list.replaceChildren(...(d.requests.length ? d.requests.map((r) => askCard(r, load)) : [el("p", "muted rfq-empty", seen.value === "new" && me ? "Nicio cerere nouă pentru tine. Schimbă filtrul ca să le vezi pe toate." : "Nicio cerere pentru aceste filtre.")]));
    };
    const later = () => { clearTimeout(tm); tm = setTimeout(load, 350); };
    q.oninput = later; brand.oninput = later; county.onchange = load; seen.onchange = load; load();
  }

  /* o cerere în panou: piesa mare, mașina pe etichete, timpul rămas ca o bară; acțiuni rapide pentru ofertant */
  function askCard(r, onDone) {
    const card = el("article", "rfq-ask" + (r.my_mark === "ignored" ? " dim" : ""));
    const total = Math.max(1, new Date(r.expires_at) - new Date(r.created_at)), frac = Math.max(0, Math.min(1, (new Date(r.expires_at) - Date.now()) / total));
    const hd = el("div", "rfq-ask-hd"); hd.append(el("b", "rfq-ask-part", r.part), el("span", "rfq-ask-left", left(r.expires_at).replace("mai ai ", "")));
    const bar = el("div", "rfq-bar"); const fill = el("i"); fill.style.width = Math.round(frac * 100) + "%"; bar.append(fill);
    const tags = el("div", "rfq-tags");
    [[r.brand + (r.model ? " " + r.model : "") + (r.year ? " · " + r.year : ""), "car"], [r.engine, ""], [r.county, "loc"], [r.kind !== "oricare" ? KIND[r.kind] : "", "kind"], [r.delivery ? "livrare" : "ridicare", ""]]
      .forEach(([t, c]) => { if (t) tags.append(el("span", "rfq-tag " + c, t)); });
    card.append(hd, bar, tags); if (r.details) card.append(el("p", "rfq-note", r.details));
    { const ph = photoStrip(r.photos, r.part); if (ph) card.append(ph); }
    const foot = el("div", "rfq-ask-ft"); foot.append(el("small", "muted", r.quotes ? `${r.quotes} ${r.quotes === 1 ? "ofertă primită" : "oferte primite"}` : "încă nicio ofertă"));
    if (r.my_mark === "later") foot.append(el("em", "rfq-chip wait", "Pentru mai târziu")); if (r.my_mark === "ignored") foot.append(el("em", "rfq-chip", "Ignorată"));
    if (r.quote_id) foot.append(el("em", "rfq-chip ok", "Ofertă trimisă"));
    card.append(foot);
    if (r.mine) { card.append(el("p", "muted", "Aceasta este cererea ta.")); return card; }
    const acts = el("div", "rfq-ask-acts");
    const offer = el("button", r.quote_id ? "ghost" : "primary", r.quote_id ? "Modifică oferta" : "Trimit ofertă"); offer.type = "button";
    offer.onclick = () => { if (!me) return openAuth(); acts.replaceWith(quoteForm(r, onDone)); };
    acts.append(offer);
    if (me && !r.quote_id) {
      const mk = async (mark) => { try { if (r.my_mark === mark) await api(`/api/requests/${r.id}/mark`, "DELETE"); else await api(`/api/requests/${r.id}/mark`, "POST", { mark }); onDone(); } catch (e) { showMessage("Eroare", errText(e)); } };
      const l = el("button", "rfq-mini", r.my_mark === "later" ? "Scoate din „mai târziu”" : "Mai târziu"), i = el("button", "rfq-mini", r.my_mark === "ignored" ? "Arată-mi-o din nou" : "Nu mă interesează");
      l.type = i.type = "button"; l.onclick = () => mk("later"); i.onclick = () => mk("ignored"); acts.append(l, i);
    }
    card.append(acts); return card;
  }

  /* ofertele mele (orice utilizator) + cererile potrivite pentru firmele aprobate */
  async function viewOffers() {
    loading();
    let d; try { d = await api("/api/requests/inbox"); } catch (e) { return fail(e); }
    st.dealer = d.dealer;
    const out = [el("p", "muted rfq-intro", "Ofertele pe care le-ai trimis. Dacă un cumpărător o alege pe a ta, apare aici și se deschide chatul cu el.")];
    const bb = el("button", "ghost", "Vezi cererile deschise"); bb.type = "button"; bb.onclick = () => go("board"); out.push(bb);
    if (!d.requests.length) out.push(el("p", "muted", "Nu ai nicio ofertă încă."));
    d.requests.forEach((r) => out.push(inboxCard(r, viewOffers)));
    body.replaceChildren(...out);
  }

  /* profil de firmă: opțional; aprobarea dă insigna „Firmă verificată” și notificări pentru cererile potrivite */
  async function viewDealer() {
    loading();
    let d; try { d = (await api("/api/requests/dealer/me")).dealer; } catch (e) { return fail(e); }
    st.dealer = d;
    if (!d) return dealerForm(null);
    const out = [], hd = el("section", "rfq-head");
    const [t, c] = { approved: ["Firmă verificată", "ok"], pending: ["În verificare", "wait"], rejected: ["Respinsă", "bad"] }[d.status] || ["", ""];
    hd.append(el("h3", "", d.company), el("em", "rfq-chip " + c, t), el("p", "muted", `${d.county} · mărci: ${d.brands.length ? d.brands.join(", ") : "toate"} · județe: ${d.counties.length ? d.counties.length : "toată țara"}`));
    out.push(hd);
    if (d.status === "pending") out.push(el("p", "wl-note", "Profilul tău așteaptă aprobarea echipei Omnivo. Între timp poți trimite oferte și ca persoană fizică."));
    if (d.status === "rejected") out.push(el("p", "err", "Profilul a fost respins. Poți corecta datele și îl retrimiți."));
    const ed = el("button", "primary", "Modifică profilul"); ed.type = "button"; ed.onclick = () => dealerForm(d); out.push(ed);
    body.replaceChildren(...out);
  }

  /* o cerere, văzută de un ofertant (în panou sau în „Ofertele mele”) */
  function inboxCard(r, onDone, pub) {
    const card = el("article", "rfq-quote"), top = el("div", "rfq-qtop");
    top.append(el("b", "", title(r)), el("small", "muted", [r.engine, r.vin && "VIN " + r.vin, r.county, r.delivery ? "livrare acceptată" : "doar ridicare"].filter(Boolean).join(" · ")));
    card.append(top); if (r.details) card.append(el("p", "rfq-note", r.details));
    { const ph = photoStrip(r.photos, r.part); if (ph) card.append(ph); }
    const status = r.quote_status === "won" ? ["Ai câștigat", "sold"] : r.quote_status === "lost" ? ["Cerere închisă", "bad"] : r.quote_status === "sent" ? ["Ofertă trimisă", "ok"] : r.accepting !== false ? [left(r.expires_at), "wait"] : ["", ""];
    if (status[0]) card.append(el("em", "rfq-chip " + status[1], status[0]));
    if (pub) card.append(" ", el("small", "muted", r.quotes ? `${r.quotes} ${r.quotes === 1 ? "ofertă" : "oferte"}` : "nicio ofertă încă"));
    if (r.quote_id) card.append(el("p", "rfq-price", `Oferta ta: ${money(r.price, r.currency)}${r.shipping == null ? "" : r.shipping === 0 ? " · transport gratuit" : " + " + money(r.shipping, r.currency) + " transport"}`));
    if (r.mine) card.append(el("p", "muted", "Aceasta este cererea ta."));
    else if (r.quote_status === "won") { const c = el("button", "primary", `Chat cu ${r.buyer}`); c.type = "button"; c.onclick = () => { st.quote = r.quote_id; st.from = "offers"; go("chat", r.quote_id); }; card.append(c); }
    else if (r.accepting !== false && r.quote_status !== "lost") {
      const b = el("button", r.quote_id ? "ghost" : "primary", r.quote_id ? "Modifică oferta" : "Trimite ofertă"); b.type = "button";
      b.onclick = () => { if (!me) return openAuth(); b.replaceWith(quoteForm(r, onDone)); }; card.append(b);
    }
    return card;
  }

  function quoteForm(r, onDone) {
    const f = el("form", "rfq-qform"), price = inp("number", "Preț piesă", r.price); price.min = 1; price.step = "0.01";
    const curS = el("select"); [["RON", "lei"], ["EUR", "€"]].forEach(([v, t]) => curS.append(new Option(t, v))); curS.value = r.currency || "RON";
    const state = el("select"); Object.entries(STATE).forEach(([v, t]) => state.append(new Option(t, v))); state.value = r.state || "buna";
    const war = inp("number", "Zile garanție (0 = fără)", r.warranty_days != null ? r.warranty_days : 0); war.min = 0; war.max = 730;
    const ship = inp("number", "Transport (gol = de stabilit, 0 = gratuit)", r.shipping != null ? r.shipping : ""); ship.min = 0; ship.step = "0.01";
    const cty = countySel(r.quote_county || (st.dealer && st.dealer.county) || "", "Județul de unde trimiți piesa");
    const pk = el("input"); pk.type = "checkbox"; pk.checked = r.pickup !== false; const pkL = el("label", "rfq-chk"); pkL.append(pk, " Se poate ridica de la mine");
    const note = el("textarea"); note.rows = 2; note.maxLength = 600; note.value = r.note || ""; note.placeholder = "Cod piesă, kilometraj mașină donatoare, detalii. Fără telefon, email sau linkuri.";
    const photos = (r.images || []).map((i) => ({ id: i.id, thumb: i.thumb || i.url })), strip = el("div", "rfq-photos"), file = el("input");
    file.type = "file"; file.accept = "image/*"; file.multiple = true; file.hidden = true;
    const add = el("button", "ghost rfq-addph", "Adaugă poze (max 6)"); add.type = "button"; add.onclick = () => file.click();
    const paint = () => {
      strip.replaceChildren(...photos.map((p, i) => { const w = el("span", "rfq-ph"), g = el("img"), x = el("button", "rfq-phx", "×"); g.src = p.thumb; g.alt = ""; x.type = "button"; x.setAttribute("aria-label", "Scoate poza"); x.onclick = () => { photos.splice(i, 1); paint(); }; w.append(g, x); return w; }));
      add.hidden = photos.length >= 6;
    };
    file.onchange = async () => {
      const list = [...file.files].slice(0, 6 - photos.length); file.value = ""; if (!list.length) return;
      add.disabled = true; add.textContent = "Se încarcă pozele…";
      for (const fl of list) { try { const im = await uploadPhoto(fl); photos.push({ id: im.id, thumb: im.thumb || im.url }); paint(); } catch (e) { msg.textContent = errText(e); msg.hidden = false; break; } }
      add.disabled = false; add.textContent = "Adaugă poze (max 6)"; paint();
    };
    const msg = el("p", "err"); msg.hidden = true; const ok = el("button", "primary", "Trimite oferta"); ok.type = "submit";
    f.append(field("Preț", price), field("Monedă", curS), field("Starea piesei", state), field("Garanție", war), field("Transport", ship), field("Județ", cty), pkL, field("Notă", note), strip, add, file, msg, ok); paint();
    f.onsubmit = async (e) => {
      e.preventDefault(); ok.disabled = true; msg.hidden = true;
      try { await api(`/api/requests/${r.id}/quotes`, "POST", { price: price.value, currency: curS.value, state: state.value, warranty_days: war.value, shipping: ship.value, pickup: pk.checked, county: cty.value, note: note.value, image_ids: photos.map((p) => p.id) }); (onDone || viewOffers)(); }
      catch (err) { msg.textContent = errText(err); msg.hidden = false; ok.disabled = false; }
    };
    return f;
  }

  function dealerForm(d) {
    const company = inp("text", "Numele firmei (SRL / PFA / II)", d ? d.company : ""), cui = inp("text", "Ex.: RO12345678", d && d.cui ? d.cui : "");
    const county = countySel(d && d.county), city = inp("text", "Localitate", d && d.city ? d.city : "");
    const brands = el("textarea"); brands.rows = 2; brands.placeholder = "Ex.: dacia, renault, volkswagen. Gol = toate mărcile."; brands.value = d ? d.brands.join(", ") : "";
    const cs = el("select"); cs.multiple = true; cs.size = 8; COUNTIES.forEach((c) => { const o = new Option(c, c); o.selected = !!(d && d.counties.includes(c)); cs.append(o); });
    const msg = el("p", "err"); msg.hidden = true; const ok = el("button", "primary", d ? "Salvează" : "Trimite spre aprobare"); ok.type = "button";
    ok.onclick = async () => {
      ok.disabled = true; msg.hidden = true;
      try { await api("/api/requests/dealer", "PUT", { company: company.value, cui: cui.value, county: county.value, city: city.value, brands: brands.value, counties: [...cs.selectedOptions].map((o) => o.value) }); viewDealer(); }
      catch (e) { msg.textContent = errText(e); msg.hidden = false; ok.disabled = false; }
    };
    body.replaceChildren(el("p", "muted rfq-intro", "Primești gratuit cererile de piese potrivite cu mărcile și zonele tale, trimiți oferte, iar cumpărătorul o alege pe cea mai bună. Echipa Omnivo verifică firma înainte de aprobare."),
      field("Firma", company), field("CUI", cui), field("Județul sediului / parcului", county), field("Localitate", city), field("Mărci pe care le dezmembrezi", brands),
      field("Județe în care vinzi sau livrezi", cs, "Ține apăsat (Ctrl / Cmd) ca să alegi mai multe. Nimic ales = toată țara."), msg, ok);
  }

  /* ---------- admin: aprobarea dezmembratorilor ---------- */
  async function viewAdmin() {
    loading();
    let d; try { d = await api("/api/requests/admin/dealers?status=pending"); } catch (e) { return fail(e); }
    if (!d.dealers.length) return body.replaceChildren(el("p", "muted", "Niciun dezmembrător în așteptare."));
    body.replaceChildren(...d.dealers.map((x) => {
      const c = el("article", "rfq-quote"); c.append(el("b", "", x.company), el("small", "muted", `CUI ${x.cui || "–"} · ${x.county}${x.city ? ", " + x.city : ""} · ${x.nickname} · ${x.email}`), el("p", "rfq-note", `Mărci: ${x.brands.join(", ") || "toate"} · județe: ${x.counties.join(", ") || "toată țara"}`));
      const set = async (s) => { try { await api(`/api/requests/admin/dealers/${x.user_id}`, "POST", { status: s }); viewAdmin(); } catch (e) { showMessage("Eroare", errText(e)); } };
      const a = el("button", "primary", "Aprobă"); a.type = "button"; a.onclick = () => set("approved");
      const r = el("button", "ghost", "Respinge"); r.type = "button"; r.onclick = () => set("rejected"); c.append(a, r); return c;
    }));
  }

  window.openRequests = (view) => {
    build(); if (typeof accClosePage === "function" && typeof accIsOpen === "function" && accIsOpen()) accClosePage();
    if (!dlg.open) dlg.showModal(); go(view || "board");
  };
  window.rfqRefresh = () => { if (dlg && dlg.open && ["mine", "offers", "detail"].includes(st.view) && !body.contains(document.activeElement)) go(st.view, st.id); };
  window.rfqMsg = () => { if (dlg && dlg.open && st.view === "chat") viewChat(st.quote); };

  /* intrare din meniu și din adresă (#cereri) */
  const nav = document.getElementById("mainMenu");
  if (nav) { const a = el("a", "", "Oferte piese"); a.href = "#cereri"; a.addEventListener("click", (e) => { e.preventDefault(); openRequests(); }); nav.append(a); }
  if (location.hash === "#cereri") setTimeout(() => openRequests(), 800);
})();
