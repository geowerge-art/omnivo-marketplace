/* Răspunsuri rapide în chat: butoane cu fraze uzuale. Apăsarea pune textul în câmpul de mesaj (poate fi modificat), nu îl trimite singură.
   Apar doar cât câmpul e gol. script.js apelează window.paintQuick(rol) la fiecare reîmprospătare a conversației. */
(() => {
  const SETS = {
    buyer: ["Mai este disponibil?", "Care este ultimul preț?", "Se poate negocia?", "Pot să-l văd azi?", "Accepți și schimb?"],
    seller: ["Da, este disponibil.", "Prețul este negociabil.", "Când vă convine să vedeți produsul?", "Accept și schimb: ce propuneți?", "Mulțumesc, revin cu un răspuns."]
  };
  const box = document.getElementById("chatQuick"), input = document.getElementById("chatInput");
  if (!box || !input) return;
  let role = null, off = false;
  const sync = () => { box.hidden = off || !role || input.value.trim() !== ""; };
  function paint(r, disabled) {
    off = !!disabled;
    const next = SETS[r] ? r : "buyer";
    if (next !== role) {
      role = next; box.replaceChildren();
      for (const t of SETS[next]) {
        const b = document.createElement("button"); b.type = "button"; b.className = "cp-q"; b.textContent = t;
        b.addEventListener("click", () => { input.value = input.value.trim() ? input.value.trimEnd() + " " + t : t; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus(); });
        box.append(b);
      }
    }
    sync();
  }
  input.addEventListener("input", sync);
  document.getElementById("chatDialog")?.addEventListener("close", () => { role = null; box.replaceChildren(); box.hidden = true; });
  window.paintQuick = paint;
})();
