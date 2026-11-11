const $ = (id) => document.getElementById(id);
const COUNTIES = ["Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brașov","Brăila","București","Buzău","Caraș-Severin","Călărași","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Giurgiu","Gorj","Harghita","Hunedoara","Ialomița","Iași","Ilfov","Maramureș","Mehedinți","Mureș","Neamț","Olt","Prahova","Satu Mare","Sălaj","Sibiu","Suceava","Teleorman","Timiș","Tulcea","Vaslui","Vâlcea","Vrancea"];
const ERR = {
  LIMITA_ANUNTURI: "Ai atins numărul maxim de anunțuri active al planului tău. Vezi Cont › Planul meu.", PLAN_INVALID: "Plan necunoscut.", DOAR_TITANIUM: "Exportul CSV e disponibil doar pe planul Titanium.",
  REINNOIRE_PREA_DEVREME: "Anunțul se poate reînnoi cu cel mult 7 zile înainte să expire.", REINNOIRE_INDISPONIBILA: "Doar anunțurile active se pot reînnoi.", REACTUALIZARE_PREA_DEVREME: "Poți reactualiza un anunț o singură dată la 24 de ore.", PROMOVARE_INDISPONIBILA: "Promovarea nu este disponibilă acum.", PREA_MULTE_PROMOVARI: "Poți avea cel mult 3 anunțuri promovate în același timp.", PROMOVARE_INVALIDA: "Alege 3, 7 sau 30 de zile.",
  INVALID_LOGIN: "Email, nickname sau parolă greșite.", LOGIN_RATE_LIMIT: "Prea multe încercări. Mai încearcă peste câteva minute.", CONT_BLOCAT: "Contul este blocat.",
  EMAIL_EXISTS: "Există deja un cont cu acest email.", NICKNAME_EXISTS: "Nickname-ul este luat.", NICKNAME_INVALID: "Nickname invalid (3-24 caractere: litere, cifre, . _ -).",
  PAROLA_SLABA: "Parola e prea slabă: folosește minim 8 caractere, nu o parolă comună.", TERMENI_NEACCEPTATI: "Trebuie să accepți termenii.", DATE_INVALIDE: "Completează corect toate câmpurile.",
  TITLU_INVALID: "Titlul trebuie să aibă 5-120 de caractere.", PRET_INVALID: "Preț invalid.", CATEGORIE_INVALIDA: "Alege o categorie.", ATRIBUT_LIPSA: "Completează câmpul obligatoriu", ATRIBUT_INVALID: "Valoare invalidă pentru",
  PREA_MULTE_ANUNTURI: "Ai postat prea multe anunțuri într-o oră.", EMAIL_NECONFIRMAT: "Confirmă-ți emailul înainte să publici.", RATE_LIMIT: "Prea multe cereri, încearcă mai târziu.",
  PREA_MULTE_POZE: "Maximum 8 poze per anunț.", SPATIU_POZE_DEPASIT: "Ai depășit spațiul pentru poze.", FISIER_INVALID: "Fișier neacceptat. Poți trimite PDF, Word, Excel sau text, până la 5 MB.", POZA_INVALIDA: "Poza nu a putut fi citită. Încearcă JPG sau PNG.", STORAGE_EROARE: "Pozele nu se pot salva acum.",
  EMAIL_INVALID: "Scrie o adresă de email de forma nume@domeniu.", TELEFON_INVALID: "Număr de telefon invalid.",
  MESAJ_INVALID: "Scrie un mesaj de maximum 2000 de caractere.", PREA_MULTE_MESAJE: "Ai trimis prea multe mesaje. Încearcă mai târziu.", BLOCAT: "Nu poți trimite mesaje acestui utilizator.",
  BLOCAT_DE_TINE: "Ai blocat acest utilizator. Deblochează-l ca să-i scrii.", INTERZIS: "Nu ai voie să faci asta.", NEGASIT: "Nu am găsit ce căutai.", NU_SE_POATE_BLOCA: "Acest cont nu poate fi blocat."
};
let catManual = false;
let me = null, cats = [], iconOf = {}, mode = "public", filter = {};
let favIds = new Set(), accTab = "mine", accFilter = "all", accMine = [];
let editing = null, existing = [];            // editarea unui anunț: id-ul și pozele deja salvate
let chat = null, chatTimer = null, unreadTimer = null, unread = 0;

async function api(url, method = "GET", body) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch { /* răspuns fără JSON */ }
  if (!r.ok) throw Object.assign(new Error(d.error || "EROARE"), { code: d.error, field: d.field, reason: d.reason, status: r.status, price: d.price, hours: d.hours });
  return d;
}
const PW = { TOO_SHORT: "Parola trebuie să aibă minim 8 caractere.", TOO_LONG: "Parola e prea lungă (maximum 72 de caractere).", COMMON: "Parola e prea comună. Alege alta.", ONLY_DIGITS: "Parola nu poate fi doar cifre. Adaugă litere sau fă-o mai lungă (12+).", REPEATED: "Parola nu poate fi același caracter repetat.", CONTAINS_EMAIL: "Parola nu trebuie să conțină începutul adresei de email.", CONTAINS_NICKNAME: "Parola nu trebuie să conțină nickname-ul." };
const errText = (e) => (e.code === "PAROLA_SLABA" && PW[e.reason] ? PW[e.reason] : ERR[e.code] ? ERR[e.code] + (e.field ? ` „${e.field}”.` : "") : e.status === 503 ? "Serviciul nu e disponibil acum." : `A apărut o eroare. Încearcă din nou. (cod: ${e.status || "fără răspuns de la server"}${e.code ? " · " + e.code : ""})`);
const price = (l) => (l.price == null ? "Preț la cerere" : `${Number(l.price).toLocaleString("ro-RO")} ${l.currency === "EUR" ? "€" : "lei"}`);
const open = (id) => { const d = $(id); if (!d.open) d.showModal(); };
const fold = (t) => t.toLocaleLowerCase("ro").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const show = (el, msg) => { el.textContent = msg || ""; el.hidden = !msg; };

function showMessage(title, message) {
  $("dialogTitle").textContent = title; $("dialogText").textContent = message; open("messageDialog");
}
$("closeDialog")?.addEventListener("click", () => $("messageDialog").close());
[["sellClose", "sellDialog"], ["authClose", "authDialog"], ["detClose", "detailDialog"], ["inboxClose", "inboxDialog"], ["chatClose", "chatDialog"]].forEach(([b, d]) => $(b)?.addEventListener("click", () => $(d).close()));
$("menuButton")?.addEventListener("click", () => $("mainMenu").classList.toggle("open"));

/* ---- pictograme ---- */
document.querySelectorAll("[data-ic]").forEach((el) => { el.innerHTML = icon(el.dataset.ic, el.classList.contains("cat-ic") ? 44 : 24); });

/* ---- categorii, sertar, formular ---- */
function setDrawer(on) { $("drawer").hidden = !on; $("scrim").hidden = !on; document.body.style.overflow = on ? "hidden" : ""; }
function pickCategory(slug, name) { trackInterest({ cat: slug, w: 2 }); pillCat = null; if ($("searchInput")) $("searchInput").value = ""; updatePills(); filter = { category: slug }; mode = "public"; $("listTitle").textContent = name || "Anunțuri recente"; loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); }

async function loadCats() {
  try { cats = (await api("/api/categories")).categories; } catch { return; }
  const sel = $("sellCat"), list = $("drawerList"); list.innerHTML = "";
  for (const c of cats) {
    iconOf[c.slug] = c.slug;
    const kids = c.children.length ? c.children : [];
    const li = document.createElement("li"), b = document.createElement("b");
    b.innerHTML = icon(c.slug, 22); b.append(" " + c.name); b.className = "drawer-cat"; b.style.cursor = "pointer";
    b.addEventListener("click", () => { setDrawer(false); pickCategory(c.slug, c.name); }); li.appendChild(b);
    const og = document.createElement("optgroup"); og.label = c.name;
    for (const k of kids.length ? kids : [c]) {
      iconOf[k.slug] = c.slug;
      if (kids.length) { const a = document.createElement("a"); a.href = "#anunturi"; a.textContent = k.name; a.addEventListener("click", () => { setDrawer(false); pickCategory(k.slug, k.name); }); li.appendChild(a); }
      const o = document.createElement("option"); o.value = k.id; o.textContent = k.name; og.appendChild(o);
    }
    sel.appendChild(og); list.appendChild(li);
  }
  document.querySelectorAll("#categorii .categories a").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault(); const n = a.querySelector("span").textContent.trim(); const c = cats.find((x) => fold(x.name) === fold(n)); if (c) pickCategory(c.slug, c.name);
  }));
  buildCatPanel(); updatePills();
}
$("bnCats")?.addEventListener("click", () => { setDrawer(true); if (!cats.length) loadCats(); });
$("bnChat")?.addEventListener("click", () => (me ? openInbox() : openAuth("Intră în cont ca să vezi mesajele.")));

/* telefon: lista completă de categorii se deschide pe loc, în secțiunea „Categorii populare", și se închide când apeși în altă parte */
function closeCatPanel() { const p = $("catPanel"); if (!p || p.hidden) return; p.hidden = true; $("catToggle").setAttribute("aria-expanded", "false"); }
function buildCatPanel() {
  const ul = $("catPanelList"); if (!ul) return; ul.replaceChildren();
  for (const c of cats) {
    const li = document.createElement("li"), b = document.createElement("button"); b.type = "button"; b.className = "cat-row"; b.innerHTML = icon(c.slug, 22); b.append(" " + c.name);
    b.addEventListener("click", () => { closeCatPanel(); pickCategory(c.slug, c.name); }); li.appendChild(b);
    if (c.children.length) {
      const sub = document.createElement("div"); sub.className = "cat-subs";
      for (const k of c.children) { const a = document.createElement("button"); a.type = "button"; a.textContent = k.name; a.addEventListener("click", () => { closeCatPanel(); pickCategory(k.slug, k.name); }); sub.appendChild(a); }
      li.appendChild(sub);
    }
    ul.appendChild(li);
  }
}
$("catToggle")?.addEventListener("click", () => { const p = $("catPanel"), open = p.hidden; if (open && !cats.length) loadCats(); p.hidden = !open; $("catToggle").setAttribute("aria-expanded", String(open)); });
document.addEventListener("click", (e) => { if (!e.target.closest("#catPanel, #catToggle")) closeCatPanel(); });
$("drawerClose")?.addEventListener("click", () => setDrawer(false));
$("scrim")?.addEventListener("click", () => setDrawer(false));

$("sellCounty").innerHTML = COUNTIES.map((c) => `<option>${c}</option>`).join("");
/* orașul: sugestii din județ; dacă nu l-ai scris tu, se completează cu reședința județului */
let cityManual = false;
function syncCities() {
  const list = (window.CITIES || {})[$("sellCounty").value] || [];
  $("cityList").innerHTML = list.map((c) => `<option value="${c}">`).join("");
  if (!cityManual && !editing && list.length) $("sellCity").value = list[0];
}
$("sellCounty").addEventListener("change", syncCities);
$("sellCity").addEventListener("input", () => { cityManual = true; });
syncCities();
function renderAttrs() {
  const box = $("sellAttrs"); box.innerHTML = ""; syncCatCard();
  const id = Number($("sellCat").value); let defs = [];
  for (const c of cats) for (const k of c.children.length ? c.children : [c]) if (k.id === id) defs = [...c.attributes, ...(k !== c ? k.attributes : [])];
  if (defs.length) { const hd = document.createElement("div"); hd.className = "sec"; hd.textContent = "Detalii · " + (catPath().split(" › ").pop() || ""); box.appendChild(hd); }
  for (const d of defs) {
    const l = document.createElement("label"); l.textContent = d.label + (d.required ? " *" : ""); l.htmlFor = "at-" + d.key; box.appendChild(l);
    let f;
    if (d.type === "select") { f = document.createElement("select"); f.innerHTML = '<option value="">—</option>' + d.options.map((o) => `<option>${o}</option>`).join(""); }
    else { f = document.createElement("input"); f.type = d.type === "number" ? "number" : "text"; if (d.type === "number") f.inputMode = "numeric"; }
    f.id = "at-" + d.key; f.dataset.attr = d.key; box.appendChild(f);
  }
  curDefs = defs; $("sellAutoAttrs").hidden = true;
  if (!editing) fillAttrs();
}
let curDefs = [], attrTimer;
$("sellAttrs")?.addEventListener("input", (e) => { if (e.target.dataset.attr) e.target.dataset.manual = "1"; });
$("sellAttrs")?.addEventListener("change", (e) => { if (e.target.dataset.attr) e.target.dataset.manual = "1"; });
/* Completează marca, modelul, anul, memoria etc. din titlu, fără să atingă ce ai scris tu. */
function fillAttrs() {
  if (!window.autofillAttrs || editing) return;
  const found = autofillAttrs($("sellTitle").value, curDefs), done = [];
  for (const d of curDefs) {
    const el = document.querySelector(`#sellAttrs [data-attr="${CSS.escape(d.key)}"]`); if (!el || el.dataset.manual) continue;
    const v = found[d.key];
    if (v !== undefined && v !== "") { el.value = v; el.dataset.auto = "1"; if (el.value === String(v)) done.push(`${d.label.replace(/ \(.*\)/, "")}: ${v}`); }
    else if (el.dataset.auto) { el.value = ""; delete el.dataset.auto; }
  }
  const n = $("sellAutoAttrs");
  n.textContent = done.length ? "✨ Completat automat: " + done.join(" · ") + ". Verifică și corectează dacă e nevoie." : ""; n.hidden = !done.length;
}
$("sellCat")?.addEventListener("change", () => { catManual = true; $("sellAuto").hidden = true; renderAttrs(); });

