const $ = (id) => document.getElementById(id);
const COUNTIES = ["Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brașov","Brăila","București","Buzău","Caraș-Severin","Călărași","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Giurgiu","Gorj","Harghita","Hunedoara","Ialomița","Iași","Ilfov","Maramureș","Mehedinți","Mureș","Neamț","Olt","Prahova","Satu Mare","Sălaj","Sibiu","Suceava","Teleorman","Timiș","Tulcea","Vaslui","Vâlcea","Vrancea"];
const ERR = {
  INVALID_LOGIN: "Email, nickname sau parolă greșite.", LOGIN_RATE_LIMIT: "Prea multe încercări. Mai încearcă peste câteva minute.", CONT_BLOCAT: "Contul este blocat.",
  EMAIL_EXISTS: "Există deja un cont cu acest email.", NICKNAME_EXISTS: "Nickname-ul este luat.", NICKNAME_INVALID: "Nickname invalid (3-24 caractere: litere, cifre, . _ -).",
  PAROLA_SLABA: "Parola e prea slabă: folosește minim 8 caractere, nu o parolă comună.", TERMENI_NEACCEPTATI: "Trebuie să accepți termenii.", DATE_INVALIDE: "Completează corect toate câmpurile.",
  TITLU_INVALID: "Titlul trebuie să aibă 5-120 de caractere.", PRET_INVALID: "Preț invalid.", CATEGORIE_INVALIDA: "Alege o categorie.", ATRIBUT_LIPSA: "Completează câmpul obligatoriu", ATRIBUT_INVALID: "Valoare invalidă pentru",
  PREA_MULTE_ANUNTURI: "Ai postat prea multe anunțuri într-o oră.", EMAIL_NECONFIRMAT: "Confirmă-ți emailul înainte să publici.", RATE_LIMIT: "Prea multe cereri, încearcă mai târziu.",
  PREA_MULTE_POZE: "Maximum 8 poze per anunț.", SPATIU_POZE_DEPASIT: "Ai depășit spațiul pentru poze.", POZA_INVALIDA: "Poza nu a putut fi citită. Încearcă JPG sau PNG.", STORAGE_EROARE: "Pozele nu se pot salva acum.",
  EMAIL_INVALID: "Scrie o adresă de email de forma nume@domeniu.", TELEFON_INVALID: "Număr de telefon invalid.",
  MESAJ_INVALID: "Scrie un mesaj de maximum 2000 de caractere.", PREA_MULTE_MESAJE: "Ai trimis prea multe mesaje. Încearcă mai târziu.", BLOCAT: "Nu poți trimite mesaje acestui utilizator.",
  BLOCAT_DE_TINE: "Ai blocat acest utilizator. Deblochează-l ca să-i scrii.", INTERZIS: "Nu ai voie să faci asta.", NEGASIT: "Nu am găsit ce căutai.", NU_SE_POATE_BLOCA: "Acest cont nu poate fi blocat."
};
let catManual = false;
let me = null, cats = [], iconOf = {}, mode = "public", filter = {};
let editing = null, existing = [];            // editarea unui anunț: id-ul și pozele deja salvate
let chat = null, chatTimer = null, unreadTimer = null, unread = 0;

async function api(url, method = "GET", body) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch { /* răspuns fără JSON */ }
  if (!r.ok) throw Object.assign(new Error(d.error || "EROARE"), { code: d.error, field: d.field, reason: d.reason, status: r.status });
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
[["sellClose", "sellDialog"], ["authClose", "authDialog"], ["accClose", "accountDialog"], ["detClose", "detailDialog"], ["inboxClose", "inboxDialog"], ["chatClose", "chatDialog"]].forEach(([b, d]) => $(b)?.addEventListener("click", () => $(d).close()));
$("menuButton")?.addEventListener("click", () => $("mainMenu").classList.toggle("open"));

/* ---- pictograme ---- */
document.querySelectorAll("[data-ic]").forEach((el) => { el.innerHTML = icon(el.dataset.ic, el.classList.contains("cat-ic") ? 44 : 24); });

/* ---- categorii, sertar, formular ---- */
function setDrawer(on) { $("drawer").hidden = !on; $("scrim").hidden = !on; document.body.style.overflow = on ? "hidden" : ""; }
function pickCategory(slug, name) { trackInterest({ cat: slug, w: 2 }); filter = { category: slug }; mode = "public"; $("listTitle").textContent = name || "Anunțuri recente"; loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); }

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
}
$("bnCats")?.addEventListener("click", () => { setDrawer(true); if (!cats.length) loadCats(); });
$("drawerClose")?.addEventListener("click", () => setDrawer(false));
$("scrim")?.addEventListener("click", () => setDrawer(false));

