/* Profil public de vânzător (ca la OLX / Vinted): date de încredere, anunțuri, vândute, recenzii.
   Folosește din script.js: $, api, me, show, showMessage, errText, card, avatar, presText, ERR, openAuth. */
(() => {
  Object.assign(ERR, {
    RECENZIE_PROPRIE: "Nu îți poți recenza propriul profil.", RECENZIE_STELE: "Alege între 1 și 5 stele.",
    FARA_CONVERSATIE: "Poți lăsa o recenzie după ce ai scris vânzătorului pe unul dintre anunțurile lui.",
    RECENZIE_EXISTENTA: "Ai lăsat deja o recenzie pentru anunțurile la care ați vorbit.",
    FARA_CONVERSATIE_CUMPARATOR: "Poți recenza un cumpărător după ce ți-a scris pe unul dintre anunțurile tale și i-ai răspuns.",
    LINK_INTERZIS: "Comentariul nu poate conține linkuri sau adrese de email."
  });
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const month = (d) => new Date(d).toLocaleDateString("ro-RO", { month: "long", year: "numeric" });
  const day = (d) => new Date(d).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
  const stars = (n) => { const r = Math.round(n); return "★".repeat(r) + "☆".repeat(5 - r); };
  const st = { id: 0, tab: "active", p: null, role: "seller", rvRole: "seller" };

  async function openProfile(id, tab) {
    id = Number(id); if (!id) return;
    const d = $("profileDialog"); st.id = id; st.tab = tab || "active";
    $("profBody").replaceChildren(el("p", "muted prof-load", "Se încarcă…")); if (!d.open) d.showModal();
    try { st.p = (await api(`/api/users/${id}/profile`)).profile; }
    catch { d.close(); return showMessage("Profil indisponibil", "Acest profil nu există sau nu mai este disponibil."); }
    draw();
  }

  function draw() {
    const p = st.p, b = $("profBody");
    const av = avatar(p.nickname, p.id); av.classList.add("prof-av");
    const info = el("div", "prof-info"); info.append(el("h2", "", p.nickname));
    const rate = el("div", "prof-rate");
    const part = (lbl, r) => { if (!r || !r.n) return null; const w = el("span", "prof-rate-it"); w.append(el("span", "prof-stars", stars(r.avg)), el("b", "", r.avg.toLocaleString("ro-RO")), el("span", "muted", ` ${lbl} · ${r.n}`)); return w; };
    const rs = part("ca vânzător", p.rating), rb = part("ca cumpărător", p.rating_buyer);
    if (rs) rate.append(rs); if (rb) rate.append(rb);
    if (!rs && !rb) rate.append(el("span", "muted", "Fără recenzii încă"));
    info.append(rate);
    const tags = el("div", "prof-tags");
    tags.append(el("span", "", "Pe Omnivo din " + month(p.since)));
    if (p.email_verified) tags.append(el("span", "ok", "✓ Email confirmat"));
    if (p.county) tags.append(el("span", "", "📍 " + p.county));
    const pt = presText(p.presence); if (pt) { const s = el("span", p.presence && p.presence.online ? "ok" : "", pt); tags.append(s); }
    info.append(tags);
    const hero = el("section", "prof-hero"); hero.append(av, info);

    const stat = (n, label, tab) => { const c = el("button", "prof-stat" + (st.tab === tab ? " on" : "")); c.type = "button"; c.append(el("b", "", n), el("span", "", label)); c.onclick = () => { st.tab = tab; draw(); }; return c; };
    const stats = el("div", "prof-stats"); stats.append(stat(p.active, "Anunțuri active", "active"), stat(p.sold, "Vândute", "sold"), stat(p.rating.n + (p.rating_buyer ? p.rating_buyer.n : 0), "Recenzii", "reviews"));

    const out = [hero];
    if (p.about) out.push(el("p", "prof-about", p.about));
    const acts = el("div", "prof-acts");
    if (p.mine) {
      const a = el("button", "ghost", p.about ? "✎ Editează descrierea" : "✎ Adaugă o descriere"); a.type = "button"; a.onclick = editAbout; acts.append(a);
    } else {
      const mk = (txt, role) => { const r = el("button", "primary", txt); r.type = "button"; r.onclick = () => (me ? reviewForm(role) : openAuth("Intră în cont ca să lași o recenzie.")); acts.append(r); };
      if (p.can_review) mk("★ Recenzează ca vânzător", "seller");
      if (p.can_review_buyer) mk("★ Recenzează ca cumpărător", "buyer");
      if (!me) { const r = el("button", "ghost", "★ Lasă o recenzie"); r.type = "button"; r.onclick = () => openAuth("Intră în cont ca să lași o recenzie."); acts.append(r); }
    }
    if (acts.children.length) out.push(acts);
    out.push(stats);
    if (st.tab === "reviews") out.push(roleBar());
    const list = el("div", "prof-list"); out.push(list);
    b.replaceChildren(...out); b.scrollTop = 0;
    if (st.tab === "reviews") loadReviews(list); else loadAds(list, st.tab === "sold");
  }

  /* recenziile primite ca vânzător și cele primite ca cumpărător, separat */
  function roleBar() {
    const bar = el("div", "prof-roles"), p = st.p;
    [["seller", "Ca vânzător", p.rating.n], ["buyer", "Ca cumpărător", p.rating_buyer ? p.rating_buyer.n : 0]].forEach(([role, label, n]) => {
      const b = el("button", "prof-role" + (st.role === role ? " on" : ""), `${label} (${n})`); b.type = "button"; b.onclick = () => { st.role = role; draw(); }; bar.append(b);
    });
    return bar;
  }

  async function loadAds(box, sold) {
    box.replaceChildren(el("p", "muted", "Se încarcă…")); let off = 0;
    const grid = el("div", "products prof-grid"), more = el("button", "ghost prof-more", "Mai multe anunțuri");
    const load = async () => {
      const d = await api(`/api/listings?user=${st.id}${sold ? "&sold=1" : ""}&limit=24&offset=${off}`);
      more.remove(); d.listings.forEach((l) => grid.append(card(l))); off += d.listings.length;
      if (!d.listings.length && off === 0) box.replaceChildren(el("p", "muted prof-empty", sold ? "Nu are anunțuri vândute încă." : "Nu are anunțuri active acum."));
      else { if (!grid.isConnected) box.replaceChildren(grid); if (off < d.total) box.append(more); }
    };
    more.onclick = () => load().catch(() => {});
    try { await load(); } catch (e) { box.replaceChildren(el("p", "err", errText(e))); }
  }

  async function loadReviews(box) {
    box.replaceChildren(el("p", "muted", "Se încarcă…")); let off = 0;
    const wrap = el("div", "prof-reviews"), more = el("button", "ghost prof-more", "Mai multe recenzii");
    const load = async () => {
      const d = await api(`/api/users/${st.id}/reviews?limit=10&offset=${off}&role=${st.role}`);
      more.remove();
      d.rows.forEach((r) => {
        const it = el("article", "prof-review"), top = el("div", "prof-rv-top");
        top.append(avatar(r.reviewer || "?", r.reviewer_id), el("b", "", "@" + (r.reviewer || "șters")), el("span", "prof-stars", stars(r.rating)), el("small", "muted", day(r.created_at)));
        it.append(top);
        if (r.body) it.append(el("p", "", r.body));
        if (r.listing) it.append(el("small", "muted", "Anunț: " + r.listing)); else if (r.request) it.append(el("small", "muted", "Cerere de piesă: " + r.request));
        if (r.can_delete) { const x = el("button", "prof-rv-del", "Șterge"); x.type = "button"; x.onclick = async () => { if (!confirm("Ștergi această recenzie?")) return; try { await api("/api/users/reviews/" + r.id, "DELETE"); openProfile(st.id, "reviews"); } catch (e) { showMessage("Eroare", errText(e)); } }; it.append(x); }
        wrap.append(it);
      });
      off += d.rows.length;
      if (!d.rows.length && off === 0) box.replaceChildren(el("p", "muted prof-empty", st.role === "buyer" ? "Nu sunt recenzii ca cumpărător încă." : "Nu sunt recenzii ca vânzător încă."));
      else { if (!wrap.isConnected) box.replaceChildren(wrap); if (d.rows.length === 10) box.append(more); }
    };
    more.onclick = () => load().catch(() => {});
    try { await load(); } catch (e) { box.replaceChildren(el("p", "err", errText(e))); }
  }

  /* ---- recenzie ---- */
  let rating = 0;
  function paintStars() { [...$("rvStars").children].forEach((b, i) => { b.classList.toggle("on", i < rating); b.setAttribute("aria-pressed", i < rating ? "true" : "false"); }); }
  function reviewForm(role) {
    st.rvRole = role === "buyer" ? "buyer" : "seller";
    rating = 0; $("rvText").value = ""; show($("rvErr"), ""); $("rvWho").textContent = "Pentru @" + st.p.nickname + (st.rvRole === "buyer" ? ", ca cumpărător" : ", ca vânzător");
    $("rvStars").replaceChildren(...[1, 2, 3, 4, 5].map((n) => { const b = el("button", "rv-star", "★"); b.type = "button"; b.setAttribute("aria-label", n + (n === 1 ? " stea" : " stele")); b.onclick = () => { rating = n; paintStars(); }; return b; }));
    paintStars(); $("reviewDialog").showModal();
  }
  $("rvNo")?.addEventListener("click", () => $("reviewDialog").close());
  $("rvOk")?.addEventListener("click", async () => {
    if (!rating) return show($("rvErr"), "Alege câte stele dai.");
    try { await api(`/api/users/${st.id}/reviews`, "POST", { rating, body: $("rvText").value, role: st.rvRole }); $("reviewDialog").close(); showMessage("Mulțumim", "Recenzia ta a fost publicată."); st.role = st.rvRole; openProfile(st.id, "reviews"); }
    catch (e) { show($("rvErr"), errText(e)); }
  });

  /* ---- „Despre mine” ---- */
  function editAbout() { $("aboutText").value = st.p.about || ""; show($("aboutErr"), ""); $("aboutDialog").showModal(); }
  $("aboutNo")?.addEventListener("click", () => $("aboutDialog").close());
  $("aboutOk")?.addEventListener("click", async () => {
    try { await api("/api/users/me/about", "PUT", { about: $("aboutText").value }); $("aboutDialog").close(); openProfile(st.id, st.tab); }
    catch (e) { show($("aboutErr"), errText(e)); }
  });

  /* ---- bară de sus + distribuire + link direct #profil-12 ---- */
  $("profClose")?.addEventListener("click", () => $("profileDialog").close());
  $("profShare")?.addEventListener("click", async () => {
    const url = location.origin + "/#profil-" + st.id, title = (st.p ? st.p.nickname : "Profil") + " pe Omnivo";
    try { if (navigator.share) await navigator.share({ title, url }); else { await navigator.clipboard.writeText(url); showMessage("Link copiat", "Poți trimite linkul profilului."); } } catch { /* anulat */ }
  });
  window.openProfile = openProfile;
  const m = location.hash.match(/^#profil-(\d+)$/);
  if (m) { history.replaceState(null, "", location.pathname + location.search); setTimeout(() => openProfile(m[1]), 400); }
})();