/* Categoria se alege singură din cuvintele titlului (ca în autoparts); dacă o schimbi tu, nu mai intervine. */
function setCatAuto(s) {
  if (Number($("sellCat").value) !== s.id) { $("sellCat").value = s.id; renderAttrs(); }
  const n = $("sellAuto"); n.textContent = `✨ Categorie aleasă automat: ${s.parent} › ${s.name}. Poți schimba dacă nu e corectă.`; n.hidden = false;
}
/* Când titlul poate însemna două lucruri (mașină întreagă sau piesă), întrebăm în loc să ghicim. */
function renderAsk(ask) {
  const n = $("sellAuto"); n.textContent = ask.question; n.hidden = false;
  for (const o of ask.options) {
    const b = document.createElement("button"); b.type = "button"; b.className = "ask-btn"; b.textContent = o.label;
    b.addEventListener("click", () => { catManual = true; setCatAuto(o); $("sellChips").innerHTML = ""; });
    $("sellChips").appendChild(b);
  }
}
let timer;
$("sellTitle")?.addEventListener("input", (e) => {
  clearTimeout(attrTimer); attrTimer = setTimeout(fillAttrs, 250);
  clearTimeout(timer); const t = e.target.value.trim();
  if (t.length < 3) { $("sellChips").innerHTML = ""; $("sellAuto").hidden = true; return; }
  timer = setTimeout(async () => {
    try {
      const { suggestions, ask, confident } = await api("/api/categories/suggest?title=" + encodeURIComponent(t));
      $("sellChips").innerHTML = "";
      if (!suggestions.length) { if (!catManual) $("sellAuto").hidden = true; return; }
      if (ask && !catManual && !editing) { renderAsk(ask); return; }
      if (!catManual && !editing) {
        if (confident !== false) setCatAuto(suggestions[0]);
        else { const n = $("sellAuto"); n.textContent = "Nu sunt sigur de categorie. Alege una:"; n.hidden = false; }
      }
      for (const s of suggestions) {
        if (Number($("sellCat").value) === s.id) continue;
        const b = document.createElement("button"); b.type = "button"; b.textContent = `${s.parent} › ${s.name}`;
        b.addEventListener("click", () => { $("sellCat").value = s.id; catManual = true; $("sellAuto").hidden = true; renderAttrs(); $("sellChips").innerHTML = ""; });
        $("sellChips").appendChild(b);
      }
    } catch { /* fără sugestii */ }
  }, 300);
});

$("sellForm")?.addEventListener("submit", async (e) => {
  e.preventDefault(); show($("sellErr"), "");
  const f = new FormData(e.target), attributes = {};
  document.querySelectorAll("#sellAttrs [data-attr]").forEach((el) => { attributes[el.dataset.attr] = el.value; });
  $("sellSubmit").disabled = true;
  try {
    const payload = {
      title: f.get("title"), category_id: f.get("category_id"), price: f.get("price"), currency: f.get("currency"), condition: f.get("condition"),
      county: f.get("county"), city: f.get("city"), address: f.get("address"), description: f.get("description"), negotiable: f.get("negotiable") === "on", attributes
    };
    const wasEdit = !!editing; let id, note;
    try { await applySellContact(); } catch (err) { throw err; }
    if (wasEdit) {
      const r = await api(`/api/listings/${editing}`, "PATCH", payload); id = editing;
      note = r.resubmitted ? "Modificările sunt salvate. Anunțul a fost retrimis la moderare și apare după aprobare." : "Modificările au fost salvate.";
    } else { id = (await api("/api/listings", "POST", payload)).listing.id; note = "Anunțul tău a fost salvat. Dacă nu apare imediat, așteaptă aprobarea."; }
    let failed = 0;
    for (let i = 0; i < photos.length; i++) {
      show($("sellProg"), `Se încarcă poza ${i + 1} din ${photos.length}…`);
      try { await uploadPhoto(id, photos[i].blob); } catch { failed++; }
    }
    show($("sellProg"), ""); photos.length = 0; renderPrev();
    e.target.reset(); $("sellAttrs").innerHTML = ""; $("sellDialog").close();
    try { localStorage.removeItem("omnivoDraft"); } catch { /* fără ciornă */ }
    showMessage(wasEdit ? "Anunț actualizat" : "Anunț trimis", failed ? `${note} ${failed} poze nu s-au încărcat.` : note);
    if (!wasEdit) { mode = "public"; filter = {}; }
    loadListings();
  } catch (err) { if (err.status === 401) { $("sellDialog").close(); openAuth(); } else show($("sellErr"), errText(err)); }
  $("sellSubmit").disabled = false;
});

/* ---- editarea unui anunț existent: același formular, precompletat ---- */
function resetSell() {
  editing = null; existing = []; catManual = false; cityManual = false; $("sellAuto").hidden = true;
  $("sellHead").textContent = "Adaugă un anunț"; $("sellSubmit").textContent = "Publică anunțul";
  photos.forEach((p) => URL.revokeObjectURL(p.url)); photos.length = 0;
  $("sellForm").reset(); syncCities(); $("sellAttrs").innerHTML = ""; $("sellChips").innerHTML = ""; show($("sellErr"), "");
  renderExisting(); renderPrev();
}
$("sellDialog")?.addEventListener("close", () => { catManual = false; cityManual = false; setTimeout(syncCities, 0); $("sellAuto").hidden = true; if (editing) resetSell(); });
function renderExisting() {
  const box = $("sellExisting"); box.hidden = !existing.length;
  box.replaceChildren(...existing.map((im, i) => {
    const d = document.createElement("div"), g = document.createElement("img"), b = document.createElement("button");
    g.src = im.url; g.alt = `Poza ${i + 1}`; b.type = "button"; b.textContent = "✕"; b.setAttribute("aria-label", "Șterge poza");
    b.addEventListener("click", async () => {
      if (!confirm("Ștergi această poză? Nu se poate anula.")) return;
      try { await api(`/api/listings/${editing}/images/${im.id}`, "DELETE"); existing.splice(existing.indexOf(im), 1); renderExisting(); renderPrev(); }
      catch (err) { show($("sellErr"), errText(err)); }
    });
    d.append(g, b); return d;
  }));
}
async function openEdit(l, copy) {   // copy = anunț nou, completat după unul existent (fără poze)
  if (!l.edit) return;
  if (!cats.length) await loadCats();
  resetSell();
  if (!copy) { editing = l.id; existing = l.edit.images.slice(); }
  $("sellHead").textContent = copy ? "Anunț nou (copie)" : "Editează anunțul"; $("sellSubmit").textContent = copy ? "Publică anunțul" : "Salvează modificările";
  $("sellTitle").value = l.title; $("sellCat").value = l.edit.category_id; renderAttrs();
  for (const [k, v] of Object.entries(l.edit.attributes)) { const el = document.querySelector(`#sellAttrs [data-attr="${CSS.escape(k)}"]`); if (el) el.value = v; }
  $("sellPrice").value = l.price == null ? "" : Number(l.price); $("sellCur").value = l.currency === "EUR" ? "EUR" : "RON";
  if (l.condition) $("sellCond").value = l.condition;
  if (l.county) $("sellCounty").value = l.county;
  cityManual = true; $("sellCity").value = l.city || ""; $("sellAddr").value = l.address || ""; syncCities();
  $("sellDesc").value = l.description || ""; $("sellForm").elements.negotiable.checked = !!l.negotiable;
  renderSellContact(); renderExisting(); renderPrev(); open("sellDialog");
  if (copy) { catManual = true; }
}
function openSell() { if (!me) return openAuth("Ca să adaugi un anunț, intră în cont sau creează unul nou."); if (editing) resetSell(); renderSellContact(); if (!cats.length) loadCats(); open("sellDialog"); $("sellTitle").focus(); }
["sellButton", "sellButtonBottom", "bnSell"].forEach((i) => $(i)?.addEventListener("click", openSell));

/* ---- cont ---- */
function openAuth() { open("authDialog"); }
const tab = (reg) => { $("loginForm").hidden = reg; $("regForm").hidden = !reg; $("tabLogin").classList.toggle("on", !reg); $("tabReg").classList.toggle("on", reg); };
$("tabLogin").addEventListener("click", () => tab(false)); $("tabReg").addEventListener("click", () => tab(true));
function renderUnread() { if ($("accTileMsgs")) $("accTileMsgs").textContent = unread || 0; if ($("accMsgsN")) { $("accMsgsN").textContent = unread ? String(unread) : ""; $("accMsgsN").hidden = !unread; } ["bnBadge", "hdrBadge"].forEach((k) => { const bd = $(k); if (bd) { bd.hidden = !unread; bd.textContent = unread > 9 ? "9+" : unread; } }); }
async function refreshUnread() { if (!me) return; try { unread = (await api("/api/messages/unread")).unread; renderUnread(); } catch { /* insigna rămâne cum era */ } }
function setMe(u) {
  me = u; unread = 0; renderUnread(); clearInterval(unreadTimer); stopLive();
  loadFavIds(); loadNotifCount();
  if (u) { refreshUnread(); unreadTimer = setInterval(() => { if (!document.hidden) refreshUnread(); }, 30000); startLive(); }
}
async function authSubmit(e, url, body, errEl) {
  e.preventDefault(); show(errEl, "");
  try { setMe((await api(url, "POST", body)).user); $("authDialog").close(); e.target.reset(); } catch (err) { show(errEl, errText(err)); }
}
$("loginForm").addEventListener("submit", (e) => authSubmit(e, "/api/auth/login", { identifier: $("lgId").value, password: $("lgPw").value }, $("lgErr")));
$("regForm").addEventListener("submit", (e) => authSubmit(e, "/api/auth/register", { name: $("rgName").value, nickname: $("rgNick").value, email: $("rgEmail").value, password: $("rgPw").value, phone: $("rgPhone").value.trim() || undefined, show_phone: $("rgShowPhone").checked, whatsapp: $("rgWa").checked, accept_terms: $("rgTerms").checked }, $("rgErr")));
/* ---- favorite ---- */
async function loadFavIds() {
  favIds = new Set();
  if (me) { try { favIds = new Set((await api("/api/favorites/ids")).ids); } catch { /* fără favorite */ } }
  syncFavs();
}
function paintFav(b) { const on = favIds.has(Number(b.dataset.id)); b.classList.toggle("on", on); b.textContent = on ? "♥" : "♡"; b.setAttribute("aria-pressed", on ? "true" : "false"); b.setAttribute("aria-label", on ? "Scoate din favorite" : "Salvează la favorite"); }
function syncFavs() { document.querySelectorAll(".fav-btn").forEach(paintFav); }
function favBtn(id, big) {
  const b = document.createElement("button"); b.type = "button"; b.className = "fav-btn" + (big ? " big" : ""); b.dataset.id = id; paintFav(b);
  b.addEventListener("click", (e) => { e.stopPropagation(); toggleFav(id); });
  return b;
}
async function toggleFav(id) {
  if (!me) return openAuth("Intră în cont ca să salvezi anunțuri la favorite.");
  const on = favIds.has(id);
  try { await api("/api/favorites/" + id, on ? "DELETE" : "POST"); on ? favIds.delete(id) : favIds.add(id); syncFavs(); if (accCur === "favs" && accIsOpen()) renderAcc(); }
  catch (err) { showMessage("Eroare", err.code === "PREA_MULTE_FAVORITE" ? "Ai atins limita de 200 de anunțuri salvate." : errText(err)); }
}

/* ---- contul meu: anunțurile mele, favorite, mesaje, setări ---- */
const ST = { approved: ["Activ", "ok"], pending: ["În moderare", "wait"], rejected: ["Respins", "bad"], sold: ["Vândut", "sold"], blocked: ["Blocat", "bad"] };
let accCur = null;                                   // null = meniul contului, altfel „mine" | „favs" | „saved" | „stats"
const accIsOpen = () => !$("accountPage").hidden;
const note = (txt) => { const p = document.createElement("p"); p.className = "muted"; p.textContent = txt; return p; };

/* pagina contului: tot ecranul, cu „Înapoi" legat de istoricul browserului (butonul Înapoi al telefonului funcționează) */
function accShowPage() { $("accountPage").hidden = false; document.body.style.overflow = "hidden"; }
function accClosePage() { $("accountPage").hidden = true; document.body.style.overflow = ""; }
function accLeave() { accClosePage(); history.pushState(null, "", location.pathname + location.search); }   // spre pagina principală, fără să rămână #cont în adresă
function openAccount() {
  if (!me) return openAuth();
  refreshUnread(); accFilter = "approved"; accShowPage();
  history.pushState({ acc: "" }, "", "#cont"); accShow("");
}
function accGo(view) { history.pushState({ acc: view }, "", "#cont"); accShow(view); }
$("accBack")?.addEventListener("click", () => history.back());
window.addEventListener("popstate", (e) => {
  const st = e.state;
  if ($("detailDialog").open && !(st && st.det)) { detSkipBack = true; detPushed = false; $("detailDialog").close(); }
  if (st && st.acc !== undefined && me) { accShowPage(); accShow(st.acc); } else accClosePage();
});