$("sellCounty").innerHTML = COUNTIES.map((c) => `<option>${c}</option>`).join("");
function renderAttrs() {
  const box = $("sellAttrs"); box.innerHTML = "";
  const id = Number($("sellCat").value); let defs = [];
  for (const c of cats) for (const k of c.children.length ? c.children : [c]) if (k.id === id) defs = [...c.attributes, ...(k !== c ? k.attributes : [])];
  for (const d of defs) {
    const l = document.createElement("label"); l.textContent = d.label + (d.required ? " *" : ""); l.htmlFor = "at-" + d.key; box.appendChild(l);
    let f;
    if (d.type === "select") { f = document.createElement("select"); f.innerHTML = '<option value="">—</option>' + d.options.map((o) => `<option>${o}</option>`).join(""); }
    else { f = document.createElement("input"); f.type = d.type === "number" ? "number" : "text"; if (d.type === "number") f.inputMode = "numeric"; }
    f.id = "at-" + d.key; f.dataset.attr = d.key; box.appendChild(f);
  }
}
$("sellCat")?.addEventListener("change", () => { catManual = true; $("sellAuto").hidden = true; renderAttrs(); });

/* Categoria se alege singură din cuvintele titlului (ca în autoparts); dacă o schimbi tu, nu mai intervine. */
function setCatAuto(s) {
  $("sellCat").value = s.id; renderAttrs();
  const n = $("sellAuto"); n.textContent = `✨ Categorie aleasă automat: ${s.parent} › ${s.name}. Poți schimba dacă nu e corectă.`; n.hidden = false;
}
let timer;
$("sellTitle")?.addEventListener("input", (e) => {
  clearTimeout(timer); const t = e.target.value.trim();
  if (t.length < 3) { $("sellChips").innerHTML = ""; $("sellAuto").hidden = true; return; }
  timer = setTimeout(async () => {
    try {
      const { suggestions } = await api("/api/categories/suggest?title=" + encodeURIComponent(t));
      $("sellChips").innerHTML = "";
      if (!suggestions.length) { if (!catManual) $("sellAuto").hidden = true; return; }
      if (!catManual && !editing) setCatAuto(suggestions[0]);
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
      county: f.get("county"), description: f.get("description"), negotiable: f.get("negotiable") === "on", attributes
    };
    const wasEdit = !!editing; let id, note;
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
    showMessage(wasEdit ? "Anunț actualizat" : "Anunț trimis", failed ? `${note} ${failed} poze nu s-au încărcat.` : note);
    if (!wasEdit) { mode = "public"; filter = {}; }
    loadListings();
  } catch (err) { if (err.status === 401) { $("sellDialog").close(); openAuth(); } else show($("sellErr"), errText(err)); }
  $("sellSubmit").disabled = false;
});

/* ---- editarea unui anunț existent: același formular, precompletat ---- */
function resetSell() {
  editing = null; existing = []; catManual = false; $("sellAuto").hidden = true;
  $("sellHead").textContent = "Adaugă un anunț"; $("sellSubmit").textContent = "Publică anunțul";
  photos.forEach((p) => URL.revokeObjectURL(p.url)); photos.length = 0;
  $("sellForm").reset(); $("sellAttrs").innerHTML = ""; $("sellChips").innerHTML = ""; show($("sellErr"), "");
  renderExisting(); renderPrev();
}
$("sellDialog")?.addEventListener("close", () => { catManual = false; $("sellAuto").hidden = true; if (editing) resetSell(); });
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
async function openEdit(l) {
  if (!l.edit) return;
  if (!cats.length) await loadCats();
  resetSell();
  editing = l.id; existing = l.edit.images.slice();
  $("sellHead").textContent = "Editează anunțul"; $("sellSubmit").textContent = "Salvează modificările";
  $("sellTitle").value = l.title; $("sellCat").value = l.edit.category_id; renderAttrs();
  for (const [k, v] of Object.entries(l.edit.attributes)) { const el = document.querySelector(`#sellAttrs [data-attr="${CSS.escape(k)}"]`); if (el) el.value = v; }
  $("sellPrice").value = l.price == null ? "" : Number(l.price); $("sellCur").value = l.currency === "EUR" ? "EUR" : "RON";
  if (l.condition) $("sellCond").value = l.condition;
  if (l.county) $("sellCounty").value = l.county;
  $("sellDesc").value = l.description || ""; $("sellForm").elements.negotiable.checked = !!l.negotiable;
  renderExisting(); renderPrev(); open("sellDialog");
}
function openSell() { if (!me) return openAuth("Ca să adaugi un anunț, intră în cont sau creează unul nou."); if (editing) resetSell(); if (!cats.length) loadCats(); open("sellDialog"); $("sellTitle").focus(); }
["sellButton", "sellButtonBottom", "bnSell"].forEach((i) => $(i)?.addEventListener("click", openSell));

/* ---- cont ---- */
function openAuth() { open("authDialog"); }
const tab = (reg) => { $("loginForm").hidden = reg; $("regForm").hidden = !reg; $("tabLogin").classList.toggle("on", !reg); $("tabReg").classList.toggle("on", reg); };
$("tabLogin").addEventListener("click", () => tab(false)); $("tabReg").addEventListener("click", () => tab(true));
function renderUnread() { $("loginButton").textContent = me ? me.nickname + (unread ? ` (${unread})` : "") : "Contul meu"; $("accMsgsN").textContent = unread ? `(${unread})` : ""; const bd = $("bnBadge"); if (bd) { bd.hidden = !unread; bd.textContent = unread > 9 ? "9+" : unread; } }
async function refreshUnread() { if (!me) return; try { unread = (await api("/api/messages/unread")).unread; renderUnread(); } catch { /* insigna rămâne cum era */ } }
function setMe(u) {
  me = u; unread = 0; renderUnread(); clearInterval(unreadTimer);
  if (u) { refreshUnread(); unreadTimer = setInterval(() => { if (!document.hidden) refreshUnread(); }, 30000); }
}
async function authSubmit(e, url, body, errEl) {
  e.preventDefault(); show(errEl, "");
  try { setMe((await api(url, "POST", body)).user); $("authDialog").close(); e.target.reset(); } catch (err) { show(errEl, errText(err)); }
}
$("loginForm").addEventListener("submit", (e) => authSubmit(e, "/api/auth/login", { identifier: $("lgId").value, password: $("lgPw").value }, $("lgErr")));
$("regForm").addEventListener("submit", (e) => authSubmit(e, "/api/auth/register", { name: $("rgName").value, nickname: $("rgNick").value, email: $("rgEmail").value, password: $("rgPw").value, accept_terms: $("rgTerms").checked }, $("rgErr")));
function openAccount() {
  if (!me) return openAuth();
  refreshUnread(); $("accName").textContent = me.nickname; $("accMod").hidden = !["admin", "moderator"].includes(me.role); open("accountDialog");
}
["loginButton", "bnAccount"].forEach((i) => $(i)?.addEventListener("click", openAccount));
$("accOut").addEventListener("click", async () => { await api("/api/auth/logout", "POST").catch(() => {}); setMe(null); $("accountDialog").close(); mode = "public"; loadListings(); });
$("accMine").addEventListener("click", () => { mode = "mine"; $("listTitle").textContent = "Anunțurile mele"; $("accountDialog").close(); loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); });
$("accMod").addEventListener("click", () => { mode = "admin"; $("listTitle").textContent = "De aprobat"; $("accountDialog").close(); loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); });

