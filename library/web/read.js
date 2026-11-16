// A read page whose text cites rows of the library: a link to a row opens the row in the panel
// on the right, as a row opens on the Map page, and the text stays where it is. In the panel:
// the row as the Library shows it open, for a record of a table the record first, the steps to
// the source before and after in the order the text cites them, and Close (or Escape). The
// address keeps what is open (#o=5.01), so a page can be opened on a source. A click with a
// modifier key, or without this script, follows the link to the Library instead.
import { load, stepPicture } from './pictures.js';

const panel = globalThis.document?.getElementById('panel');
if (panel) {
  const entries = new Map([...panel.querySelectorAll('article.entry')].map((article) => [article.dataset.no, article]));
  const links = [...document.querySelectorAll('.read a[data-row]')].filter((a) => entries.has(a.dataset.row));
  const keyOf = (a) => `${a.dataset.row}/${a.dataset.rec ?? ''}`;
  // The sources in the order the text first cites them.
  const stops = [];
  for (const a of links) if (!stops.some((stop) => stop.key === keyOf(a))) stops.push({ key: keyOf(a), no: a.dataset.row, rec: a.dataset.rec ?? null });

  const prev = make('button', 'e-prev', '← Previous');
  const next = make('button', 'e-next', 'Next →');
  const at = make('span', 'n', '');
  const step = make('p', 'e-step', [prev, at, next]);
  panel.append(step);

  let shown = -1; // the stop that is open
  let from = null; // the link it was opened from

  function show(n, { link = null, reveal = false } = {}) {
    const stop = stops[n];
    if (!stop) return close();
    shown = n;
    const article = entries.get(stop.no);
    for (const other of entries.values()) other.hidden = other !== article;
    for (const record of article.querySelectorAll('.e-record')) record.hidden = record.dataset.rec !== stop.rec;
    load(article.querySelector('.pics figure:not([hidden]) img'));
    prev.disabled = n === 0;
    next.disabled = n === stops.length - 1;
    at.textContent = `${n + 1} / ${stops.length}`;
    from = link ?? links.find((a) => keyOf(a) === stop.key) ?? null;
    for (const a of links) a.classList.toggle('shown', keyOf(a) === stop.key);
    panel.hidden = false;
    panel.scrollTop = 0;
    if (reveal) from?.scrollIntoView({ block: 'center' });
    history.replaceState(null, '', `#o=${encodeURIComponent(stop.no)}${stop.rec === null ? '' : `.${stop.rec}`}`);
    article.querySelector('h3').focus({ preventScroll: true });
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    shown = -1;
    for (const a of links) a.classList.remove('shown');
    history.replaceState(null, '', location.pathname + location.search);
    from?.focus({ preventScroll: true });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('.read a[data-row]');
    if (link && links.includes(link)) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      return show(stops.findIndex((stop) => stop.key === keyOf(link)), { link });
    }
    if (target?.closest('.panel .close')) return close();
    if (target?.closest('.e-prev')) return show(shown - 1, { reveal: true });
    if (target?.closest('.e-next')) return show(shown + 1, { reveal: true });
    const arrow = target?.closest('.panel .pic-nav button[data-step]');
    if (arrow) stepPicture(arrow, Number(arrow.dataset.step));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  // #o=5.01, or #o=1.03.12 for the record 12 of the table 1.03.
  const asked = /^#o=(\d{1,2}\.\d{2})(?:\.(\d+))?$/.exec(decodeURIComponent(location.hash));
  if (asked) {
    const n = stops.findIndex((stop) => stop.no === asked[1] && (asked[2] === undefined || stop.rec === asked[2]));
    if (n >= 0) show(n, { reveal: true });
  }
}

function make(tag, className, content) {
  const el = document.createElement(tag);
  el.className = className;
  if (tag === 'button') el.type = 'button';
  if (Array.isArray(content)) el.append(...content);
  else el.textContent = content;
  return el;
}