function accItem(txt, fn, cnt, id) {
  const b = document.createElement("button"); b.type = "button"; b.className = "acc-item";
  const t = document.createElement("span"); t.textContent = txt; b.appendChild(t);
  const c = document.createElement("em"); c.className = "cnt"; if (id) c.id = id; if (cnt) c.textContent = cnt; else c.hidden = true; b.appendChild(c);
  const i = document.createElement("i"); i.textContent = "›"; b.appendChild(i);
  b.addEventListener("click", fn); return b;
}
function accSection(title, items) {
  const d = document.createElement("details"); d.open = true;
  const s = document.createElement("summary"); s.textContent = title; d.appendChild(s); d.append(...items); return d;
}
/* ---- acțiuni pe anunț: aceleași în fereastra ⋮ din listă și în bara de pe pagina anunțului ---- */
const DAY = 86400000;
const dShort = (d) => new Date(d).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
const dLong = (d) => new Date(d).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
const daysAgo = (d) => { const n = Math.floor((Date.now() - new Date(d)) / DAY); return n < 1 ? "azi" : n === 1 ? "ieri" : `acum ${n} zile`; };
const isExpired = (l) => l.status === "approved" && !!l.expires_at && new Date(l.expires_at) < Date.now();
function expState(l) {   // "" | "soon" (mai puțin de 7 zile) | "expired"
  if (l.status !== "approved" || !l.expires_at) return { k: "", txt: "" };
  const left = new Date(l.expires_at) - Date.now();
  if (left <= 0) return { k: "expired", txt: "Expirat pe " + dShort(l.expires_at) };
  return { k: left < 7 * DAY ? "soon" : "", txt: "Valabil până pe " + dShort(l.expires_at) };
}
const AI = {   // pictograme de 24×24, doar contur
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4", copy: "M8 8h11v12H8zM5 16V4h11", sold: "M5 12.5l4.5 4.5L19 7.5", resume: "M4 12a8 8 0 108-8M4 4v5h5",
  bump: "M12 19V5M6 11l6-6 6 6", renew: "M20 12a8 8 0 11-3-6.2M20 4v5h-5", promo: "M3 10v4h3l7 4V6L6 10zM16.5 9a4 4 0 010 6",
  view: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z", stats: "M4 4v16h16M8 15l4-4 3 3 5-6",
  del: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3", msg: "M4 5h16v11H9l-5 4z", heart: "M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z"
};
const aico = (k, sz = 22) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${AI[k]}"/></svg>`;
/* l: anunțul (din listă sau din pagina lui); ctx.detail: acțiunile pornesc din pagina anunțului; ctx.done: ce se reîmprospătează după */
function listingActs(l, ctx = {}) {
  const acts = [], ex = expState(l), after = (gone) => { if (ctx.detail) { if (gone) $("detailDialog").close(); else openDetail(l.id); } if (accIsOpen()) renderAcc(); loadListings(); };
  const A = (key, label, fn, o = {}) => acts.push({ key, label, fn, ...o });
  const leaveDetail = () => { if (ctx.detail) $("detailDialog").close(); };
  if (l.status === "approved") A("promo", l.promoted ? "Prelungește promovarea" : "Promovează", async () => { leaveDetail(); openPromo(l); }, { main: 1, short: l.promoted ? "Prelungește" : "" });
  if (l.status === "approved") {
    if (ex.k) A("renew", "Reînnoiește (30 zile)", async () => { const r = await api(`/api/listings/${l.id}/renew`, "POST"); showMessage("Reînnoit", `Anunțul este valabil până pe ${dLong(r.expires_at)}.`); after(); }, { main: 1, short: "Reînnoiește" });
    else A("bump", "Urcă în listă", async () => {
      let paid = 0;
      try { await api(`/api/listings/${l.id}/bump`, "POST"); }
      catch (e) {   // e.price vine de la server doar când urcarea mai deasă costă credite
        if (e.code !== "REACTUALIZARE_PREA_DEVREME" || !e.price) throw e;
        if (!confirm(`Ai urcat anunțul de curând. Îl urci din nou acum pentru ${e.price} lei din credite?`)) return;
        await api(`/api/listings/${l.id}/bump`, "POST", { pay: true }); paid = e.price;
      }
      if (window.loadBilling) loadBilling(true).catch(() => {});
      showMessage("Urcat în listă", paid ? `Anunțul a urcat în capul listei (${paid} credite).` : "Anunțul a urcat în capul listei."); after();
    }, { main: 1 });
  }
  if (l.status === "sold") A("resume", "Repune la vânzare", async () => { await api(`/api/listings/${l.id}/status`, "PATCH", { status: "approved" }); after(); }, { main: 1 });
  if (l.status !== "blocked") A("edit", "Editează", async () => { const { listing } = await api("/api/listings/" + l.id); leaveDetail(); openEdit(listing); }, { main: l.status === "rejected" });
  if (l.status !== "blocked") A("copy", "Copiază anunțul", async () => { const { listing } = await api("/api/listings/" + l.id); leaveDetail(); openEdit(listing, true); });
  if (l.status === "approved") A("sold", "Marchează vândut", async () => { await api(`/api/listings/${l.id}/status`, "PATCH", { status: "sold" }); after(); });
  if (!ctx.detail) A("view", "Previzualizează", async () => openDetail(l.id));
  if (!ctx.detail) A("stats", "Vezi statisticile", async () => accGo("stats"));
  A("del", "Șterge", async () => { if (!confirm(`Ștergi anunțul „${l.title}”?`)) return; await api("/api/listings/" + l.id, "DELETE"); after(true); }, { danger: 1 });
  return acts;
}
async function runAct(a, btn) {
  if (btn) btn.disabled = true;
  try { await a.fn(); } catch (err) { showMessage("Eroare", errText(err)); }
  if (btn) btn.disabled = false;
}
function openActSheet(l, ctx) {
  $("asTitle").textContent = l.title; const box = $("asList"); box.replaceChildren();
  for (const a of listingActs(l, ctx)) {
    const b = document.createElement("button"); b.type = "button"; b.className = "as-item" + (a.danger ? " danger" : ""); b.innerHTML = aico(a.key); const t = document.createElement("span"); t.textContent = a.label; b.appendChild(t);
    b.addEventListener("click", () => { $("actDialog").close(); runAct(a); }); box.appendChild(b);
  }
  open("actDialog");
}
$("asClose")?.addEventListener("click", () => $("actDialog").close());
$("actDialog")?.addEventListener("click", (e) => { if (e.target === $("actDialog")) $("actDialog").close(); });

/* contul meu: cardul de sus, scurtături cu număr și liste simple, grupate */
const accCounts = () => ({
  approved: accMine.filter((l) => l.status === "approved" && !isExpired(l)).length, pending: accMine.filter((l) => l.status === "pending").length,
  expired: accMine.filter(isExpired).length, sold: accMine.filter((l) => l.status === "sold").length,
  promo: accMine.filter((l) => l.promoted && !isExpired(l)).length, rejected: accMine.filter((l) => ["rejected", "blocked"].includes(l.status)).length
});
function accTile(txt, n, fn, id) {
  const b = document.createElement("button"); b.type = "button"; b.className = "acc-tile";
  const c = document.createElement("b"); c.textContent = n; if (id) c.id = id; const t = document.createElement("span"); t.textContent = txt; b.append(c, t); b.addEventListener("click", fn); return b;
}
function accGroup(title, items) {
  const d = document.createElement("section"); d.className = "acc-group"; const h = document.createElement("h3"); h.textContent = title;
  const l = document.createElement("div"); l.className = "acc-list"; l.append(...items); d.append(h, l); return d;
}
function accMenu() {
  const isAdmin = me.role === "admin", isMod = me.role === "moderator";
  const tiles = document.createElement("nav"); tiles.className = "acc-tiles"; tiles.setAttribute("aria-label", "Scurtături cont");
  tiles.append(accTile("Anunțuri", accMine.length ? accCounts().approved : "–", () => { accFilter = "approved"; accGo("mine"); }, "accTileMine"), accTile("Mesaje", unread || 0, openInbox, "accTileMsgs"), accTile("Favorite", favIds.size, () => accGo("favs")), accTile("Căutări", "–", () => accGo("saved"), "accTileSaved"));
  const status = [["approved", "Active"], ["pending", "În moderare"], ["expired", "Expirate"], ["sold", "Vândute"], ["promo", "Promovate"], ["rejected", "Respinse"]].map(([k, t]) => {
    const it = accItem(t, () => { accFilter = k; accGo("mine"); }, "", "accC_" + k); it.dataset.k = k; if (k !== "approved" && k !== "pending" && k !== "sold") it.hidden = true; return it;
  });
  const secs = document.createElement("div"); secs.className = "acc-sections";
  secs.append(
    accGroup("Anunțurile tale", [...status, accItem("Studio · statistici", () => accGo("studio"))]),
    accGroup("Cumpăr", [accItem("Cere oferte pentru o piesă", () => window.openRequests && window.openRequests()), accItem("Favorite", () => accGo("favs"), favIds.size || ""), accItem("Căutări salvate", () => accGo("saved"))]),
    accGroup("Conversații", [accItem("Mesaje", openInbox, unread || "", "accMsgsN"), accItem("Notificări", () => accGo("notif"), notifCount || "", "accNotifN")]),
    accGroup("Cont", [accItem("Portofel și credite", () => accGo("wallet"), "", "accCredTag"), accItem("Datele mele și ștergerea contului", () => window.openData && window.openData()), accItem("Planul meu", () => accGo("plan"), "", "accPlanTag"), accItem("Profilul meu public", () => window.openProfile && window.openProfile(me.id)), accItem("Date generale și telefon", openSettings)])
  );
  const goModeration = () => { mode = "admin"; $("listTitle").textContent = "De aprobat"; accLeave(); loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); };
  if (isMod || isAdmin) secs.appendChild(accGroup("Moderare", [accItem("Studio moderare", () => accGo("modstudio")), ...(isMod ? [accItem("Moderare anunțuri", goModeration)] : [])]));
  const out = document.createElement("button"); out.type = "button"; out.className = "ghost acc-out"; out.textContent = "Ieșire din cont"; out.addEventListener("click", accLogout);
  const last = [tiles, secs, out];
  if (isAdmin || isMod) { const ad = document.createElement("button"); ad.type = "button"; ad.className = "acc-admin"; ad.textContent = "🛡 Administrare"; ad.addEventListener("click", () => openAdmin()); last.push(ad); }
  $("accMain").replaceChildren(...last);
  api("/api/listings/mine").then((r) => {
    accMine = r.listings; const c = accCounts();
    for (const k of Object.keys(c)) { const em = $("accC_" + k); if (!em) continue; const it = em.closest(".acc-item"); it.hidden = !c[k] && !["approved", "pending", "sold"].includes(k); em.textContent = c[k] || ""; em.hidden = !c[k]; }
    const t = $("accTileMine"); if (t) t.textContent = c.approved;
  }).catch(() => {});
  if (window.loadBilling) loadBilling().then((b) => { const c = $("accCredTag"); if (c && b.enabled) { c.textContent = b.balance + " cr."; c.hidden = false; } }).catch(() => {});
  loadPlan().then((p) => { const c = $("accPlanTag"); if (c && p) { c.textContent = p.name; c.hidden = false; } });
  api("/api/saved-searches").then((r) => { const t = $("accTileSaved"); if (t) t.textContent = r.searches.length; }).catch(() => {});
}
function accShow(view) {
  if (!me) return accClosePage();
  accCur = view || null;
  $("accName").textContent = me.nickname; $("accSub").textContent = me.name || me.email || ""; loadPlan().then((p) => { if (p && !$("accName").querySelector(".plan-badge")) { const b = document.createElement("span"); b.className = "plan-badge " + p.key; b.textContent = p.name; $("accName").append(" ", b); } }); $("accAv").textContent = (me.nickname || "?").charAt(0).toUpperCase();
  $("accountPage").scrollTop = 0;
  if (!accCur) return accMenu();
  const titles = { mine: "Anunțurile mele", favs: "Favorite", saved: "Căutări salvate", stats: "Studio", studio: "Studio", plan: "Planul meu", wallet: "Portofel și credite", modstudio: "Studio moderare", notif: "Notificări" };
  const h = document.createElement("h2"); h.className = "acc-title"; h.textContent = titles[accCur] || "";
  const body = document.createElement("div"); body.id = "accBody"; body.className = "acc-body";
  $("accMain").replaceChildren(h, body);
  accTab = accCur === "favs" ? "favs" : "mine";
  if (accCur === "saved") renderSaved(body); else if (accCur === "stats" || accCur === "studio") window.renderStudio(body); else if (accCur === "wallet") window.renderWallet(body); else if (accCur === "plan") window.renderPlan(body); else if (accCur === "modstudio") window.renderModStudio(body); else if (accCur === "notif") renderNotifs(body); else renderAcc();
}
async function renderAcc() {
  const box = $("accBody"); if (!box) return; box.replaceChildren(note("Se încarcă…"));
  if (accTab === "favs") return renderFavs(box);
  try { accMine = (await api("/api/listings/mine")).listings; } catch (err) { box.replaceChildren(note(errText(err))); return; }
  drawMine(box);
}
let planCache = null;
async function loadPlan(force) {
  if (!me) return null;
  if (planCache && !force && Date.now() - planCache.t < 60000 && planCache.uid === me.id) return planCache.p;
  try { const d = await api("/api/plans/me"); const p = d.plans.find((x) => x.key === d.plan); planCache = { t: Date.now(), uid: me.id, p: { ...p, until: d.plan_until }, d }; return planCache.p; }
  catch { return null; }
}
async function accLogout() { await api("/api/auth/logout", "POST").catch(() => {}); setMe(null); accClosePage(); history.pushState(null, "", location.pathname + location.search); mode = "public"; loadListings(); }
$("sellDialog")?.addEventListener("close", () => { if (accIsOpen() && (accCur === "mine" || accCur === "stats")) accShow(accCur); else if (accIsOpen() && !accCur) accMenu(); });

/* ---- căutări salvate ---- */
async function renderSaved(box) {
  box.replaceChildren(note("Se încarcă…"));
  try {
    const { searches } = await api("/api/saved-searches");
    if (!searches.length) { box.replaceChildren(note("Nu ai căutări salvate. Fă o căutare sau alege o categorie, apoi apasă „Salvează căutarea” deasupra rezultatelor.")); return; }
    box.replaceChildren(...searches.map((x) => {
      const r = document.createElement("div"); r.className = "acc-row acc-saved";
      const t = document.createElement("b"); t.textContent = x.label || x.q || x.category_slug;
      const acts = document.createElement("div"); acts.className = "acc-acts";
      const go = document.createElement("button"); go.type = "button"; go.textContent = "Arată anunțurile";
      go.addEventListener("click", () => { accLeave(); pillCat = null; $("searchInput").value = x.q || ""; updatePills(); filter = {}; if (x.q) filter.q = x.q; if (x.category_slug) filter.category = x.category_slug; mode = "public"; $("listTitle").textContent = x.label || "Rezultate"; loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); });
      const del = document.createElement("button"); del.type = "button"; del.className = "danger"; del.textContent = "🗑 Șterge";
      del.addEventListener("click", async () => { try { await api("/api/saved-searches/" + x.id, "DELETE"); renderSaved(box); } catch (err) { showMessage("Eroare", errText(err)); } });
      acts.append(go, del); const w = document.createElement("div"); w.className = "acc-mid"; w.append(t, acts); r.appendChild(w); return r;
    }));
  } catch (err) { box.replaceChildren(note(errText(err))); }
}
function updateSaveBtn() {
  const b = $("saveSearchBtn"); if (!b) return;
  b.hidden = !(mode === "public" && (filter.q || filter.category));
}
$("saveSearchBtn")?.addEventListener("click", async () => {
  if (!me) return openAuth("Intră în cont ca să salvezi căutarea.");
  try { await api("/api/saved-searches", "POST", { q: filter.q || "", category: filter.category || "", label: $("listTitle").textContent }); showMessage("Căutare salvată", "O găsești în Cont › Căutări salvate."); }
  catch (err) { showMessage("Eroare", err.code === "PREA_MULTE_CAUTARI" ? "Poți salva maximum 30 de căutări. Șterge una veche." : errText(err)); }
});