/* ---- lista de anunțuri ---- */
function card(l) {
  const a = document.createElement("article"); a.className = "product"; a.tabIndex = 0;
  const im = document.createElement("div"); im.className = "product-image";
  if (l.thumb) { const g = document.createElement("img"); g.src = l.thumb; g.alt = l.title; g.loading = "lazy"; im.appendChild(g); } else im.innerHTML = icon(iconOf[l.category_slug] || "alt", 60);
  const info = document.createElement("div"); info.className = "product-info";
  const h = document.createElement("h3"); h.textContent = l.title;
  const p = document.createElement("p"); p.textContent = [l.county, l.category].filter(Boolean).join(" · ");
  const s = document.createElement("strong"); s.textContent = price(l);
  info.append(h, p, s); a.append(im, info);
  if (mode !== "public" && l.status !== "approved") { const t = document.createElement("span"); t.className = "tag"; t.textContent = l.status; info.appendChild(t); }
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
async function openDetail(id) {
  try {
    const { listing: l } = await api("/api/listings/" + id);
    $("detTitle").textContent = l.title; $("detPrice").textContent = price(l) + (l.negotiable ? " · negociabil" : "");
    $("detMeta").textContent = [l.parent_category, l.category, l.condition, [l.city, l.county].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    $("detAttrs").replaceChildren(...l.attributes.map((a) => { const li = document.createElement("li"); li.textContent = `${a.label}: ${a.value}`; return li; }));
    $("detDesc").textContent = l.description;
    $("detGallery").replaceChildren(...l.images.map((u) => { const g = document.createElement("img"); g.src = u; g.alt = l.title; g.loading = "lazy"; return g; }));
    const s = $("detSeller"); s.textContent = `Vânzător: ${l.seller || "—"}`;
    if (l.phone) { const a = document.createElement("a"); a.href = "tel:" + l.phone.replace(/[^+\d]/g, ""); a.textContent = ` · ${l.phone}`; s.appendChild(a); }
    const act = $("detActions"); act.replaceChildren();
    const add = (txt, fn, alt) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; if (alt) b.className = "alt"; b.addEventListener("click", () => { $("detailDialog").close(); fn(); }); act.appendChild(b); };
    if (l.mine) { if (l.status !== "blocked") add("Editează anunțul", () => openEdit(l)); }
    else if (l.seller_id && ["approved", "sold"].includes(l.status)) add("Trimite mesaj vânzătorului", () => (me ? openChat(l.id, l.seller_id, l.title) : openAuth()));
    open("detailDialog");
  } catch (err) { showMessage("Eroare", errText(err)); }
}

/* ---- căutare ---- */
$("searchForm")?.addEventListener("submit", (e) => { e.preventDefault(); filter = { q: $("searchInput").value.trim() }; mode = "public"; $("listTitle").textContent = filter.q ? `Rezultate pentru „${filter.q}”` : "Anunțuri recente"; loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); });
$("searchInput")?.addEventListener("input", () => { if (!$("searchInput").value.trim() && filter.q) { filter = {}; loadListings(); } });
$("bnSearch")?.addEventListener("click", () => { window.scrollTo({ top: 0, behavior: "smooth" }); $("searchInput").focus(); });

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
async function openInbox() {
  if (!me) return openAuth();
  try {
    const { threads } = await api("/api/messages");
    $("inboxEmpty").hidden = threads.length > 0;
    $("inboxList").replaceChildren(...threads.map((t) => {
      const b = document.createElement("button"), h = document.createElement("b"), sm = document.createElement("small");
      b.type = "button"; if (t.unread) b.className = "unread";
      h.textContent = `${t.other_name} · ${t.title}`;
      if (t.unread) { const d = document.createElement("span"); d.className = "dot"; d.textContent = t.unread; h.prepend(d); }
      sm.textContent = (t.mine ? "Tu: " : "") + t.body; b.append(h, sm);
      b.addEventListener("click", () => { $("inboxDialog").close(); openChat(t.listing_id, t.other, t.title); });
      return b;
    }));
    open("inboxDialog");
  } catch (err) { if (err.status === 401) { setMe(null); openAuth(); } else showMessage("Eroare", errText(err)); }
}
$("accMsgs")?.addEventListener("click", () => { $("accountDialog").close(); openInbox(); });

