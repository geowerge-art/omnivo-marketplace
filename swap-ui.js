/* „Schimb”: pagina cu anunțuri la care se acceptă schimb, „Schimburile mele” și potrivirile (directe și în lanț de 3).
   Folosește din script.js: $, api, me, showMessage, errText, ERR, openAuth, openDetail, openInbox. Backend: swap.js. */
(() => {
  Object.assign(ERR, {
    CE_CAUTI_INVALID: "Scrie ce cauți în schimb (între 3 și 120 de caractere).",
    FARA_CONTACT_IN_SCHIMB: "Nu scrie telefon, email sau linkuri. Contactul se dă în chat.",
    PREA_MULTE_SCHIMBURI: "Poți avea cel mult 20 de anunțuri la schimb.",
    PREA_MULTE_CERERI: "Prea multe cereri. Încearcă mai târziu."
  });
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const money = (x) => (x.price == null ? "Preț la cerere" : `${Number(x.price).toLocaleString("ro-RO")} ${x.currency === "EUR" ? "€" : "lei"}`);
  const st = { view: "board", q: "", list: null, mineData: null, timer: null };
  let dlg = null, body = null, tabsEl = null;

  const CHEV = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  function build() {
    if (dlg) return;
    dlg = el("dialog", "chatpage sw-page"); dlg.setAttribute("aria-label", "Schimb");
    const top = el("header", "cp-head"), h = el("h2", "", "Schimb");
    const x = el("button", "cp-back"); x.type = "button"; x.setAttribute("aria-label", "Înapoi"); x.innerHTML = CHEV; x.onclick = () => dlg.close();
    top.append(x, h);
    tabsEl = el("nav", "sw-tabs"); body = el("div", "sw-body");
    dlg.append(top, tabsEl, body); document.body.append(dlg);
    dlg.addEventListener("close", () => { clearTimeout(st.timer); });
  }
  function tabs() {
    const items = [["board", "Schimburi"], ["mine", "Ale mele și potriviri"]];
    tabsEl.replaceChildren(...items.map(([k, t]) => { const b = el("button", "sw-tab" + (st.view === k ? " on" : ""), t); b.type = "button"; b.onclick = () => go(k); return b; }));
  }
  function go(v) { st.view = v; tabs(); (v === "mine" ? viewMine : viewBoard)(); }
  const note = (txt, cls) => el("p", "sw-note" + (cls ? " " + cls : ""), txt);

  function card(x, actions) {
    const c = el("article", "sw-card");
    const ph = el("button", "sw-ph"); ph.type = "button"; ph.setAttribute("aria-label", "Deschide anunțul");
    if (x.thumb) { const im = el("img"); im.src = x.thumb; im.alt = ""; im.loading = "lazy"; ph.append(im); } else ph.textContent = "⇄";
    ph.onclick = () => window.openDetail && openDetail(x.id);
    const mid = el("div", "sw-mid");
    const t = el("button", "sw-title", x.title); t.type = "button"; t.onclick = ph.onclick;
    mid.append(t, el("div", "sw-price", money(x)));
    if (x.wants) { const w = el("div", "sw-wants"); w.append(el("b", "", "Caută în schimb: "), document.createTextNode(x.wants)); mid.append(w); }
    const loc = [x.city, x.county].filter(Boolean).join(", "); const who = [x.nickname, loc].filter(Boolean).join(" · ");
    if (who) mid.append(el("div", "sw-meta", who));
    if (actions) mid.append(actions);
    c.append(ph, mid); return c;
  }

  /* ---- Schimburi (lista publică) ---- */
  async function viewBoard() {
    body.replaceChildren();
    const f = el("form", "sw-search"); f.addEventListener("submit", (e) => { e.preventDefault(); st.q = inp.value.trim(); viewBoard(); });
    const inp = el("input"); inp.type = "search"; inp.placeholder = "Ce cauți? Ex: laptop, bicicletă"; inp.value = st.q; inp.setAttribute("aria-label", "Caută în schimburi"); inp.maxLength = 100;
    const go1 = el("button", "", "Caută"); go1.type = "submit"; f.append(inp, go1);
    const intro = note("Anunțuri la care proprietarul acceptă schimb. Apasă „Propun schimb” și trimite-i un mesaj cu ceva de-al tău.");
    const list = el("div", "sw-list"); list.append(note("Se încarcă…"));
    body.append(f, intro, list);
    try {
      const d = await api("/api/swaps" + (st.q ? "?q=" + encodeURIComponent(st.q) : ""));
      list.replaceChildren();
      if (!d.swaps.length) list.append(note(st.q ? "Nimic găsit pentru această căutare." : "Încă nu e niciun anunț la schimb. Fii primul: din „Ale mele” alegi un anunț și spui ce cauți.", "sw-empty"));
      for (const x of d.swaps) {
        const a = el("div", "sw-actions");
        if (me && x.user_id === me.id) a.append(el("span", "sw-mine-tag", "Anunțul tău"));
        else { const b = el("button", "sw-btn", "Propun schimb"); b.type = "button"; b.onclick = () => propose(x); a.append(b); }
        list.append(card(x, a));
      }
    } catch (e) { list.replaceChildren(note(errText(e), "sw-err")); }
  }

  /* ---- trimiterea unei propuneri: mesaj în chatul anunțului ---- */
  async function myApproved() { const d = await api("/api/listings/mine"); return d.listings.filter((l) => l.status === "approved"); }
  async function sendTo(listingId, text) {
    await api("/api/messages", "POST", { listing_id: listingId, body: text });
    if (dlg && dlg.open) dlg.close();
    showMessage("Propunere trimisă", "Mesajul a ajuns la proprietar. Răspunsul îl vezi în Mesaje.");
    if (window.openInbox) setTimeout(() => { const d = document.getElementById("messageDialog"); if (d) d.addEventListener("close", () => openInbox(), { once: true }); }, 0);
  }
  async function propose(x) {
    if (!me) return openAuth("Intră în cont ca să propui un schimb.");
    let mineL = [];
    try { mineL = await myApproved(); } catch (e) { return showMessage("Schimb", errText(e)); }
    const ov = el("dialog", "sw-pop"); ov.setAttribute("aria-label", "Propune schimb");
    ov.append(el("h3", "", "Propune schimb"), el("p", "sw-meta", `Pentru: ${x.title}`));
    const sel = el("select"); sel.setAttribute("aria-label", "Ce oferi tu");
    sel.append(new Option("Ofer altceva (scriu în mesaj)", ""));
    for (const l of mineL) sel.append(new Option(l.title, String(l.id)));
    const ta = el("textarea"); ta.rows = 4; ta.maxLength = 600; ta.setAttribute("aria-label", "Mesaj");
    const fill = () => { const l = mineL.find((q) => String(q.id) === sel.value); ta.value = l ? `Salut! Îți propun un schimb: ofer „${l.title}” pentru „${x.title}”. Ce zici?` : `Salut! Îți propun un schimb pentru „${x.title}”. Ofer: `; };
    if (mineL.length) sel.value = String(mineL[0].id);
    sel.onchange = fill; fill();
    const err = note("", "sw-err"); err.hidden = true;
    const row = el("div", "sw-row"), cancel = el("button", "sw-btn ghost", "Renunț"), go2 = el("button", "sw-btn", "Trimite");
    cancel.type = "button"; go2.type = "button"; cancel.onclick = () => ov.close();
    go2.onclick = async () => {
      go2.disabled = true; err.hidden = true;
      try { ov.close(); await sendTo(x.id, ta.value.trim()); } catch (e) { go2.disabled = false; if (!ov.open) ov.showModal(); err.textContent = msgErr(e); err.hidden = false; }
    };
    row.append(cancel, go2); ov.append(sel, ta, err, row); ov.addEventListener("close", () => ov.remove()); document.body.append(ov); ov.showModal();
  }
  const msgErr = (e) => ({ ANUNT_VANDUT: "Anunțul a fost vândut.", ANUNT_STERS: "Anunțul nu mai există.", BLOCAT: "Nu poți scrie acestui utilizator.", BLOCAT_DE_TINE: "L-ai blocat pe acest utilizator.", PREA_MULTE_MESAJE: "Ai trimis prea multe mesaje. Încearcă mai târziu.", MESAJ_INVALID: "Scrie un mesaj." }[e.code] || errText(e));

  /* ---- Ale mele + potriviri ---- */
  async function viewMine() {
    body.replaceChildren();
    if (!me) { const b = el("button", "sw-btn", "Intră în cont"); b.type = "button"; b.onclick = () => openAuth("Intră în cont ca să-ți pui anunțurile la schimb."); body.append(note("Intră în cont ca să-ți pui anunțurile la schimb și să vezi potrivirile."), b); return; }
    body.append(note("Se încarcă…"));
    let d, all;
    try { [d, all] = await Promise.all([api("/api/swaps/mine"), myApproved()]); } catch (e) { body.replaceChildren(note(errText(e), "sw-err")); return; }
    body.replaceChildren();
    const on = new Map(d.mine.map((s) => [s.id, s]));

    // 1) potriviri
    const hasM = d.direct.length || d.chains.length;
    const sec1 = el("section", "sw-sec"); sec1.append(el("h3", "", "Potriviri pentru tine"));
    if (!d.mine.length) sec1.append(note("Pune un anunț la schimb (mai jos) și îți căutăm potriviri."));
    else if (!hasM) sec1.append(note("Încă nu avem nicio potrivire. Revino mai târziu: se adaugă anunțuri noi în fiecare zi."));
    for (const m of d.direct) {
      const a = el("div", "sw-actions"); if (m.both) a.append(el("span", "sw-badge", "Potrivire dublă")); 
      const b = el("button", "sw-btn", "Propun schimb"); b.type = "button";
      b.onclick = async () => { try { await sendTo(m.other.id, `Salut! Îți propun un schimb: ofer „${m.mine.title}” pentru „${m.other.title}”. Ce zici?`); } catch (e) { showMessage("Schimb", msgErr(e)); } };
      a.append(b);
      const c = card(m.other, a); const why = el("div", "sw-why", m.both ? `Cauți asta pentru „${m.mine.title}”, iar el caută exact ce ai tu.` : `Se potrivește cu ce cauți pentru „${m.mine.title}”.`); c.querySelector(".sw-mid").insertBefore(why, c.querySelector(".sw-actions")); sec1.append(c);
    }
    if (d.chains.length) {
      sec1.append(el("h4", "", "Schimb în lanț (3 persoane)"), note("Nu e nevoie să se potrivească direct doi oameni: dacă A vrea ce are B, B vrea ce are C și C vrea ce ai tu, toți trei primesc ce caută."));
      for (const ch of d.chains) {
        const box = el("article", "sw-chain");
        const steps = el("ol", "sw-steps");
        steps.append(el("li", "", `Tu dai „${ch.mine.title}” lui ${ch.c.nickname || "C"}`), el("li", "", `${ch.c.nickname || "C"} dă „${ch.c.title}” lui ${ch.b.nickname || "B"}`), el("li", "", `${ch.b.nickname || "B"} îți dă „${ch.b.title}”`));
        const a = el("div", "sw-actions");
        const msgB = `Salut! Cred că putem face un schimb în 3: eu primesc „${ch.b.title}” de la tine, tu primești „${ch.c.title}” de la ${ch.c.nickname || "încă o persoană"}, iar acesta primește „${ch.mine.title}” de la mine. Ești de acord?`;
        const msgC = `Salut! Cred că putem face un schimb în 3: eu îți dau „${ch.mine.title}”, tu îi dai „${ch.c.title}” lui ${ch.b.nickname || "încă o persoană"}, iar acesta îmi dă „${ch.b.title}”. Ești de acord?`;
        for (const [lab, to, txt] of [[`Scrie-i lui ${ch.b.nickname || "B"}`, ch.b.id, msgB], [`Scrie-i lui ${ch.c.nickname || "C"}`, ch.c.id, msgC]]) {
          const b = el("button", "sw-btn", lab); b.type = "button"; b.onclick = async () => { try { await sendTo(to, txt); } catch (e) { showMessage("Schimb", msgErr(e)); } }; a.append(b);
        }
        box.append(steps, a); sec1.append(box);
      }
    }
    body.append(sec1);

    // 2) anunțurile mele
    const sec2 = el("section", "sw-sec"); sec2.append(el("h3", "", "Anunțurile mele"));
    if (!all.length) sec2.append(note("Nu ai anunțuri publicate. Adaugă un anunț, apoi îl poți pune la schimb."));
    for (const l of all) {
      const cur = on.get(l.id);
      const form = el("form", "sw-form");
      const inp = el("input"); inp.type = "text"; inp.maxLength = 120; inp.placeholder = "Ce cauți în schimb? Ex: laptop sau tabletă"; inp.value = cur ? cur.wants : ""; inp.setAttribute("aria-label", "Ce cauți în schimb");
      const save = el("button", "sw-btn", cur ? "Salvează" : "Pune la schimb"); save.type = "submit";
      const err = note("", "sw-err"); err.hidden = true;
      form.append(inp, save);
      form.addEventListener("submit", async (e) => { e.preventDefault(); save.disabled = true; err.hidden = true; try { await api("/api/swaps/" + l.id, "PUT", { wants: inp.value }); viewMine(); } catch (er) { save.disabled = false; err.textContent = errText(er); err.hidden = false; } });
      const acts = el("div", "sw-actions"); acts.append(form);
      if (cur) { const rm = el("button", "sw-btn ghost", "Scoate de la schimb"); rm.type = "button"; rm.onclick = async () => { try { await api("/api/swaps/" + l.id, "DELETE"); viewMine(); } catch (er) { showMessage("Schimb", errText(er)); } }; acts.append(rm); }
      acts.append(err);
      sec2.append(card({ ...l, wants: "" }, acts));
    }
    body.append(sec2);
  }

  window.openSwap = (view) => {
    build();
    if (!dlg.open) dlg.showModal();
    go(view === "mine" ? "mine" : "board");
  };
  if (location.pathname === "/schimb") window.addEventListener("load", () => window.openSwap(), { once: true });
})();