/* ---- statistici ---- */
async function renderStats(box) {
  box.replaceChildren(note("Se încarcă…"));
  try {
    const { listings } = await api("/api/listings/stats");
    if (!listings.length) { box.replaceChildren(note("Nu ai anunțuri încă, deci nu sunt statistici.")); return; }
    const tot = (k) => listings.reduce((n, l) => n + (Number(l[k]) || 0), 0);
    const cards = document.createElement("div"); cards.className = "acc-stat-cards";
    [[tot("views"), "Vizualizări"], [tot("favs"), "Salvări la favorite"], [listings.filter((l) => l.status === "approved").length, "Anunțuri active"]].forEach(([n, t]) => { const d = document.createElement("div"); const b = document.createElement("b"); b.textContent = n.toLocaleString("ro-RO"); const sm = document.createElement("small"); sm.textContent = t; d.append(b, sm); cards.appendChild(d); });
    const rows = listings.map((l) => { const r = document.createElement("div"); r.className = "acc-stat-row"; const t = document.createElement("span"); t.textContent = l.title; t.addEventListener("click", () => openDetail(l.id)); const v = document.createElement("span"); v.textContent = `👁 ${l.views}`; const f = document.createElement("span"); f.textContent = `♥ ${l.favs}`; r.append(t, v, f); return r; });
    box.replaceChildren(cards, ...rows);
  } catch (err) { box.replaceChildren(note(errText(err))); }
}

function drawMine(box) {
  const inF = (l, k) => k === "promo" ? l.promoted && !isExpired(l) : k === "approved" ? l.status === "approved" && !isExpired(l) : k === "expired" ? isExpired(l) : k === "rejected" ? ["rejected", "blocked"].includes(l.status) : l.status === k;
  if (accFilter === "all") accFilter = "approved";
  const cnt = (k) => accMine.filter((l) => inF(l, k)).length;
  const tabs = document.createElement("div"); tabs.className = "acc-tabs";
  [["approved", "Active"], ["pending", "În moderare"], ["expired", "Expirate"], ["sold", "Vândute"], ["promo", "Promovate"], ["rejected", "Respinse"]].forEach(([k, t]) => {
    if (k !== "approved" && !cnt(k) && accFilter !== k) return;
    const b = document.createElement("button"); b.type = "button"; b.className = accFilter === k ? "on" : ""; b.textContent = `${t} ${cnt(k)}`;
    b.addEventListener("click", () => { accFilter = k; drawMine(box); }); tabs.appendChild(b);
  });
  const out = [tabs];
  let q = "";
  const list = document.createElement("div"); list.className = "mc-list";
  const paint = () => {
    const f = accMine.filter((l) => inF(l, accFilter) && (!q || l.title.toLowerCase().includes(q)));
    if (!f.length) { const n = note(q ? "Niciun anunț cu acest cuvânt." : accMine.length ? "Niciun anunț în această categorie." : "Nu ai publicat niciun anunț încă."); list.replaceChildren(n); if (!accMine.length) { const b = document.createElement("button"); b.type = "button"; b.className = "primary"; b.textContent = "+ Adaugă primul anunț"; b.addEventListener("click", () => openSell()); list.appendChild(b); } }
    else list.replaceChildren(...f.map((l) => mineRow(l, box)));
  };
  if (accMine.length > 5) {
    const s = document.createElement("input"); s.type = "search"; s.className = "mc-search"; s.placeholder = "Caută în anunțurile mele…"; s.setAttribute("aria-label", "Caută în anunțurile mele");
    s.addEventListener("input", () => { q = s.value.trim().toLowerCase(); paint(); }); out.push(s);
  }
  paint(); out.push(list); box.replaceChildren(...out);
}
function openPromo(l) {
  const until = l.promoted ? new Date(l.promoted_until).toLocaleDateString("ro-RO", { day: "numeric", month: "long" }) : "";
  $("promoTitle").textContent = l.promoted ? "Prelungește promovarea" : "Promovează anunțul";
  $("promoText").textContent = `„${l.title}” apare primul în listă, cu insigna „Promovat”.` + (until ? ` Acum este promovat până pe ${until}; zilele noi se adaugă după.` : "");
  const box = $("promoPlans"); box.replaceChildren();
  [[3, "3 zile"], [7, "7 zile"], [30, "30 de zile"]].forEach(([d, t]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "primary"; b.textContent = t;
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api(`/api/listings/${l.id}/promote`, "POST", { days: d }); $("promoDialog").close(); showMessage("Promovat", `Anunțul este promovat ${t}.`); renderAcc(); loadListings(); }
      catch (err) { $("promoDialog").close(); showMessage("Eroare", errText(err)); if (err.code === "CREDITE_INSUFICIENTE" && confirm("Deschid Portofelul ca să încarci credite?")) { openAccount(); accGo("wallet"); } }
      b.disabled = false;
    });
    box.appendChild(b);
  });
  open("promoDialog");
  if (window.loadBilling) loadBilling().then((d) => {   // cu BILLING=on se arată prețul pe fiecare buton și soldul
    if (!d.enabled) return;
    const byDays = Object.fromEntries(d.pricing.promo.map((p) => [p.days, p.price]));
    [...box.children].forEach((b, i) => { const dd = [3, 7, 30][i]; if (byDays[dd] != null) b.textContent += ` · ${byDays[dd]} lei`; });
    $("promoText").textContent += ` Ai ${d.balance} credite (1 credit = 1 leu).`;
  }).catch(() => {});
}
$("promoCancel")?.addEventListener("click", () => $("promoDialog").close());
function mineRow(l, box) {
  const r = document.createElement("article"); r.className = "mc" + (isExpired(l) ? " is-exp" : "");
  const top = document.createElement("div"); top.className = "mc-top";
  const th = document.createElement("div"); th.className = "mc-th";
  if (l.thumb) { const g = document.createElement("img"); g.src = l.thumb; g.alt = ""; g.loading = "lazy"; th.appendChild(g); } else th.innerHTML = icon(iconOf[l.category_slug] || "alt", 30);
  const mid = document.createElement("div"); mid.className = "mc-mid";
  const ex = expState(l), [lab, cls] = ST[l.status] || [l.status, ""];
  const st = document.createElement("small"); st.className = "mc-exp " + (ex.k || (l.status === "approved" ? "" : cls)); st.textContent = l.status === "approved" ? ex.txt || "Activ" : lab;
  const t = document.createElement("b"); t.className = "mc-t"; t.textContent = l.title;
  const p = document.createElement("div"); p.className = "mc-p"; p.textContent = price(l) + (l.negotiable ? " · negociabil" : "");
  mid.append(st, t, p);
  if (l.promoted && l.status === "approved") { const pr = document.createElement("span"); pr.className = "mc-promo"; pr.textContent = "⭐ Promovat până pe " + dShort(l.promoted_until); mid.appendChild(pr); }
  const dots = document.createElement("button"); dots.type = "button"; dots.className = "mc-dots"; dots.setAttribute("aria-label", "Gestionează acest anunț"); dots.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>';
  dots.addEventListener("click", (e) => { e.stopPropagation(); openActSheet(l); });
  top.append(th, mid, dots); [th, t, p].forEach((el) => el.addEventListener("click", () => openDetail(l.id)));
  const stats = document.createElement("div"); stats.className = "mc-stats";
  [["view", l.views || 0, "Vizualizări"], ["msg", l.msgs || 0, "Mesaje"], ["heart", l.favs || 0, "Salvări la favorite"]].forEach(([k, n, tt]) => { const s = document.createElement("span"); s.title = tt; s.setAttribute("aria-label", `${tt}: ${n}`); s.innerHTML = aico(k, 20); s.append(" " + n); stats.appendChild(s); });
  r.append(top, stats);
  const mains = listingActs(l).filter((a) => a.main).slice(0, 2);
  if (mains.length) {
    const row = document.createElement("div"); row.className = "mc-btns";
    mains.forEach((a, i) => { const b = document.createElement("button"); b.type = "button"; b.className = i === 0 && a.key === "promo" ? "mc-b dark" : "mc-b"; b.textContent = a.short || a.label; b.addEventListener("click", () => runAct(a, b)); row.appendChild(b); });
    r.appendChild(row);
  } else if (l.status === "pending") { const n = document.createElement("p"); n.className = "mc-note"; n.textContent = "Anunțul este verificat de un moderator și apare în scurt timp."; r.appendChild(n); }
  return r;
}
async function renderFavs(box) {
  const ids = [...favIds].slice(0, 48);
  if (!ids.length) { box.replaceChildren(note("Nu ai anunțuri salvate. Apasă ♡ pe un anunț ca să-l găsești aici.")); return; }
  try {
    const r = await api("/api/listings?" + new URLSearchParams({ ids: ids.join(","), limit: 48 }));
    const by = new Map(r.listings.map((l) => [l.id, l])), list = ids.map((i) => by.get(i)).filter(Boolean);
    if (!list.length) { box.replaceChildren(note("Anunțurile salvate nu mai sunt disponibile.")); return; }
    const g = document.createElement("div"); g.className = "acc-grid"; g.replaceChildren(...list.map(card)); box.replaceChildren(g);
  } catch (err) { box.replaceChildren(note(errText(err))); }
}
function openSettings() {
  $("setName").value = me.name || ""; $("setPhone").value = me.phone || ""; $("setShowPhone").checked = !!me.show_phone; $("setWa").checked = !!me.whatsapp; show($("setErr"), ""); $("setOk").hidden = true;
  api("/api/messages/prefs").then((p) => { $("setPresence").checked = p.show_presence !== false; }).catch(() => {});
  open("settingsDialog");
}
$("setClose").addEventListener("click", () => $("settingsDialog").close());
$("setForm").addEventListener("submit", async (e) => {
  e.preventDefault(); show($("setErr"), ""); $("setOk").hidden = true;
  const phone = $("setPhone").value.trim();
  try {
    const r = await api("/api/auth/me", "PATCH", { name: $("setName").value, phone, show_phone: $("setShowPhone").checked && !!phone, whatsapp: $("setWa").checked && !!phone });
    await api("/api/messages/prefs", "PUT", { show_presence: $("setPresence").checked });
    me = r.user; $("setShowPhone").checked = !!me.show_phone; $("setWa").checked = !!me.whatsapp; $("setOk").textContent = "Salvat."; $("setOk").hidden = false;
  } catch (err) { show($("setErr"), errText(err)); }
});
["hdrAccount", "bnAccount"].forEach((i) => $(i)?.addEventListener("click", openAccount));
$("hdrChat")?.addEventListener("click", () => (me ? openInbox() : openAuth("Intră în cont ca să vezi mesajele.")));
$("hdrSearch")?.addEventListener("click", () => openSearchPage($("searchInput").value.trim()));