async function openChat(listingId, withId, title) {
  chat = { listingId, withId, sig: "", blocked: false, first: true };
  $("chatTitle").textContent = title || "Conversație"; $("chatWith").textContent = ""; $("chatLog").replaceChildren(); $("chatInput").value = ""; show($("chatErr"), "");
  open("chatDialog"); $("chatInput").focus();
  await refreshChat();
  clearInterval(chatTimer); chatTimer = setInterval(() => { if (!document.hidden) refreshChat(); }, 8000);
}
async function refreshChat() {
  const c = chat; if (!c) return;
  try {
    const d = await api(`/api/messages/thread?listing=${c.listingId}&with=${c.withId}`);
    if (chat !== c) return;                       // între timp s-a închis sau s-a deschis alta
    c.first = false; c.blocked = d.blocked_by_me;
    $("chatTitle").textContent = d.listing.title; $("chatWith").textContent = `Cu ${d.other.nickname}` + (c.blocked ? " · blocat de tine" : "");
    $("chatBlock").textContent = c.blocked ? "Deblochează utilizatorul" : "Blochează utilizatorul";
    $("chatInput").disabled = $("chatSend").disabled = c.blocked;
    const sig = d.messages.length + ":" + (d.messages.length ? d.messages[d.messages.length - 1].id : 0);
    if (sig !== c.sig) {
      c.sig = sig; const log = $("chatLog"), atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
      log.replaceChildren(...d.messages.map((m) => {
        const el = document.createElement("div"), t = document.createElement("time");
        el.className = "bubble" + (m.mine ? " mine" : ""); el.append(m.body); t.textContent = when(m.created_at); t.dateTime = m.created_at; el.appendChild(t); return el;
      }));
      if (atEnd || !log.dataset.seen) log.scrollTop = log.scrollHeight; log.dataset.seen = "1";
    }
    refreshUnread();
  } catch (err) {
    if (err.status === 401) { $("chatDialog").close(); setMe(null); openAuth(); }
    else if (c.first) show($("chatErr"), errText(err));
  }
}
$("chatForm")?.addEventListener("submit", async (e) => {
  e.preventDefault(); const c = chat, body = $("chatInput").value.trim(); if (!c || !body) return;
  show($("chatErr"), ""); $("chatSend").disabled = true;
  try { await api("/api/messages", "POST", { listing_id: c.listingId, to: c.withId, body }); $("chatInput").value = ""; c.sig = ""; await refreshChat(); }
  catch (err) { if (err.status === 401) { $("chatDialog").close(); setMe(null); openAuth(); } else show($("chatErr"), errText(err)); }
  if (chat) $("chatSend").disabled = chat.blocked;
});
$("chatBlock")?.addEventListener("click", async () => {
  const c = chat; if (!c) return;
  try {
    if (c.blocked) await api(`/api/messages/block/${c.withId}`, "DELETE");
    else { if (!confirm("Blochezi acest utilizator? Nu vă veți mai putea scrie.")) return; await api("/api/messages/block", "POST", { user_id: c.withId }); }
    c.sig = ""; await refreshChat();
  } catch (err) { show($("chatErr"), errText(err)); }
});
$("chatDialog")?.addEventListener("close", () => { clearInterval(chatTimer); chat = null; refreshUnread(); });

