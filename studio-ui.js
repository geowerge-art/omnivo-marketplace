/* Studio (statistici pe zile, ca într-un tablou de bord de creator) + „Planul meu”.
   Folosește din script.js: api, errText, showMessage, accGo, openDetail, loadPlan. */
(() => {
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const nf = (n) => Number(n || 0).toLocaleString("ro-RO");
  const sum = (a, k) => a.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const dshort = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
  const dlong = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("ro-RO", { weekday: "short", day: "numeric", month: "long" });
  const pct = (a, b) => (b ? ((a - b) / b) * 100 : a ? 100 : 0);
  const hours = (h) => (h == null ? "–" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h.toFixed(1).replace(".", ",")} h` : `${Math.round(h / 24)} zile`);
  const niceMax = (m) => { const p = 10 ** Math.floor(Math.log10(m)), f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  const loading = (box) => box.replaceChildren(el("p", "muted", "Se încarcă…"));
  const fail = (box, e) => box.replaceChildren(el("p", "muted", errText(e)));

  /* ---- grafic SVG: perioada curentă (plin) și cea anterioară (punctat), cu detalii la atingere / mouse ---- */
  function chart(rows, prevRows, key, label) {
    const W = 640, H = 230, L = 40, R = 10, T = 12, B = 26, pw = W - L - R, ph = H - T - B, n = rows.length;
    const cur = rows.map((r) => Number(r[key]) || 0), prev = prevRows.map((r) => Number(r[key]) || 0);
    const max = niceMax(Math.max(1, ...cur, ...prev));
    const x = (i) => L + (n > 1 ? (i / (n - 1)) * pw : pw / 2), y = (v) => T + ph - (v / max) * ph;
    const line = (a) => a.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
    const ticks = max >= 4 ? [0, .25, .5, .75, 1] : [0, .5, 1];
    const xl = [0, Math.floor((n - 1) / 2), n - 1];
    const wrap = el("div", "st-chart");
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} pe zile">
      ${ticks.map((t) => `<line class="g" x1="${L}" x2="${W - R}" y1="${y(max * t)}" y2="${y(max * t)}"/><text class="t" x="${L - 6}" y="${y(max * t) + 4}" text-anchor="end">${nf(Math.round(max * t * 10) / 10)}</text>`).join("")}
      ${xl.map((i, k) => `<text class="t" x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${dshort(rows[i].day)}</text>`).join("")}
      <path class="area" d="${line(cur)} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z"/>
      <path class="prev" d="${line(prev)}"/><path class="cur" d="${line(cur)}"/>
      <line class="cursor" x1="0" x2="0" y1="${T}" y2="${T + ph}"/><circle class="dot" r="4.5" cx="0" cy="0"/></svg><div class="st-tip"></div>`;
    const svg = wrap.querySelector("svg"), cursor = svg.querySelector(".cursor"), dot = svg.querySelector(".dot"), tip = wrap.querySelector(".st-tip");
    const vis = (on) => { cursor.style.display = dot.style.display = on ? "" : "none"; tip.style.display = on ? "grid" : "none"; };
    vis(false);       // ascuns la început (fără atribute style în HTML: politica CSP le blochează)
    const move = (e) => {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W, i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / pw) * (n - 1))));
      cursor.setAttribute("x1", x(i)); cursor.setAttribute("x2", x(i)); dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(cur[i])); vis(true);
      tip.replaceChildren(el("b", "", dlong(rows[i].day)), el("span", "", `${label}: ${nf(cur[i])}`), el("small", "", `înainte: ${nf(prev[i])}`));
      const left = (x(i) / W) * 100; tip.style.left = Math.min(78, Math.max(2, left - 10)) + "%";
    };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", () => vis(false));
    return wrap;
  }

  function card(label, now, before, active, onClick, fmt) {
    const b = el("button", "st-card" + (active ? " on" : "")); b.type = "button"; b.setAttribute("aria-pressed", active ? "true" : "false");
    const t = pct(now, before), up = t > 0.5, down = t < -0.5;
    b.append(el("small", "", label), el("b", "", fmt ? fmt(now) : nf(now)));
    b.append(el("span", "st-trend" + (up ? " up" : down ? " down" : ""), before || now ? `${up ? "▲" : down ? "▼" : "•"} ${Math.abs(Math.round(t))}% față de perioada anterioară` : "fără date încă"));
    b.addEventListener("click", onClick); return b;
  }
  const chips = (opts, current, onPick) => {
    const w = el("div", "st-chips");
    opts.forEach(([v, t, locked]) => { const b = el("button", "acc-chip" + (v === current ? " on" : "") + (locked ? " locked" : ""), (locked ? "🔒 " : "") + t); b.type = "button"; b.addEventListener("click", () => onPick(v, locked)); w.appendChild(b); });
    return w;
  };

  /* ---------- Studio pentru vânzători ---------- */
  window.renderStudio = function (box) {
    let days = 28, listing = "", metric = "views", data = null;
    const METRICS = [["views", "Vizualizări"], ["favs", "Salvări la favorite"], ["chats", "Mesaje noi"], ["phones", "Numere afișate"]];
    async function load() {
      loading(box);
      try { data = await api(`/api/studio/seller?days=${days}` + (listing ? `&listing=${listing}` : "")); days = data.days; draw(); } catch (e) { fail(box, e); }
    }
    function draw() {
      const rows = data.series.slice(-days), prev = data.series.slice(0, data.series.length - days), out = [];
      const bar = el("div", "st-bar");
      bar.append(chips([[7, "7 zile", false], [28, "28 de zile", 28 > data.max_days], [90, "90 de zile", 90 > data.max_days]], days, (v, locked) => {
        if (locked) return showMessage("Perioadă blocată", `Perioada de ${v} de zile e disponibilă de la planul ${data.unlock[v]}. Vezi Cont › Planul meu.`);
        days = v; load();
      }));
      const sel = el("select", "st-sel"); sel.setAttribute("aria-label", "Anunț");
      sel.append(Object.assign(el("option", "", "Toate anunțurile"), { value: "" }));
      data.listings.forEach((l) => sel.append(Object.assign(el("option", "", l.title.length > 42 ? l.title.slice(0, 40) + "…" : l.title), { value: String(l.id), selected: String(l.id) === String(listing) })));
      sel.addEventListener("change", () => { listing = sel.value; load(); });
      bar.append(sel);
      const csv = el("button", "acc-chip", data.export ? "⬇ CSV" : "🔒 CSV"); csv.type = "button";
      csv.addEventListener("click", () => { if (data.export) window.location.href = `/api/studio/seller.csv?days=${days}` + (listing ? `&listing=${listing}` : ""); else showMessage("Export CSV", "Exportul CSV e disponibil pe planul Titanium. Vezi Cont › Planul meu."); });
      bar.append(csv); out.push(bar);

      const cards = el("div", "st-cards");
      METRICS.forEach(([k, t]) => cards.append(card(t, sum(rows, k), sum(prev, k), metric === k, () => { metric = k; draw(); })));
      out.push(cards);
      const label = METRICS.find((m) => m[0] === metric)[1];
      out.push(el("h3", "st-h", `${label} · ultimele ${days} de zile`), chart(rows, prev, metric, label));
      out.push(el("p", "st-legend", "━ perioada aleasă   ┅ perioada anterioară"));

      const views = sum(rows, "views"), contacts = sum(rows, "chats") + sum(rows, "phones");
      const best = rows.reduce((a, r) => (r[metric] > (a ? a[metric] : -1) ? r : a), null);
      const facts = el("div", "st-facts");
      facts.append(el("p", "", `Rata de contact: ${views ? ((contacts / views) * 100).toFixed(1).replace(".", ",") + "%" : "–"} (mesaje noi + numere afișate, raportate la vizualizări)`));
      if (best && best[metric] > 0) facts.append(el("p", "", `Cea mai bună zi la „${label}”: ${dlong(best.day)}, ${nf(best[metric])}.`));
      if (views > 40 && contacts / views < 0.01) facts.append(el("p", "st-tip-line", "Mulți te văd, puțini te contactează. Un preț clar, poze luminoase și o descriere completă ajută."));
      out.push(facts);

      const any = rows.some((r) => r.views || r.favs || r.chats || r.phones);
      if (!any) out.push(el("p", "muted", "Încă nu sunt date pentru perioada aleasă. Numărătoarea începe din momentul activării Studio-ului; vizitele noi apar aici."));

      out.push(el("h3", "st-h", "Cele mai bune anunțuri"));
      const maxV = Math.max(1, ...data.top.map((t) => t.views));
      if (!data.top.length) out.push(el("p", "muted", "Nu ai anunțuri încă."));
      data.top.forEach((t) => {
        const r = el("div", "st-row"), th = el("div", "acc-thumb"), mid = el("div", "st-mid");
        if (t.thumb) { const g = document.createElement("img"); g.src = t.thumb; g.alt = ""; g.loading = "lazy"; th.appendChild(g); }
        const name = el("b", "", t.title); name.addEventListener("click", () => openDetail(t.id));
        const bar2 = el("div", "st-meter"); bar2.append(el("i")); bar2.firstChild.style.width = Math.round((t.views / maxV) * 100) + "%";
        mid.append(name, bar2, el("small", "", `👁 ${nf(t.views)}  ·  ♥ ${nf(t.favs)}  ·  ✉ ${nf(t.chats)}  ·  📞 ${nf(t.phones)}`));
        r.append(th, mid); out.push(r);
      });
      box.replaceChildren(...out);
    }
    load();
  };

  /* ---------- Studio moderare ---------- */
  window.renderModStudio = function (box) {
    let days = 28, metric = "new_listings", data = null;
    const METRICS = [["new_listings", "Anunțuri noi"], ["approved", "Aprobări"], ["rejected", "Respingeri și blocări"], ["reports", "Raportări noi"], ["new_users", "Utilizatori noi"]];
    async function load() { loading(box); try { data = await api(`/api/studio/moderation?days=${days}`); draw(); } catch (e) { fail(box, e); } }
    function draw() {
      const rows = data.series.slice(-days), prev = data.series.slice(0, data.series.length - days), q = data.queue, out = [];
      out.push(chips([[7, "7 zile"], [28, "28 de zile"], [90, "90 de zile"]], days, (v) => { days = v; load(); }));
      const strip = el("div", "st-queue");
      [[nf(q.pending), "în așteptare acum"], [hours(q.oldest_h), "cel mai vechi anunț"], [hours(q.avg_review_h), "timp mediu de verificare"], [nf(q.open_reports), "raportări deschise"]].forEach(([v, t]) => { const d = el("div"); d.append(el("b", "", v), el("small", "", t)); strip.append(d); });
      out.push(strip);
      const cards = el("div", "st-cards");
      METRICS.forEach(([k, t]) => cards.append(card(t, sum(rows, k), sum(prev, k), metric === k, () => { metric = k; draw(); })));
      out.push(cards);
      const label = METRICS.find((m) => m[0] === metric)[1];
      out.push(el("h3", "st-h", `${label} · ultimele ${days} de zile`), chart(rows, prev, metric, label), el("p", "st-legend", "━ perioada aleasă   ┅ perioada anterioară"));
      out.push(el("p", "muted st-note", "Aprobările și respingerile numără acțiunile din jurnalul de moderare; o aprobare în masă contează o singură dată."));
      out.push(el("h3", "st-h", "Cine a moderat cel mai mult"));
      if (!data.leaders.length) out.push(el("p", "muted", "Nicio acțiune de moderare în perioada aleasă."));
      const top = Math.max(1, ...data.leaders.map((l) => l.n));
      data.leaders.forEach((l) => { const r = el("div", "st-lead"); const m = el("div", "st-meter"); m.append(el("i")); m.firstChild.style.width = Math.round((l.n / top) * 100) + "%"; r.append(el("span", "", "@" + l.nickname), m, el("b", "", nf(l.n))); out.push(r); });
      box.replaceChildren(...out);
    }
    load();
  };

  /* ---------- Planul meu ---------- */
  window.renderPlan = async function (box) {
    loading(box);
    try {
      const d = await api("/api/plans/me"), cur = d.plans.find((p) => p.key === d.plan), out = [];
      const head = el("div", "pl-head"), badge = el("span", "plan-badge big " + cur.key, cur.name);
      const until = d.plan_until ? `valabil până la ${new Date(d.plan_until).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}` : cur.key === "basic" ? "planul de bază" : "fără dată de expirare";
      head.append(badge, el("span", "muted", until)); out.push(head);
      const usage = (t, used, max) => { const w = el("div", "pl-use"), m = el("div", "st-meter"); m.append(el("i")); m.firstChild.style.width = Math.min(100, Math.round((used / max) * 100)) + "%"; w.append(el("span", "", t), m, el("b", "", `${nf(used)} / ${nf(max)}`)); return w; };
      out.push(usage("Anunțuri active", d.usage.listings, cur.listings), usage("Promovări active", d.usage.promos, cur.promos));
      out.push(el("h3", "st-h", "Ce include fiecare plan"), el("p", "muted st-note", "Anunțuri active, promovări simultane și istoricul statisticilor, în zile (z)."));
      const tbl = el("table", "pl-table"), hr = el("tr"); hr.append(el("th", "", ""));
      d.plans.forEach((p) => hr.append(el("th", p.key === d.plan ? "now" : "", p.name))); tbl.append(Object.assign(el("thead"), {})); tbl.firstChild.append(hr);
      const body = el("tbody");
      [["Anunțuri", (p) => nf(p.listings)], ["Promovări", (p) => nf(p.promos)], ["Statistici", (p) => p.stats_days + " z"], ["Export CSV", (p) => (p.export ? "✓" : "–")], ["Insignă", (p) => (["silver", "gold", "titanium"].includes(p.key) ? "✓" : "–")]].forEach(([t, f]) => {
        const tr = el("tr"); tr.append(el("td", "", t)); d.plans.forEach((p) => tr.append(el("td", p.key === d.plan ? "now" : "", f(p)))); body.append(tr);
      });
      tbl.append(body); const sc = el("div", "st-scroll"); sc.append(tbl); out.push(sc);
      out.push(el("p", "muted st-note", "Planurile superioare se acordă deocamdată de echipa Omnivo. Dacă ai nevoie de mai multe anunțuri sau de statistici pe 90 de zile, scrie-ne."));
      box.replaceChildren(...out);
    } catch (e) { fail(box, e); }
  };
})();
