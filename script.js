
const menuButton = document.getElementById("menuButton");
const mainMenu = document.getElementById("mainMenu");

if (menuButton && mainMenu) {
  menuButton.addEventListener("click", () => {
    mainMenu.classList.toggle("open");
  });
}

const dialog = document.getElementById("messageDialog");
const dialogTitle = document.getElementById("dialogTitle");
const dialogText = document.getElementById("dialogText");

function showMessage(title, message) {
  dialogTitle.textContent = title;
  dialogText.textContent = message;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    alert(title + "\n\n" + message);
  }
}

document.getElementById("loginButton")?.addEventListener("click", () => {
  showMessage(
    "Contul meu",
    "În curând vei putea să îți creezi cont, să te autentifici și să îți gestionezi anunțurile."
  );
});

function openSellDialog() {
  document.getElementById("sellDialog").showModal();
  document.getElementById("sellTitle").focus();
}

document.getElementById("sellButton")?.addEventListener("click", openSellDialog);
document.getElementById("sellButtonBottom")?.addEventListener("click", openSellDialog);

document.getElementById("closeDialog")?.addEventListener("click", () => {
  dialog.close();
});

dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) {
    dialog.close();
  }
});

// căutare fără diacritice: "bicicleta" găsește și "bicicletă"
const fold = (t) => t.toLocaleLowerCase("ro").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const products = document.querySelectorAll(".product");
const emptyMessage = document.getElementById("emptyMessage");

searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const query = fold(searchInput.value);
  let visibleCount = 0;

  products.forEach((product) => {
    const text = fold(product.textContent);
    const matches = text.includes(query);

    product.hidden = !matches;
    if (matches) visibleCount++;
  });

  emptyMessage.hidden = visibleCount !== 0;
  document.getElementById("anunturi").scrollIntoView({
    behavior: "smooth"
  });
});

searchInput?.addEventListener("input", () => {
  if (!searchInput.value.trim()) {
    products.forEach((product) => {
      product.hidden = false;
    });
    emptyMessage.hidden = true;
  }
});

// ---- meniu telefon: categorii din API, sugestie de categorie după titlu ----
const $id = (x) => document.getElementById(x);
function setDrawer(open) { $id("drawer").hidden = !open; $id("scrim").hidden = !open; document.body.style.overflow = open ? "hidden" : ""; }

async function loadDrawer() {
  try {
    const { categories } = await (await fetch("/api/categories")).json();
    $id("drawerList").innerHTML = "";
    for (const c of categories) {
      const li = document.createElement("li");
      const b = document.createElement("b"); b.textContent = `${c.icon || ""} ${c.name}`; li.appendChild(b);
      for (const k of c.children) {
        const a = document.createElement("a"); a.href = "#anunturi"; a.textContent = k.name;
        a.addEventListener("click", () => setDrawer(false)); li.appendChild(a);
      }
      $id("drawerList").appendChild(li);
    }
  } catch { $id("drawerList").innerHTML = "<li class='muted' style='padding:14px 18px'>Categoriile nu se pot încărca acum.</li>"; }
}

$id("bnCats")?.addEventListener("click", () => { setDrawer(true); loadDrawer(); });
$id("drawerClose")?.addEventListener("click", () => setDrawer(false));
$id("scrim")?.addEventListener("click", () => setDrawer(false));
$id("bnSell")?.addEventListener("click", openSellDialog);
$id("bnSearch")?.addEventListener("click", () => { window.scrollTo({ top: 0, behavior: "smooth" }); searchInput?.focus(); });
$id("bnAccount")?.addEventListener("click", () => showMessage("Contul meu", "În curând vei putea să îți creezi cont și să îți gestionezi anunțurile."));
$id("sellClose")?.addEventListener("click", () => $id("sellDialog").close());

let suggestTimer;
$id("sellTitle")?.addEventListener("input", (e) => {
  clearTimeout(suggestTimer);
  const t = e.target.value.trim();
  $id("sellPicked").hidden = true;
  if (t.length < 3) { $id("sellChips").innerHTML = ""; $id("sellHint").hidden = false; return; }
  suggestTimer = setTimeout(async () => {
    try {
      const { suggestions } = await (await fetch("/api/categories/suggest?title=" + encodeURIComponent(t))).json();
      $id("sellChips").innerHTML = "";
      $id("sellHint").hidden = suggestions.length > 0;
      $id("sellHint").textContent = "Nu am găsit o categorie. O vei alege manual.";
      for (const s of suggestions) {
        const b = document.createElement("button"); b.type = "button"; b.textContent = `${s.parent} › ${s.name}`;
        b.addEventListener("click", () => { $id("sellPicked").textContent = `Categorie: ${s.parent} › ${s.name} ✓`; $id("sellPicked").hidden = false; });
        $id("sellChips").appendChild(b);
      }
    } catch { /* fără sugestii dacă serverul nu răspunde */ }
  }, 350);
});
