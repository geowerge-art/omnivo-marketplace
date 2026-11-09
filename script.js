const $ = (id) => document.getElementById(id);
const COUNTIES = ["Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brașov","Brăila","București","Buzău","Caraș-Severin","Călărași","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Giurgiu","Gorj","Harghita","Hunedoara","Ialomița","Iași","Ilfov","Maramureș","Mehedinți","Mureș","Neamț","Olt","Prahova","Satu Mare","Sălaj","Sibiu","Suceava","Teleorman","Timiș","Tulcea","Vaslui","Vâlcea","Vrancea"];
const ERR = {
  INVALID_LOGIN: "Email, nickname sau parolă greșite.", LOGIN_RATE_LIMIT: "Prea multe încercări. Mai încearcă peste câteva minute.", CONT_BLOCAT: "Contul este blocat.",
  EMAIL_EXISTS: "Există deja un cont cu acest email.", NICKNAME_EXISTS: "Nickname-ul este luat.", NICKNAME_INVALID: "Nickname invalid (3-24 caractere: litere, cifre, . _ -).",
  PAROLA_SLABA: "Parola e prea slabă: folosește minim 8 caractere, nu o parolă comună.", TERMENI_NEACCEPTATI: "Trebuie să accepți termenii.", DATE_INVALIDE: "Completează corect toate câmpurile.",
  TITLU_INVALID: "Titlul trebuie să aibă 5-120 de caractere.", PRET_INVALID: "Preț invalid.", CATEGORIE_INVALIDA: "Alege o categorie.", ATRIBUT_LIPSA: "Completează câmpul obligatoriu", ATRIBUT_INVALID: "Valoare invalidă pentru",
  PREA_MULTE_ANUNTURI: "Ai postat prea multe anunțuri într-o oră.", EMAIL_NECONFIRMAT: "Confirmă-ți emailul înainte să publici.", RATE_LIMIT: "Prea multe cereri, încearcă mai târziu.",
  PREA_MULTE_POZE: "Maximum 8 poze per anunț.", SPATIU_POZE_DEPASIT: "Ai depășit spațiul pentru poze.", POZA_INVALIDA: "Poza nu a putut fi citită. Încearcă JPG sau PNG.", STORAGE_EROARE: "Pozele nu se pot salva acum."
};
let me = null, cats = [], iconOf = {}, mode = "public", filter = {};

async function api(url, method = "GET", body) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch { /* răspuns fără JSON */ }
  if (!r.ok) throw Object.assign(new Error(d.error || "EROARE"), { code: d.error, field: d.field, status: r.status });
  return d;
}
const errText = (e) => (ERR[e.code] ? ERR[e.code] + (e.field ? ` „${e.field}”.` : "") : e.status === 503 ? "Serviciul nu e disponibil acum." : "A apărut o eroare. Încearcă din nou.");
const price = (l) => (l.price == null ? "Preț la cerere" : `${Number(l.price).toLocaleString("ro-RO")} ${l.currency === "EUR" ? "€" : "lei"}`);
const open = (id) => { const d = $(id); if (!d.open) d.showModal(); };
const fold = (t) => t.toLocaleLowerCase("ro").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const show = (el, msg) => { el.textContent = msg || ""; el.hidden = !msg; };

function showMessage(title, message) {
  $("dialogTitle").textContent = title; $("dialogText").textContent = message; open("messageDialog");
}
$("closeDialog")?.addEventListener("click", () => $("messageDialog").close());
[["sellClose", "sellDialog"], ["authClose", "authDialog"], ["accClose", "accountDialog"], ["detClose", "detailDialog"]].forEach(([b, d]) => $(b)?.addEventListener("click", () => $(d).close()));
$("menuButton")?.addEventListener("click", () => $("mainMenu").classList.toggle("open"));

/* ---- categorii, sertar, formular ---- */
function setDrawer(on) { $("drawer").hidden = !on; $("scrim").hidden = !on; document.body.style.overflow = on ? "hidden" : ""; }
function pickCategory(slug, name) { filter = { category: slug }; mode = "public"; $("listTitle").textContent = name || "Anunțuri recente"; loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); }

