// ---------- State ----------
const STORAGE_LOANS = "abu-rural-emprestimos";
const STORAGE_COVERS = "abu-rural-capas-v2";

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

// ---------- Title/author matching (avoids attaching the wrong cover) ----------
function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coreTitle(title) {
  return (title || "").split(/[:(]/)[0];
}

function titleSimilarity(a, b) {
  const wa = new Set(normalize(coreTitle(a)).split(" ").filter(w => w.length > 2));
  const wb = new Set(normalize(coreTitle(b)).split(" ").filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  wa.forEach(w => { if (wb.has(w)) common++; });
  return common / Math.max(wa.size, wb.size);
}

function authorMatches(ourAuthor, candidateAuthors) {
  if (!candidateAuthors || !candidateAuthors.length) return false;
  const ourWords = normalize(ourAuthor).split(" ").filter(w => w.length > 2);
  if (!ourWords.length) return false;
  const candidateNorm = normalize(candidateAuthors.join(" "));
  return ourWords.some(w => candidateNorm.includes(w));
}

function pickBestMatch(book, items) {
  let best = null;
  let bestScore = 0;
  (items || []).forEach(item => {
    const info = item.volumeInfo || {};
    if (!info.imageLinks || !info.imageLinks.thumbnail) return;
    const sim = titleSimilarity(book.titulo, info.title || "");
    const authOk = authorMatches(book.autor, info.authors);
    const threshold = authOk ? 0.25 : 0.55;
    if (sim >= threshold && sim > bestScore) {
      bestScore = sim;
      best = info.imageLinks.thumbnail.replace(/^http:/, "https:");
    }
  });
  return best;
}

// ---------- Cover fetching (Google Books, validated + cached + lazy) ----------
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

  if (MANUAL_COVERS[book.id]) {
    coverCache[cacheKey] = MANUAL_COVERS[book.id];
    saveCovers();
    applyCover(wrapEl, MANUAL_COVERS[book.id]);
    return;
  }

  if (coverCache[cacheKey] !== undefined) {
    applyCover(wrapEl, coverCache[cacheKey]);
    return;
  }

  try {
    const authorFirstName = (book.autor || "").split(/[,&]| e /)[0].trim();
    const q = `intitle:${coreTitle(book.titulo)} ${authorFirstName ? "inauthor:" + authorFirstName : ""}`;
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`,
      { signal: AbortSignal.timeout(6000) }
    );
    const data = await res.json();
    const url = pickBestMatch(book, data.items);
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
  const cached = MANUAL_COVERS[book.id] || coverCache[cacheKey];
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
