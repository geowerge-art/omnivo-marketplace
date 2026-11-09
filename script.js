
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
  showMessage(
    "Adaugă un anunț",
    "Publicarea anunțurilor și conturile de utilizator vor fi activate în etapa următoare."
  );
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
