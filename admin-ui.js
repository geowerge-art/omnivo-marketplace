/* Panou de administrare (admin + moderator) și raportarea anunțurilor.
   Folosește din script.js: $, api, me, show, showMessage, errText, price, ERR, openDetail, openAuth. */
(() => {
  Object.assign(ERR, {
    MOTIV_OBLIGATORIU: "Scrie un motiv.", BLOCARE_MAX_30_ZILE: "Moderatorii pot bloca cel mult 30 de zile.", DOAR_ADMIN: "Doar administratorii pot face asta.",
    CANNOT_BLOCK_SELF: "Nu te poți bloca singur.", ROL_PROPRIU: "Nu îți poți schimba singur rolul.", ADMIN_PRINCIPAL: "Contul principal de administrator nu poate fi schimbat.",
    ULTIMUL_ADMIN: "Trebuie să rămână cel puțin un administrator.", CANNOT_DELETE_ADMIN: "Un administrator nu poate fi șters.", INTERZIS: "Nu ai voie să faci asta.",
    REPORT_PROPRIU: "Nu îți poți raporta propriul anunț.", RAPORT_MOTIV: "Alege motivul raportării."
  });
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const fmt = (d) => new Date(d).toLocaleString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const TABS = [["over", "Panou"], ["ads", "Anunțuri"], ["users", "Utilizatori"], ["reports", "Raportări"], ["log", "Jurnal"]];
  const AB = { pending: "De aprobat", approved: "Active", rejected: "Respinse", blocked: "Blocate", sold: "Vândute", all: "Toate", deleted: "Șterse" };
  const UB = { "": "Toți", "status:blocked": "Blocați", "role:moderator": "Moderatori", "role:admin": "Administratori" };
  const RB = { open: "Deschise", resolved: "Rezolvate", dismissed: "Respinse" };
  const ROLE = { user: "Utilizator", moderator: "Moderator", admin: "Administrator" };
  const REASON = { inselatorie: "Înșelătorie", interzis: "Interzis", duplicat: "Duplicat", gresit: "Preț/categorie greșită", vandut: "Deja vândut", altul: "Altceva" };
  const ACT = { listing_approved: "Anunț aprobat", listing_rejected: "Anunț respins", listing_blocked: "Anunț blocat", listing_pending: "Anunț trimis în moderare", listing_edit: "Anunț editat", listing_delete: "Anunț șters",
    user_block: "Cont blocat", user_unblock: "Cont deblocat", user_role: "Rol schimbat", user_delete: "Cont șters", report_resolved: "Raportare rezolvată", report_dismissed: "Raportare respinsă" };
  const st = { tab: "over", ads: "pending", users: "", reports: "open", q: { ads: "", users: "" }, badge: { pending: 0, reports: 0 } };
  const fail = (e) => showMessage("Eroare", errText(e));

  /* ---- ferestre mici: motiv / editare ---- */
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
  function editAd(a, done) {
    $("edTitle").value = a.title; $("edPrice").value = a.price == null ? "" : Number(a.price); $("edDesc").value = ""; show($("edErr"), "");
    api("/api/listings/" + a.id).then(({ listing }) => { $("edDesc").value = listing.description || ""; }).catch(() => {});
    $("edNo").onclick = () => $("admEdit").close();
    $("edOk").onclick = async () => {
      try { await api(`/api/admin/ads/${a.id}`, "PATCH", { title: $("edTitle").value, price: $("edPrice").value, description: $("edDesc").value }); $("admEdit").close(); done(); }
      catch (e) { show($("edErr"), errText(e)); }
    };
    $("admEdit").showModal();
  }

  /* ---- bucăți de interfață ---- */
  const chips = (map, cur, pick) => { const box = el("div", "acc-chips"); Object.entries(map).forEach(([k, t]) => { const b = el("button", "acc-chip" + (k === cur ? " on" : ""), t); b.type = "button"; b.onclick = () => pick(k); box.append(b); }); return box; };
  function searchBox(ph, val, on) {
    const i = el("input", "adm-search"); i.type = "search"; i.placeholder = ph; i.value = val; let t;
    i.oninput = () => { clearTimeout(t); t = setTimeout(() => on(i.value.trim()), 400); }; return i;
  }
  function row(head, meta, acts, onHead) {
    const r = el("div", "adm-row"), h = el("b", "adm-title", head); if (onHead) h.onclick = onHead; r.append(h);
    meta.filter(Boolean).forEach((m) => r.append(el("small", "adm-meta", m)));
    if (acts.length) {
      const box = el("div", "adm-acts");
      acts.forEach(([t, fn, cls]) => { const b = el("button", "adm-btn" + (cls ? " " + cls : ""), t); b.type = "button"; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { fail(e); } b.disabled = false; }; box.append(b); });
      r.append(box);
    }
    return r;
  }
  async function paged(list, base, rowFn) {
    list.replaceChildren(el("p", "muted", "Se încarcă…")); let off = 0; const more = el("button", "ghost", "Mai multe");
    const load = async () => {
      const d = await api(`${base}${base.includes("?") ? "&" : "?"}limit=20&offset=${off}`);
      if (off === 0) list.replaceChildren(); more.remove(); d.rows.forEach((r) => list.append(rowFn(r)));
      if (!d.rows.length && off === 0) list.append(el("p", "muted", "Nimic de afișat aici."));
      off += d.rows.length; if (d.rows.length === 20) list.append(more);
    };
    more.onclick = () => load().catch(fail);
    try { await load(); } catch (e) { list.replaceChildren(el("p", "err", errText(e))); }
  }
  const actRow = (a) => row(ACT[a.action] || a.action, [`${a.target_type} #${a.target_id} · @${a.nickname || "—"} · ${fmt(a.created_at)}`, a.details], []);

  /* ---- secțiuni ---- */
  async function vOver(b) {
    const d = await api("/api/admin/overview"); st.badge = { pending: d.listings.pending, reports: d.reports.open }; tabs();
    const S = (n, label, sub, fn, hot) => { const c = el(fn ? "button" : "div", "adm-stat" + (hot ? " hot" : "")); c.append(el("span", "n", n), el("span", "l", label)); if (sub) c.append(el("small", "adm-meta", sub)); if (fn) c.onclick = fn; return c; };
    const g = el("div", "adm-grid");
    g.append(
      S(d.listings.pending, "De aprobat", "", () => { st.ads = "pending"; go("ads"); }, d.listings.pending > 0),
      S(d.reports.open, "Raportări deschise", "", () => { st.reports = "open"; go("reports"); }, d.reports.open > 0),
      S(d.listings.active, "Anunțuri active", `+${d.listings.d1} în 24h`, () => { st.ads = "approved"; go("ads"); }),
      S(d.users.total, "Utilizatori", `+${d.users.d1} azi · +${d.users.d7} în 7 zile`, () => { st.users = ""; go("users"); }),
      S(d.listings.sold, "Vândute", "", () => { st.ads = "sold"; go("ads"); }),
      S(d.users.blocked, "Conturi blocate", "", () => { st.users = "status:blocked"; go("users"); }));
    if (d.messages.d1 != null) g.append(S(d.messages.d1, "Mesaje în 24h"));
    b.replaceChildren(g, el("h3", "adm-h", "Ultimele anunțuri"),
      ...d.recent.map((r) => row(r.title, [`@${r.nickname || "—"} · ${AB[r.status] || r.status} · ${fmt(r.created_at)}`], [], () => openDetail(r.id))),
      el("h3", "adm-h", "Ultima activitate"), ...(d.activity.length ? d.activity.map(actRow) : [el("p", "muted", "Încă nimic.")]));
  }

  function adRow(a) {
    const act = (status, label, needReason, cls) => [label, async () => {
      let note; if (needReason) { const f = await ask({ title: label, hint: `„${a.title}” — motivul îl vede vânzătorul.` }); if (!f) return; note = f.reason; }
      await api(`/api/admin/ads/${a.id}`, "PATCH", { status, note }); render();
    }, cls];
    const acts = [];
    if (a.status !== "approved") acts.push(act("approved", "Aprobă", false, "ok"));
    if (a.status !== "rejected") acts.push(act("rejected", "Respinge", true));
    if (a.status !== "blocked") acts.push(act("blocked", "Blochează", true, "bad"));
    acts.push(["Editează", async () => editAd(a, render)]);
    if (me.role === "admin") acts.push(["Șterge definitiv", async () => { if (!confirm(`Ștergi definitiv „${a.title}”? Nu se mai poate recupera.`)) return; await api(`/api/admin/ads/${a.id}`, "DELETE"); render(); }, "bad"]);
    const r = row(a.title, [`${price(a)} · ${a.category} · ${a.county || "—"}`, `@${a.nickname || "—"} · ${a.email || ""} · ${fmt(a.created_at)}`, a.mod_note ? `Motiv: ${a.mod_note}` : ""], acts, () => openDetail(a.id));
    if (a.reports) { const w = el("small", "adm-warn", `⚑ ${a.reports} raportări deschise`); r.querySelector(".adm-title").after(w); }
    return r;
  }
  async function vAds(b) {
    const list = el("div"), fill = () => paged(list, `/api/admin/ads?status=${st.ads}&q=${encodeURIComponent(st.q.ads)}`, adRow);
    const top = el("div", "adm-top"); top.append(searchBox("Titlu, @nickname, email sau #id", st.q.ads, (v) => { st.q.ads = v; fill(); }), chips(AB, st.ads, (k) => { st.ads = k; vAds(b); }));
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
    const r = row(`@${u.nickname}${mine ? " (tu)" : ""}`, [`${u.name} · ${u.email}${u.phone ? " · " + u.phone : ""}`, `${ROLE[u.role]} · ${u.ads} anunțuri · înscris ${fmt(u.created_at)}${u.email_verified ? "" : " · email neconfirmat"}`,
      u.status === "blocked" ? `Blocat ${until}: ${u.block_reason || ""}` : "", u.reported ? `⚑ ${u.reported} raportări deschise pe anunțurile lui` : ""], acts);
    if (me.role === "admin" && !mine) {
      const s = el("select", "adm-sel"); Object.entries(ROLE).forEach(([k, t]) => { const o = el("option", "", t); o.value = k; o.selected = k === u.role; s.append(o); });
      s.onchange = async () => {
        if (!confirm(`Schimbi rolul lui @${u.nickname} în ${ROLE[s.value]}?`)) { s.value = u.role; return; }
        try { await api(`/api/admin/users/${u.id}/role`, "PATCH", { role: s.value }); render(); } catch (e) { s.value = u.role; fail(e); }
      };
      (r.querySelector(".adm-acts") || r.appendChild(el("div", "adm-acts"))).append(s);
    }
    return r;
  }
  async function vUsers(b) {
    const list = el("div"), [k, v] = st.users ? st.users.split(":") : ["", ""];
    const fill = () => paged(list, `/api/admin/users?q=${encodeURIComponent(st.q.users)}${k ? `&${k}=${v}` : ""}`, userRow);
    const top = el("div", "adm-top"); top.append(searchBox("Nume, @nickname, email sau #id", st.q.users, (x) => { st.q.users = x; fill(); }), chips(UB, st.users, (x) => { st.users = x; vUsers(b); }));
    b.replaceChildren(top, list); fill();
  }

  function reportRow(r) {
    const done = (to, block) => async () => {
      const f = await ask({ title: block ? "Blochează anunțul" : to === "resolved" ? "Marchează rezolvată" : "Respinge raportarea", hint: `„${r.title}”`, label: block ? "Motiv (îl vede vânzătorul)" : "Notă", required: !!block });
      if (!f) return; await api(`/api/admin/reports/${r.id}`, "PATCH", { status: to, note: f.reason, block_listing: !!block }); render();
    };
    const acts = r.status === "open" ? [["Rezolvată", done("resolved")], ["Respinge raportarea", done("dismissed")], ["Blochează anunțul", done("resolved", true), "bad"]] : [];
    return row(`⚑ ${REASON[r.reason] || r.reason}: ${r.title}`, [r.details, `de la @${r.reporter || "—"} · vânzător @${r.seller || "—"} · ${fmt(r.created_at)}`, r.same_listing > 1 ? `${r.same_listing} raportări pe acest anunț` : "", `Anunțul e acum: ${AB[r.listing_status] || r.listing_status}`, r.admin_note ? `Notă: ${r.admin_note}` : ""], acts, () => openDetail(r.listing_id));
  }
  async function vReports(b) {
    const list = el("div"), top = el("div", "adm-top"); top.append(chips(RB, st.reports, (k) => { st.reports = k; vReports(b); }));
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
    if (st.tab !== "over") api("/api/admin/overview").then((d) => { st.badge = { pending: d.listings.pending, reports: d.reports.open }; tabs(); }).catch(() => {});
  }
  function go(k) { st.tab = k; tabs(); render(); }
  window.openAdmin = () => {
    if (!me || !["admin", "moderator"].includes(me.role)) return;
    if (!$("adminDialog").open) $("adminDialog").showModal(); go(st.tab);
  };
  $("admClose")?.addEventListener("click", () => $("adminDialog").close());

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
