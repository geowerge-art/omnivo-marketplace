/* „Cere oferte” pentru piese: cumpărătorul cere, dezmembrătorii oferă (în ascuns), cumpărătorul alege.
   Folosește din script.js: $, api, me, COUNTIES, showMessage, errText, ERR, openAuth. Backend: requests.js. */
(() => {
  Object.assign(ERR, {
    PIESA_INVALIDA: "Scrie ce piesă cauți (minimum 3 caractere).", NUME_INVALID: "Scrie numele celui care primește piesele.", TELEFON_INVALID: "Scrie un număr de telefon valid.", LOCALITATE_INVALIDA: "Scrie localitatea.", STRADA_INVALIDA: "Scrie strada și numărul.", DEJA_EXPEDIAT: "Piesa a fost deja expediată, adresa nu se mai poate schimba.", PREA_MULTE_PIESE: "Poți cere cel mult 8 piese într-o cerere.", FARA_PIESE_IN_OFERTA: "Pune preț la cel puțin o piesă din cerere.", PIESA_NECUNOSCUTA: "Oferta conține o piesă care nu e în cerere.", MARCA_INVALIDA: "Scrie marca mașinii.", AN_INVALID: "Anul mașinii nu pare corect.",
    VIN_INVALID: "Seria de șasiu (VIN) are 11-17 caractere, fără I, O sau Q.", JUDET_LIPSA: "Alege județul.", DETALII_PREA_LUNGI: "Detaliile sunt prea lungi (maximum 1000 de caractere).",
    PREA_MULTE_CERERI: "Ai trimis prea multe cereri azi. Încearcă mâine.", PRET_INVALID: "Scrie un preț valid.", TRANSPORT_INVALID: "Costul transportului nu e valid.",
    GARANTIE_INVALIDA: "Garanția poate fi între 0 și 730 de zile.", NOTA_PREA_LUNGA: "Nota e prea lungă (maximum 600 de caractere).",
    FARA_CONTACT_IN_OFERTA: "Nu scrie telefon, email sau linkuri în ofertă. Vă puteți scrie în chat după ce cumpărătorul alege oferta.",
    DEZMEMBRATOR_NEAPROBAT: "Contul tău de dezmembrător nu e încă aprobat.", CERERE_INCHISA: "Cererea s-a închis între timp.", OFERTA_NEGASITA: "Oferta nu mai e disponibilă.",
    POZA_INVALIDA: "Poza nu e bună. Alege un JPG, PNG sau WebP.", PREA_MULTE_POZE: "Ai prea multe poze neatașate. Trimite oferta sau scoate câteva.", STORAGE_EROARE: "Pozele nu se pot salva acum. Încearcă din nou.",
    OEM_INVALID: "Codul OEM poate avea litere, cifre, spații, puncte și cratime (3–40 de caractere).", CURIER_INVALID: "Alege curierul.", AWB_INVALID: "AWB-ul are 5–30 de caractere (litere, cifre, cratimă).", TERMEN_INVALID: "Termenul de livrare poate fi între 0 și 60 de zile.", CHAT_NECESAR: "Ca să finalizați tranzacția, trebuie să fi scris amândoi în chat.", PREA_DEVREME: "Poți finaliza tranzacția la cel puțin o oră după începerea conversației.",
    FARA_CONTACT_IN_CERERE: "Cererea e publică: nu scrie telefon, email sau linkuri. Contactul se dă în chat, după ce alegi o ofertă.",
    FIRMA_INVALIDA: "Scrie numele firmei.", CUI_INVALID: "CUI-ul trebuie să aibă doar cifre (cu sau fără RO în față).",
    TRANZACTIE_NEFINALIZATA: "Marchează întâi tranzacția ca finalizată, apoi poți lăsa recenzia.", INTREBARE_INVALIDA: "Scrie întrebarea (între 3 și 300 de caractere).",
    FARA_CONTACT_IN_INTREBARE: "Nu scrie telefon, email sau linkuri. Contactul se schimbă în chat, după ce cumpărătorul alege oferta.",
    PREA_MULTE_INTREBARI: "Ai pus deja numărul maxim de întrebări la această ofertă.", RASPUNS_INVALID: "Scrie răspunsul (maximum 500 de caractere).", DEJA_RASPUNS: "Ai răspuns deja la această întrebare.",
    LINK_INTERZIS: "Comentariul nu poate conține linkuri sau adrese de email.", RECENZIE_STELE: "Alege între 1 și 5 stele."
  });
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const nf = (n) => Number(n).toLocaleString("ro-RO");
  const ETA = [["", "Nespecificat"], ["0", "În stoc, expediez azi"], ["1", "1 zi"], ["2", "2 zile"], ["3", "3 zile"], ["5", "5 zile"], ["7", "7 zile"], ["14", "14 zile"], ["30", "30 de zile"]];
  const etaText = (d) => (d == null ? "" : d === 0 ? "În stoc, expediere imediată" : `Livrare în ${d} ${d === 1 ? "zi" : "zile"}`);
  const cur = (c) => (c === "EUR" ? "€" : "lei");
  const money = (n, c) => `${nf(n)} ${cur(c)}`;
  const when = (d) => new Date(d).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const left = (d) => { const ms = new Date(d) - Date.now(); if (ms <= 0) return "termen depășit"; const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h >= 1 ? `mai ai ${h} h` : `mai ai ${m} min`; };
  const STATE = { noua: "Piesă nouă", excelenta: "Stare excelentă", buna: "Stare bună", uzata: "Uzată, funcțională", "de-reparat": "De reparat" };
  const FUEL = { benzina: "Benzină", motorina: "Motorină", gpl: "GPL", hibrid: "Hibrid", electric: "Electric" }, GEAR = { manuala: "Cutie manuală", automata: "Cutie automată" };
  const BODY = { berlina: "Berlină", break: "Break", hatchback: "Hatchback", suv: "SUV", monovolum: "Monovolum", coupe: "Coupe", cabrio: "Cabrio", utilitara: "Utilitară" };
  const PAY = { oricare: "", ramburs: "Plată ramburs", transfer: "Plată prin transfer", numerar: "Plată numerar la ridicare" };
  const CARRIERS = ["Fan Courier", "Cargus", "Sameday", "DPD", "GLS", "Poșta Română", "Altul"];
  const carTags = (r) => [r.oem && "OEM " + r.oem, FUEL[r.fuel], GEAR[r.gearbox], BODY[r.body_type]].filter(Boolean);
  const KIND = { oricare: "Noi sau second-hand", "second-hand": "Doar second-hand", noi: "Doar piese noi" };
  const RS = { open: ["Deschisă", "ok"], awarded: ["Câștigător ales", "sold"], expired: ["Expirată", "wait"], cancelled: ["Anulată", "bad"] };
  const BRANDS = ["Audi", "BMW", "Dacia", "Ford", "Opel", "Renault", "Skoda", "Volkswagen", "Mercedes", "Toyota", "Peugeot", "Citroen", "Fiat", "Hyundai", "Kia", "Seat", "Honda", "Mazda", "Nissan", "Volvo"];
  const title = (r) => [r.part, r.brand, r.model, r.year].filter(Boolean).join(" ");
  const multi = (r) => r.items && r.items.length > 1;
  /* lista pieselor unei cereri (apare doar când sunt mai multe) */
  const partsList = (r) => { if (!multi(r)) return null; const ul = el("ul", "rfq-parts-list"); r.items.forEach((i) => ul.append(el("li", "", i.name + (i.details ? " · " + i.details : "")))); return ul; };
  /* explicația pe scurt, pentru cine vede pentru prima dată: cumpărător și ofertant */
  function howBox() {
    const w = el("div", "rfq-how3");
    [["1", "Ceri piesa"], ["2", "Primești oferte"], ["3", "Alegi și primești"]].forEach(([n, t]) => { const i = el("div", "rfq-how3-i"); i.append(el("b", "", n), el("span", "", t)); w.append(i); });
    return w;
  }
  /* unde se află cererea în traseu: Cerută → Oferte → Aleasă → Finalizată */
  function stepper(r, d) {
    const won = d.quotes.find((q) => q.status === "won");
    const at = won && won.completed_at ? 4 : won ? 3 : d.quotes.length ? 2 : 1;
    const ol = el("ol", "rfq-steps"); ["Cerută", "Așteaptă oferte", "Ofertă aleasă", "Finalizată"].forEach((t, i) => ol.append(el("li", i + 1 < at ? "done" : i + 1 === at ? "now" : "", t)));
    return ol;
  }

  const st = { view: "mine", id: 0, quote: 0, timer: null };
  /* rolul ales: cumpărător („buy”) sau ofertant („sell”); fiecare vede doar paginile lui */
  const BUY_VIEWS = ["mine", "new", "received", "detail", "address"], SELL_VIEWS = ["board", "offers", "dealer"];
  const getRole = () => { try { const r = localStorage.getItem("rfqRole"); return r === "buy" || r === "sell" ? r : ""; } catch { return ""; } };
  const setRole = (r) => { st.role = r; try { localStorage.setItem("rfqRole", r); } catch { /* fără memorare */ } };
  st.role = getRole();
  const rfqSum = { open: 0, waiting: 0, new_quotes: 0, new_answers: 0 }; window.rfqSummary = rfqSum;   // oferte și răspunsuri de văzut
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
    dlg.addEventListener("close", () => { clearInterval(st.timer); st.timer = null; try { if (!st.pop && parsePath(location.pathname)) history.pushState(null, "", "/"); } catch { /* fără istoric */ } });
  }

  function tabs() {
    const n = rfqSum.new_quotes + rfqSum.new_answers;
    let items = [];
    if (st.view === "hub" || !st.role) items = [];
    else if (st.role === "buy") items = [["mine", "Cererile mele" + (n ? ` (${n})` : "")], ["new", "Cerere nouă"], ["received", "Toate ofertele"], ["address", "Adresa mea"]];
    else items = [["board", "Cereri de piese"], ["offers", "Ofertele mele"], ["dealer", "Profil firmă"]];
    if (me && ["admin", "moderator"].includes(me.role)) items.push(["admin", "Aprobări"]);
    const on = (k) => st.view === k || (k === "mine" && (st.view === "detail" || (st.view === "chat" && st.from !== "offers"))) || (k === "offers" && st.view === "chat" && st.from === "offers");
    const tabEls = items.map(([k, n]) => { const b = el("button", "rfq-tab" + (on(k) ? " on" : ""), n); b.type = "button"; b.onclick = () => go(k); return b; });
    if (st.role && st.view !== "hub") { const sw = el("button", "rfq-tab rfq-switch", st.role === "buy" ? "Vreau să vând" : "Caut o piesă"); sw.type = "button"; sw.onclick = () => go("hub"); tabEls.push(sw); }
    $("rfqTabs").replaceChildren(...tabEls);
  }

  /* fiecare pagină are adresa ei (se poate da mai departe, merge „Înapoi” din browser) */
  const ROUTES = { hub: "/cere-oferte", board: "/piese-cautate", new: "/piese-cautate/noua", mine: "/cererile-mele", received: "/oferte-primite", offers: "/ofertele-mele", address: "/adresa-mea", dealer: "/firma", admin: "/aprobari" };
  const pathFor = (v, a) => (v === "detail" ? "/cererea/" + a : v === "chat" ? "/chat-oferta/" + a : ROUTES[v] || ROUTES.board);
  function parsePath(p) {
    p = String(p || "").replace(/\/+$/, "") || "/";
    for (const [k, v] of Object.entries(ROUTES)) if (v === p) return [k];
    let m = /^\/cererea\/(\d+)$/.exec(p); if (m) return ["detail", Number(m[1])];
    m = /^\/chat-oferta\/(\d+)$/.exec(p); if (m) return ["chat", Number(m[1])];
    return null;
  }
  function go(view, arg) {
    if (!me && view !== "board" && view !== "hub") return openAuth();
    if (BUY_VIEWS.includes(view)) setRole("buy"); else if (SELL_VIEWS.includes(view)) setRole("sell");
    else if (view === "chat") setRole(st.from === "offers" ? "sell" : "buy");
    clearInterval(st.timer); st.timer = null; st.view = view;
    if (view === "detail") st.id = arg;
    try { const url = pathFor(view, view === "chat" ? arg || st.quote : st.id); if (!st.pop && typeof history !== "undefined" && location.pathname !== url) history.pushState({ rfq: 1 }, "", url); } catch { /* fără istoric */ }
    if (view !== "chat") st.from = view === "offers" ? "offers" : view === "detail" || view === "mine" ? "buyer" : st.from;
    tabs(); setTimeout(() => window.rfqSummaryRefresh && rfqSummaryRefresh(), 800);   // după ce serverul a marcat cererea ca „văzută”
    ({ hub: viewHub, board: viewBoard, mine: viewMine, new: viewNew, detail: viewDetail, received: viewReceived, offers: viewOffers, address: viewAddress, dealer: viewDealer, admin: viewAdmin, chat: viewChat })[view](arg);
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

  /* ---------- pagina de start: o alegere clară ---------- */
  function viewHub() {
    const n = rfqSum.new_quotes + rfqSum.new_answers;
    const card = (cls, h, t, cta, fn, badge) => { const b = el("button", "rfq-role " + cls); b.type = "button"; const hh = el("b", "", h); if (badge) hh.append(el("em", "rfq-chip ok", badge)); b.append(hh, el("span", "", t), el("strong", "", cta)); b.onclick = fn; return b; };
    const w = el("div", "rfq-roles");
    w.append(
      card("buy", "Caut o piesă", "Spui ce piesă îți trebuie și primești oferte de la dezmembrători, fără să dai telefonul.", "Cererile mele →", () => (me ? go("mine") : openAuth()), n ? `${n} noi` : ""),
      card("sell", "Am piese de vândut", "Vezi ce caută cumpărătorii și trimiți o ofertă în câteva secunde. Răspunsurile sunt gratuite.", "Cereri de piese →", () => go("board")));
    body.replaceChildren(el("h3", "rfq-hubh", "Ce vrei să faci?"), w, howBox(), ...(me ? [] : [el("p", "muted", "Pentru a cere sau a trimite oferte ai nevoie de cont.")]));
  }

  /* ---------- cumpărător: lista cererilor ---------- */
  async function viewMine() {
    loading();
    let d; try { d = await api("/api/requests/mine"); } catch (e) { return fail(e); }
    const out = [el("p", "muted rfq-intro", "Descrii piesa, iar dezmembrători și persoane din toată țara îți trimit oferte în ascuns. Tu o alegi pe cea mai bună.")];
    const nb = el("button", "primary", "Cere oferte pentru o piesă"); nb.type = "button"; nb.onclick = () => go("new"); out.push(nb);
    if (!d.requests.length) out.push(el("p", "muted", "Nu ai nicio cerere încă."));
    const isNew = (r) => (r.new_quotes || 0) + (r.new_answers || 0) > 0;
    d.requests.sort((x, y) => Number(isNew(y)) - Number(isNew(x)));
    const hot = d.requests.filter(isNew);
    if (hot.length) {
      const tq = hot.reduce((a, r) => a + (r.new_quotes || 0), 0), ban = el("button", "rfq-banner"); ban.type = "button";
      ban.append(el("b", "", tq ? `${tq} ${tq === 1 ? "ofertă nouă" : "oferte noi"} la ${hot.length} ${hot.length === 1 ? "cerere" : "cereri"}` : `Răspunsuri noi la ${hot.length} ${hot.length === 1 ? "cerere" : "cereri"}`), el("span", "", "Deschide și alege →"));
      ban.onclick = () => go("detail", hot[0].id); out.splice(1, 0, ban);
    }
    d.requests.forEach((r) => {
      const b = el("button", "rfq-row" + (isNew(r) ? " new" : "")); b.type = "button";
      const m = el("span", "rfq-mid"); m.append(el("b", "", title(r)), el("small", "muted", `${r.county} · ${r.status === "open" ? (r.accepting ? left(r.expires_at) : "se așteaptă alegerea ta") : when(r.created_at)}`));
      const right = el("span", "rfq-right"); const [t, c] = RS[r.status] || [r.status, ""]; right.append(el("em", "rfq-chip " + c, t));
      if (r.new_quotes || r.new_answers) right.append(el("em", "rfq-chip ok", [r.new_quotes && `${r.new_quotes} ${r.new_quotes === 1 ? "ofertă nouă" : "oferte noi"}`, r.new_answers && `${r.new_answers} ${r.new_answers === 1 ? "răspuns" : "răspunsuri"}`].filter(Boolean).join(" · ")));
      right.append(el("small", "", r.quotes ? `${r.quotes} ${r.quotes === 1 ? "ofertă" : "oferte"}${r.best_ron ? " · de la " + money(r.best_ron, "RON") : ""}` : "nicio ofertă încă"));
      if (r.thumb) { const th = el("span", "rfq-rth"), g = el("img"); g.src = r.thumb; g.alt = ""; g.loading = "lazy"; th.append(g); b.append(th); }
      b.append(m, right); b.onclick = () => go("detail", r.id); out.push(b);
      if (r.status === "open") {   // anularea fără să intri în cerere
        const cn = el("button", "link-btn rfq-cancel", "Anulează cererea"); cn.type = "button";
        cn.onclick = async () => { if (!confirm("Anulezi cererea? Ofertele primite se închid, iar ofertanții sunt anunțați.")) return; try { await api(`/api/requests/${r.id}/cancel`, "POST"); viewMine(); rfqSummaryRefresh(); } catch (e) { showMessage("Eroare", errText(e)); } };
        out.push(cn);
      }
    });
    body.replaceChildren(...out);
  }

  /* ---------- cumpărător: cerere nouă ---------- */
  function viewNew(ed) {
    const part = el("textarea");   // doar pentru editare: piesele nu se mai schimbă după ce s-au dat oferte
    const rows = [], partsBox = el("div", "rfq-parts"), addP = el("button", "ghost rfq-addph", "+ Adaugă încă o piesă"); addP.type = "button";
    const addRow = (n, dt) => {
      const w = el("div", "rfq-part"), a = inp("text", "Piesa: ex. far stânga, cutie de viteze…", n || ""), b2 = inp("text", "Detalii (opțional): culoare, variantă", dt || ""), x = el("button", "rfq-phx", "×"), o = { a, b: b2 };
      a.maxLength = 200; b2.maxLength = 300; x.type = "button"; x.setAttribute("aria-label", "Scoate piesa");
      x.onclick = () => { if (rows.length > 1) { rows.splice(rows.indexOf(o), 1); w.remove(); sync(); } };
      w.append(a, b2, x); rows.push(o); partsBox.append(w); sync();
    };
    const sync = () => { addP.hidden = rows.length >= 8; partsBox.classList.toggle("one", rows.length === 1); };
    addP.onclick = () => addRow(); addRow();
    if (!ed && window.rfqPre) { rows[0].a.value = String(window.rfqPre.part || "").slice(0, 200); rows[0].b.value = String(window.rfqPre.details || "").slice(0, 300); window.rfqPre = null; }   // venit din căutare: piesa deja scrisă
    const brand = inp("text", "Ex.: Volkswagen"); brand.setAttribute("list", "rfqBrands"); brand.maxLength = 40;
    const dl = el("datalist"); dl.id = "rfqBrands"; BRANDS.forEach((b) => dl.append(new Option(b)));
    const model = inp("text", "Ex.: Golf 7"), year = inp("number", "2015"); year.min = 1950; year.max = new Date().getFullYear() + 1;
    const engine = inp("text", "Ex.: 2.0 TDI 150 CP"), vin = inp("text", "Opțional, dar duce la ofertă potrivită"); vin.maxLength = 17;
    const county = countySel(!ed && me && me.county ? me.county : ""), city = inp("text", "Localitate (opțional)");
    const det = el("textarea"); det.rows = 3; det.maxLength = 1000; det.placeholder = "Culoare, variantă de echipare, defecte acceptate…";
    const hours = el("select"); [[24, "24 de ore"], [48, "48 de ore"], [72, "72 de ore"]].forEach(([v, t]) => hours.append(new Option(t, v))); hours.value = 48;
    const del = el("input"); del.type = "checkbox"; del.checked = true; const delL = el("label", "rfq-chk"); delL.append(del, " Accept și livrare prin curier");
    const kind = el("select"); Object.entries(KIND).forEach(([v, t]) => kind.append(new Option(t, v)));
    const oem = inp("text", "Ex.: 1K0 941 005 A sau 8200 123 456"); oem.maxLength = 40;
    const sel = (map, first) => { const s = el("select"); s.append(new Option(first, "")); Object.entries(map).forEach(([v, t]) => s.append(new Option(t, v))); return s; };
    const fuel = sel(FUEL, "Oricare / nu știu"), gear = sel(GEAR, "Oricare / nu știu"), bodyT = sel(BODY, "Oricare / nu știu");
    const msg = el("p", "err"); msg.hidden = true;
    const pp = photoPicker(6, [], msg), phWrap = el("div"); phWrap.append(...pp.nodes);
    const go1 = el("button", "primary", ed ? "Salvează modificările" : "Trimite cererea"); go1.type = "button";
    if (ed) {
      part.value = ed.part; partsBox.replaceChildren(...(ed.items && ed.items.length ? [partsList(ed) || el("p", "", ed.items[0].name)] : [el("p", "", ed.part)])); addP.hidden = true; brand.value = ed.brand; model.value = ed.model || ""; year.value = ed.year || ""; engine.value = ed.engine || ""; vin.value = ed.vin || ""; county.value = ed.county; city.value = ed.city || "";
      det.value = ed.details || ""; del.checked = ed.delivery !== false; kind.value = ed.kind || "oricare"; oem.value = ed.oem || ""; fuel.value = ed.fuel || ""; gear.value = ed.gearbox || ""; bodyT.value = ed.body_type || "";
      [part, brand, county, city, hours].forEach((x) => { x.disabled = true; });
    }
    go1.onclick = async () => {
      if (ed) {
        go1.disabled = true; msg.hidden = true;
        try { await api("/api/requests/" + ed.id, "PUT", { model: model.value, year: year.value, engine: engine.value, vin: vin.value, details: det.value, kind: kind.value, delivery: del.checked, oem: oem.value, fuel: fuel.value, gearbox: gear.value, body_type: bodyT.value }); go("detail", ed.id); }
        catch (e) { msg.textContent = errText(e); msg.hidden = false; go1.disabled = false; }
        return;
      }
      if (pp.busy()) { msg.textContent = "Așteaptă să se termine încărcarea pozelor."; msg.hidden = false; return; }
      go1.disabled = true; msg.hidden = true;
      try { const r = await api("/api/requests", "POST", { parts: rows.map((o) => ({ name: o.a.value, details: o.b.value })).filter((p) => p.name.trim() || p.details.trim()), brand: brand.value, model: model.value, year: year.value, engine: engine.value, vin: vin.value, county: county.value, city: city.value, details: det.value, kind: kind.value, delivery: del.checked, hours: Number(hours.value), oem: oem.value, fuel: fuel.value, gearbox: gear.value, body_type: bodyT.value, image_ids: pp.ids() }); go("detail", r.request.id); }
      catch (e) { msg.textContent = errText(e); msg.hidden = false; go1.disabled = false; }
    };
    const intro = ed ? "Poți modifica detaliile cât timp cererea e deschisă. Piesa, marca și județul nu se schimbă, fiindcă ofertele s-au dat pentru ele; ofertanții sunt anunțați de modificare." : "Cererea e publică: oricine o poate vedea și poate oferi, iar dezmembrătorii potriviți sunt anunțați. Ofertanții nu văd ofertele celorlalți, iar contactul tău rămâne ascuns până alegi tu.";
    const cancel = el("button", "ghost", "Renunță"); cancel.type = "button"; cancel.onclick = () => go("detail", ed && ed.id);
    const more = el("details", "rfq-more"); more.open = !!ed;
    more.append(el("summary", "", "Mai multe detalii pentru oferte mai bune (opțional)"), field("Motorizare", engine), field("Combustibil", fuel), field("Cutie de viteze", gear), field("Caroserie", bodyT),
      field("Cod piesă (OEM)", oem, "Ajută ofertanții să găsească exact piesa. Îl găsești pe piesa veche sau în cartea mașinii."), field("Serie de șasiu (VIN)", vin, "Văzută doar de dezmembrătorii verificați și de cei care trimit ofertă."),
      field("Ce fel de piese accepți?", kind), field("Localitate", city), field("Detalii", det), ...(ed ? [] : [field("Poze (opțional)", phWrap, "Maximum 6 poze · JPG, PNG sau WebP. Ajută ofertanții să recunoască piesa.")]), delL, ...(ed ? [] : [field("Cât timp primești oferte?", hours)]));
    body.replaceChildren(el("p", "muted rfq-intro", intro),
      ...(ed ? [] : [howBox()]), field(ed ? "Piesele cerute" : "Ce piesă cauți?", partsBox), ...(ed ? [] : [addP]), field("Marca", brand), dl, field("Modelul", model), field("Anul fabricației", year), field("Județ", county),
      more, msg, go1, ...(ed ? [cancel] : []));
  }

  /* ---------- cumpărător: o cerere cu ofertele ei ---------- */
  async function viewDetail(id) {
    id = id || st.id; loading();
    let d; try { d = await api("/api/requests/" + id); } catch (e) { return fail(e); }
    const r = d.request, out = [], back = el("button", "link-btn", "‹ Toate cererile"); back.type = "button"; back.onclick = () => go("mine"); out.push(back);
    const hd = el("section", "rfq-head"); hd.append(el("h3", "", title(r)));
    hd.append(el("p", "muted", [r.engine, ...carTags(r), r.vin && "VIN " + r.vin, r.county + (r.city ? ", " + r.city : ""), r.delivery ? "acceptă livrare" : "doar ridicare", KIND[r.kind], r.edited_at && "modificată"].filter(Boolean).join(" · ")));
    { const pl = partsList(r); if (pl) hd.append(pl); }
    if (r.details) hd.append(el("p", "", r.details));
    { const ph = photoStrip(d.photos, r.part); if (ph) hd.append(ph); }
    if (["open", "awarded"].includes(r.status)) hd.append(stepper(r, d));
    const [t, c] = RS[r.status] || [r.status, ""];
    const sp = el("p"); sp.append(el("em", "rfq-chip " + c, t));
    if (r.status === "open") sp.append(el("small", "muted", r.accepting ? ` ${left(r.expires_at)} ca să primești oferte` : " termenul pentru oferte a trecut; poți alege dintre cele primite"));
    hd.append(sp);
    if (d.quotes.length) hd.append(el("p", "rfq-count", `${d.quotes.length} ${d.quotes.length === 1 ? "ofertă primită" : "oferte primite"}`));
    out.push(hd);
    if (!d.quotes.length) out.push(el("p", "muted rfq-empty", r.status === "open" ? "Nicio ofertă încă. Dezmembrătorii au fost anunțați; te anunțăm când sosește prima ofertă." : "Cererea nu a primit oferte."));
    out.push(...offersBlock(r, d.quotes));
    if (["expired", "cancelled"].includes(r.status) && !r.awarded_quote_id) {
      const re = el("button", "primary", "Redeschide cererea pentru încă 48 h"); re.type = "button";
      re.onclick = async () => { re.disabled = true; try { await api(`/api/requests/${r.id}/reactivate`, "POST"); viewDetail(r.id); } catch (e) { showMessage("Eroare", errText(e)); re.disabled = false; } };
      out.push(re);
    }
    if (r.status === "open") {
      const ed = el("button", "ghost", "Modifică cererea"); ed.type = "button"; ed.onclick = () => go("new", r); out.push(ed);
      const cn = el("button", "ghost", "Anulează cererea"); cn.type = "button";
      cn.onclick = async () => { if (!confirm("Anulezi cererea? Ofertele primite se închid.")) return; try { await api(`/api/requests/${r.id}/cancel`, "POST"); go("mine"); } catch (e) { showMessage("Eroare", errText(e)); } };
      out.push(cn);
      st.timer = setInterval(() => { if (!dlg.open || st.view !== "detail") return clearInterval(st.timer); if (!document.activeElement || !body.contains(document.activeElement)) viewDetail(r.id); }, 20000);
    }
    body.replaceChildren(...out);
  }

  /* ---------- adresa de livrare: salvată în cont, confirmată la alegerea ofertei ---------- */
  const SHIP_KIND = { domiciliu: "Livrare la domiciliu", sediu: "Livrare la sediul firmei", altul: "Livrare în alt loc" };
  const shipText = (a) => (a.mode === "ridicare" ? "Ridică personal de la ofertant" : `${SHIP_KIND[a.kind] || "Livrare"}: ${a.street}, ${a.city}, ${a.county}`);
  function shipCard(a, who) {
    const c = el("section", "rfq-ship-to"); c.append(el("b", "", who || "Date pentru livrare"), el("p", "", a.name + " · " + a.phone), el("p", "", shipText(a)));
    if (a.note) c.append(el("p", "muted", "Mențiuni: " + a.note));
    return c;
  }
  /* formular reutilizat la alegerea ofertei, la modificarea adresei și în „Adresa mea” */
  function addressForm(init, defs, o) {
    const a = init || {}, f = el("form", "rfq-qform rfq-addr");
    const mode = el("select"); [["domiciliu", "Livrare la domiciliu"], ["sediu", "Livrare la sediul firmei"], ["altul", "Livrare în alt loc"]].concat(o.pickup ? [["ridicare", "Ridic personal de la ofertant"]] : []).forEach(([v, t]) => mode.append(new Option(t, v)));
    mode.value = a.mode === "ridicare" && o.pickup ? "ridicare" : (a.kind || "domiciliu");
    const name = inp("text", "Numele celui care primește", a.name || (defs && defs.name) || ""), phone = inp("tel", "Telefon pentru curier", a.phone || (defs && defs.phone) || "");
    name.maxLength = 80; phone.maxLength = 20;
    const county = countySel(a.county || "", "Județ"), city = inp("text", "Localitate", a.city || ""), street = inp("text", "Stradă, număr, bloc, scară, apartament", a.street || "");
    city.maxLength = 60; street.maxLength = 150;
    const note = el("textarea"); note.rows = 2; note.maxLength = 200; note.value = a.note || ""; note.placeholder = "Mențiuni pentru curier (ex.: program, interfon)";
    const place = el("div", "rfq-addr-place"); place.append(field("Județ", county), field("Localitate", city), field("Stradă și număr", street));
    const sv = el("input"); sv.type = "checkbox"; sv.checked = o.saveDefault !== false; const svL = el("label", "rfq-chk"); svL.append(sv, " Salvează ca adresa mea din cont");
    const msg = el("p", "err"), ok = el("button", "primary", o.submit || "Salvează"); msg.hidden = true; ok.type = "submit";
    const sync = () => { place.hidden = mode.value === "ridicare"; svL.hidden = mode.value === "ridicare" && !o.account; }; mode.onchange = sync; sync();
    f.append(...(o.intro ? [el("p", "muted", o.intro)] : []), field("Cum primești piesele?", mode), field("Nume", name), field("Telefon", phone, "Îl vede doar ofertantul ales, ca să poată trimite piesa."), place, field("Mențiuni", note), ...(o.noSave ? [] : [svL]), msg, ok);
    f.onsubmit = async (e) => {
      e.preventDefault(); ok.disabled = true; msg.hidden = true;
      const ridic = mode.value === "ridicare";
      try { await o.send({ mode: ridic ? "ridicare" : "livrare", kind: ridic ? "" : mode.value, name: name.value, phone: phone.value, county: county.value, city: city.value, street: street.value, note: note.value, save: sv.checked && !o.noSave }); }
      catch (err) { msg.textContent = errText(err); msg.hidden = false; ok.disabled = false; }
    };
    return f;
  }
  async function viewAddress() {
    loading(); let d; try { d = await api("/api/requests/address"); } catch (e) { return fail(e); }
    const f = addressForm(d.address, d.defaults, { submit: "Salvează adresa", noSave: true, account: true, intro: "Salvează o dată adresa unde primești piesele. La alegerea unei oferte o găsești completată și o poți schimba (altă adresă, sediu, ridicare personală).", send: async (b) => { await api("/api/requests/address", "PUT", { ...b, mode: "livrare" }); showMessage("Salvat", "Adresa ta de livrare a fost salvată."); } });
    body.replaceChildren(el("h3", "", "Adresa mea de livrare"), f);
  }
  /* alegerea ofertei: întâi spui unde trimit piesele, apoi oferta e aleasă */
  async function viewAward(r, q) {
    loading(); let d; try { d = await api("/api/requests/address"); } catch (e) { return fail(e); }
    const back = el("button", "link-btn", "‹ Înapoi la oferte"); back.type = "button"; back.onclick = () => viewDetail(r.id);
    const txt = q.shipping == null ? money(q.price, q.currency) + " + transport de stabilit" : money(totalOf(q), q.currency) + " cu transport";
    const f = addressForm(d.address, d.defaults, { pickup: q.pickup, submit: "Alege oferta și trimite adresa", intro: "Verifică unde vrei să primești piesele. Adresa și telefonul se trimit doar ofertantului ales; celelalte oferte se închid.",
      send: async (b) => { await api(`/api/requests/${r.id}/award/${q.id}`, "POST", { delivery: b }); st.quote = q.id; st.from = "buyer"; go("chat", q.id); } });
    body.replaceChildren(back, el("h3", "", `Alegi oferta ${q.company}`), el("p", "rfq-price", txt), f);
  }

  /* ---------- compararea ofertelor ---------- */
  const totalOf = (q) => Number(q.price) + (q.shipping == null ? 0 : Number(q.shipping));
  const totalRon = (q) => (q.currency === "EUR" ? 5 : 1) * totalOf(q);   // aceeași curs ca la sortarea de pe server
  const isNew = (d) => Date.now() - new Date(d) < 864e5;
  const SORTS = {
    total: ["Cel mai mic total", (a, b) => totalRon(a) - totalRon(b)],
    warranty: ["Garanție", (a, b) => b.warranty_days - a.warranty_days || totalRon(a) - totalRon(b)],
    eta: ["Livrare rapidă", (a, b) => (a.eta_days == null ? 99 : a.eta_days) - (b.eta_days == null ? 99 : b.eta_days) || totalRon(a) - totalRon(b)],
    rating: ["Calificativ", (a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || totalRon(a) - totalRon(b)],
    new: ["Cele mai noi", (a, b) => new Date(b.created_at) - new Date(a.created_at)]
  };
  async function awardQuote(r, q, btn) { viewAward(r, q); }
  function cmpTable(r, live, tagsOf) {
    const wrap = el("div", "rfq-cmp"), t = el("table"), hr = el("tr"), best = Math.min(...live.map(totalRon));
    ["Ofertant", "Total", "Stare", "Garanție", "Livrare", "Județ", "Calificativ", ""].forEach((h) => hr.append(el("th", "", h)));
    t.append(el("thead")); t.firstChild.append(hr); const tb = el("tbody");
    live.forEach((q) => {
      const tr = el("tr"), who = el("td"), nm = el(q.dealer_id && window.openProfile ? "button" : "b", "rfq-seller", q.company);
      if (nm.tagName === "BUTTON") { nm.type = "button"; nm.onclick = () => window.openProfile(q.dealer_id); }
      who.append(nm); const tg = tagsOf(q).map((x) => x[0]); if (isNew(q.created_at)) tg.unshift("Nouă"); if (tg.length) who.append(el("small", "muted", tg.join(" · ")));
      const tot = el("td", totalRon(q) === best ? "best" : ""); tot.append(el("b", "", money(totalOf(q), q.currency))); if (q.shipping == null) tot.append(el("small", "muted", "+ transport"));
      const go1 = el("td"), ch = el("button", "primary", "Alege"); ch.type = "button"; ch.onclick = () => awardQuote(r, q, ch); go1.append(ch);
      tr.append(who, tot, el("td", "", STATE[q.state] || "—"), el("td", "", q.warranty_days ? q.warranty_days + " zile" : "fără"),
        el("td", "", q.eta_days == null ? "—" : q.eta_days === 0 ? "în stoc" : q.eta_days + (q.eta_days === 1 ? " zi" : " zile")), el("td", "", q.dealer_county || "—"),
        el("td", "", q.rating ? `★ ${q.rating} (${q.rating_count})` : "—"), go1);
      tb.append(tr);
    });
    t.append(tb); wrap.append(t); return wrap;
  }
  function offersBlock(r, quotes) {
    if (!quotes.length) return [];
    const won = quotes.filter((q) => q.status === "won"), live = quotes.filter((q) => q.status === "sent"), rest = quotes.filter((q) => q.status === "lost");
    const tagsOf = (q) => {
      const t = [];
      if (live.length > 1 && q.status === "sent") {
        if (totalRon(q) === Math.min(...live.map(totalRon))) t.push(["Cel mai mic total", "ok"]);
        const mw = Math.max(...live.map((x) => x.warranty_days)); if (mw > 0 && q.warranty_days === mw) t.push(["Cea mai lungă garanție", ""]);
        const et = live.filter((x) => x.eta_days != null).map((x) => x.eta_days); if (et.length > 1 && q.eta_days === Math.min(...et)) t.push(["Livrare cea mai rapidă", ""]);
        const mr = Math.max(...live.map((x) => Number(x.rating) || 0)); if (mr > 0 && Number(q.rating) === mr) t.push(["Cel mai bine cotat", ""]);
      }
      if (q.dealer_county && q.dealer_county === r.county) t.push(["În județul tău", ""]);
      return t;
    };
    const list = el("div", "rfq-offers-list"), bar = el("div", "rfq-sortbar");
    const draw = () => {
      const sorted = [...live].sort(SORTS[st.sort || "total"][1]);
      list.replaceChildren(...won.map((q) => quoteCard(r, q, [])), ...(st.cmp && sorted.length > 1 ? [cmpTable(r, sorted, tagsOf)] : sorted.map((q) => quoteCard(r, q, tagsOf(q)))), ...rest.map((q) => quoteCard(r, q, [])));
      const act = st.cmp ? "cmp" : st.sort || "total"; bar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === act));
    };
    if (live.length > 1) {
      bar.append(el("span", "muted", `${live.length} oferte · sortează:`));
      Object.entries(SORTS).forEach(([k, [n]]) => { const b = el("button", "rfq-sort", n); b.type = "button"; b.dataset.k = k; b.onclick = () => { st.sort = k; st.cmp = false; draw(); }; bar.append(b); });
      const tb = el("button", "rfq-sort", "▦ Compară în tabel"); tb.type = "button"; tb.dataset.k = "cmp"; tb.onclick = () => { st.cmp = !st.cmp; draw(); }; bar.append(tb);
    }
    draw();
    return live.length > 1 ? [bar, list] : [list];
  }

  /* ---------- „Oferte primite”: toate ofertele la toate cererile tale ---------- */
  async function viewReceived() {
    loading();
    let d; try { d = await api("/api/requests/received"); } catch (e) { return fail(e); }
    const out = [el("p", "muted rfq-intro", "Toate ofertele primite la cererile tale. Deschide o cerere ca să le compari, să pui întrebări și să o alegi pe cea mai bună.")];
    if (!d.offers.length) {
      out.push(el("p", "muted rfq-empty", "Nu ai primit nicio ofertă încă. Dezmembrătorii au fost anunțați; te anunțăm când sosește prima ofertă."));
      const nb = el("button", "primary", "Cere oferte pentru o piesă"); nb.type = "button"; nb.onclick = () => go("new"); out.push(nb);
      return body.replaceChildren(...out);
    }
    const by = new Map(); d.offers.forEach((o) => { if (!by.has(o.request_id)) by.set(o.request_id, []); by.get(o.request_id).push(o); });
    by.forEach((list, rid) => {
      list.sort((a, b) => (b.status === "won") - (a.status === "won") || totalRon(a) - totalRon(b));
      const f = list[0], card = el("section", "rfq-recv"), hd = el("button", "rfq-recv-hd"); hd.type = "button"; hd.onclick = () => go("detail", rid);
      if (f.thumb) { const th = el("span", "rfq-rth"), g = el("img"); g.src = f.thumb; g.alt = ""; g.loading = "lazy"; th.append(g); hd.append(th); }
      const tx = el("span", "rfq-recv-t"), nNew = list.filter((o) => isNew(o.created_at)).length;
      tx.append(el("b", "", title(f)), el("small", "muted", `${list.length} ${list.length === 1 ? "ofertă" : "oferte"}${nNew ? ` · ${nNew} ${nNew === 1 ? "nouă" : "noi"}` : ""} · ${f.request_status === "open" ? left(f.expires_at) : "câștigător ales"}`));
      hd.append(tx, el("em", "rfq-go", "›")); card.append(hd);
      list.slice(0, 3).forEach((o) => {
        const row = el("button", "rfq-recv-row"); row.type = "button"; row.onclick = () => go("detail", rid);
        const nm = el("span", "rfq-recv-nm"); nm.append(el("b", "", o.company), el("small", "muted", [o.rating ? `★ ${o.rating} (${o.rating_count})` : "fără recenzii", STATE[o.state], o.warranty_days ? `garanție ${o.warranty_days} z` : ""].filter(Boolean).join(" · ")));
        if (o.status === "won") nm.append(el("em", "rfq-chip sold", "Câștigătoare")); else if (isNew(o.created_at)) nm.append(el("em", "rfq-chip wait", "Nouă"));
        row.append(nm, el("b", "rfq-recv-pr", money(totalOf(o), o.currency) + (o.shipping == null ? " + transp." : ""))); card.append(row);
      });
      if (list.length > 3) { const more = el("button", "link-btn", `Vezi toate cele ${list.length} oferte și compară`); more.type = "button"; more.onclick = () => go("detail", rid); card.append(more); }
      out.push(card);
    });
    body.replaceChildren(...out);
  }

  /* ---------- întrebări la o ofertă (înainte de alegere) ---------- */
  function textForm(placeholder, max, label, send) {
    const f = el("form", "rfq-qform"), ta = el("textarea"); ta.rows = 2; ta.maxLength = max; ta.placeholder = placeholder;
    const msg = el("p", "err"); msg.hidden = true; const ok = el("button", "primary", label); ok.type = "submit";
    f.append(ta, msg, ok);
    f.onsubmit = async (e) => { e.preventDefault(); ok.disabled = true; msg.hidden = true; try { await send(ta.value); } catch (err) { msg.textContent = errText(err); msg.hidden = false; ok.disabled = false; } };
    return f;
  }
  /* cumpărătorul: întrebările lui și răspunsurile; poate pune încă o întrebare cât oferta e deschisă */
  function buyerQa(r, q) {
    const qs = q.questions || [], canAsk = q.status === "sent" && r.status === "open";
    if (!qs.length && !canAsk) return null;
    const wrap = el("div", "rfq-qa-wrap");
    qs.forEach((x) => { const it = el("div", "rfq-qa-it"); it.append(el("p", "rfq-qa-q", x.body), el("p", x.answer ? "rfq-qa-a" : "rfq-qa-wait", x.answer || "Ofertantul nu a răspuns încă")); wrap.append(it); });
    if (canAsk && qs.length < 5) {
      const ask = el("button", "ghost", "Întreabă ofertantul"); ask.type = "button";
      ask.onclick = () => ask.replaceWith(textForm("Ex.: Se potrivește pe seria de șasiu din cerere? Ce kilometraj are mașina donatoare? Fără telefon sau linkuri.", 300, "Trimite întrebarea", async (t) => { await api(`/api/requests/quote/${q.id}/questions`, "POST", { body: t }); viewDetail(r.id); }));
      wrap.append(ask);
    }
    return wrap;
  }
  /* ofertantul: întrebările primite; le răspunde pe loc */
  function dealerQa(r, onDone) {
    const qs = r.questions || []; if (!qs.length) return null;
    const wrap = el("div", "rfq-qa-wrap"); wrap.append(el("b", "", "Întrebările cumpărătorului"));
    qs.forEach((x) => {
      const it = el("div", "rfq-qa-it"); it.append(el("p", "rfq-qa-q", x.body));
      if (x.answer) it.append(el("p", "rfq-qa-a", x.answer));
      else it.append(textForm("Răspunsul tău (fără telefon, email sau linkuri)", 500, "Trimite răspunsul", async (t) => { await api(`/api/requests/question/${x.id}/answer`, "POST", { answer: t }); (onDone || viewOffers)(); }));
      wrap.append(it);
    });
    return wrap;
  }

  /* ---------- tranzacție finalizată + recenzii în ambele sensuri ---------- */
  const starsTxt = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  function reviewBox(qid, deal, reload) {
    const box = el("div", "rfq-rv"), who = deal.as === "buyer" ? "vânzătorul" : "cumpărătorul";
    if (deal.review) {
      const row = el("p", "rfq-rv-mine"); row.append(el("span", "prof-stars", starsTxt(deal.review.rating)), ` Recenzia ta pentru ${deal.other_name}`);
      box.append(row); if (deal.review.body) box.append(el("p", "muted", deal.review.body));
      const ed = el("button", "link-btn", "Modifică recenzia"); ed.type = "button"; ed.onclick = () => form(deal.review.rating, deal.review.body || ""); box.append(ed);
      return box;
    }
    form(0, ""); return box;
    function form(start, text) {
      let rating = start;
      const stars = el("div", "rv-stars"), ta = el("textarea"), msg = el("p", "err"), ok = el("button", "primary", "Trimite recenzia");
      ta.rows = 3; ta.maxLength = 500; ta.value = text; ta.placeholder = deal.as === "buyer" ? "Ai primit piesa? Era cum s-a descris?" : "Cum a fost cumpărătorul? A plătit și a ridicat la timp?"; msg.hidden = true; ok.type = "button";
      const paint = () => [...stars.children].forEach((b, i) => { b.classList.toggle("on", i < rating); b.setAttribute("aria-pressed", String(i < rating)); });
      [1, 2, 3, 4, 5].forEach((n) => { const b = el("button", "rv-star", "★"); b.type = "button"; b.setAttribute("aria-label", n + (n === 1 ? " stea" : " stele")); b.onclick = () => { rating = n; paint(); }; stars.append(b); });
      paint();
      ok.onclick = async () => {
        if (!rating) { msg.textContent = "Alege câte stele dai."; msg.hidden = false; return; }
        ok.disabled = true; msg.hidden = true;
        try { await api(`/api/requests/quote/${qid}/rating`, "PUT", { rating, body: ta.value }); reload(); } catch (e) { msg.textContent = errText(e); msg.hidden = false; ok.disabled = false; }
      };
      box.replaceChildren(el("b", "", `Recenzează ${who} ${deal.other_name}`), stars, ta, msg, ok);
    }
  }
  function paintDeal(box, qid, deal, reload) {
    const out = [], prof = el("button", "link-btn", `Vezi profilul lui ${deal.other_name}`); prof.type = "button"; prof.onclick = () => window.openProfile && window.openProfile(deal.other_id);
    if (!deal.completed) {
      out.push(el("p", "muted", "Ați terminat tranzacția? Marchează-o ca finalizată, apoi vă puteți recenza reciproc."));
      const b = el("button", "ghost", "Marchează tranzacția ca finalizată"); b.type = "button";
      b.onclick = async () => { if (!confirm("Marchezi tranzacția ca finalizată? Nu se mai poate anula.")) return; b.disabled = true; try { await api(`/api/requests/quote/${qid}/complete`, "POST"); reload(); } catch (e) { showMessage("Eroare", errText(e)); b.disabled = false; } };
      out.push(b);
    } else { out.push(el("p", "rfq-done", "✔ Tranzacție finalizată")); out.push(reviewBox(qid, deal, reload)); }
    if (deal.awb) out.unshift(el("p", "rfq-done", `📦 Expediat cu ${deal.carrier}, AWB ${deal.awb}`));
    if (deal.ship_to) {
      const sc = shipCard(deal.ship_to, deal.as === "dealer" ? "Unde trimiți piesele" : "Adresa pe care ai trimis-o"); out.unshift(sc);
      if (deal.can_edit_ship) {
        const eb = el("button", "ghost", "Modifică adresa"); eb.type = "button";
        eb.onclick = () => { eb.replaceWith(addressForm(deal.ship_to, null, { pickup: true, submit: "Salvează adresa", send: async (b) => { await api(`/api/requests/quote/${qid}/delivery`, "PUT", b); reload(); } })); };
        sc.append(eb);
      }
    }
    if (deal.as === "dealer" && !deal.completed) {
      const sf = el("div", "rfq-ship"), cs = el("select"), ai = inp("text", "AWB (număr colet)"); ai.maxLength = 30;
      CARRIERS.forEach((c) => cs.append(new Option(c, c))); if (deal.carrier) cs.value = deal.carrier; if (deal.awb) ai.value = deal.awb;
      const sb = el("button", "ghost", deal.awb ? "Actualizează AWB" : "Marchează ca expediat"); sb.type = "button";
      sb.onclick = async () => { sb.disabled = true; try { await api(`/api/requests/quote/${qid}/ship`, "POST", { carrier: cs.value, awb: ai.value }); reload(); } catch (e) { showMessage("Eroare", errText(e)); } sb.disabled = false; };
      sf.append(el("small", "muted", "Ai trimis piesa prin curier? Trece AWB-ul; cumpărătorul e anunțat."), cs, ai, sb); out.push(sf);
    }
    out.push(prof); box.replaceChildren(...out);
  }

  function quoteCard(r, q, tags) {
    const card = el("article", "rfq-quote" + (q.status === "won" ? " won" : q.status === "lost" ? " lost" : ""));
    const top = el("div", "rfq-qtop"); let nm;
    if (q.dealer_id && window.openProfile) { nm = el("button", "rfq-seller", q.company); nm.type = "button"; nm.title = "Vezi profilul și recenziile"; nm.onclick = () => window.openProfile(q.dealer_id); } else nm = el("b", "", q.company);
    const rate = q.rating ? ` · ★ ${q.rating} (${q.rating_count})` : "";
    top.append(nm, el("small", "muted", [q.dealer_city, q.dealer_county].filter(Boolean).join(", ") + rate));
    top.append(el("em", "rfq-chip", q.verified ? "Firmă verificată" : "Persoană fizică"));
    if (q.status === "won") { top.append(el("em", "rfq-chip sold", "Câștigătoare")); if (q.completed_at) top.append(el("em", "rfq-chip ok", "Finalizată")); } else { (tags || []).forEach(([t, c]) => top.append(el("em", "rfq-chip " + (c || ""), t))); if (q.status === "sent" && isNew(q.created_at)) top.append(el("em", "rfq-chip wait", "Nouă")); }
    const pr = el("div", "rfq-price");
    if (q.shipping == null) { pr.append(el("b", "", money(q.price, q.currency)), el("span", "muted", " + transport de stabilit")); }
    else { pr.append(el("b", "", "Total " + money(totalOf(q), q.currency)), el("span", "muted", q.shipping === 0 ? " · transport gratuit" : ` · piesa ${money(q.price, q.currency)} + transport ${money(q.shipping, q.currency)}`)); }
    let linesEl = null;
    if (q.lines && q.lines.length && (q.lines.length > 1 || multi(r))) {
      linesEl = el("ul", "rfq-lines");
      q.lines.forEach((l) => { const li = el("li"); li.append(el("span", "", l.name), el("b", "", money(l.price, q.currency))); linesEl.append(li); });
      if (multi(r)) { const miss = r.items.filter((i) => !q.lines.some((l) => l.item_id === i.id)); linesEl.append(el("li", "rfq-cover" + (miss.length ? " part" : ""), miss.length ? `Acoperă ${q.lines.length} din ${r.items.length} piese · lipsesc: ${miss.map((i) => i.name).join(", ")}` : "Acoperă toate piesele")); }
    }
    const facts = el("ul", "rfq-facts"); [STATE[q.state], q.warranty_days ? `Garanție ${q.warranty_days} zile` : "Fără garanție", etaText(q.eta_days), q.invoice ? "Emite factură" : "", PAY[q.payment], q.pickup ? "Ridicare din parc" : "Doar livrare"].filter(Boolean).forEach((f) => facts.append(el("li", "", f)));
    card.append(top, pr); if (linesEl) card.append(linesEl); card.append(facts); if (q.note) card.append(el("p", "rfq-note", q.note));
    if (q.images && q.images.length) {
      const strip = el("div", "rfq-photos");
      q.images.forEach((im, i) => { const b = el("button", "rfq-ph"); b.type = "button"; b.setAttribute("aria-label", `Poza ${i + 1}`); const g = el("img"); g.src = im.thumb || im.url; g.alt = ""; g.loading = "lazy"; b.append(g); b.onclick = () => openLightbox(q.images.map((x) => x.url), i, q.company); strip.append(b); });
      card.append(strip);
    }
    { const qa = buyerQa(r, q); if (qa) card.append(qa); }
    if (q.status === "sent" && r.status === "open") {
      const b = el("button", "primary", "Alege această ofertă"); b.type = "button";
      b.onclick = () => awardQuote(r, q, b);
      const rj = el("button", "ghost", "Respinge oferta"); rj.type = "button";
      rj.onclick = async () => { if (!confirm(`Respingi oferta ${q.company}? Ofertantul e anunțat și nu o mai poate retrimite.`)) return; rj.disabled = true; try { await api(`/api/requests/${r.id}/quotes/${q.id}/reject`, "POST"); viewDetail(r.id); } catch (e) { showMessage("Eroare", errText(e)); rj.disabled = false; } };
      card.append(b, rj);
    }
    if (q.status === "won") {
      if (q.awb) card.append(el("p", "rfq-done", `📦 Expediat cu ${q.carrier}, AWB ${q.awb}`));
      if (q.phone) { const a = el("a", "ghost rfq-call", "Sună: " + q.phone); a.href = "tel:" + q.phone.replace(/[^\d+]/g, ""); card.append(a); }
      const c = el("button", "primary", q.completed_at ? "Chat și recenzie" : "Deschide chatul"); c.type = "button"; c.onclick = () => go("chat", q.id); card.append(c);
    }
    return card;
  }

  /* ---------- chatul ofertei câștigătoare ---------- */
  async function viewChat(qid) {
    qid = qid || st.quote; st.quote = qid;
    const list = el("div", "rfq-chat"), ta = el("textarea"); ta.rows = 2; ta.maxLength = 2000; ta.placeholder = "Scrie un mesaj…";
    const send = el("button", "primary", "Trimite"); send.type = "button";
    const back = el("button", "link-btn", "‹ Înapoi"); back.type = "button"; back.onclick = () => go(st.from === "offers" ? "offers" : "detail", st.id);
    const ttl = el("h3", ""), deal = el("section", "rfq-deal");
    body.replaceChildren(back, ttl, deal, list, ta, send);
    let sig = "", dsig = "";
    const load = async () => {
      try {
        const d = await api(`/api/requests/quote/${qid}/chat`); const s = d.messages.map((m) => m.id).join(",");
        ttl.textContent = `${d.title} · ${d.with}`;
        const ds = JSON.stringify(d.deal); if (ds !== dsig) { dsig = ds; paintDeal(deal, qid, d.deal, load); }   // formularul de recenzie se redesenează doar când se schimbă starea, nu la fiecare reîmprospătare
        if (s === sig) return; sig = s;
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
    body.replaceChildren(el("p", "muted rfq-intro", "Piese căutate chiar acum de cumpărători din toată țara. Ai piesa? Trimite o ofertă; ceilalți ofertanți nu o văd."), howBox(), nb, bar, list);
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
    [[r.brand + (r.model ? " " + r.model : "") + (r.year ? " · " + r.year : ""), "car"], [r.engine, ""], ...carTags(r).map((t) => [t, ""]), [r.vin ? "VIN " + r.vin : r.has_vin ? "VIN după ce trimiți o ofertă" : "", ""], [r.county, "loc"], [r.kind !== "oricare" ? KIND[r.kind] : "", "kind"], [r.delivery ? "livrare" : "ridicare", ""]]
      .forEach(([t, c]) => { if (t) tags.append(el("span", "rfq-tag " + c, t)); });
    card.append(hd, bar, tags); { const pl = partsList(r); if (pl) card.append(pl); } if (r.details) card.append(el("p", "rfq-note", r.details));
    { const ph = photoStrip(r.photos, r.part); if (ph) card.append(ph); }
    const foot = el("div", "rfq-ask-ft"); foot.append(el("small", "muted", r.quotes ? `${r.quotes} ${r.quotes === 1 ? "ofertă primită" : "oferte primite"}` : "încă nicio ofertă"));
    if (r.my_mark === "later") foot.append(el("em", "rfq-chip wait", "Pentru mai târziu")); if (r.my_mark === "ignored") foot.append(el("em", "rfq-chip", "Ignorată"));
    if (r.quote_id) foot.append(r.quote_status === "rejected" ? el("em", "rfq-chip bad", "Ofertă respinsă") : el("em", "rfq-chip ok", "Ofertă trimisă"));
    card.append(foot);
    if (r.mine) { card.append(el("p", "muted", "Aceasta este cererea ta.")); return card; }
    if (r.quote_status === "rejected") return card;
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
    top.append(el("b", "", title(r)), el("small", "muted", [r.engine, ...carTags(r), r.vin && "VIN " + r.vin, r.county, r.delivery ? "livrare acceptată" : "doar ridicare"].filter(Boolean).join(" · ")));
    card.append(top); { const pl = partsList(r); if (pl) card.append(pl); } if (r.details) card.append(el("p", "rfq-note", r.details));
    { const ph = photoStrip(r.photos, r.part); if (ph) card.append(ph); }
    const status = r.quote_status === "won" ? ["Ai câștigat", "sold"] : r.quote_status === "lost" ? ["Cerere închisă", "bad"] : r.quote_status === "rejected" ? ["Ofertă respinsă", "bad"] : r.quote_status === "sent" ? ["Ofertă trimisă", "ok"] : r.accepting !== false ? [left(r.expires_at), "wait"] : ["", ""];
    if (status[0]) card.append(el("em", "rfq-chip " + status[1], status[0]));
    if (pub) card.append(" ", el("small", "muted", r.quotes ? `${r.quotes} ${r.quotes === 1 ? "ofertă" : "oferte"}` : "nicio ofertă încă"));
    if (r.quote_id) card.append(el("p", "rfq-price", `Oferta ta: ${money(r.price, r.currency)}${r.shipping == null ? "" : r.shipping === 0 ? " · transport gratuit" : " + " + money(r.shipping, r.currency) + " transport"}${r.eta_days == null ? "" : " · " + etaText(r.eta_days)}`));
    if (r.open_questions) card.append(el("em", "rfq-chip wait", `${r.open_questions} ${r.open_questions === 1 ? "întrebare fără răspuns" : "întrebări fără răspuns"}`));
    if (r.ship_to && r.quote_status === "won") card.append(shipCard(r.ship_to, "Unde trimiți piesele"));
    if (r.awb) card.append(el("p", "rfq-done", `📦 Expediat cu ${r.carrier}, AWB ${r.awb}`));
    { const qa = dealerQa(r, onDone); if (qa) card.append(qa); }
    if (r.mine) card.append(el("p", "muted", "Aceasta este cererea ta."));
    else if (r.quote_status === "won") {
      const br = r.buyer_rating_count ? ` · ★ ${r.buyer_rating} (${r.buyer_rating_count})` : " · fără recenzii ca cumpărător";
      card.append(el("p", "muted", `Cumpărător: @${r.buyer}${br}${r.completed_at ? " · tranzacție finalizată" : ""}`));
      const c = el("button", "primary", r.completed_at ? `Chat și recenzie · ${r.buyer}` : `Chat cu ${r.buyer}`); c.type = "button"; c.onclick = () => { st.quote = r.quote_id; st.from = "offers"; go("chat", r.quote_id); }; card.append(c); }
    else if (r.accepting !== false && r.quote_status !== "lost" && r.quote_status !== "rejected") {
      const b = el("button", r.quote_id ? "ghost" : "primary", r.quote_id ? "Modifică oferta" : "Trimite ofertă"); b.type = "button";
      b.onclick = () => { if (!me) return openAuth(); b.replaceWith(quoteForm(r, onDone)); }; card.append(b);
    }
    return card;
  }

  function quoteForm(r, onDone) {
    const f = el("form", "rfq-qform"), price = inp("number", "Preț piesă", r.price); price.min = 1; price.step = "0.01";
    // cerere cu mai multe piese: preț pe fiecare piesă; las gol ce nu ai
    const lineIn = [], linesBox = el("div", "rfq-qlines"), totalEl = el("p", "rfq-qtotal");
    if (multi(r)) {
      r.items.forEach((it) => {
        const have = (r.lines || []).find((l) => l.item_id === it.id), w = el("label", "rfq-qline"), i = inp("number", "Preț", have ? have.price : ""); i.min = 0.01; i.step = "0.01";
        w.append(el("span", "", it.name + (it.details ? " · " + it.details : "")), i); linesBox.append(w); lineIn.push([it, i]); i.oninput = tot;
      });
    }
    function tot() { const n = lineIn.filter(([, i]) => Number(i.value) > 0), s = n.reduce((a, [, i]) => a + Number(i.value), 0); totalEl.textContent = n.length ? `Ai pus preț la ${n.length} din ${lineIn.length} piese · total ${nf(Math.round(s * 100) / 100)}` : "Pune preț la cel puțin o piesă. Piesele pe care nu le ai le lași goale."; }
    tot();
    const curS = el("select"); [["RON", "lei"], ["EUR", "€"]].forEach(([v, t]) => curS.append(new Option(t, v))); curS.value = r.currency || "RON";
    const state = el("select"); Object.entries(STATE).forEach(([v, t]) => state.append(new Option(t, v))); state.value = r.state || "buna";
    const war = inp("number", "Zile garanție (0 = fără)", r.warranty_days != null ? r.warranty_days : 0); war.min = 0; war.max = 730;
    const eta = el("select"); ETA.forEach(([v, t]) => eta.append(new Option(t, v))); eta.value = r.eta_days != null ? String(r.eta_days) : "";
    const inv = el("input"); inv.type = "checkbox"; inv.checked = r.invoice != null ? !!r.invoice : !!(st.dealer && st.dealer.status === "approved"); const invL = el("label", "rfq-chk"); invL.append(inv, " Emit factură");
    const pay = el("select"); [["oricare", "Oricum (ramburs sau transfer)"], ["ramburs", "Doar ramburs"], ["transfer", "Doar transfer bancar"], ["numerar", "Numerar, la ridicare"]].forEach(([v, t]) => pay.append(new Option(t, v))); pay.value = r.payment || "oricare";
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
    const more = el("details", "rfq-more"); more.open = !!r.quote_id;
    more.append(el("summary", "", "Garanție, transport, plată, poze (opțional)"), field("Garanție", war), field("Termen de livrare", eta), field("Transport", ship), field("Plată acceptată", pay), invL, field("Județ", cty), pkL, field("Notă", note), strip, add, file);
    f.append(...(multi(r) ? [el("p", "muted", "Pune prețul pentru fiecare piesă pe care o ai. Poți oferi doar o parte din ele."), linesBox, totalEl] : [field("Preț", price)]), field("Monedă", curS), field("Starea piesei", state), more, msg, ok); paint();
    f.onsubmit = async (e) => {
      e.preventDefault(); ok.disabled = true; msg.hidden = true;
      try { await api(`/api/requests/${r.id}/quotes`, "POST", { ...(multi(r) ? { lines: lineIn.filter(([, i]) => Number(i.value) > 0).map(([it, i]) => ({ item_id: it.id, price: i.value, state: state.value })) } : { price: price.value }), currency: curS.value, state: state.value, warranty_days: war.value, eta_days: eta.value, invoice: inv.checked, payment: pay.value, shipping: ship.value, pickup: pk.checked, county: cty.value, note: note.value, image_ids: photos.map((p) => p.id) }); (onDone || viewOffers)(); }
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

  window.openRequests = (view, pre) => {
    if (!view) view = pre ? "new" : !st.role ? "hub" : st.role === "sell" ? "board" : me ? "mine" : "hub";
    window.rfqPre = me && pre && typeof pre === "object" ? pre : null;   // fără cont nu păstrăm nimic: după autentificare omul apasă din nou
    build(); if (typeof accClosePage === "function" && typeof accIsOpen === "function" && accIsOpen()) accClosePage();
    if (!dlg.open) dlg.showModal(); go(view);
  };
  window.rfqSummaryRefresh = async () => {
    if (!me) Object.assign(rfqSum, { open: 0, waiting: 0, new_quotes: 0, new_answers: 0 });
    else { try { Object.assign(rfqSum, await api("/api/requests/summary")); } catch { return; } }
    const n = rfqSum.new_quotes + rfqSum.new_answers, c = document.getElementById("accRfqN");   // contorul din meniul contului
    if (c) { const t = n ? `${n} ${n === 1 ? "nouă" : "noi"}` : (rfqSum.waiting ? String(rfqSum.waiting) : ""); c.textContent = t; c.hidden = !t; c.classList.toggle("hot", n > 0); }
    if (dlg && dlg.open) tabs();
  };
  window.rfqRefresh = () => { window.rfqSummaryRefresh(); if (dlg && dlg.open && ["mine", "received", "offers", "detail"].includes(st.view) && !body.contains(document.activeElement)) go(st.view, st.id); };
  window.rfqMsg = () => { if (dlg && dlg.open && st.view === "chat") viewChat(st.quote); };

  /* intrare din meniu și din adresă (#cereri) */
  const nav = document.getElementById("mainMenu");
  if (nav) { const a = el("a", "", "Oferte piese"); a.href = ROUTES.hub; a.addEventListener("click", (e) => { e.preventDefault(); openRequests(); }); nav.append(a); }
  const startRoute = parsePath(location.pathname) || (location.hash === "#cereri" ? ["board"] : null);
  if (startRoute) setTimeout(() => { build(); if (typeof accClosePage === "function" && typeof accIsOpen === "function" && accIsOpen()) accClosePage(); if (!dlg.open) dlg.showModal(); go(me || startRoute[0] === "hub" ? startRoute[0] : "board", startRoute[1]); }, 800);
  if (typeof window.addEventListener === "function") window.addEventListener("popstate", () => {
    const r = parsePath(location.pathname); st.pop = true;
    try { if (r) { build(); if (!dlg.open) dlg.showModal(); go(r[0], r[1]); } else if (dlg && dlg.open) dlg.close(); } finally { st.pop = false; }
  });
})();
