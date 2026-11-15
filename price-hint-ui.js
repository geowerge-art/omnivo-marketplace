/* Preț sugerat sub câmpul „Preț” din formularul de anunț. Backend: GET /api/listings/price-hint (price-hint.js). */
(() => {
  const form = document.getElementById("sellForm"); if (!form) return;
  const $ = (id) => document.getElementById(id);
  const anchor = form.querySelector('input[name="negotiable"]')?.closest("label"); if (!anchor) return;
  const box = document.createElement("div"); box.className = "ph-hint"; box.hidden = true; box.setAttribute("aria-live", "polite");
  const txt = document.createElement("span"), use = document.createElement("button"); use.type = "button"; use.className = "ph-use";
  box.append(txt, use); anchor.before(box);
  let timer = null, seq = 0, mid = 0;
  const nf = (n) => Number(n).toLocaleString("ro-RO");

  async function refresh() {
    const my = ++seq, title = $("sellTitle")?.value.trim() || "", cat = $("sellCat")?.value || "";
    if (title.length < 3 || !cat) { box.hidden = true; return; }
    const cur = $("sellCur")?.value === "EUR" ? "EUR" : "RON";
    try {
      const q = new URLSearchParams({ category_id: cat, currency: cur, title, condition: $("sellCond")?.value || "" });
      const r = await fetch("/api/listings/price-hint?" + q, { credentials: "same-origin" });
      if (!r.ok) throw new Error();
      const { hint } = await r.json();
      if (my !== seq) return;                       // între timp s-a schimbat altceva în formular
      if (!hint) { box.hidden = true; return; }
      const sym = cur === "EUR" ? "€" : "lei";
      mid = hint.mid;
      txt.textContent = `${hint.scope === "similar" ? "Anunțuri asemănătoare" : "În categoria aleasă"}: ${nf(hint.low)}–${nf(hint.high)} ${sym} (mediană ${nf(hint.mid)}, din ${hint.n} anunțuri). Orientativ. `;
      use.textContent = `Pune ${nf(hint.mid)} ${sym}`; box.hidden = false;
    } catch { if (my === seq) box.hidden = true; }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 700); };
  form.addEventListener("input", (e) => { if (["sellTitle", "sellCur"].includes(e.target.id)) later(); });
  form.addEventListener("change", (e) => { if (["sellCat", "sellCur", "sellCond", "sellTitle"].includes(e.target.id)) later(); });
  form.addEventListener("click", (e) => { if (e.target.closest("#sellSeg")) later(); });
  form.addEventListener("reset", () => { seq++; box.hidden = true; });
  use.addEventListener("click", () => { const p = $("sellPrice"); if (!p || !mid) return; p.value = mid; p.dispatchEvent(new Event("input", { bubbles: true })); p.focus(); });
})();
