// ---------- State ----------
const STORAGE_RESUMOS = "abu-rural-resumos";
const resumoCache = JSON.parse(localStorage.getItem(STORAGE_RESUMOS) || "{}");

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

    const matchesQuery = !q ||
      b.titulo.toLowerCase().includes(q) ||
      b.autor.toLowerCase().includes(q) ||
      b.tema.toLowerCase().includes(q);

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

// Since the query itself already requires the quoted title phrase to appear,
// results are already filtered strongly by Google. We only use similarity as
// a light tie-breaker between candidates, not as a strict pass/fail gate.
function pickBestMatch(book, items) {
  if (!items || !items.length) return null;

  let best = null;
  let bestScore = -1;
  items.forEach(item => {
    const info = item.volumeInfo || {};
    const sim = titleSimilarity(book.titulo, info.title || "");
    const authOk = authorMatches(book.autor, info.authors);
    const score = sim + (authOk ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { id: item.id, description: info.description || null };
    }
  });
  return best;
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
    // Plain quoted full-text query — more reliable than intitle:/inauthor:
    // prefixes for multi-word Portuguese titles, which those prefixes only
    // bind to a single following word.
    const authorFirstName = (book.autor || "").split(/[,&]| e /)[0].trim();
    const q = `"${coreTitle(book.titulo).trim()}" ${authorFirstName}`.trim();
    const searchRes = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&country=US`
    );
    if (!searchRes.ok) throw new Error("search failed");
    const searchData = await searchRes.json();
    const match = pickBestMatch(book, searchData.items);

    if (!match) {
      resumoCache[cacheKey] = null;
      saveResumos();
      box.textContent = "Resumo não disponível para este livro.";
      return;
    }

    // The search result sometimes already has a (short) description; use it
    // as a starting point, then try to get the fuller one from the volume
    // detail endpoint, which search results often omit entirely.
    let resumo = match.description;
    if (match.id) {
      try {
        const volRes = await fetch(`https://www.googleapis.com/books/v1/volumes/${match.id}?country=US`);
        if (volRes.ok) {
          const volData = await volRes.json();
          const fullDesc = volData.volumeInfo && volData.volumeInfo.description;
          if (fullDesc) resumo = fullDesc;
        }
      } catch (e2) {
        // ignore — we still have whatever came from the search step, if any
      }
    }

    resumoCache[cacheKey] = resumo || null;
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

// ---------- Init ----------
renderTemaFilter();
renderList();