/* ---- lista de anunțuri ---- */
function card(l) {
  const a = document.createElement("article"); a.className = "product"; a.tabIndex = 0;
  const im = document.createElement("div"); im.className = "product-image";
  if (l.thumb) { const g = document.createElement("img"); g.src = l.thumb; g.alt = l.title; g.loading = "lazy"; im.appendChild(g); } else im.innerHTML = icon(iconOf[l.category_slug] || "alt", 60);
  if (l.condition) {   // „Nou” / „Folosit”; la piese auto „Second-hand”
    const cd = document.createElement("span"); cd.className = "cond " + l.condition;
    cd.textContent = l.condition === "nou" ? "Nou" : (l.category_slug === "piese-auto" ? "Second-hand" : "Folosit"); im.appendChild(cd);
  }
  if (l.promoted) { const pt = document.createElement("span"); pt.className = "promo-tag"; pt.textContent = "⭐ Promovat"; im.appendChild(pt); }
  if (mode === "public") im.appendChild(favBtn(l.id));
  const info = document.createElement("div"); info.className = "product-info";
  const h = document.createElement("h3"); h.textContent = l.title;
  const p = document.createElement("p"); p.textContent = [l.county, l.category].filter(Boolean).join(" · ");
  const s = document.createElement("strong"); s.textContent = price(l);
  info.append(h, p, s); a.append(im, info);
  if (mode !== "public" && l.status !== "approved") { const t = document.createElement("span"); t.className = "tag"; t.textContent = l.status; info.appendChild(t); }
  if (mode === "mine" && l.mod_note) { const n = document.createElement("small"); n.className = "mod-note"; n.textContent = "Motiv: " + l.mod_note; info.appendChild(n); }
  a.addEventListener("click", () => { trackInterest({ cat: l.category_slug, w: 3, id: l.id, title: l.title }); openDetail(l.id); });
  if (mode === "public") return a;
  const box = document.createElement("div"); box.className = "card-actions";
  const btn = (txt, fn) => { const b = document.createElement("button"); b.textContent = txt; b.addEventListener("click", async (e) => { e.stopPropagation(); try { await fn(); loadListings(); } catch (err) { showMessage("Eroare", errText(err)); } }); box.appendChild(b); };
  if (mode === "mine") {
    if (l.status === "approved") btn("Marchează vândut", () => api(`/api/listings/${l.id}/status`, "PATCH", { status: "sold" }));
    if (l.status === "sold") btn("Repune la vânzare", () => api(`/api/listings/${l.id}/status`, "PATCH", { status: "approved" }));
    if (l.status !== "blocked") btn("Editează", async () => openEdit((await api(`/api/listings/${l.id}`)).listing));
    btn("Șterge", () => api(`/api/listings/${l.id}`, "DELETE"));
  } else { btn("Aprobă", () => api(`/api/admin/listings/${l.id}`, "PATCH", { status: "approved" })); btn("Respinge", () => api(`/api/admin/listings/${l.id}`, "PATCH", { status: "rejected" })); }
  const w = document.createElement("div"); w.append(a, box); return w;
}
async function loadListings() {
  updateSaveBtn();
  const box = $("products"); box.setAttribute("aria-busy", "true");
  try {
    const url = mode === "mine" ? "/api/listings/mine" : mode === "admin" ? "/api/admin/listings?status=pending" : "/api/listings?" + new URLSearchParams(filter);
    const { listings } = await api(url);
    box.replaceChildren(...listings.map(card));
    $("emptyMessage").hidden = listings.length > 0;
    $("emptyMessage").textContent = mode === "public" ? "Nu am găsit anunțuri. Fii primul care adaugă unul!" : "Nimic de afișat aici.";
  } catch (err) {
    if (err.status === 401) { setMe(null); mode = "public"; return openAuth(); }
    box.replaceChildren(); $("emptyMessage").hidden = false; $("emptyMessage").textContent = errText(err);
  }
  box.removeAttribute("aria-busy");
}
/* ---- galerie + poză mare (ca în AutoParts) ---- */
function buildGallery(images, title) {
  const g = $("detGal"); g.replaceChildren();
  if (!images.length) { g.className = "ad-gal ad-gal-empty"; g.innerHTML = icon("alt", 56) + "<small>Fără poze</small>"; return; }
  g.className = "ad-gal";
  const sl = document.createElement("div"); sl.className = "ad-slider";
  images.forEach((u, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "ad-slide"; b.setAttribute("aria-label", `Vezi poza ${i + 1} mai mare`);
    const im = document.createElement("img"); im.src = u; im.alt = `${title} - poza ${i + 1}`; if (i) im.loading = "lazy";
    b.appendChild(im); b.addEventListener("click", () => openLightbox(images, i, title)); sl.appendChild(b);
  });
  g.appendChild(sl);
  if (images.length < 2) return;
  const nav = (cls, txt, d) => { const b = document.createElement("button"); b.type = "button"; b.className = "ad-nav " + cls; b.innerHTML = d < 0 ? CHEV_L : CHEV_R; b.setAttribute("aria-label", d < 0 ? "Poza anterioară" : "Poza următoare"); b.addEventListener("click", () => sl.scrollBy({ left: d * sl.clientWidth, behavior: "smooth" })); return b; };
  const cnt = document.createElement("span"); cnt.className = "ad-count"; cnt.textContent = `1 / ${images.length}`;
  const dots = document.createElement("div"); dots.className = "ad-dots"; dots.setAttribute("aria-hidden", "true"); dots.innerHTML = images.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("");
  g.append(nav("prev", "‹", -1), nav("next", "›", 1), cnt, dots);
  sl.addEventListener("scroll", () => { const i = Math.round(sl.scrollLeft / sl.clientWidth); cnt.textContent = `${i + 1} / ${images.length}`; [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i)); });
}
const CHEV_L = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>', CHEV_R = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
let lb = { list: [], i: 0 };
function lbShow() { $("lbImg").src = lb.list[lb.i]; $("lbCount").textContent = `${lb.i + 1} / ${lb.list.length}`; $("lbPrev").hidden = $("lbNext").hidden = lb.list.length < 2; }
function lbMove(d) { if (lb.list.length < 2) return; lb.i = (lb.i + d + lb.list.length) % lb.list.length; lbShow(); }
function openLightbox(list, i, alt) { lb = { list, i }; $("lbImg").alt = alt || ""; lbShow(); if (!$("lightbox").open) $("lightbox").showModal(); }
$("lbClose")?.addEventListener("click", () => $("lightbox").close());
$("lbPrev")?.addEventListener("click", () => lbMove(-1));
$("lbNext")?.addEventListener("click", () => lbMove(1));
$("lightbox")?.addEventListener("click", (e) => { if (e.target === $("lightbox")) $("lightbox").close(); });
$("lightbox")?.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") lbMove(-1); else if (e.key === "ArrowRight") lbMove(1); });
{ let x0 = null; const lg = $("lightbox");
  lg?.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lg?.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) lbMove(dx < 0 ? 1 : -1); }); }

