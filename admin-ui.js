/* Panou de administrare (admin + moderator) și raportarea anunțurilor.
   Folosește din script.js: $, api, me, show, showMessage, errText, price, ERR, openDetail, openAuth, openEdit, openLightbox. */
(() => {
  Object.assign(ERR, {
    MOTIV_OBLIGATORIU: "Scrie un motiv.", BLOCARE_MAX_30_ZILE: "Moderatorii pot bloca cel mult 30 de zile.", DOAR_ADMIN: "Doar administratorii pot face asta.",
    CANNOT_BLOCK_SELF: "Nu te poți bloca singur.", ROL_PROPRIU: "Nu îți poți schimba singur rolul.", ADMIN_PRINCIPAL: "Contul principal de administrator nu poate fi schimbat.",
    ULTIMUL_ADMIN: "Trebuie să rămână cel puțin un administrator.", CANNOT_DELETE_ADMIN: "Un administrator nu poate fi șters.", INTERZIS: "Nu ai voie să faci asta.",
    NIMIC_SELECTAT: "Nu ai selectat niciun anunț.", REPORT_PROPRIU: "Nu îți poți raporta propriul anunț.", RAPORT_MOTIV: "Alege motivul raportării."
  });
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const fmt = (d) => new Date(d).toLocaleString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtD = (d) => new Date(d).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
  const TABS = [["over", "Panou"], ["ads", "Anunțuri"], ["users", "Utilizatori"], ["reports", "Raportări"], ["log", "Jurnal"]];
  const AB = { pending: "De aprobat", approved: "Active", rejected: "Respinse", blocked: "Blocate", sold: "Vândute", all: "Toate", deleted: "Șterse" };
  const UB = { "": "Toți", "status:blocked": "Blocați", "role:moderator": "Moderatori", "role:admin": "Administratori" };
  const RB = { open: "Deschise", resolved: "Rezolvate", dismissed: "Respinse" };
  const ROLE = { user: "Utilizator", moderator: "Moderator", admin: "Administrator" };
  const REASON = { inselatorie: "Înșelătorie", interzis: "Interzis", duplicat: "Duplicat", gresit: "Preț/categorie greșită", vandut: "Deja vândut", altul: "Altceva" };
  const ACT = { listing_approved: "Anunț aprobat", listing_rejected: "Anunț respins", listing_blocked: "Anunț blocat", listing_pending: "Anunț trimis în moderare", listing_edit: "Anunț editat", listing_delete: "Anunț șters",
    user_block: "Cont blocat", user_unblock: "Cont deblocat", user_role: "Rol schimbat", user_delete: "Cont șters", report_resolved: "Raportare rezolvată", report_dismissed: "Raportare respinsă", listing_promote: "Promovare anunț", review_delete: "Recenzie ștearsă" };
  const ICON = { listing_approved: "✅", listing_rejected: "⛔", listing_blocked: "🚫", listing_pending: "⏳", listing_edit: "✎", listing_delete: "🗑", user_block: "🔒", user_unblock: "🔓", user_role: "🛡", user_delete: "🗑", report_resolved: "⚑", report_dismissed: "⚑", listing_promote: "⭐", review_delete: "★" };
  const PILL = { pending: "warn", approved: "ok", rejected: "bad", blocked: "bad", sold: "mute", deleted: "mute" };
  const DIST = [["approved", "#2e9e5b"], ["pending", "#d9a528"], ["sold", "#8a8a8a"], ["rejected", "#d9705f"], ["blocked", "#b3261e"]];
  const st = { tab: "over", ads: "pending", users: "", reports: "open", q: { ads: "", users: "" }, badge: { pending: 0, reports: 0 }, counts: {}, review: 0, sel: new Set(), selMode: false, updateBulk: () => {} };
  const fail = (e) => showMessage("Eroare", errText(e));
  const pill = (s) => el("span", "adm-pill " + (PILL[s] || "mute"), AB[s] || s);

  /* ---- fereastră mică: motiv / durată ---- */
  function ask({ title, hint = "", days = false, label = "Motiv", required = true }) {
    return new Promise((res) => {
      $("admFormTitle").textContent = title; $("admFormHint").textContent = hint; $("admFormDays").hidden = !days;
      $("admReasonLbl").textContent = label + (required ? " *" : " (opțional)"); $("admReason").value = ""; $("admDays").value = ""; show($("admFormErr"), "");
      const d = $("admForm"); let done = false;
      const end = (v) => { if (done) return; done = true; d.close(); res(v); };
      $("admFormOk").onclick = () => { const reason = $("admReason").value.trim(); if (required && !reason) return show($("admFormErr"), "Scrie un motiv."); end({ reason, days: $("admDays").value.trim() }); };
      $("admFormNo").onclick = () => end(null); d.onclose = () => end(null);
      d.showModal();
    });
  }

  /* ---- bucăți de interfață ---- */
  const btn = (t, fn, cls) => {
    const b = el("button", "adm-btn" + (cls ? " " + cls : ""), t); b.type = "button";
    b.onclick = async (e) => { e.stopPropagation(); b.disabled = true; try { await fn(); } catch (err) { fail(err); } b.disabled = false; };
    return b;
  };
  function chips(map, cur, pick, counts) {
    const box = el("div", "adm-chips");
    Object.entries(map).forEach(([k, t]) => {
      const b = el("button", "adm-chip" + (k === cur ? " on" : ""), t); b.type = "button";
      if (counts && counts[k] != null) b.append(el("i", "", counts[k]));
      b.onclick = () => pick(k); box.append(b);
    });
    return box;
  }
  function searchBox(ph, val, on) {
    const i = el("input", "adm-search"); i.type = "search"; i.placeholder = ph; i.value = val; let t;
    i.oninput = () => { clearTimeout(t); t = setTimeout(() => on(i.value.trim()), 400); }; return i;
  }
  const thumb = (u) => { const t = el("div", "adm-thumb"); if (u) { const g = el("img"); g.src = u; g.alt = ""; g.loading = "lazy"; t.append(g); } else t.textContent = "📷"; return t; };
  function item({ lead, title, tag, price: pr, meta = [], flags = [], acts = [], onOpen }) {
    const r = el("article", "adm-item" + (onOpen ? " click" : "")), mid = el("div", "adm-mid"), line = el("div", "adm-line");
    line.append(el("b", "adm-title", title)); if (tag) line.append(tag); mid.append(line);
    if (pr) mid.append(el("div", "adm-price", pr));
    meta.filter(Boolean).forEach((m) => mid.append(el("small", "adm-meta", m)));
    flags.filter(Boolean).forEach((f) => mid.append(el("small", "adm-warn", f)));
    if (acts.length) { const box = el("div", "adm-acts"); acts.forEach(([t, fn, cls]) => box.append(btn(t, fn, cls))); mid.append(box); }
    r.append(lead, mid);
    if (onOpen) r.onclick = (e) => { if (!e.target.closest("button, select, a, input")) onOpen(); };
    return r;
  }
  async function paged(list, base, rowFn) {
    list.replaceChildren(el("p", "muted", "Se încarcă…")); let off = 0; const more = el("button", "ghost adm-more", "Mai multe");
    const load = async () => {
      const d = await api(`${base}${base.includes("?") ? "&" : "?"}limit=20&offset=${off}`);
      if (off === 0) list.replaceChildren(); more.remove(); d.rows.forEach((r) => list.append(rowFn(r)));
      if (!d.rows.length && off === 0) list.append(el("p", "muted", "Nimic de afișat aici."));
      off += d.rows.length; if (d.rows.length === 20) list.append(more);
    };
    more.onclick = () => load().catch(fail);
    try { await load(); } catch (e) { list.replaceChildren(el("p", "err", errText(e))); }
  }
  const actRow = (a) => {
    const r = el("div", "adm-log"), t = el("div"); r.append(el("span", "", ICON[a.action] || "•"), t);
    t.append(el("b", "", ACT[a.action] || a.action), el("small", "adm-meta", `${a.target_type} #${a.target_id} · @${a.nickname || "—"} · ${fmt(a.created_at)}`));
    if (a.details) t.append(el("small", "adm-meta", a.details)); return r;
  };

  /* ---- acțiuni pe anunț (folosite și în listă, și în fereastra de verificare) ---- */
  async function setStatus(a, status, label, needReason) {
    let note; if (needReason) { const f = await ask({ title: label, hint: `„${a.title}” — motivul îl vede vânzătorul.` }); if (!f) return; note = f.reason; }
    await api(`/api/admin/ads/${a.id}`, "PATCH", { status, note }); await refresh();
  }
  async function editFull(id) {   // același formular ca la „Editează anunțul”, cu poze și atribute
    const { listing } = await api("/api/listings/" + id);
    if (!listing.edit) return showMessage("Eroare", "Nu poți edita acest anunț.");
    await openEdit(listing);
  }
  async function refresh() { await render(); if ($("admAd").open && st.review) await openReview(st.review); }

  /* ---- fereastra de verificare a anunțului ---- */
  async function openReview(id) {
    st.review = id; const d = $("admAd");
    if (!d.open) { $("admAdBody").replaceChildren(el("p", "muted", "Se încarcă…")); $("admAdActions").replaceChildren(); d.showModal(); }
    let l; try { l = (await api("/api/admin/ads/" + id)).listing; } catch (e) { d.close(); return fail(e); }
    $("admAdTitle").textContent = `Anunț #${l.id}`; $("admAdSub").textContent = AB[l.status] || l.status;
    const urls = l.images.map((i) => i.url);
    const left = el("div", "adm-ad-l"), main = el("div", "adm-gal-main" + (urls.length ? "" : " none")), strip = el("div", "adm-gal-th");
    let cur = 0;
    const show1 = (i) => { cur = i; main.replaceChildren(); if (!urls.length) { main.textContent = "Anunțul nu are poze."; return; } const g = el("img"); g.src = urls[i]; g.alt = l.title; main.append(g); [...strip.children].forEach((c, k) => c.classList.toggle("on", k === i)); };
    main.onclick = () => { if (urls.length) openLightbox(urls, cur, l.title); };
    l.images.forEach((im, i) => {
      const t = el("div", "adm-th" + (i ? "" : " on")), g = el("img"); g.src = im.url; g.alt = ""; g.loading = "lazy"; t.append(g); t.onclick = () => show1(i);
      const x = el("button", "adm-th-x", "✕"); x.type = "button"; x.title = "Șterge poza";
      x.onclick = async (e) => { e.stopPropagation(); if (!confirm("Ștergi această poză din anunț?")) return; try { await api(`/api/listings/${l.id}/images/${im.id}`, "DELETE"); await openReview(l.id); render(); } catch (err) { fail(err); } };
      t.append(x); strip.append(t);
    });
    show1(0); left.append(main); if (urls.length > 1 || urls.length) left.append(strip);

    const right = el("div", "adm-ad-r");
    const head = el("div"); head.append(el("h2", "", l.title)); const pr = el("div", "adm-bigprice", price(l) + (l.negotiable ? " · negociabil" : "")); head.append(pr);
    const row2 = el("div", "adm-line"); row2.append(pill(l.status)); row2.style.justifyContent = "flex-start"; if (l.promoted_until && new Date(l.promoted_until) > new Date()) row2.append(el("span", "adm-pill warn", "⭐ Promovat"));
    right.append(head, row2);
    const F = (k, v) => { if (v == null || v === "") return null; const d1 = el("div"); d1.append(el("small", "", k), el("b", "", v)); return d1; };
    const facts = el("div", "adm-facts");
    [F("Categorie", [l.parent_category, l.category].filter(Boolean).join(" › ")), F("Stare", l.condition === "nou" ? "Nou" : l.condition ? "Folosit" : ""), F("Locație", [l.city, l.county].filter(Boolean).join(", ")),
      F("Vizualizări", l.views), F("Publicat", fmtD(l.created_at)), F("Expiră", l.expires_at ? fmtD(l.expires_at) : ""), ...l.attrs.map((a) => F(a.label, a.value))].filter(Boolean).forEach((x) => facts.append(x));
    right.append(facts);
    if (l.mod_note) { const n = el("div", "adm-box note"); n.append(el("h4", "", "Motiv moderare"), el("p", "", l.mod_note)); right.append(n); }
    if (l.description) { const b = el("div", "adm-box"); b.append(el("h4", "", "Descriere"), el("p", "", l.description)); right.append(b); }

    const sb = el("div", "adm-box"), srow = el("div", "adm-seller"), sinfo = el("div");
    sb.append(el("h4", "", "Vânzător")); srow.append(el("div", "adm-av", (l.nickname || "?").slice(0, 1).toUpperCase()), sinfo);
    sinfo.append(el("b", "", `@${l.nickname || "—"}${l.uname ? " · " + l.uname : ""}`));
    const c1 = el("small", "adm-meta"); if (l.email) { const a = el("a", "", l.email); a.href = "mailto:" + l.email; c1.append(a); } if (l.phone) { c1.append(" · "); const a = el("a", "", l.phone); a.href = "tel:" + l.phone; c1.append(a); } sinfo.append(c1);
    sinfo.append(el("small", "adm-meta", `${ROLE[l.urole] || ""} · ${l.uads} anunțuri · înscris ${fmtD(l.ucreated)}${l.ustatus === "blocked" ? " · CONT BLOCAT" : ""}${l.email_verified ? "" : " · email neconfirmat"}`));
    sb.append(srow);
    const sa = el("div", "adm-acts"); sa.append(btn("Profil public", async () => { await window.openProfile(l.uid); }), btn("Toate anunțurile lui", async () => { st.q.ads = l.nickname; st.ads = "all"; $("admAd").close(); go("ads"); })); sb.append(sa); right.append(sb);

    if (l.reports.length) { const b = el("div", "adm-box"); b.append(el("h4", "", `Raportări (${l.reports.length})`)); l.reports.forEach((r) => { const p = el("p", "", `⚑ ${REASON[r.reason] || r.reason}${r.details ? " — " + r.details : ""}`); const s = el("small", "adm-meta", `de la @${r.reporter || "—"} · ${fmt(r.created_at)} · ${RB[r.status] || r.status}`); b.append(p, s); }); right.append(b); }
    if (l.history.length) { const b = el("div", "adm-box"); b.append(el("h4", "", "Istoric moderare")); l.history.forEach((h) => b.append(actRow({ ...h, target_type: "anunț", target_id: l.id }))); right.append(b); }
    $("admAdBody").replaceChildren(left, right);

    const bar = $("admAdActions"); bar.replaceChildren();
    if (l.status !== "approved") bar.append(btn("✓ Aprobă", () => setStatus(l, "approved", "Aprobă", false), "ok"));
    if (l.status !== "rejected") bar.append(btn("Respinge", () => setStatus(l, "rejected", "Respinge anunțul", true)));
    if (l.status !== "blocked") bar.append(btn("Blochează", () => setStatus(l, "blocked", "Blochează anunțul", true), "bad"));
    bar.append(btn("✎ Editează", () => editFull(l.id)));
    bar.append(btn("👁 Pagina publică", async () => { await openDetail(l.id); }));
    if (l.status === "approved" || (l.promoted_until && new Date(l.promoted_until) > new Date())) {
      const sel = el("select", "adm-sel"), on = l.promoted_until && new Date(l.promoted_until) > new Date();
      [["", "⭐ Promovare…"], ["3", "Promovează 3 zile"], ["7", "Promovează 7 zile"], ["30", "Promovează 30 de zile"], ["90", "Promovează 90 de zile"], ...(on ? [["0", "Oprește promovarea"]] : [])].forEach(([v, t]) => { const o = el("option", "", t); o.value = v; sel.append(o); });
      sel.onchange = async () => { if (sel.value === "") return; try { await api(`/api/admin/ads/${l.id}/promote`, "POST", { days: Number(sel.value) }); await refresh(); } catch (e) { sel.value = ""; fail(e); } };
      bar.append(sel);
    }
    if (me.role === "admin") bar.append(btn("🗑 Șterge", async () => { if (!confirm(`Ștergi definitiv „${l.title}”? Nu se mai poate recupera.`)) return; await api(`/api/admin/ads/${l.id}`, "DELETE"); $("admAd").close(); render(); }, "bad"));
  }
  $("admAdClose")?.addEventListener("click", () => $("admAd").close());
  $("sellDialog")?.addEventListener("close", () => { if ($("adminDialog").open) refresh().catch(() => {}); });   // după „Editează” din admin

  /* ---- secțiuni ---- */
  async function vOver(b) {
    const d = await api("/api/admin/overview"); st.badge = { pending: d.listings.pending, reports: d.reports.open }; st.counts = d.by_status || {}; tabs();
    const task = (n, label, fn, hot) => { const c = el("button", "adm-task" + (hot ? " hot" : "")); c.type = "button"; c.append(el("b", "", n), el("span", "", label), el("em", "", "→")); c.onclick = fn; return c; };
    const todo = el("section", "adm-card"); todo.append(el("h3", "adm-h", "De făcut acum"));
    const tg = el("div", "adm-todo-grid"); tg.append(
      task(d.listings.pending, "anunțuri de aprobat", () => { st.ads = "pending"; go("ads"); }, d.listings.pending > 0),
      task(d.reports.open, "raportări deschise", () => { st.reports = "open"; go("reports"); }, d.reports.open > 0));
    todo.append(tg); if (!d.listings.pending && !d.reports.open) todo.append(el("p", "adm-ok", "✓ Totul la zi — nu e nimic în așteptare."));
    const S = (n, label, sub, fn) => { const c = el(fn ? "button" : "div", "adm-stat"); c.append(el("span", "n", n), el("span", "l", label)); if (sub) c.append(el("small", "", sub)); if (fn) c.onclick = fn; return c; };
    const g = el("div", "adm-grid"); g.append(
      S(d.listings.active, "Anunțuri active", `+${d.listings.d1} în 24h`, () => { st.ads = "approved"; go("ads"); }),
      S(d.users.total, "Utilizatori", `+${d.users.d1} azi · +${d.users.d7} în 7 zile`, () => { st.users = ""; go("users"); }),
      S(d.listings.sold, "Vândute", "", () => { st.ads = "sold"; go("ads"); }),
      S(d.users.blocked, "Conturi blocate", "", () => { st.users = "status:blocked"; go("users"); }));
    if (d.messages.d1 != null) g.append(S(d.messages.d1, "Mesaje în 24h"));
    const total = DIST.reduce((s, [k]) => s + (st.counts[k] || 0), 0);
    const dist = el("section", "adm-card"); dist.style.marginTop = "14px"; dist.append(el("h3", "adm-h", "Anunțurile pe stări"));
    const bar = el("div", "adm-dist"), leg = el("div", "adm-legend");
    DIST.forEach(([k, c]) => { const n = st.counts[k] || 0; if (!n) return; const i = el("i"); i.style.width = (100 * n / total) + "%"; i.style.background = c; bar.append(i); const s = el("span", "", `${AB[k]}: ${n}`); s.style.setProperty("--c", c); leg.append(s); });
    dist.append(bar, leg);
    const rec = el("div", "adm-list"); d.recent.forEach((r) => rec.append(item({ lead: thumb(r.thumb), title: r.title, tag: pill(r.status), price: price(r), meta: [`@${r.nickname || "—"} · ${fmt(r.created_at)}`], onOpen: () => openReview(r.id) })));
    const act = el("div"); (d.activity.length ? d.activity.map(actRow) : [el("p", "muted", "Încă nimic.")]).forEach((x) => act.append(x));
    b.replaceChildren(todo, g, dist, el("h3", "adm-h", "Ultimele anunțuri"), rec, el("h3", "adm-h", "Ultima activitate"), act);
  }

  function adItem(a) {
    const quick = [];
    if (a.status === "pending") quick.push(["✓ Aprobă", () => setStatus(a, "approved", "Aprobă", false), "ok"], ["Respinge", () => setStatus(a, "rejected", "Respinge anunțul", true)]);
    else quick.push(["Deschide", () => openReview(a.id)]);
    let cb = null;
    if (st.selMode) { cb = el("input", "adm-pick"); cb.type = "checkbox"; cb.checked = st.sel.has(a.id); cb.onchange = () => { cb.checked ? st.sel.add(a.id) : st.sel.delete(a.id); st.updateBulk(); }; }
    const it = item({ lead: thumb(a.thumb), title: a.title, tag: pill(a.status), price: price(a),
      meta: [`${a.category}${a.county ? " · " + a.county : ""}`, `@${a.nickname || "—"} · ${fmt(a.created_at)}${a.views ? " · 👁 " + a.views : ""}`, a.mod_note ? `Motiv: ${a.mod_note}` : ""],
      flags: [a.reports ? `⚑ ${a.reports} raportări deschise` : ""], acts: st.selMode ? [] : quick, onOpen: () => (cb ? cb.click() : openReview(a.id)) });
    if (cb) it.prepend(cb);
    return it;
  }
  async function vAds(b) {
    const list = el("div", "adm-list two"), fill = () => paged(list, `/api/admin/ads?status=${st.ads}&q=${encodeURIComponent(st.q.ads)}`, adItem);
    const o = await api("/api/admin/overview").catch(() => null);
    if (o) { st.counts = o.by_status || {}; st.badge = { pending: o.listings.pending, reports: o.reports.open }; tabs(); }
    const counts = { all: ["pending", "approved", "rejected", "blocked", "sold"].reduce((s, k) => s + (st.counts[k] || 0), 0) };
    ["pending", "approved", "rejected", "blocked", "sold"].forEach((k) => { counts[k] = st.counts[k] || 0; });
    const top = el("div", "adm-top");
    top.append(searchBox("Caută: titlu, @nickname, email sau #id", st.q.ads, (v) => { st.q.ads = v; st.sel.clear(); fill(); st.updateBulk(); }), chips(AB, st.ads, (k) => { st.ads = k; st.sel.clear(); vAds(b); }, counts));
    const bulk = el("div", "adm-bulk");
    st.updateBulk = () => {
      bulk.replaceChildren(); bulk.hidden = !st.selMode; const n = st.sel.size; bulk.append(el("b", "", n ? `${n} selectate` : "Bifează anunțurile"));
      if (n) [["✓ Aprobă", "approved", false, "ok"], ["Respinge", "rejected", true, ""], ["Blochează", "blocked", true, "bad"]].forEach(([t, s, need, cls]) => bulk.append(btn(t, async () => {
        let note; if (need) { const f = await ask({ title: `${t} ${n} anunțuri`, hint: "Motivul îl văd vânzătorii." }); if (!f) return; note = f.reason; }
        const r = await api("/api/admin/ads/bulk", "POST", { ids: [...st.sel], status: s, note }); st.sel.clear(); showMessage("Gata", `${r.changed} anunțuri actualizate.`); await render();
      }, cls)));
    };
    top.append(btn(st.selMode ? "✕ Ieși din selectare" : "☑ Selectează mai multe", async () => { st.selMode = !st.selMode; st.sel.clear(); vAds(b); }));
    top.append(bulk); st.updateBulk();
    if (st.ads === "pending" && counts.pending > 0) top.append(btn(`✓ Aprobă toate (${counts.pending})`, async () => { if (!confirm(`Aprobi toate cele ${counts.pending} anunțuri din coadă?`)) return; await api("/api/admin/ads/approve-all", "POST"); await render(); }, "ok"));
    b.replaceChildren(top, list); fill();
  }

  function userRow(u) {
    const acts = [], mine = u.id === me.id, canTouch = me.role === "admin" || u.role === "user";
    if (!mine && canTouch) {
      if (u.status === "active") acts.push(["Blochează", async () => {
        const f = await ask({ title: "Blochează contul", hint: `@${u.nickname} — motivul se arată utilizatorului la autentificare.`, days: true }); if (!f) return;
        await api(`/api/admin/users/${u.id}`, "PATCH", { status: "blocked", reason: f.reason, days: f.days || null }); render();
      }, "bad"]);
      else acts.push(["Deblochează", async () => { await api(`/api/admin/users/${u.id}`, "PATCH", { status: "active" }); render(); }, "ok"]);
    }
    acts.push(["Anunțurile lui", async () => { st.q.ads = u.nickname; st.ads = "all"; go("ads"); }]);
    if (me.role === "admin" && !mine && u.role === "user") acts.push(["Șterge contul", async () => { if (!confirm(`Ștergi definitiv contul @${u.nickname}, cu anunțuri și mesaje? Nu se mai poate recupera.`)) return; await api(`/api/admin/users/${u.id}`, "DELETE"); render(); }, "bad"]);
    const until = u.blocked_until ? `până la ${new Date(u.blocked_until).toLocaleDateString("ro-RO")}` : "definitiv";
    const tag = el("span", "adm-pill " + (u.status === "blocked" ? "bad" : u.role === "user" ? "mute" : "warn"), u.status === "blocked" ? "Blocat" : ROLE[u.role]);
    const r = item({ lead: el("div", "adm-av", (u.nickname || "?").slice(0, 1).toUpperCase()), title: `@${u.nickname}${mine ? " (tu)" : ""}`, tag,
      meta: [`${u.name} · ${u.email}${u.phone ? " · " + u.phone : ""}`, `${u.ads} anunțuri · înscris ${fmt(u.created_at)}${u.email_verified ? "" : " · email neconfirmat"}`, u.status === "blocked" ? `Blocat ${until}: ${u.block_reason || ""}` : ""],
      flags: [u.reported ? `⚑ ${u.reported} raportări deschise pe anunțurile lui` : ""], acts });
    if (me.role === "admin" && !mine) {
      const s = el("select", "adm-sel"); Object.entries(ROLE).forEach(([k, t]) => { const o = el("option", "", t); o.value = k; o.selected = k === u.role; s.append(o); });
      s.onchange = async () => {
        if (!confirm(`Schimbi rolul lui @${u.nickname} în ${ROLE[s.value]}?`)) { s.value = u.role; return; }
        try { await api(`/api/admin/users/${u.id}/role`, "PATCH", { role: s.value }); render(); } catch (e) { s.value = u.role; fail(e); }
      };
      (r.querySelector(".adm-acts") || r.querySelector(".adm-mid").appendChild(el("div", "adm-acts"))).append(s);
    }
    return r;
  }
  async function vUsers(b) {
    const list = el("div", "adm-list two"), [k, v] = st.users ? st.users.split(":") : ["", ""];
    const fill = () => paged(list, `/api/admin/users?q=${encodeURIComponent(st.q.users)}${k ? `&${k}=${v}` : ""}`, userRow);
    const top = el("div", "adm-top"); top.append(searchBox("Nume, @nickname, email sau #id", st.q.users, (x) => { st.q.users = x; fill(); }), chips(UB, st.users, (x) => { st.users = x; vUsers(b); }));
    b.replaceChildren(top, list); fill();
  }

  function reportRow(r) {
    const done = (to, block) => async () => {
      const f = await ask({ title: block ? "Blochează anunțul" : to === "resolved" ? "Marchează rezolvată" : "Respinge raportarea", hint: `„${r.title}”`, label: block ? "Motiv (îl vede vânzătorul)" : "Notă", required: !!block });
      if (!f) return; await api(`/api/admin/reports/${r.id}`, "PATCH", { status: to, note: f.reason, block_listing: !!block }); render();
    };
    const acts = [["Deschide anunțul", () => openReview(r.listing_id)]];
    if (r.status === "open") acts.push(["Rezolvată", done("resolved"), "ok"], ["Respinge raportarea", done("dismissed")], ["Blochează anunțul", done("resolved", true), "bad"]);
    return item({ lead: el("div", "adm-av", "⚑"), title: r.title, tag: el("span", "adm-pill warn", REASON[r.reason] || r.reason),
      meta: [r.details, `de la @${r.reporter || "—"} · vânzător @${r.seller || "—"} · ${fmt(r.created_at)}`, `Anunțul e acum: ${AB[r.listing_status] || r.listing_status}`, r.admin_note ? `Notă: ${r.admin_note}` : ""],
      flags: [r.same_listing > 1 ? `${r.same_listing} raportări pe acest anunț` : ""], acts, onOpen: () => openReview(r.listing_id) });
  }
  async function vReports(b) {
    const list = el("div", "adm-list two"), top = el("div", "adm-top"); top.append(chips(RB, st.reports, (k) => { st.reports = k; vReports(b); }));
    b.replaceChildren(top, list); paged(list, `/api/admin/reports?status=${st.reports}`, reportRow);
  }
  async function vLog(b) { const list = el("div"); b.replaceChildren(list); paged(list, "/api/admin/activity", actRow); }

  /* ---- cadru ---- */
  function tabs() {
    $("admTabs").replaceChildren(...TABS.map(([k, t]) => {
      const b = el("button", st.tab === k ? "on" : "", t); b.type = "button";
      const n = k === "ads" ? st.badge.pending : k === "reports" ? st.badge.reports : 0; if (n) b.append(el("span", "adm-badge", n));
      b.onclick = () => go(k); return b;
    }));
  }
  const VIEWS = { over: vOver, ads: vAds, users: vUsers, reports: vReports, log: vLog };
  async function render() {
    const b = $("admBody"); b.replaceChildren(el("p", "muted", "Se încarcă…"));
    try { await VIEWS[st.tab](b); } catch (e) { b.replaceChildren(el("p", "err", errText(e))); }
    if (st.tab !== "over" && st.tab !== "ads") api("/api/admin/overview").then((d) => { st.badge = { pending: d.listings.pending, reports: d.reports.open }; tabs(); }).catch(() => {});
  }
  function go(k) { st.tab = k; tabs(); $("admBody").scrollTop = 0; render(); }
  window.openAdmin = () => {
    if (!me || !["admin", "moderator"].includes(me.role)) return;
    $("admRole").textContent = me.role === "admin" ? "Administrator" : "Moderator";
    if (!$("adminDialog").open) $("adminDialog").showModal(); go(st.tab);
  };
  $("admClose")?.addEventListener("click", () => { $("admAd").close(); $("adminDialog").close(); });

  /* ---- raportarea unui anunț (orice utilizator) ---- */
  let reportId = 0;
  const baseOpen = window.openDetail;
  window.openDetail = async function (id) { reportId = id; await baseOpen(id); $("detReport").hidden = !$("detOwner").hidden; };
  $("detReport")?.addEventListener("click", () => { if (!me) return openAuth(); show($("rpErr"), ""); $("rpDetails").value = ""; $("reportDialog").showModal(); });
  $("rpNo")?.addEventListener("click", () => $("reportDialog").close());
  $("rpOk")?.addEventListener("click", async () => {
    try { await api("/api/reports", "POST", { listing_id: reportId, reason: $("rpReason").value, details: $("rpDetails").value }); $("reportDialog").close(); showMessage("Mulțumim", "Raportarea a fost trimisă echipei Omnivo."); }
    catch (e) { show($("rpErr"), errText(e)); }
  });
})();
