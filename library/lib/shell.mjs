// The frame every page shares: wordmark on the left, three tabs on the right, base.css first.

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

export function page({ title, tab, body, css = [], js = [], depth = 0, head = '' }) {
  const up = '../'.repeat(depth);
  const styles = [BASE_CSS, ...css.filter((href) => href !== BASE_CSS)]
    .map((href) => `<link rel="stylesheet" href="${esc(up + href)}">`);
  const scripts = js.map((src) => `<script type="module" src="${esc(up + src)}"></script>`);
  const tabs = TABS.map(([id, label, href]) =>
    `<a href="${up}${href}"${id === tab ? ' aria-current="page"' : ''}>${label}</a>`);
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
<nav class="tabs" aria-label="Sections">${tabs.join('')}</nav>
</header>
<main>
${body}
</main>
</body>
</html>
`;
}
