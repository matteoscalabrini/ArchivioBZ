// The Library page in the browser: the keyword filter, the filter by kind of entry, the sort, rows
// that open in place, pictures
// that load when their row first opens, and the address kept in step with all of it (state.js).
import { parseState, formatState, matches, compare } from './state.js';
import { load, stepPicture } from './pictures.js';

const list = document.querySelector('.list');
const status = document.querySelector('.status');
const colhead = document.querySelector('.colhead');
const keywordButtons = [...document.querySelectorAll('button[data-k]')];
const kindButtons = [...document.querySelectorAll('button[data-kind]')];
const sortButtons = [...colhead.querySelectorAll('button[data-sort]')];
const labels = readJson('keyword-labels', {});
const kindLabels = readJson('kind-labels', {});
const onMapKeywords = new Set(readJson('keywords-on-map', [])); // keywords with a row placed on the map
const rows = [...list.querySelectorAll('article.row')].map((el) => ({
  el,
  no: el.dataset.no,
  type: el.dataset.type,
  kind: el.dataset.kind,
  year: Number(el.dataset.year),
  kw: el.dataset.kw.split(' ').filter(Boolean),
  title: el.querySelector('.c-title button'),
  body: el.querySelector('.row-body'),
}));
const byNo = new Map(rows.map((row) => [row.no, row]));
const known = {
  keywords: new Set(keywordButtons.map((b) => b.dataset.k)),
  kinds: new Set(kindButtons.map((b) => b.dataset.kind)),
  rows: new Set(byNo.keys()),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let order = 'no'; // the order the rows stand in now
let state = parseState(location.hash, known);
restore();

addEventListener('hashchange', () => {
  state = parseState(location.hash, known);
  restore();
});

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const keyword = target.closest('button[data-k]');
  if (keyword) return filter(state.k === keyword.dataset.k ? null : keyword.dataset.k);
  const kind = target.closest('button[data-kind]');
  if (kind) {
    state.t = state.t === kind.dataset.kind ? null : kind.dataset.kind;
    return render();
  }
  if (target.closest('.show-all')) {
    state.t = null;
    return filter(null);
  }
  const sort = target.closest('button[data-sort]');
  if (sort) {
    state.s = sort.dataset.sort;
    return render();
  }
  const arrow = target.closest('.pic-nav button[data-step]');
  if (arrow) return stepPicture(arrow, Number(arrow.dataset.step));
  const jump = target.closest('a[data-jump]');
  if (jump && byNo.has(jump.dataset.jump) && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
    event.preventDefault();
    return openRow(byNo.get(jump.dataset.jump));
  }
  const head = target.closest('.row-head');
  if (head && !target.closest('a') && !selecting(head)) toggle(byNo.get(head.parentElement.dataset.no));
});

// With focus on a picture arrow, the Left and Right keys step too.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
  const arrow = event.target instanceof Element ? event.target.closest('.pic-nav button[data-step]') : null;
  if (!arrow) return;
  event.preventDefault();
  stepPicture(arrow, event.key === 'ArrowLeft' ? -1 : 1);
});

// The state as the address gives it, applied without animation, the first open row in view.
function restore() {
  list.classList.add('still');
  render();
  const first = [...list.children].find((el) => el.classList.contains('open') && !el.hidden);
  if (first) reveal(first, 'auto');
  requestAnimationFrame(() => requestAnimationFrame(() => list.classList.remove('still')));
}

function render() {
  if (state.s !== order) {
    list.append(...[...rows].sort((a, b) => compare(a, b, state.s)).map((row) => row.el));
    order = state.s;
  }
  let shown = 0;
  for (const row of rows) {
    row.el.hidden = !matches(row, state);
    if (!row.el.hidden) shown++;
    setOpen(row, state.o.includes(row.no));
  }
  for (const button of keywordButtons) button.setAttribute('aria-pressed', String(button.dataset.k === state.k));
  for (const button of kindButtons) button.setAttribute('aria-pressed', String(button.dataset.kind === state.t));
  for (const button of sortButtons) button.setAttribute('aria-pressed', String(button.dataset.sort === state.s));

  // Written only when it changes: the status is a live region and would be read out again.
  // The kind first, then the keyword: "Press · Typeface".
  const narrowed = [state.t && (kindLabels[state.t] ?? state.t), state.k && (labels[state.k] ?? state.k)].filter(Boolean);
  setText(status.querySelector('.what'), narrowed.join(' · ') || 'All entries');
  setText(status.querySelector('.n'), narrowed.length ? `${shown} of ${entries(rows.length)}` : entries(rows.length));
  status.querySelector('.show-all').hidden = !narrowed.length;
  const onMap = status.querySelector('.on-map');
  onMap.hidden = !state.k || !onMapKeywords.has(state.k);
  onMap.href = state.k ? `map.html#k=${encodeURIComponent(state.k)}` : 'map.html';

  const hash = formatState(state);
  if (hash !== location.hash) history.replaceState(null, '', hash || location.pathname + location.search);
}

function filter(k) {
  state.k = k;
  render();
  // To the top of the list: the kinds line when the page has one, so it stays in reach.
  const head = document.querySelector('.kinds') ?? colhead;
  if (k) scrollTo({ top: head.getBoundingClientRect().top + scrollY - status.offsetHeight, behavior: motion() });
}

function toggle(row) {
  state.o = state.o.includes(row.no) ? state.o.filter((no) => no !== row.no) : [...state.o, row.no];
  render();
}

// From a "Sources" number: open that row, showing all rows if a filter hides it.
function openRow(row) {
  if (!state.o.includes(row.no)) state.o = [...state.o, row.no];
  if (!matches(row, state)) {
    state.k = null;
    state.t = null;
  }
  render();
  reveal(row.el, motion());
  row.title.focus({ preventScroll: true });
}

function setOpen(row, open) {
  if (row.el.classList.contains('open') === open) return;
  row.el.classList.toggle('open', open);
  row.title.setAttribute('aria-expanded', String(open));
  row.body.inert = !open;
  if (open) load(row.el.querySelector('.pics figure:not([hidden]) img'));
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// Puts a row just under the sticky status line.
function reveal(el, behavior) {
  scrollTo({ top: el.getBoundingClientRect().top + scrollY - status.offsetHeight, behavior });
}

// True while the reader is selecting text in this row head rather than clicking it.
function selecting(head) {
  const selection = getSelection();
  return Boolean(selection && !selection.isCollapsed && head.contains(selection.anchorNode));
}

// The JSON the build wrote into <script type="application/json" id="…">, or `fallback`.
function readJson(id, fallback) {
  try {
    return JSON.parse(document.getElementById(id)?.textContent ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function motion() {
  return reduced.matches ? 'auto' : 'smooth';
}

function entries(n) {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`;
}
