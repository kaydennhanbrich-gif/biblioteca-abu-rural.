// ---------- State ----------
let query = "";
let activeTema = "Todos";

const ABU_TAG = "Editora ABU";
const temas = ["Todos", ABU_TAG, ...Array.from(new Set(BOOKS.map(b => b.tema))).sort()];

// ---------- Helpers ----------
function isEditoraABU(book) {
  return /abu/i.test(book.editora || "");
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

// ---------- Search & filters ----------
document.getElementById("search").addEventListener("input", (e) => {
  query = e.target.value;
  renderList();
});

// ---------- Init ----------
renderTemaFilter();
renderList();
