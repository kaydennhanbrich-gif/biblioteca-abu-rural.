// ---------- State ----------
const STORAGE_LOANS = "abu-rural-emprestimos";
const STORAGE_COVERS = "abu-rural-capas";

const loanState = JSON.parse(localStorage.getItem(STORAGE_LOANS) || "{}");
const coverCache = JSON.parse(localStorage.getItem(STORAGE_COVERS) || "{}");

let activeTema = "Todos";
let query = "";

const ABU_TAG = "Editora ABU";
const temas = ["Todos", ABU_TAG, ...Array.from(new Set(BOOKS.map(b => b.tema))).sort()];

// ---------- Helpers ----------
function isEditoraABU(book) {
  return /abu/i.test(book.editora || "");
}

function initials(title) {
  return title.split(" ").filter(w => w.length > 2).slice(0, 3).map(w => w[0]).join("");
}

function isEmprestado(book) {
  return !!loanState[book.id];
}

function saveLoans() {
  localStorage.setItem(STORAGE_LOANS, JSON.stringify(loanState));
}

function saveCovers() {
  localStorage.setItem(STORAGE_COVERS, JSON.stringify(coverCache));
}

function filteredBooks() {
  const q = query.trim().toLowerCase();
  return BOOKS.filter(b => {
    const matchesTema = activeTema === "Todos" ||
      (activeTema === ABU_TAG ? isEditoraABU(b) : b.tema === activeTema);
    const matchesQuery = !q ||
      b.titulo.toLowerCase().includes(q) ||
      b.autor.toLowerCase().includes(q);
    return matchesTema && matchesQuery;
  });
}

// ---------- Cover fetching (Open Library, cached, lazy) ----------
const coverObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      coverObserver.unobserve(el);
      loadCover(el);
    }
  });
}, { rootMargin: "200px" });

async function loadCover(wrapEl) {
  const bookId = wrapEl.dataset.bookId;
  const book = BOOKS.find(b => b.id == bookId);
  const cacheKey = book.titulo + "|" + book.autor;

  if (coverCache[cacheKey] !== undefined) {
    applyCover(wrapEl, coverCache[cacheKey]);
    return;
  }

  try {
    const q = encodeURIComponent(book.titulo + " " + book.autor.split(/[,e&]/)[0]);
    const res = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i`, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    const coverId = data.docs && data.docs[0] && data.docs[0].cover_i;
    const url = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
    coverCache[cacheKey] = url;
    saveCovers();
    applyCover(wrapEl, url);
  } catch (e) {
    coverCache[cacheKey] = null;
    saveCovers();
    applyCover(wrapEl, null);
  }
}

function applyCover(wrapEl, url) {
  const img = wrapEl.querySelector(".cover-img");
  const placeholder = wrapEl.querySelector(".cover-placeholder");
  if (url) {
    img.src = url;
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
  }
}

// ---------- Rendering ----------
function renderChips() {
  const wrap = document.getElementById("temaChips");
  wrap.innerHTML = "";
  temas.forEach(tema => {
    let count;
    if (tema === "Todos") count = BOOKS.length;
    else if (tema === ABU_TAG) count = BOOKS.filter(isEditoraABU).length;
    else count = BOOKS.filter(b => b.tema === tema).length;
    const chip = document.createElement("button");
    chip.className = "chip" + (tema === ABU_TAG ? " chip-abu" : "");
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(tema === activeTema));
    chip.innerHTML = `${tema} <span class="count">${count}</span>`;
    chip.addEventListener("click", () => {
      activeTema = tema;
      renderChips();
      renderGrid();
    });
    wrap.appendChild(chip);
  });
}

function renderGrid() {
  const results = filteredBooks();
  const grid = document.getElementById("results");
  const empty = document.getElementById("empty");
  const stats = document.getElementById("stats");

  stats.textContent = `${results.length} de ${BOOKS.length} livros`;
  grid.innerHTML = "";
  empty.classList.toggle("hidden", results.length > 0);

  results.forEach(book => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "book-card";
    card.innerHTML = `
      <div class="cover-wrap" data-book-id="${book.id}">
        <img class="cover-img hidden" alt="Capa de ${escapeHtml(book.titulo)}">
        <div class="cover-placeholder">${escapeHtml(initials(book.titulo))}</div>
      </div>
      <p class="card-tema">${escapeHtml(book.tema)}</p>
      <p class="card-title">${escapeHtml(book.titulo)}</p>
      <p class="card-autor">${escapeHtml(book.autor)}</p>
    `;
    card.addEventListener("click", () => openModal(book));
    grid.appendChild(card);
    coverObserver.observe(card.querySelector(".cover-wrap"));
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ---------- Modal ----------
const modalBackdrop = document.getElementById("modalBackdrop");
const modalCoverImg = document.getElementById("modalCoverImg");
const modalCoverPlaceholder = document.getElementById("modalCoverPlaceholder");

function openModal(book) {
  document.getElementById("modalTema").textContent = book.tema;
  document.getElementById("modalTitle").textContent = book.titulo;
  document.getElementById("modalAutor").textContent = book.autor;
  document.getElementById("modalEditora").textContent = book.editora;
  document.getElementById("modalEstante").textContent = `${book.estante} · item ${book.item}`;

  const cacheKey = book.titulo + "|" + book.autor;
  const cached = coverCache[cacheKey];
  if (cached) {
    modalCoverImg.src = cached;
    modalCoverImg.classList.remove("hidden");
    modalCoverPlaceholder.classList.add("hidden");
  } else {
    modalCoverImg.classList.add("hidden");
    modalCoverPlaceholder.classList.remove("hidden");
    modalCoverPlaceholder.textContent = initials(book.titulo);
  }

  const btn = document.getElementById("loanBtn");
  const updateBtn = () => {
    const taken = isEmprestado(book);
    btn.textContent = taken ? "Marcar como devolvido" : "Registrar empréstimo";
    btn.classList.toggle("taken", taken);
  };
  updateBtn();
  btn.onclick = () => {
    loanState[book.id] = !loanState[book.id];
    saveLoans();
    updateBtn();
    renderGrid();
  };

  modalBackdrop.classList.remove("hidden");
}

document.getElementById("modalClose").addEventListener("click", () => {
  modalBackdrop.classList.add("hidden");
});
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) modalBackdrop.classList.add("hidden");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") modalBackdrop.classList.add("hidden");
});

// ---------- Search ----------
document.getElementById("search").addEventListener("input", (e) => {
  query = e.target.value;
  renderGrid();
});

// ---------- Init ----------
renderChips();
renderGrid();
