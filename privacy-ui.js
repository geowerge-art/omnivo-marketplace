/* „Datele mele”: descărcarea datelor proprii (GDPR) și ștergerea contului. Folosește din script.js: $, api, me, show, showMessage, errText, ERR, setMe, loadBilling. */
(() => {
  Object.assign(ERR, { CONFIRMARE_LIPSA: "Scrie cuvântul STERGE ca să confirmi.", CONT_PRIVILEGIAT: "Conturile de administrator sau moderator se retrogradează întâi, de către un administrator.", PAROLA_GRESITA: "Parola nu este corectă." });
  window.openData = async () => {
    if (!me) return;
    ["dataPw", "dataConfirm"].forEach((i) => { $(i).value = ""; }); show($("dataErr"), "");
    let extra = ""; try { const b = window.loadBilling ? await loadBilling() : null; if (b && b.balance > 0) extra = ` Ai ${b.balance} credite în portofel, care se pierd.`; } catch { /* fără portofel */ }
    $("dataWarn").textContent = "Se șterg definitiv contul, anunțurile cu poze, favoritele, căutările salvate, mesajele și recenziile. Nu se mai poate recupera." + extra;
    if (!$("dataDialog").open) $("dataDialog").showModal();
  };
  $("dataClose")?.addEventListener("click", () => $("dataDialog").close());
  $("dataExport")?.addEventListener("click", async () => {
    const b = $("dataExport"); b.disabled = true;
    try {
      const r = await fetch("/api/account/export");
      if (!r.ok) throw Object.assign(new Error("export"), { code: (await r.json().catch(() => ({}))).error, status: r.status });
      const blob = await r.blob(), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `omnivo-datele-mele-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { show($("dataErr"), errText(e)); }
    b.disabled = false;
  });
  $("dataDelete")?.addEventListener("click", async () => {
    show($("dataErr"), ""); const b = $("dataDelete");
    if (!$("dataPw").value) return show($("dataErr"), "Scrie parola.");
    if (!confirm("Ștergi definitiv contul? Nu se mai poate recupera.")) return;
    b.disabled = true;
    try {
      await api("/api/account/delete", "POST", { password: $("dataPw").value, confirm: $("dataConfirm").value });
      $("dataDialog").close(); setMe(null); showMessage("Contul a fost șters", "Datele tale au fost șterse. Ne pare rău să te vedem plecând."); setTimeout(() => { location.href = "/"; }, 2500);
    } catch (e) { show($("dataErr"), errText(e)); }
    b.disabled = false;
  });
})();