/* ---- fereastra anunțului ---- */
/* ---- link propriu pentru fiecare anunț, distribuire ---- */
const slug = (t) => fold(t).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
let detPushed = false, detSkipBack = false, detCur = null; const baseTitle = document.title;
function detUrlSync(l) {
  const url = "/anunt/" + l.id + (slug(l.title) ? "-" + slug(l.title) : "");
  detCur = { id: l.id, title: l.title, url, price: price(l) };
  document.title = l.title + " | Omnivo";
  if (location.pathname === url) return;                                  // deschis direct din link
  if (/^\/anunt\//.test(location.pathname)) history.replaceState({ det: l.id }, "", url);   // de la un anunț la altul
  else { history.pushState({ det: l.id }, "", url); detPushed = true; }
}
$("detailDialog")?.addEventListener("close", () => {
  document.title = baseTitle;
  if (detSkipBack) { detSkipBack = false; return; }
  if (/^\/anunt\//.test(location.pathname)) { if (detPushed) { detPushed = false; history.back(); } else history.replaceState(null, "", "/"); }
});
$("detShare")?.addEventListener("click", async () => {
  if (!detCur) return; const url = location.origin + detCur.url;
  if (navigator.share) { try { await navigator.share({ title: detCur.title, text: detCur.price, url }); } catch { /* anulat */ } return; }
  try { await navigator.clipboard.writeText(url); showMessage("Link copiat", "Poți trimite linkul oricui: " + url); } catch { showMessage("Link anunț", url); }
});

/* ---- notificări ---- */
let notifCount = 0, toastTimer = null;
function paintNotifCount() { const c = $("accNotifN"); if (c) { c.textContent = notifCount || ""; c.hidden = !notifCount; } }
async function loadNotifCount() { notifCount = 0; if (me) { try { notifCount = (await api("/api/notifications/count")).unread; } catch { /* fără notificări */ } } paintNotifCount(); }
function toast(text, fn) {
  let t = $("toast"); if (!t) { t = document.createElement("button"); t.id = "toast"; t.type = "button"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = "🔔 " + text; t.hidden = false; t.onclick = () => { t.hidden = true; if (fn) fn(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}
const NK = { rfq_new: "🔧", rfq_quote: "💬", rfq_won: "🏆", rfq_lost: "•", rfq_msg: "✉", rfq_dealer: "✓", price: "↓", match: "🔎", mod_approved: "✓", mod_rejected: "✕", mod_blocked: "⛔" };
async function renderNotifs(box) {
  box.replaceChildren(note("Se încarcă…"));
  try {
    const d = await api("/api/notifications");
    if (!d.notifications.length) { box.replaceChildren(note("Nicio notificare încă. Te anunțăm când un anunț salvat își reduce prețul sau apare un anunț nou pentru o căutare salvată.")); return; }
    const head = document.createElement("div"); head.className = "nt-head";
    box.replaceChildren(head, ...d.notifications.map((n) => {
      const r = document.createElement("button"); r.type = "button"; r.className = "nt-row" + (n.read ? "" : " new");
      const ic = document.createElement("span"); ic.className = "nt-ic " + n.kind; ic.textContent = NK[n.kind] || "•";
      const mid = document.createElement("span"); mid.className = "nt-mid";
      const t = document.createElement("b"); t.textContent = n.title; const b = document.createElement("small"); b.textContent = n.body;
      const w = document.createElement("em"); w.textContent = when(n.created_at); mid.append(t, b, w);
      r.append(ic, mid); r.addEventListener("click", () => { if (n.listing_id) openDetail(n.listing_id); else if (/^rfq/.test(n.kind) && window.openRequests) openRequests(); });
      return r;
    }));
    if (d.unread) { api("/api/notifications/read", "POST").then(() => { notifCount = 0; paintNotifCount(); }).catch(() => {}); }
  } catch (err) { box.replaceChildren(note(errText(err))); }
}

async function openDetail(id) {
  try {
    const { listing: l } = await api("/api/listings/" + id);
    const cap = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
    const date = l.created_at ? new Date(l.created_at).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" }) : "";
    $("detCrumbs").innerHTML = [l.parent_category, l.category].filter(Boolean).map((t) => `<span></span>`).join("<i>›</i>");
    [...$("detCrumbs").querySelectorAll("span")].forEach((sp, i) => { sp.textContent = [l.parent_category, l.category].filter(Boolean)[i]; });
    buildGallery(l.images || [], l.title);
    $("detTitle").textContent = l.title;
    $("detPrice").textContent = price(l);
    $("detSub").textContent = [l.city, l.county, date].filter(Boolean).join(" · ");
    const chips = $("detChips"); chips.replaceChildren();
    const chip = (t, cls) => { const s = document.createElement("span"); s.className = "lchip" + (cls ? " " + cls : ""); s.textContent = t; chips.appendChild(s); };
    if (l.status === "sold") chip("Vândut", "sold"); if (l.condition) chip(l.condition === "nou" ? "Nou" : (fold(l.category || "") === "piese auto" ? "Second-hand" : "Folosit"), l.condition === "nou" ? "new" : ""); if (l.promoted_until && new Date(l.promoted_until) > new Date()) chip("⭐ Promovat", "promo"); if (l.negotiable) chip("Preț negociabil");
    const loc = $("detLoc"), place = [l.address, l.city, l.county].filter(Boolean).join(", ");
    loc.replaceChildren(); loc.hidden = !place;
    if (place) { loc.append("📍 " + place + " · "); const m = document.createElement("a"); m.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place + ", România"); m.target = "_blank"; m.rel = "noopener noreferrer"; m.textContent = "Vezi pe hartă"; loc.appendChild(m); }
    $("detDesc").textContent = l.description || ""; $("detDescBox").hidden = !l.description;
    const rows = [...(l.condition ? [["Stare", cap(l.condition)]] : []), ...l.attributes.map((a) => [a.label, a.value]), ["Localitate", [l.city, l.county].filter(Boolean).join(", ")], ["Tip vânzător", l.seller_type === "firma" ? "Firmă" : "Persoană fizică"], ["Publicat", date], ["ID anunț", "#" + l.id]].filter((r) => r[1]);
    $("detAttrs").replaceChildren(...rows.map(([k, v]) => { const d = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; d.append(dt, dd); return d; }));
    const sc = $("detSeller"); sc.replaceChildren();
    const av = document.createElement("span"); av.className = "ad-av"; av.textContent = (l.seller || "V").charAt(0).toUpperCase();
    const who = document.createElement("div"), nm = document.createElement("b"), mt = document.createElement("small");
    nm.textContent = l.seller || "Vânzător"; if (["silver", "gold", "titanium"].includes(l.seller_plan)) { const pb = document.createElement("span"); pb.className = "plan-badge " + l.seller_plan; pb.textContent = l.seller_plan.charAt(0).toUpperCase() + l.seller_plan.slice(1); nm.append(" ", pb); } mt.textContent = [l.seller_type === "firma" ? "Firmă" : "Persoană fizică", l.county].filter(Boolean).join(" · ");
    who.append(nm, mt);
    { const sp = l.seller_presence;   // „online acum” / „văzut azi la 21:40”; lipsește dacă vânzătorul și-a ascuns prezența
      if (sp && !sp.hidden) { const pr = document.createElement("small"); pr.className = "ad-pres" + (sp.online ? " online" : ""); pr.textContent = sp.online ? "online acum" : seenText(sp.last_seen); who.appendChild(pr); } }
    sc.append(av, who);
    { const rt = document.createElement("small"); rt.className = "ad-rate"; rt.textContent = l.seller_rating && l.seller_rating.n ? `★ ${l.seller_rating.avg.toLocaleString("ro-RO")} · ${l.seller_rating.n} ${l.seller_rating.n === 1 ? "recenzie" : "recenzii"}` : "Fără recenzii încă"; who.appendChild(rt);
      if (l.seller_since) { const sn = document.createElement("small"); sn.textContent = "Pe Omnivo din " + new Date(l.seller_since).toLocaleDateString("ro-RO", { month: "long", year: "numeric" }); who.appendChild(sn); }
      const go = document.createElement("span"); go.className = "ad-go"; go.textContent = "›"; go.setAttribute("aria-hidden", "true"); sc.appendChild(go);
      sc.classList.add("ad-seller-link"); sc.tabIndex = 0; sc.setAttribute("role", "button"); sc.setAttribute("aria-label", "Vezi profilul vânzătorului");
      sc.onclick = () => window.openProfile && window.openProfile(l.seller_id); sc.onkeydown = (e) => { if (e.key === "Enter") sc.onclick(); }; }
    /* bara de contact: mereu vizibilă jos, cu telefon, WhatsApp și mesaj */
    const act = $("detActions"); act.replaceChildren(); act.hidden = false;
    const ob = $("detOwner"); ob.replaceChildren(); ob.hidden = true;
    const live = ["approved", "sold"].includes(l.status);
    const btn = (txt, fn, cls) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; if (cls) b.className = cls; b.addEventListener("click", fn); act.appendChild(b); return b; };
    if (l.mine) {
      act.hidden = true;   // acțiunile proprietarului: un singur panou „Anunțul tău” sus, cu „Gestionează” care deschide meniul de acțiuni
      const oi = l.owner_info || {}, m = { ...l, ...oi, promoted: !!oi.promoted_until && new Date(oi.promoted_until) > Date.now() };
      const [stLab, stCls] = ST[l.status] || [l.status, ""], ex = expState(m);
      const head = document.createElement("div"); head.className = "own-head";
      const who = document.createElement("b"); who.textContent = "Anunțul tău"; const pill = document.createElement("span"); pill.className = "acc-st " + stCls; pill.textContent = stLab;
      const mg = document.createElement("button"); mg.type = "button"; mg.className = "own-manage"; mg.innerHTML = aico("edit", 18); mg.append(" Gestionează"); mg.addEventListener("click", () => openActSheet(m, { detail: true }));
      head.append(who, pill, mg);
      const stats = document.createElement("div"); stats.className = "own-stats";
      [["view", oi.views || 0, "vizualizări"], ["msg", oi.msgs || 0, "mesaje"], ["heart", oi.favs || 0, "salvări"]].forEach(([k, n, t]) => { const d = document.createElement("div"); d.innerHTML = aico(k, 20); const bb = document.createElement("b"); bb.textContent = Number(n).toLocaleString("ro-RO"); const sm = document.createElement("small"); sm.textContent = t; d.append(bb, sm); stats.appendChild(d); });
      ob.append(head, stats);
      if (l.status === "approved" && oi.expires_at) {   // bara de valabilitate: cât a mai rămas din cele 30 de zile
        const left = new Date(oi.expires_at) - Date.now(), pct = Math.max(0, Math.min(100, left / (30 * DAY) * 100));
        const v = document.createElement("div"); v.className = "own-valid " + ex.k; const bar = document.createElement("div"); bar.className = "own-bar-track"; const fill = document.createElement("i"); fill.style.width = pct + "%"; bar.appendChild(fill);
        const tx = document.createElement("small"); tx.textContent = left <= 0 ? `A expirat pe ${dLong(oi.expires_at)}` : `Mai are ${Math.max(1, Math.ceil(left / DAY))} zile de afișare, până pe ${dLong(oi.expires_at)}`; v.append(bar, tx); ob.appendChild(v);
      }
      const cta = listingActs(m, { detail: true }).find((a) => a.key === (ex.k ? "renew" : l.status === "sold" ? "resume" : "promo"));
      if (cta) { const bt = document.createElement("button"); bt.type = "button"; bt.className = "own-cta"; bt.textContent = ex.k ? "Reînnoiește pentru 30 de zile" : cta.label; bt.addEventListener("click", () => runAct(cta, bt)); ob.appendChild(bt); }
      ob.hidden = false;
    }
    else if (live) {
      if (l.has_phone && l.status !== "sold") {
        const call = btn("📞 Contact", async () => {
          call.disabled = true;
          try {
            const { phone, whatsapp } = await api(`/api/listings/${l.id}/phone`);
            const t = document.createElement("a"); t.href = "tel:" + phone.replace(/[^+\d]/g, ""); t.className = "call"; t.textContent = "📞 " + fmtPhone(phone);
            const nodes = [t];
            if (whatsapp) { const w = document.createElement("a"); w.href = waLink(phone); w.target = "_blank"; w.rel = "noopener noreferrer"; w.className = "wa"; w.textContent = "WhatsApp"; nodes.push(w); }
            call.replaceWith(...nodes);
          } catch (err) { call.disabled = false; showMessage("Eroare", errText(err)); }
        }, "call");
      }
      act.appendChild(favBtn(l.id, true));
      if (l.seller_id) btn("✉️ Trimite mesaj", () => { $("detailDialog").close(); me ? openChat(l.id, l.seller_id, l.title) : openAuth(); }, l.has_phone && l.status !== "sold" ? "alt" : "call");
      if (!l.has_phone && l.status !== "sold") { const n = document.createElement("small"); n.className = "ad-nophone"; n.textContent = "Vânzătorul nu a afișat telefonul. Scrie-i un mesaj."; act.prepend(n); }
    }
    open("detailDialog"); $("detailDialog").scrollTop = 0; detUrlSync(l);
  } catch (err) { showMessage("Eroare", errText(err)); }
}

/* ---- căutare ---- */
/* ---- căutare + pastile de categorii sub bară ---- */
let pillCat = null, pillTimer = null, pillSeq = 0;
function applySearch(scroll) {
  const q = $("searchInput").value.trim();
  filter = {}; if (q) filter.q = q; if (pillCat) filter.category = pillCat.slug;
  mode = "public";
  $("listTitle").textContent = q && pillCat ? `Rezultate pentru „${q}” în ${pillCat.name}` : q ? `Rezultate pentru „${q}”` : pillCat ? pillCat.name : "Anunțuri recente";
  loadListings();
  if (scroll) $("anunturi").scrollIntoView({ behavior: "smooth" });
}
function pillEl(c) {
  const b = document.createElement("button"); b.type = "button";
  const on = pillCat && pillCat.slug === c.slug;
  b.className = "pill" + (on ? " on" : ""); b.setAttribute("aria-pressed", on ? "true" : "false");
  const ic = document.createElement("span"); ic.className = "pill-ic"; ic.innerHTML = icon(iconOf[c.slug] || c.slug, 18); b.appendChild(ic);
  b.append(c.name);
  if (c.parent) { const p = document.createElement("small"); p.textContent = c.parent; b.appendChild(p); }
  if (on) { const x = document.createElement("span"); x.className = "pill-x"; x.textContent = "✕"; x.setAttribute("aria-hidden", "true"); b.appendChild(x); }
  b.addEventListener("click", () => {
    pillCat = on ? null : { slug: c.slug, name: c.name, parent: c.parent };
    if (pillCat) trackInterest({ cat: c.slug, w: 2 });
    applySearch(true); updatePills();
  });
  return b;
}
function renderPills(list) {
  const box = $("searchPills"); if (!box) return;
  const items = list.slice();
  if (pillCat && !items.some((c) => c.slug === pillCat.slug)) items.unshift(pillCat);
  box.replaceChildren(...items.map(pillEl)); box.hidden = !items.length;
}
async function updatePills() {
  if (!$("searchPills") || !cats.length) return;
  const text = $("searchInput").value.trim(), seq = ++pillSeq;
  if (text.length < 2) return renderPills([]);                      // bara goală → fără pastile
  const f = fold(text), found = [];
  for (const c of cats) for (const k of [c, ...c.children]) {      // potrivire pe numele categoriei
    if (fold(k.name).split(/[^a-z0-9]+/).some((w) => w.startsWith(f)) || fold(k.name).startsWith(f)) found.push({ slug: k.slug, name: k.name, parent: k === c ? "" : c.name });
  }
  let remote = [];                                                  // potrivire pe cuvinte-cheie (ex. „bormasina” → Unelte)
  try { remote = (await api("/api/categories/suggest?title=" + encodeURIComponent(text))).suggestions.map((x) => ({ slug: x.slug, name: x.name, parent: x.parent })); } catch { /* fără sugestii */ }
  if (seq !== pillSeq) return;                                      // a scris între timp altceva
  const seen = new Set(), list = [];
  for (const c of [...remote, ...found]) if (!seen.has(c.slug)) { seen.add(c.slug); list.push(c); }
  renderPills(list.slice(0, 6));                                    // nimic potrivit → fără pastile
}
$("searchForm")?.addEventListener("submit", (e) => { e.preventDefault(); applySearch(true); });
$("searchInput")?.addEventListener("input", () => {
  clearTimeout(pillTimer); pillTimer = setTimeout(updatePills, 180);
  if (!$("searchInput").value.trim()) { const had = pillCat || filter.q; pillCat = null; if (had) applySearch(false); }
});
/* ---- pagina de căutare pe tot ecranul (ca „Adaugă anunț”; model: AutoParts #searchOverlay) ---- */
const REC_KEY = "omnivoRecentSearches";
let spCat = null, spSeq = 0, spTimer = null, spClosedAt = 0;
const spRecent = () => { try { return (JSON.parse(localStorage.getItem(REC_KEY)) || []).filter((x) => typeof x === "string" && x.trim()).slice(0, 10); } catch { return []; } };
const spSave = (q) => { try { localStorage.setItem(REC_KEY, JSON.stringify([q, ...spRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 10))); } catch { /* fără istoric */ } };
function spItem(ico, text, sub, onPick) {
  const b = document.createElement("button"); b.type = "button"; b.className = "sp-item";
  const i = document.createElement("span"); i.className = "sp-ico"; i.setAttribute("aria-hidden", "true"); i.textContent = ico;
  const t = document.createElement("span"); t.className = "sp-txt"; t.textContent = text;
  if (sub) { const s = document.createElement("small"); s.textContent = sub; t.appendChild(s); }
  const a = document.createElement("em"); a.setAttribute("aria-hidden", "true"); a.textContent = "↖";
  b.append(i, t, a); b.addEventListener("click", onPick); return b;
}
function spRenderCats() {
  const box = $("spCats"); if (!box) return;
  const mk = (label, slug) => { const b = document.createElement("button"); b.type = "button"; const on = (spCat ? spCat.slug : null) === slug; b.className = "pill" + (on ? " on" : ""); b.setAttribute("aria-pressed", on ? "true" : "false"); b.textContent = label; b.addEventListener("click", () => { spCat = slug ? { slug, name: label, parent: "" } : null; spRenderCats(); spRefresh(); }); return b; };
  box.replaceChildren(mk("Toate", null), ...cats.map((c) => mk(c.name, c.slug)));
}
function spSubmit(q, cat) {
  q = String(q || "").trim(); if (!q && !cat) return;
  if (q) spSave(q);
  $("searchDialog").close(); spClosedAt = Date.now();
  if (!$("accountPage").hidden) accLeave();
  $("searchInput").value = q; pillCat = cat || null; updatePills(); applySearch(true);
}
function spRefresh() {
  const q = $("spInput").value.trim(), list = $("spList"), head = $("spRecentHead");
  $("spClear").hidden = !$("spInput").value; clearTimeout(spTimer);
  if (q.length < 2) {
    spSeq++; const rec = spRecent(); head.hidden = !rec.length;
    list.replaceChildren(...(rec.length ? rec.map((x) => spItem("↺", x, "", () => spSubmit(x, spCat))) : [Object.assign(document.createElement("p"), { className: "sp-empty", textContent: "Nu ai căutări recente." })]));
    return;
  }
  head.hidden = true;
  const own = [spItem("⌕", `Caută „${q}”`, spCat ? spCat.name : "Toate categoriile", () => spSubmit(q, spCat))];
  list.replaceChildren(...own);
  const seq = ++spSeq;
  spTimer = setTimeout(async () => {
    const f = fold(q), found = [];
    for (const c of cats) for (const k of [c, ...c.children]) if (fold(k.name).split(/[^a-z0-9]+/).some((w) => w.startsWith(f))) found.push({ slug: k.slug, name: k.name, parent: k === c ? "" : c.name });
    let remote = []; try { remote = (await api("/api/categories/suggest?title=" + encodeURIComponent(q))).suggestions.map((x) => ({ slug: x.slug, name: x.name, parent: x.parent })); } catch { /* fără sugestii */ }
    if (seq !== spSeq) return;
    const seen = new Set(), rows = [];
    for (const c of [...remote, ...found]) if (!seen.has(c.slug)) { seen.add(c.slug); rows.push(spItem("▦", c.name, c.parent ? `în ${c.parent}` : "Categorie", () => spSubmit("", c))); }
    list.replaceChildren(...own, ...rows.slice(0, 6));
  }, 160);
}
function openSearchPage(value) {
  if (!$("searchDialog")) return;
  $("spInput").value = value || ""; spCat = pillCat || null;
  if (!cats.length) loadCats();
  spRenderCats(); spRefresh(); open("searchDialog"); $("spInput").focus();
}
$("spClose")?.addEventListener("click", () => { $("searchDialog").close(); spClosedAt = Date.now(); });
$("spForm")?.addEventListener("submit", (e) => { e.preventDefault(); spSubmit($("spInput").value, spCat); });
$("spInput")?.addEventListener("input", spRefresh);
$("spClear")?.addEventListener("click", () => { $("spInput").value = ""; spRefresh(); $("spInput").focus(); });
$("spRecentClear")?.addEventListener("click", () => { try { localStorage.removeItem(REC_KEY); } catch { /* nimic */ } spRefresh(); });
$("bnSearch")?.addEventListener("click", () => openSearchPage($("searchInput").value.trim()));
$("searchInput")?.addEventListener("focus", () => {   // pe telefon, bara de pe prima pagină deschide pagina de căutare
  if (Date.now() - spClosedAt < 600 || !matchMedia("(max-width:760px)").matches || $("searchDialog").open) return;
  $("searchInput").blur(); openSearchPage($("searchInput").value.trim());
});

/* ---- poze: comprimare în browser (max 1600 px, JPEG), previzualizare, încărcare una câte una ---- */
const photos = [];
async function compress(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) throw Object.assign(new Error("POZA_INVALIDA"), { code: "POZA_INVALIDA" });
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height); // fundal alb: PNG-urile transparente nu ies negre
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("POZA_INVALIDA"))), "image/jpeg", 0.82));
}
function renderPrev() {
  $("sellPrev").replaceChildren(...photos.map((p, i) => {
    const d = document.createElement("div"), g = document.createElement("img"), b = document.createElement("button");
    g.src = p.url; g.alt = `Poza ${i + 1}`; b.type = "button"; b.textContent = "✕"; b.setAttribute("aria-label", "Șterge poza");
    b.addEventListener("click", () => { URL.revokeObjectURL(p.url); photos.splice(i, 1); renderPrev(); });
    d.append(g, b); if (i === 0) { const t = document.createElement("span"); t.textContent = "Principală"; d.appendChild(t); } return d;
  }));
  { const n = photos.length + existing.length; $("sellPhotoBtn").textContent = n ? `📷 Adaugă încă (${n}/8)` : "📷 Adaugă poze"; }
}
$("sellPhotoBtn")?.addEventListener("click", () => $("sellPhotos").click());
$("sellPhotos")?.addEventListener("change", async (e) => {
  show($("sellErr"), ""); let bad = 0;
  for (const f of [...e.target.files].slice(0, 8 - photos.length - existing.length)) {
    try { const blob = await compress(f); photos.push({ blob, url: URL.createObjectURL(blob) }); renderPrev(); } catch { bad++; }
  }
  if (bad) show($("sellErr"), ERR.POZA_INVALIDA);
  e.target.value = "";
});
async function uploadPhoto(id, blob) {
  const r = await fetch(`/api/listings/${id}/images`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
  if (!r.ok) throw new Error("upload");
}

/* ---- mesagerie: căsuță + conversație (reîmprospătare la 8 s cât e deschisă) ---- */
const when = (t) => new Date(t).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
/* ---- bife ca pe WhatsApp: ✓ trimis, ✓✓ livrat, ✓✓ albastre = citit ---- */
const tickState = (m) => (m.read || m.read_at ? "read" : m.delivered || m.delivered_at ? "delivered" : "sent");
function tickEl(st) {
  const t = document.createElement("span"); t.className = "cv-ticks " + st; t.dataset.st = st; t.textContent = st === "sent" ? "✓" : "✓✓";
  t.setAttribute("aria-label", st === "read" ? "Citit" : st === "delivered" ? "Livrat" : "Trimis"); return t;
}
function setTicks(ids, st) {
  (ids || []).forEach((id) => {
    const t = document.querySelector(`.bubble[data-mid="${Number(id)}"] .cv-ticks`); if (!t) return;
    if (t.dataset.st === "read" || (t.dataset.st === "delivered" && st === "delivered")) return;
    t.replaceWith(tickEl(st));
  });
}
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const hhmm = (t) => new Date(t).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
function dayLabel(t) {
  const d = new Date(t), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
  return sameDay(d, n) ? "Azi" : sameDay(d, y) ? "Ieri" : d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", ...(d.getFullYear() === n.getFullYear() ? {} : { year: "numeric" }) });
}
const inboxTime = (t) => { const d = new Date(t), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1); return sameDay(d, n) ? hhmm(t) : sameDay(d, y) ? "Ieri" : d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" }); };
/* „văzut azi la 21:40” / „văzut ieri la 18:05” / „văzut 3 nov.” */
function seenText(ts) {
  if (!ts) return "offline";
  const d = new Date(ts), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
  if (sameDay(d, n)) return "văzut azi la " + hhmm(ts);
  if (sameDay(d, y)) return "văzut ieri la " + hhmm(ts);
  return "văzut " + d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}
window.seenText = seenText;
const presText = (p) => (!p || p.hidden ? "" : p.online ? "online" : seenText(p.last_seen));
const AVC = ["#b8935a", "#8f6d38", "#a07a4a", "#7d6a52", "#c2a06b", "#9a7b4f"];
const avatar = (name, id) => { const a = document.createElement("span"); a.className = "cp-av"; a.textContent = String(name || "?").charAt(0).toUpperCase(); a.style.background = AVC[Math.abs(Number(id) || 0) % AVC.length]; return a; };
let typTimer = null;
function setPresence(p) {
  const el = $("chatPresence"); if (!el) return;
  const t = presText(p); el.className = "cv-presence" + (p && !p.hidden && p.online ? " online" : ""); el.dataset.base = t; el.textContent = t; clearTimeout(typTimer);
}

/* ---- timp real (SSE): mesaje noi, bife, online, „scrie…" ---- */
let live = null, liveStopped = true, liveSleep = null;
function startLive() {
  if (!window.EventSource || !me || live) return;
  liveStopped = false;
  live = new EventSource("/api/stream");
  const on = (k, fn) => live.addEventListener(k, (ev) => { try { fn(JSON.parse(ev.data)); } catch { /* semnal invalid */ } });
  on("message", (d) => {
    refreshUnread();
    if (chat && chat.listingId === d.listing_id && chat.withId === d.from) { chat.sig = ""; refreshChat(); }
    else if ($("inboxDialog").open) renderInbox();
  });
  on("msg_status", (d) => { setTicks(d.ids, d.status); if ($("inboxDialog").open) renderInbox(); });
  on("notify", (d) => { notifCount++; paintNotifCount(); toast(d.title, () => { if (d.listing_id) openDetail(d.listing_id); else if (/^rfq/.test(d.kind) && window.openRequests) openRequests(); else openAccount(); }); if (accIsOpen() && accCur === "notif") renderNotifs($("accBody")); });
  on("rfq", () => { if (window.rfqRefresh) rfqRefresh(); });
  on("rfq_msg", () => { if (window.rfqMsg) rfqMsg(); });
  on("presence", (d) => { if (chat && d.uid === chat.withId) setPresence({ online: d.online, last_seen: new Date().toISOString() }); });
  on("typing", (d) => {
    if (!chat || d.from !== chat.withId || (d.listing && d.listing !== chat.listingId)) return;
    const el = $("chatPresence"); el.className = "cv-presence typing"; el.textContent = "scrie…";
    clearTimeout(typTimer); typTimer = setTimeout(() => { el.className = "cv-presence" + (el.dataset.base === "online" ? " online" : ""); el.textContent = el.dataset.base || ""; }, 4000);
  });
  live.addEventListener("error", () => { if (live && live.readyState === 2) { live.close(); live = null; if (!liveStopped) setTimeout(startLive, 5000); } });
}
function stopLive() { liveStopped = true; clearTimeout(liveSleep); if (live) { live.close(); live = null; } }
/* aplicația în fundal > 3 secunde: închidem conexiunea (ceilalți te văd „offline"); la revenire reconectăm și recuperăm ce s-a pierdut */
document.addEventListener("visibilitychange", () => {
  clearTimeout(liveSleep);
  if (document.hidden) { liveSleep = setTimeout(() => { if (document.hidden && live) { live.close(); live = null; } }, 3000); return; }
  if (me && !live && !liveStopped) { startLive(); refreshUnread(); if (chat) { chat.sig = ""; refreshChat(); } }
});
window.addEventListener("pagehide", () => { if (live) { live.close(); live = null; } });
window.addEventListener("pageshow", () => { if (me && !live && !liveStopped) startLive(); });

const sel = { on: false, keys: new Set() };
const tkey = (t) => t.listing_id + ":" + t.other;
function setSel(on) {
  sel.on = on; sel.keys.clear(); $("inboxDialog").classList.toggle("selecting", on);
  $("inboxSelect").textContent = on ? "Anulează" : "Selectează"; $("inboxTitle").textContent = "Mesaje"; $("inboxTrash").hidden = true;
  $("inboxList").querySelectorAll(".cp-row").forEach((r) => r.classList.remove("sel"));
}
function updSel() { $("inboxCount").textContent = sel.keys.size; $("inboxTrash").hidden = !sel.keys.size; $("inboxTitle").textContent = sel.on && sel.keys.size ? sel.keys.size + " selectate" : "Mesaje"; }
function toggleSel(b, t) { const k = tkey(t); if (sel.keys.has(k)) sel.keys.delete(k); else sel.keys.add(k); b.classList.toggle("sel", sel.keys.has(k)); updSel(); }
$("inboxSelect")?.addEventListener("click", () => setSel(!sel.on));
$("inboxDialog")?.addEventListener("close", () => setSel(false));
$("inboxTrash")?.addEventListener("click", async () => {
  const n = sel.keys.size; if (!n) return;
  if (!confirm(n === 1 ? "Ștergi conversația? Dispare doar de la tine." : `Ștergi ${n} conversații? Dispar doar de la tine.`)) return;
  const items = [...sel.keys].map((k) => { const [l, w] = k.split(":"); return { listing_id: +l, with: +w }; });
  try { await api("/api/messages/hide", "POST", { items }); setSel(false); await renderInbox(); refreshUnread(); }
  catch (err) { showMessage("Eroare", errText(err)); }
});
async function renderInbox() {
  const { threads } = await api("/api/messages");
  $("inboxEmpty").hidden = threads.length > 0;
  const alive = new Set(threads.map(tkey)); [...sel.keys].forEach((k) => { if (!alive.has(k)) sel.keys.delete(k); });
  $("inboxList").replaceChildren(...threads.map((t) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "cp-row" + (t.unread ? " unread" : "") + (sel.keys.has(tkey(t)) ? " sel" : "");
    const mid = document.createElement("span"); mid.className = "cp-mid";
    const top = document.createElement("span"); top.className = "cp-top";
    const nm = document.createElement("b"); nm.textContent = t.other_name;
    const tm = document.createElement("time"); tm.textContent = inboxTime(t.created_at); top.append(nm, tm);
    const ti = document.createElement("span"); ti.className = "cp-ti"; ti.textContent = t.title;
    const sm = document.createElement("small"); if (t.mine) sm.append(tickEl(tickState(t)), " "); sm.append(t.attach && !t.body ? (t.attach === "file" ? "📎 Fișier" : "📷 Poză") : t.body);
    mid.append(top, ti, sm); b.append(avatar(t.other_name, t.other), mid);
    if (t.unread) { const d = document.createElement("span"); d.className = "dot"; d.textContent = t.unread; b.appendChild(d); }
    const chk = document.createElement("span"); chk.className = "cp-chk"; chk.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; b.prepend(chk);
    let pressT = 0, longDone = false;
    const cancel = () => clearTimeout(pressT);
    b.addEventListener("pointerdown", () => { longDone = false; cancel(); pressT = setTimeout(() => { longDone = true; if (!sel.on) setSel(true); toggleSel(b, t); navigator.vibrate?.(15); }, 500); });
    ["pointerup", "pointerleave", "pointercancel", "pointermove"].forEach((ev) => b.addEventListener(ev, cancel));
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      if (longDone) { longDone = false; return; }
      if (sel.on) return toggleSel(b, t);
      $("inboxDialog").close(); openChat(t.listing_id, t.other, t.title);
    });
    return b;
  }));
}
async function openInbox() {
  if (!me) return openAuth();
  try { await renderInbox(); open("inboxDialog"); }
  catch (err) { if (err.status === 401) { setMe(null); openAuth(); } else showMessage("Eroare", errText(err)); }
}

