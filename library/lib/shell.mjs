// The frame every page shares: wordmark on the left, three tabs and the search field on the
// right, base.css first, and web/find.js, which makes the field work on every page.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

const TABS = [
  ['library', 'Library', 'index.html'],
  ['map', 'Map', 'map.html'],
  ['about', 'About', 'about.html'],
];
const BASE_CSS = 'web/base.css';
const FIND_JS = 'web/find.js';

export function page({ title, tab, body, css = [], js = [], depth = 0, head = '' }) {
  const up = '../'.repeat(depth);
  const styles = [BASE_CSS, ...css.filter((href) => href !== BASE_CSS)]
    .map((href) => `<link rel="stylesheet" href="${esc(up + href)}">`);
  const scripts = [FIND_JS, ...js.filter((src) => src !== FIND_JS)]
    .map((src) => `<script type="module" src="${esc(up + src)}"></script>`);
  const tabs = TABS.map(([id, label, href]) =>
    `<a href="${up}${href}"${id === tab ? ' aria-current="page"' : ''}>${label}</a>`);
  // The search: on the Library it narrows the list as one types, elsewhere Enter leads there.
  const find = `<form class="find" role="search" action="${up}index.html">`
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