async function loadCats() {
  try { cats = (await api("/api/categories")).categories; } catch { return; }
  const sel = $("sellCat"), list = $("drawerList"); list.innerHTML = "";
  for (const c of cats) {
    iconOf[c.slug] = c.icon;
    const kids = c.children.length ? c.children : [];
    const li = document.createElement("li"), b = document.createElement("b");
    b.textContent = `${c.icon || ""} ${c.name}`; b.style.cursor = "pointer";
    b.addEventListener("click", () => { setDrawer(false); pickCategory(c.slug, c.name); }); li.appendChild(b);
    const og = document.createElement("optgroup"); og.label = c.name;
    for (const k of kids.length ? kids : [c]) {
      iconOf[k.slug] = c.icon;
      if (kids.length) { const a = document.createElement("a"); a.href = "#anunturi"; a.textContent = k.name; a.addEventListener("click", () => { setDrawer(false); pickCategory(k.slug, k.name); }); li.appendChild(a); }
      const o = document.createElement("option"); o.value = k.id; o.textContent = k.name; og.appendChild(o);
    }
    sel.appendChild(og); list.appendChild(li);
  }
  document.querySelectorAll("#categorii .categories a").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault(); const n = a.textContent.trim().replace(/^\S+\s/, ""); const c = cats.find((x) => fold(x.name) === fold(n)); if (c) pickCategory(c.slug, c.name);
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
$("sellCat")?.addEventListener("change", renderAttrs);

let timer;
$("sellTitle")?.addEventListener("input", (e) => {
  clearTimeout(timer); const t = e.target.value.trim();
  if (t.length < 3) { $("sellChips").innerHTML = ""; return; }
  timer = setTimeout(async () => {
    try {
      const { suggestions } = await api("/api/categories/suggest?title=" + encodeURIComponent(t));
      $("sellChips").innerHTML = "";
      for (const s of suggestions) {
        const b = document.createElement("button"); b.type = "button"; b.textContent = `${s.parent} › ${s.name}`;
        b.addEventListener("click", () => { $("sellCat").value = s.id; renderAttrs(); $("sellChips").innerHTML = ""; });
        $("sellChips").appendChild(b);
      }
    } catch { /* fără sugestii */ }
  }, 350);
});

$("sellForm")?.addEventListener("submit", async (e) => {
  e.preventDefault(); show($("sellErr"), "");
  const f = new FormData(e.target), attributes = {};
  document.querySelectorAll("#sellAttrs [data-attr]").forEach((el) => { attributes[el.dataset.attr] = el.value; });
  $("sellSubmit").disabled = true;
  try {
    const created = await api("/api/listings", "POST", {
      title: f.get("title"), category_id: f.get("category_id"), price: f.get("price"), currency: f.get("currency"), condition: f.get("condition"),
      county: f.get("county"), description: f.get("description"), negotiable: f.get("negotiable") === "on", attributes
    });
    let failed = 0;
    for (let i = 0; i < photos.length; i++) {
      show($("sellProg"), `Se încarcă poza ${i + 1} din ${photos.length}…`);
      try { await uploadPhoto(created.listing.id, photos[i].blob); } catch { failed++; }
    }
    show($("sellProg"), ""); photos.length = 0; renderPrev();
    e.target.reset(); $("sellAttrs").innerHTML = ""; $("sellDialog").close();
    showMessage("Anunț trimis", failed ? `Anunțul e salvat, dar ${failed} poze nu s-au încărcat.` : "Anunțul tău a fost salvat. Dacă nu apare imediat, așteaptă aprobarea.");
    mode = "public"; filter = {}; loadListings();
  } catch (err) { if (err.status === 401) { $("sellDialog").close(); openAuth(); } else show($("sellErr"), errText(err)); }
  $("sellSubmit").disabled = false;
});
function openSell() { if (!me) return openAuth("Ca să adaugi un anunț, intră în cont sau creează unul nou."); if (!cats.length) loadCats(); open("sellDialog"); $("sellTitle").focus(); }
["sellButton", "sellButtonBottom", "bnSell"].forEach((i) => $(i)?.addEventListener("click", openSell));

/* ---- cont ---- */
function openAuth() { open("authDialog"); }
const tab = (reg) => { $("loginForm").hidden = reg; $("regForm").hidden = !reg; $("tabLogin").classList.toggle("on", !reg); $("tabReg").classList.toggle("on", reg); };
$("tabLogin").addEventListener("click", () => tab(false)); $("tabReg").addEventListener("click", () => tab(true));
function setMe(u) { me = u; $("loginButton").textContent = u ? u.nickname : "Contul meu"; }
async function authSubmit(e, url, body, errEl) {
  e.preventDefault(); show(errEl, "");
  try { setMe((await api(url, "POST", body)).user); $("authDialog").close(); e.target.reset(); } catch (err) { show(errEl, errText(err)); }
}
$("loginForm").addEventListener("submit", (e) => authSubmit(e, "/api/auth/login", { identifier: $("lgId").value, password: $("lgPw").value }, $("lgErr")));
$("regForm").addEventListener("submit", (e) => authSubmit(e, "/api/auth/register", { name: $("rgName").value, nickname: $("rgNick").value, email: $("rgEmail").value, password: $("rgPw").value, accept_terms: $("rgTerms").checked }, $("rgErr")));
function openAccount() {
  if (!me) return openAuth();
  $("accName").textContent = me.nickname; $("accMod").hidden = !["admin", "moderator"].includes(me.role); open("accountDialog");
}
["loginButton", "bnAccount"].forEach((i) => $(i)?.addEventListener("click", openAccount));
$("accOut").addEventListener("click", async () => { await api("/api/auth/logout", "POST").catch(() => {}); setMe(null); $("accountDialog").close(); mode = "public"; loadListings(); });
$("accMine").addEventListener("click", () => { mode = "mine"; $("listTitle").textContent = "Anunțurile mele"; $("accountDialog").close(); loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); });
$("accMod").addEventListener("click", () => { mode = "admin"; $("listTitle").textContent = "De aprobat"; $("accountDialog").close(); loadListings(); $("anunturi").scrollIntoView({ behavior: "smooth" }); });

