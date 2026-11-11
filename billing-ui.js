/* Portofel cu credite, prețuri și cumpărarea planurilor. Folosește din script.js: $, api, me, showMessage, errText, ERR, accGo, accShow, loadPlan. */
(() => {
  Object.assign(ERR, {
    CREDITE_INSUFICIENTE: "Nu ai destule credite. Încarcă din Cont › Portofel și credite.", PLATA_INDISPONIBILA: "Plata cu cardul nu este disponibilă acum. Încearcă mai târziu.",
    PACHET_INVALID: "Pachet necunoscut.", FACTURARE_INACTIVA: "Serviciile plătite nu sunt active încă.", PLAN_FARA_EXPIRARE: "Ai deja acest plan fără dată de expirare.",
    PLAN_MAI_MIC_ACTIV: "Ai deja un plan mai mare activ. Poți alege unul mai mic după ce expiră.", CREDITE_INVALID: "Scrie un număr întreg de credite, diferit de 0.",
    REACTUALIZARE_PREA_DEVREME: "Ai urcat anunțul de curând. Încearcă din nou mai târziu.", SESIUNE_INVALIDA: "Plata aparține altui cont."
  });
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const nf = (n) => Number(n).toLocaleString("ro-RO");
  const when = (d) => new Date(d).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const KIND = { purchase: "Încărcare", bump: "Urcare în listă", promo: "Promovare", plan: "Plan de cont", admin: "Ajustare" };
  let cache = null;

  window.loadBilling = async (force) => {
    if (!me) throw new Error("fără cont");
    if (cache && !force && Date.now() - cache.t < 30000 && cache.uid === me.id) return cache.d;
    const d = await api("/api/billing/me"); cache = { t: Date.now(), uid: me.id, d }; return d;
  };

  const toWallet = () => { if (typeof openAccount === "function") openAccount(); accGo("wallet"); };

  window.renderWallet = async (box) => {
    box.replaceChildren(el("p", "muted", "Se încarcă…"));
    let d; try { d = await loadBilling(true); } catch (e) { return box.replaceChildren(el("p", "err", errText(e))); }
    const out = [], P = d.pricing;
    const bal = el("section", "wl-bal"); bal.append(el("small", "", "Soldul tău"), el("b", "", nf(d.balance) + (d.balance === 1 ? " credit" : " credite")), el("span", "muted", "1 credit = 1 leu"));
    out.push(bal);
    if (me.role === "admin") {   // doar administratorii: credite pentru contul propriu (test, sau după o plată prin transfer)
      const ab = el("button", "ghost", "💰 Adaugă credite în contul meu (admin)"); ab.type = "button";
      ab.onclick = async () => {
        const v = prompt("Câte credite adaugi în contul tău? (număr negativ = scazi)", "50"); if (v === null) return;
        const n = Math.trunc(Number(v)); if (!n) return showMessage("Eroare", "Scrie un număr întreg, diferit de 0.");
        try { await api(`/api/admin/users/${me.id}/credits`, "POST", { amount: n, note: "ajustare din portofel" }); await loadBilling(true); renderWallet(box); }
        catch (e) { showMessage("Eroare", errText(e)); }
      };
      out.push(ab);
    }
    if (!d.enabled) out.push(el("p", "wl-note", "Deocamdată urcarea în listă și promovarea sunt gratuite. Creditele vor fi necesare după lansarea serviciilor plătite."));

    if (d.stripe) {
      out.push(el("h3", "st-h", "Încarcă credite"));
      const g = el("div", "wl-packs");
      P.packs.forEach((p) => {
        const b = el("button", "wl-pack"); b.type = "button"; b.append(el("b", "", nf(p.credits) + " credite"), el("span", "", nf(p.lei) + " lei")); if (p.bonus > 0) b.append(el("em", "", "+" + p.bonus + " bonus"));
        b.onclick = async () => { b.disabled = true; try { const r = await api("/api/billing/checkout", "POST", { pack: p.key }); location.href = r.url; } catch (e) { showMessage("Eroare", errText(e)); b.disabled = false; } };
        g.append(b);
      });
      out.push(g, el("p", "muted wl-small", "Plata se face pe pagina securizată Stripe; Omnivo nu vede și nu păstrează datele cardului."));
    } else if (d.enabled) out.push(el("p", "wl-note", "Încărcarea cu cardul nu este activă încă. Contactează echipa Omnivo ca să adaugi credite."));

    if (d.enabled) {
      out.push(el("h3", "st-h", "Cât costă"));
      const rows = [
        ["Urcare în listă", `gratuită o dată la ${P.bump.free_hours} ore, apoi ${P.bump.price} lei`],
        ...P.promo.map((p) => [`Promovare ${p.days} zile`, `${p.price} lei`]),
        ...P.plans.map((p) => [`Plan ${p.name} (${p.days} zile)`, `${p.price} lei`])
      ];
      const ul = el("div", "wl-prices"); rows.forEach(([a, b]) => { const r = el("div"); r.append(el("span", "", a), el("b", "", b)); ul.append(r); }); out.push(ul);
    }
    out.push(el("h3", "st-h", "Istoric"));
    if (!d.tx.length) out.push(el("p", "muted", "Nu ai mișcări de credite încă."));
    else { const l = el("div", "wl-tx"); d.tx.forEach((t) => { const r = el("div"), m = el("span"); m.append(el("b", "", t.note || KIND[t.kind] || t.kind), el("small", "muted", when(t.created_at)));
      r.append(m, el("b", t.amount > 0 ? "in" : "out", (t.amount > 0 ? "+" : "") + nf(t.amount))); l.append(r); }); out.push(l); }
    box.replaceChildren(...out);
  };

  /* butoanele de cumpărare din „Planul meu” */
  window.planBuy = (bd, d) => {
    const ORDER = ["basic", "standard", "silver", "gold", "titanium"], wrap = el("section", "pl-buy");
    wrap.append(el("h3", "st-h", "Alege un plan"), el("p", "muted st-note", `Plătești cu credite (soldul tău: ${nf(bd.balance)}). Fiecare plan durează ${bd.pricing.plans[0].days} de zile.`));
    const row = el("div", "wl-packs");
    bd.pricing.plans.filter((p) => ORDER.indexOf(p.key) >= ORDER.indexOf(d.plan)).forEach((p) => {
      const same = p.key === d.plan, b = el("button", "wl-pack" + (same ? " cur" : "")); b.type = "button";
      b.append(el("b", "", p.name), el("span", "", nf(p.price) + " credite"), el("em", "", same ? "prelungește" : "30 de zile"));
      b.onclick = async () => {
        const msg = same ? `Prelungești planul ${p.name} cu ${p.days} zile pentru ${p.price} credite?` : `Treci la planul ${p.name} pentru ${p.price} credite?${d.plan !== "basic" ? " Planul curent se înlocuiește acum." : ""}`;
        if (!confirm(msg)) return; b.disabled = true;
        try { await api("/api/billing/plan", "POST", { plan: p.key }); await loadBilling(true); if (typeof loadPlan === "function") await loadPlan(true); showMessage("Plan activat", `Planul ${p.name} este activ.`); accShow("plan"); }
        catch (e) { showMessage("Eroare", errText(e)); if (e.code === "CREDITE_INSUFICIENTE" && confirm("Deschid Portofelul ca să încarci credite?")) toWallet(); b.disabled = false; }
      };
      row.append(b);
    });
    wrap.append(row); return wrap;
  };

  /* întoarcerea de la Stripe: /?plata=ok sau /?plata=anulat */
  const pay = new URLSearchParams(location.search).get("plata");
  if (pay) {
    history.replaceState(null, "", location.pathname + location.hash);
    setTimeout(() => { if (pay === "ok") { showMessage("Plată reușită", "Creditele au fost adăugate în Portofel."); if (me) loadBilling(true).catch(() => {}); } else showMessage("Plată anulată", "Nu s-a scos niciun ban din cont."); }, 700);
  }
})();
