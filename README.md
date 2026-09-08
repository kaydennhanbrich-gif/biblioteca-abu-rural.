# Biblioteca Abu Rural

Site de catálogo para os livros da biblioteca, organizado pelos temas que já categorizamos na planilha.

## Arquivos

- `index.html` — estrutura da página
- `style.css` — visual (cores, tipografia, layout)
- `script.js` — busca, filtro por tema, modal de detalhes e registro de empréstimo
- `books.js` — os 300 livros (título, autor, editora, tema, estante), gerado a partir da sua planilha

## Como abrir

1. Baixe os 4 arquivos e coloque todos **na mesma pasta**.
2. Abra a pasta no VS Code.
3. Instale a extensão **Live Server** (ou qualquer servidor local) e clique em "Go Live" no `index.html`.
   - Abrir o `index.html` direto (duplo clique) também funciona na maioria dos navegadores, mas a busca de capas pode falhar em alguns por causa de restrições de arquivo local — usar Live Server é mais confiável.

## Sobre as capas dos livros

Não foi possível baixar as 300 capas manualmente, então o site busca cada capa automaticamente no **Open Library** (acervo público, gratuito, sem chave de API) pelo título e autor, assim que o card do livro aparece na tela. Quando a capa não é encontrada — comum em livros de editoras evangélicas brasileiras pequenas, que raramente estão nesse acervo internacional —, o card mostra as iniciais do título no lugar. Isso exige internet; sem conexão, todos os livros aparecem só com as iniciais.

## Sobre o empréstimo

O botão "Registrar empréstimo" no momento só salva no navegador de quem está usando (`localStorage`), então cada pessoa vê seu próprio estado — não é compartilhado entre usuários. Para a "funcionalidade de inscrição para pegar livros emprestados" valendo pra todo mundo, como você pediu, vai ser preciso um banco de dados e um back-end (login de usuários, quem pegou o quê, prazos). Posso montar isso como próximo passo — é mais trabalho de código, então prefiro fazer separado.

## Personalizar

- Cores e fontes: topo do `style.css`, na seção `:root`.
- Textos do cabeçalho: `index.html`, dentro de `.brand-text`.
- Se algum livro ficou no tema errado, é só editar o campo `"tema"` dele em `books.js`.