/* ---- lista de anunțuri ---- */
function card(l) {
  const a = document.createElement("article"); a.className = "product"; a.tabIndex = 0;
  const im = document.createElement("div"); im.className = "product-image";
  if (l.thumb) { const g = document.createElement("img"); g.src = l.thumb; g.alt = l.title; g.loading = "lazy"; im.appendChild(g); } else im.textContent = iconOf[l.category_slug] || "📦";
  const info = document.createElement("div"); info.className = "product-info";
  const h = document.createElement("h3"); h.textContent = l.title;
  const p = document.createElement("p"); p.textContent = [l.county, l.category].filter(Boolean).join(" · ");
  const s = document.createElement("strong"); s.textContent = price(l);
  info.append(h, p, s); a.append(im, info);
  if (mode !== "public" && l.status !== "approved") { const t = document.createElement("span"); t.className = "tag"; t.textContent = l.status; info.appendChild(t); }
  a.addEventListener("click", () => openDetail(l.id));
  if (mode === "public") return a;
  const box = document.createElement("div"); box.className = "card-actions";
  const btn = (txt, fn) => { const b = document.createElement("button"); b.textContent = txt; b.addEventListener("click", async (e) => { e.stopPropagation(); try { await fn(); loadListings(); } catch (err) { showMessage("Eroare", errText(err)); } }); box.appendChild(b); };
  if (mode === "mine") {
    if (l.status === "approved") btn("Marchează vândut", () => api(`/api/listings/${l.id}/status`, "PATCH", { status: "sold" }));
    if (l.status === "sold") btn("Repune la vânzare", () => api(`/api/listings/${l.id}/status`, "PATCH", { status: "approved" }));
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
  $("sellPhotoBtn").textContent = photos.length ? `📷 Adaugă încă (${photos.length}/8)` : "📷 Adaugă poze";
}
$("sellPhotoBtn")?.addEventListener("click", () => $("sellPhotos").click());
$("sellPhotos")?.addEventListener("change", async (e) => {
  show($("sellErr"), ""); let bad = 0;
  for (const f of [...e.target.files].slice(0, 8 - photos.length)) {
    try { const blob = await compress(f); photos.push({ blob, url: URL.createObjectURL(blob) }); renderPrev(); } catch { bad++; }
  }
  if (bad) show($("sellErr"), ERR.POZA_INVALIDA);
  e.target.value = "";
});
async function uploadPhoto(id, blob) {
  const r = await fetch(`/api/listings/${id}/images`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
  if (!r.ok) throw new Error("upload");
}

(async () => { try { setMe((await api("/api/me")).user); } catch { /* fără server */ } await loadCats(); loadListings(); })();