/* link din email: /#verifica-email=TOKEN */
(async () => {
  const m = location.hash.match(/^#verifica-email=([\w-]+)$/); if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try { await api("/api/auth/verify-email", "POST", { token: m[1] }); if (me) me.email_verified = true; showMessage("Email confirmat", "Adresa ta de email a fost confirmată. Mulțumim!"); }
  catch { showMessage("Link invalid", "Linkul de confirmare a expirat sau a fost deja folosit."); }
})();

(async () => { try { setMe((await api("/api/me")).user); } catch { /* fără server */ } await loadCats(); loadListings(); })();


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
async function loadForYou() {
  const sec = $("pentruTine"); if (!sec) return;
  const d = readInterest(), top = Object.entries(d.cats || {}).sort((a, b) => b[1] - a[1])[0];
  if (!top) { sec.hidden = true; return; }
  const cat = top[0], seen = new Set(d.seen || []);
  const calls = [];
  const brand = d.last && d.last.cat === cat ? fold(d.last.title).split(/[^a-z0-9]+/).find((x) => x.length >= 3 && !/^\d+$/.test(x) && !STOP.has(x)) : "";
  if (brand) calls.push(api("/api/listings?" + new URLSearchParams({ category: cat, q: brand, sort: "price_asc", limit: 8 })));
  calls.push(api("/api/listings?" + new URLSearchParams({ category: cat, sort: "price_asc", limit: 12 })));
  try {
    const res = await Promise.all(calls);
    const out = [], ids = new Set();
    for (const r of res) for (const l of r.listings) if (!ids.has(l.id) && !(d.last && l.id === d.last.id)) { ids.add(l.id); out.push(l); }
    const list = out.filter((l) => !seen.has(l.id)).concat(out.filter((l) => seen.has(l.id))).slice(0, 6);
    if (!list.length) { sec.hidden = true; return; }
    $("forYouTitle").textContent = `Recomandate pentru tine · ${list[0].category || ""}${brand ? " · " + brand : ""}`;
    $("forYou").replaceChildren(...list.map(card)); sec.hidden = false;
  } catch { sec.hidden = true; }
}
$("forYouClear")?.addEventListener("click", () => { try { localStorage.removeItem(INT_KEY); } catch {} $("pentruTine").hidden = true; });
loadForYou();
