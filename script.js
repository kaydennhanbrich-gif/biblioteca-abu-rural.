// ---------- State ----------
const STORAGE_RESUMOS = "abu-rural-resumos";
const resumoCache = JSON.parse(localStorage.getItem(STORAGE_RESUMOS) || "{}");

let searchField = "all";
let query = "";
let activeTema = "Todos";

const ABU_TAG = "Editora ABU";
const temas = ["Todos", ABU_TAG, ...Array.from(new Set(BOOKS.map(b => b.tema))).sort()];

// ---------- Helpers ----------
function isEditoraABU(book) {
  return /abu/i.test(book.editora || "");
}

function saveResumos() {
  localStorage.setItem(STORAGE_RESUMOS, JSON.stringify(resumoCache));
}

function filteredBooks() {
  const q = query.trim().toLowerCase();
  return BOOKS.filter(b => {
    const matchesTema = activeTema === "Todos" ||
      (activeTema === ABU_TAG ? isEditoraABU(b) : b.tema === activeTema);

    let matchesQuery = true;
    if (q) {
      if (searchField === "titulo") matchesQuery = b.titulo.toLowerCase().includes(q);
      else if (searchField === "autor") matchesQuery = b.autor.toLowerCase().includes(q);
      else matchesQuery = b.titulo.toLowerCase().includes(q) || b.autor.toLowerCase().includes(q) || b.tema.toLowerCase().includes(q);
    }

    return matchesTema && matchesQuery;
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ---------- Title/author matching (avoids showing the wrong book's summary) ----------
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

// Picks the best-matching volume ID from a search result list (does NOT
// rely on description being present here — search results often omit it).
function pickBestVolumeId(book, items) {
  let bestId = null;
  let bestScore = 0;
  (items || []).forEach(item => {
    const info = item.volumeInfo || {};
    const sim = titleSimilarity(book.titulo, info.title || "");
    const authOk = authorMatches(book.autor, info.authors);
    const threshold = authOk ? 0.25 : 0.55;
    if (sim >= threshold && sim > bestScore) {
      bestScore = sim;
      bestId = item.id;
    }
  });
  return bestId;
}

// ---------- Rendering ----------
function renderTemaFilter() {
  const sel = document.getElementById("temaFilter");
  sel.innerHTML = "";
  temas.forEach(tema => {
    const opt = document.createElement("option");
    opt.value = tema;
    opt.textContent = tema === "Todos" ? "Todos os temas" : tema;
    sel.appendChild(opt);
  });
  sel.value = activeTema;
  sel.addEventListener("change", () => {
    activeTema = sel.value;
    renderList();
  });
}

function renderList() {
  const results = filteredBooks();
  const list = document.getElementById("results");
  const empty = document.getElementById("empty");
  const stats = document.getElementById("stats");

  stats.textContent = `${results.length} de ${BOOKS.length} registros`;
  list.innerHTML = "";
  empty.classList.toggle("hidden", results.length > 0);

  results.forEach(book => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "book-row";
    row.innerHTML = `
      <div class="row-main">
        <p class="row-title">${escapeHtml(book.titulo)}</p>
        <p class="row-meta">${escapeHtml(book.autor)} &middot; ${escapeHtml(book.editora)}</p>
        <p class="row-tema">${escapeHtml(book.tema)}</p>
      </div>
    `;
    row.addEventListener("click", () => openModal(book));
    list.appendChild(row);
  });
}

// ---------- Modal ----------
const modalBackdrop = document.getElementById("modalBackdrop");

function openModal(book) {
  document.getElementById("modalTema").textContent = book.tema;
  document.getElementById("modalTitle").textContent = book.titulo;
  document.getElementById("modalAutor").textContent = book.autor;
  document.getElementById("modalEditora").textContent = book.editora;
  document.getElementById("modalEstante").textContent = `${book.estante} · item ${book.item}`;

  loadResumo(book);

  modalBackdrop.classList.remove("hidden");
}

async function loadResumo(book) {
  const box = document.getElementById("modalResumo");
  const cacheKey = book.titulo + "|" + book.autor;

  if (resumoCache[cacheKey] !== undefined) {
    box.textContent = resumoCache[cacheKey] || "Resumo não disponível para este livro.";
    return;
  }

  box.textContent = "Buscando resumo...";

  try {
    // Step 1: search to find the right book (title/author match).
    const authorFirstName = (book.autor || "").split(/[,&]| e /)[0].trim();
    const q = `intitle:${coreTitle(book.titulo)} ${authorFirstName ? "inauthor:" + authorFirstName : ""}`;
    const searchRes = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`
    );
    const searchData = await searchRes.json();
    const volumeId = pickBestVolumeId(book, searchData.items);

    if (!volumeId) {
      resumoCache[cacheKey] = null;
      saveResumos();
      box.textContent = "Resumo não disponível para este livro.";
      return;
    }

    // Step 2: fetch that specific volume's full record — search results
    // often omit the description, but the volume detail endpoint has it.
    const volRes = await fetch(`https://www.googleapis.com/books/v1/volumes/${volumeId}`);
    const volData = await volRes.json();
    const resumo = (volData.volumeInfo && volData.volumeInfo.description) || null;

    resumoCache[cacheKey] = resumo;
    saveResumos();
    box.textContent = resumo || "Resumo não disponível para este livro.";
  } catch (e) {
    resumoCache[cacheKey] = null;
    saveResumos();
    box.textContent = "Resumo não disponível para este livro.";
  }
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

// ---------- Search & filters ----------
document.getElementById("search").addEventListener("input", (e) => {
  query = e.target.value;
  renderList();
});
document.getElementById("searchField").addEventListener("change", (e) => {
  searchField = e.target.value;
  renderList();
});

// ---------- Init ----------
renderTemaFilter();
renderList();
