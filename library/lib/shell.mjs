// The frame every page shares: wordmark on the left, the tabs and the search field on the right,
// base.css first, and web/find.js, which makes the field work on every page. The tabs are Library,
// Map, a tab for each site page (design §14) in the author's order, and About, always last.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

const BASE_CSS = 'web/base.css';
const FIND_JS = 'web/find.js';
const HIDDEN_PAGE = 'The page is hidden.';

// `tab`: the tab of the page, 'library', 'map', 'about' or 'page:<address>' for a site page.
// `pages`: the site pages, [{ address, title, hidden }], in their order. `edit`: the frame of edit
// mode, whose Library (its tab and the search) is /edit/ and whose page tabs lead to the pages in
// edit mode, a hidden one dotted, its title saying why; on the public site a hidden page has no tab.
export function page({ title, tab, body, css = [], js = [], depth = 0, head = '', pages = [], edit = false }) {
  const up = '../'.repeat(depth);
  const styles = [BASE_CSS, ...css.filter((href) => href !== BASE_CSS)]
    .map((href) => `<link rel="stylesheet" href="${esc(up + href)}">`);
  const scripts = [FIND_JS, ...js.filter((src) => src !== FIND_JS)]
    .map((src) => `<script type="module" src="${esc(up + src)}"></script>`);
  const tabs = tabList(pages, edit).map(({ id, label, href, hidden }) => `<a href="${esc(up + href)}"${id === tab ? ' aria-current="page"' : ''}`
    + `${hidden ? ` class="dead-link" title="${HIDDEN_PAGE}"` : ''}>${esc(label)}</a>`);
  // The search: on the Library it narrows the list as one types, elsewhere Enter leads there (in
  // edit mode to edit mode's Library).
  const find = `<form class="find" role="search" action="${up}${edit ? 'edit/' : 'index.html'}">`
    + '<input type="text" name="q" placeholder="Search" aria-label="Search the library" autocomplete="off" spellcheck="false"></form>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${[...styles, ...scripts].join('\n')}
${head}
</head>
<body>
<header class="site">
<a class="wordmark" href="${up}index.html">Translocalities in Bolzano</a>
<nav class="tabs" aria-label="Sections">${tabs.join('')}${find}</nav>
</header>
<main>
${body}
</main>
</body>
</html>
`;
}

function tabList(pages, edit) {
  const sites = pages.filter((p) => edit || !p.hidden).map(({ address, title, hidden }) => (
    { id: `page:${address}`, label: title, href: edit ? `edit/pages/${address}` : `pages/${address}.html`, hidden: edit && hidden === true }));
  return [
    { id: 'library', label: 'Library', href: edit ? 'edit/' : 'index.html' },
    { id: 'map', label: 'Map', href: 'map.html' },
    ...sites,
    { id: 'about', label: 'About', href: 'about.html' },
  ];
}