async function openChat(listingId, withId, title) {
  chat = { listingId, withId, sig: "", blocked: false, first: true };
  $("chatTitle").textContent = title || "Anunț"; $("chatWith").textContent = "Conversație"; $("chatAv").textContent = "?"; $("chatPop").hidden = true; setPresence(null); fitChat(); $("chatLog").replaceChildren(); $("chatInput").value = ""; show($("chatErr"), "");
  open("chatDialog"); fitChat(); autoGrow();
  await refreshChat();
  clearInterval(chatTimer); chatTimer = setInterval(() => { if (!document.hidden) refreshChat(); }, live ? 20000 : 8000);   // cu conexiune live, interogarea e doar plasă de siguranță
}
async function refreshChat() {
  const c = chat; if (!c) return;
  try {
    const d = await api(`/api/messages/thread?listing=${c.listingId}&with=${c.withId}`);
    if (chat !== c) return;                       // între timp s-a închis sau s-a deschis alta
    c.first = false; c.blocked = d.blocked_by_me;
    $("chatTitle").textContent = d.listing.title; $("chatWith").textContent = d.other.nickname + (c.blocked ? " · blocat" : ""); const av = avatar(d.other.nickname, d.other.id); $("chatAv").textContent = av.textContent; $("chatAv").style.background = av.style.background;
    if (!$("chatPresence").classList.contains("typing")) setPresence(d.presence);
    $("chatBlock").textContent = c.blocked ? "Deblochează utilizatorul" : "Blochează utilizatorul";
    $("chatInput").disabled = $("chatSend").disabled = $("chatAttach").disabled = c.blocked;
    const mine = d.messages.filter((m) => m.mine), last = d.messages.length ? d.messages[d.messages.length - 1].id : 0;
    const sig = `${d.messages.length}:${last}:${mine.filter((m) => m.read).length}:${mine.filter((m) => m.delivered).length}`;
    if (sig !== c.sig) {
      c.sig = sig; const log = $("chatLog"), atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
      const pics = d.messages.filter((m) => m.image_url).map((m) => m.image_url); let lastDay = "";
      const nodes = [];
      for (const m of d.messages) {
        const day = new Date(m.created_at).toDateString();
        if (day !== lastDay) { lastDay = day; const sp = document.createElement("div"); sp.className = "cv-day"; const sb = document.createElement("span"); sb.textContent = dayLabel(m.created_at); sp.appendChild(sb); nodes.push(sp); }
        const el = document.createElement("div"), t = document.createElement("time");
        el.className = "bubble" + (m.mine ? " mine" : "") + (m.image_thumb ? " has-img" : ""); el.dataset.mid = m.id;
        if (m.image_thumb) {
          const pb = document.createElement("button"), im = document.createElement("img"); pb.type = "button"; pb.className = "cv-img"; pb.setAttribute("aria-label", "Deschide poza");
          im.src = m.image_thumb; im.alt = "Poză trimisă"; im.loading = "lazy"; pb.appendChild(im);
          pb.addEventListener("click", () => openLightbox(pics, Math.max(0, pics.indexOf(m.image_url)), "Poză din conversație")); el.appendChild(pb);
        }
        if (m.file_url) {
          const a = document.createElement("a"), ext = ((m.file_name || "").split(".").pop() || "").toLowerCase();
          a.className = "cv-file"; a.href = m.file_url; a.download = m.file_name || "fisier"; a.rel = "noopener";
          const ic = document.createElement("i"); ic.textContent = ext.slice(0, 4).toUpperCase(); ic.dataset.ext = ext;
          const nm = document.createElement("span"), n1 = document.createElement("b"), n2 = document.createElement("small");
          n1.textContent = m.file_name || "Fișier"; n2.textContent = fmtSize(m.file_size) + " · Descarcă"; nm.append(n1, n2); a.append(ic, nm); el.appendChild(a);
        }
        if (m.body) { const tx = document.createElement("span"); tx.className = "cv-txt"; tx.textContent = m.body; el.appendChild(tx); }
        t.textContent = hhmm(m.created_at); t.dateTime = m.created_at;
        if (m.mine) t.append(" ", tickEl(tickState(m)));
        el.appendChild(t); nodes.push(el);
      }
      log.replaceChildren(...nodes);
      if (atEnd || !log.dataset.seen) log.scrollTop = log.scrollHeight; log.dataset.seen = "1";
    }
    refreshUnread();
  } catch (err) {
    if (err.status === 401) { $("chatDialog").close(); setMe(null); openAuth(); }
    else if (c.first) show($("chatErr"), errText(err));
  }
}
let typSent = 0;
/* compozitor: crește cu textul (max 5 rânduri), Enter trimite pe laptop, butonul rotund se aprinde când ai ce trimite */
function autoGrow() {
  const t = $("chatInput"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 128) + "px"; t.style.overflowY = t.scrollHeight > 128 ? "auto" : "hidden";
  $("chatSend").classList.toggle("empty", !t.value.trim());
}
$("chatInput")?.addEventListener("input", autoGrow);
$("chatInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(hover:hover) and (pointer:fine)").matches) { e.preventDefault(); $("chatForm").requestSubmit(); }
});
/* când apare tastatura pe telefon, pagina de chat se micșorează la ce se vede: bara de scris rămâne deasupra tastaturii */
function fitChat() {
  const el = $("chatDialog"), v = window.visualViewport; if (!el) return;
  if (v && el.open && v.height < innerHeight - 80) { el.style.height = v.height + "px"; el.style.top = v.offsetTop + "px"; } else { el.style.height = ""; el.style.top = ""; }
  const log = $("chatLog"); if (el.open && log) log.scrollTop = log.scrollHeight;
}
window.visualViewport?.addEventListener("resize", fitChat);
window.visualViewport?.addEventListener("scroll", fitChat);
$("chatMore")?.addEventListener("click", (e) => { e.stopPropagation(); const p = $("chatPop"); p.hidden = !p.hidden; $("chatMore").setAttribute("aria-expanded", String(!p.hidden)); });
document.addEventListener("click", (e) => { const p = $("chatPop"); if (p && !p.hidden && !e.target.closest(".cp-menu")) p.hidden = true; });
$("chatAd")?.addEventListener("click", () => { if (chat) openDetail(chat.listingId); });
const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((n || 0) / 1024)) + " KB");
const closeAtt = () => { const m = $("chatAttMenu"); if (m) m.hidden = true; $("chatAttach")?.setAttribute("aria-expanded", "false"); };
$("chatAttach")?.addEventListener("click", (e) => { e.stopPropagation(); const m = $("chatAttMenu"); m.hidden = !m.hidden; $("chatAttach").setAttribute("aria-expanded", String(!m.hidden)); });
document.addEventListener("click", (e) => { if (!e.target.closest(".cp-attwrap")) closeAtt(); });
$("chatAttMenu")?.addEventListener("click", (e) => { const b = e.target.closest("button[data-pick]"); if (!b) return; closeAtt(); $("chatFile" + b.dataset.pick).click(); });
async function sendAttach(c, endpoint, headers, body) {
  const r = await fetch(endpoint, { method: "POST", headers, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "upload"), { code: j.error, status: r.status });
  await api("/api/messages", "POST", { listing_id: c.listingId, to: c.withId, image_id: j.image.id, body: "" });
  c.sig = ""; await refreshChat();
}
async function pickUpload(e, isDoc) {
  const c = chat, files = [...e.target.files].slice(0, 5); e.target.value = ""; if (!c || !files.length) return;
  show($("chatErr"), ""); $("chatAttach").disabled = true;
  try {
    for (const f of files) {
      if (isDoc) {
        if (f.size > 5 * 1048576) throw Object.assign(new Error("big"), { code: "FISIER_INVALID" });
        await sendAttach(c, "/api/messages/file", { "content-type": "application/octet-stream", "x-filename": encodeURIComponent(f.name) }, f);
      } else await sendAttach(c, "/api/messages/image", { "content-type": "image/jpeg" }, await compress(f));
    }
  } catch (err) { if (err.status === 401) { $("chatDialog").close(); setMe(null); openAuth(); } else show($("chatErr"), errText(err)); }
  if (chat) $("chatAttach").disabled = chat.blocked;
}
$("chatFileGal")?.addEventListener("change", (e) => pickUpload(e, false));
$("chatFileCam")?.addEventListener("change", (e) => pickUpload(e, false));
$("chatFileDoc")?.addEventListener("change", (e) => pickUpload(e, true));
$("chatDelete")?.addEventListener("click", async () => {
  const c = chat; if (!c) return; $("chatPop").hidden = true;
  if (!confirm("Ștergi conversația? Dispare doar de la tine; celălalt o păstrează.")) return;
  try { await api("/api/messages/hide", "POST", { items: [{ listing_id: c.listingId, with: c.withId }] }); $("chatDialog").close(); refreshUnread(); }
  catch (err) { show($("chatErr"), errText(err)); }
});
$("chatInput")?.addEventListener("input", () => {
  const c = chat; if (!c || !$("chatInput").value.trim() || Date.now() - typSent < 2500) return;
  typSent = Date.now(); api("/api/messages/typing", "POST", { to: c.withId, listing_id: c.listingId }).catch(() => {});
});
$("chatForm")?.addEventListener("submit", async (e) => {
  e.preventDefault(); const c = chat, body = $("chatInput").value.trim(); if (!c || !body) return;
  show($("chatErr"), ""); $("chatSend").disabled = true;
  try { await api("/api/messages", "POST", { listing_id: c.listingId, to: c.withId, body }); $("chatInput").value = ""; autoGrow(); c.sig = ""; await refreshChat(); $("chatInput").focus(); }
  catch (err) { if (err.status === 401) { $("chatDialog").close(); setMe(null); openAuth(); } else show($("chatErr"), errText(err)); }
  if (chat) $("chatSend").disabled = chat.blocked;
});
$("chatBlock")?.addEventListener("click", async () => {
  const c = chat; if (!c) return; $("chatPop").hidden = true;
  try {
    if (c.blocked) await api(`/api/messages/block/${c.withId}`, "DELETE");
    else { if (!confirm("Blochezi acest utilizator? Nu vă veți mai putea scrie.")) return; await api("/api/messages/block", "POST", { user_id: c.withId }); }
    c.sig = ""; await refreshChat();
  } catch (err) { show($("chatErr"), errText(err)); }
});
$("chatDialog")?.addEventListener("close", () => { clearInterval(chatTimer); chat = null; $("chatPop").hidden = true; fitChat(); refreshUnread(); });

/* link din email: /#verifica-email=TOKEN */
(async () => {
  const m = location.hash.match(/^#verifica-email=([\w-]+)$/); if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try { await api("/api/auth/verify-email", "POST", { token: m[1] }); if (me) me.email_verified = true; showMessage("Email confirmat", "Adresa ta de email a fost confirmată. Mulțumim!"); }
  catch { showMessage("Link invalid", "Linkul de confirmare a expirat sau a fost deja folosit."); }
})();

(async () => { try { setMe((await api("/api/me")).user); } catch { /* fără server */ } await loadCats(); loadListings();
  const dm = location.pathname.match(/^\/anunt\/(\d+)/);
  if (dm) openDetail(Number(dm[1]));                       // link direct către un anunț
  if (location.hash === "#cont") {                       // pagină reîncărcată din contul meu
    if (me && history.state && history.state.acc !== undefined) { accShowPage(); accShow(history.state.acc); }
    else history.replaceState(null, "", location.pathname + location.search);
  }
})();


/* ---- recomandări din ce ai văzut (rămân doar în browserul tău) ---- */
const INT_KEY = "omnivo_interest";
function readInterest() { try { return JSON.parse(localStorage.getItem(INT_KEY)) || { cats: {} }; } catch { return { cats: {} }; } }
function trackInterest({ cat, w, id, title }) {
  try {
    const d = readInterest(); d.cats = d.cats || {};
    if (cat) d.cats[cat] = (d.cats[cat] || 0) + w;
    if (id) { d.last = { id, cat, title: String(title || "").slice(0, 120) }; d.seen = [id, ...(d.seen || []).filter((x) => x !== id)].slice(0, 30); }
    localStorage.setItem(INT_KEY, JSON.stringify(d));
  } catch { /* fără stocare */ }
}
const STOP = new Set(["vand", "vind", "de", "si", "cu", "la", "pentru", "nou", "noua", "folosit", "second", "hand"]);
/* Starea pe care o „ține minte": dacă te-ai uitat la mașini avariate, recomandările rămân avariate (potrivire pe rădăcina cuvântului din titlu). */
const STATES = { avariat: "avariate", accidentat: "accidentate", defect: "defecte", dezmembr: "pentru dezmembrat", reparat: "reparate", impecabil: "impecabile", sigilat: "sigilate" };
async function loadForYou() {
  const rec = $("vazute"), sec = $("pentruTine"); if (!rec || !sec) return;
  const d = readInterest(), seenIds = (d.seen || []).slice(0, 12);
  /* 1. „Văzute recent": anunțurile deschise, aduse proaspăt (cele vândute sau expirate dispar singure) */
  let viewed = [];
  if (seenIds.length) {
    try {
      const r = await api("/api/listings?" + new URLSearchParams({ ids: seenIds.join(","), limit: 48 }));
      const byId = new Map(r.listings.map((l) => [l.id, l]));
      viewed = seenIds.map((id) => byId.get(id)).filter(Boolean);
    } catch { /* fără server */ }
  }
  if (viewed.length) { $("recent").replaceChildren(...viewed.map(card)); rec.hidden = false; } else rec.hidden = true;
  /* 2. „Recomandate": categoria dominantă din ultimele vizionări, cu aceeași stare și marcă */
  const recent = viewed.slice(0, 5), score = {};
  recent.forEach((l, i) => { score[l.category_slug] = (score[l.category_slug] || 0) + (5 - i); });
  const top = Object.entries(score).sort((x, y) => y[1] - x[1])[0] || Object.entries(d.cats || {}).sort((x, y) => y[1] - x[1])[0];
  if (!top) { sec.hidden = true; return; }
  const cat = top[0], inCat = recent.filter((l) => l.category_slug === cat);
  const counts = {};
  for (const l of inCat) { const t = fold(l.title); for (const k of Object.keys(STATES)) if (t.includes(k)) counts[k] = (counts[k] || 0) + 1; }
  const best = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
  const state = best && best[1] * 2 >= inCat.length ? best[0] : "";           // în cel puțin jumătate din ce ai văzut
  const brand = inCat.length ? fold(inCat[0].title).split(/[^a-z0-9]+/).find((x) => x.length >= 3 && !/^\d+$/.test(x) && !STOP.has(x) && !(x in STATES) && !Object.keys(STATES).some((k) => x.startsWith(k))) || "" : "";
  const get = (q, limit) => api("/api/listings?" + new URLSearchParams({ category: cat, ...(q ? { q } : {}), limit })).then((r) => r.listings).catch(() => []);
  const calls = [];
  if (state && brand) calls.push(get(brand + " " + state, 8));
  if (state) calls.push(get(state, 8));
  if (brand) calls.push(get(brand, 8));
  calls.push(get("", 12));                                                    // „de toate", ca să nu rămână gol
  try {
    const res = await Promise.all(calls), have = new Set(viewed.map((l) => l.id)), out = [];
    for (const r of res) for (const l of r) if (!have.has(l.id)) { have.add(l.id); out.push(l); }
    const list = out.slice(0, 8);
    if (!list.length) { sec.hidden = true; return; }
    const name = (inCat[0] && inCat[0].category) || list[0].category || "";
    $("forYouTitle").textContent = `Anunțuri noi în ${name}${state ? " " + STATES[state] : ""}`;
    $("forYou").replaceChildren(...list.map(card)); sec.hidden = false;
  } catch { sec.hidden = true; }
}
const clearInterest = () => { try { localStorage.removeItem(INT_KEY); } catch {} $("pentruTine").hidden = true; $("vazute").hidden = true; };
$("forYouClear")?.addEventListener("click", clearInterest);
$("recentClear")?.addEventListener("click", clearInterest);
loadForYou();


/* ---- contact: telefon + WhatsApp (ca în autoparts) ---- */
function fmtPhone(p) {
  const raw = String(p || "").trim(); let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+40")) d = "0" + d.slice(3); else if (d.startsWith("0040")) d = "0" + d.slice(4);
  return /^0\d{9}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : raw;
}
function waLink(p) {
  let d = String(p || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1); else if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "40" + d.slice(1);
  return "https://wa.me/" + d;
}
function renderSellContact() {
  const has = !!(me && me.phone);
  $("sellContactHas").hidden = !has; $("sellContactNew").hidden = has;
  if (has) { $("sellPhoneShown").textContent = fmtPhone(me.phone); $("sellShowPhone").checked = !!me.show_phone; $("sellWa").checked = !!me.whatsapp; }
  else { $("sellPhoneNew").value = ""; $("sellWaNew").checked = true; }
}
/* salvează în cont ce ai ales în formularul de anunț (telefon nou, afișare, WhatsApp) */
async function applySellContact() {
  if (!me) return;
  let body = null;
  if (me.phone) {
    const show = $("sellShowPhone").checked, wa = $("sellWa").checked;
    if (show !== !!me.show_phone || wa !== !!me.whatsapp) body = { show_phone: show, whatsapp: wa };
  } else {
    const p = $("sellPhoneNew").value.trim();
    if (p) body = { phone: p, show_phone: true, whatsapp: $("sellWaNew").checked };
  }
  if (body) me = (await api("/api/auth/me", "PATCH", body)).user;
}

/* ---- pagina de postare: card de categorie, „Stare” ca butoane, contor titlu, ciornă salvată ---- */
function catPath() { const o = $("sellCat").selectedOptions[0]; return o && o.value ? `${o.parentElement.label || ""} › ${o.textContent}` : ""; }
function syncCatCard() { $("sellCatText").textContent = catPath() || "Alege categoria"; }
$("sellCatEdit")?.addEventListener("click", () => { $("sellCat").hidden = !$("sellCat").hidden; });
$("sellCat")?.addEventListener("change", () => { syncCatCard(); $("sellCat").hidden = true; });
function syncSeg() { document.querySelectorAll("#sellSeg button").forEach((b) => b.classList.toggle("on", b.dataset.v === $("sellCond").value)); }
$("sellSeg")?.replaceChildren(...[["folosit", "Folosit"], ["nou", "Nou"]].map(([v, t]) => {
  const b = document.createElement("button"); b.type = "button"; b.dataset.v = v; b.textContent = t;
  b.addEventListener("click", () => { $("sellCond").value = v; syncSeg(); }); return b;
}));
const countTitle = () => { $("sellCount").textContent = `${$("sellTitle").value.length}/120`; };
$("sellTitle")?.addEventListener("input", countTitle);

const DRAFT = "omnivoDraft", DRAFT_FIELDS = ["title", "price", "currency", "condition", "county", "city", "address", "description"];
let draftTimer;
$("sellForm")?.addEventListener("input", () => {
  if (editing) return; clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      const f = new FormData($("sellForm")), d = {}; DRAFT_FIELDS.forEach((k) => { d[k] = f.get(k) || ""; }); d.cat = $("sellCat").value;
      if (d.title || d.description) localStorage.setItem(DRAFT, JSON.stringify(d));
    } catch { /* browser fără stocare */ }
  }, 600);
});
function restoreDraft() {
  if (editing || $("sellTitle").value) return;
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || "null"); if (!d) return;
    DRAFT_FIELDS.forEach((k) => { const el = $("sellForm").elements[k]; if (el && d[k]) el.value = d[k]; });
    if (d.cat) { $("sellCat").value = d.cat; catManual = true; renderAttrs(); }
    show($("sellAuto"), "Am restaurat ciorna ta. Anunțul nu s-a pierdut.");
  } catch { /* ciornă ilizibilă */ }
}
const syncSell = () => { countTitle(); syncCatCard(); syncSeg(); };
new MutationObserver(() => { if ($("sellDialog").open) { restoreDraft(); syncSell(); setTimeout(syncSell, 300); } }).observe($("sellDialog"), { attributes: true, attributeFilter: ["open"] });
