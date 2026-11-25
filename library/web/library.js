// The Library page in the browser: the keyword filter, the filter by kind of entry, the search,
// the sort, rows that open in place, pictures that load when their row first opens, and the
// address kept in step with all of it (state.js).
//
// The search field stands in the frame (lib/shell.mjs, find.js). Here it narrows the list as one
// types: search.js finds the rows in the index the build wrote (search.json, fetched when the
// field is first used), results.js says what the list then holds, and this file puts it there:
// the rows found in two groups, each under its line, and under each title why it was found.
//
// A library in chapters has a heading over each chapter's rows (h2.chapter, lib/pages.mjs): it
// stands in the list only in the story order (the No. sort) with nothing searched, and is hidden
// while none of its chapter's rows shows. Edit mode changes the list in place and then calls
// rescan(), which reads the page again.
import { parseState, formatState, matches, compare } from './state.js';
import { prepare, search } from './search.js';
import { layout, summary, reasonHtml, inChapters } from './results.js';
import { load, stepPicture } from './pictures.js';
import './lightbox.js';

const list = document.querySelector('.list');
const status = document.querySelector('.status');
const colhead = document.querySelector('.colhead');
const form = document.querySelector('form.find');
const field = form?.querySelector('input') ?? null;
const sortButtons = [...colhead.querySelectorAll('button[data-sort]')];
const onMap = status.querySelector('.on-map');
const mapAddress = onMap.getAttribute('href'); // map.html, or the way up to it from a page below the top
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// What the page holds, read from it by scan(): once here, and again on rescan().
let keywordButtons = [];
let kindButtons = [];
let labels = {};
let kindLabels = {};
let onMapKeywords = new Set(); // keywords with a row placed on the map
let rows = [];
let byNo = new Map();
let known = { keywords: new Set(), kinds: new Set(), rows: new Set() };
const headings = new Map(); // chapter id -> its heading, in the story order
let headed = true; // the headings stand in the list, as the page came
scan();

// What a search adds to the list: a line over each group, a line that offers the possible links
// not yet shown, and a line for a search that found nothing. Made once, put in when needed.
const groups = {
  precise: groupLine('Precise', 'what you typed stands in these'),
  possible: groupLine('Possible links', 'another language, a near spelling, the same word family, or only some of the words'),
};
const more = Object.assign(document.createElement('button'), { type: 'button', className: 'more-possible' });
const none = Object.assign(document.createElement('p'), { className: 'none' });

let sorted = [...rows]; // every row in the order the column heads ask for
let sortedBy = 'no';
let engine = null; // the index, ready to be searched
let asked = false; // the index has been sent for
let failed = false; // and could not be had
let allPossible = false; // every possible link shows, not the first thirty
let typing = false; // this drawing follows a keystroke in the search field
let addressing = 0; // the wait before the address follows what is typed
let state = parseState(location.hash, known);

if (field) {
  form.dataset.live = ''; // find.js leaves Enter to this page
  field.addEventListener('focus', needIndex);
  field.addEventListener('input', () => {
    state.q = field.value;
    allPossible = false;
    typing = true;
    render();
    typing = false;
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    toList();
  });
}
restore();

addEventListener('hashchange', () => {
  state = parseState(location.hash, known);
  allPossible = false;
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
    clearSearch();
    return filter(null);
  }
  if (target.closest('.more-possible')) {
    allPossible = true;
    return render();
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

// For edit mode, after it has changed the list: the page is read again and drawn in the same
// state, less what is no longer on it (a removed row is not open, a keyword gone filters nothing).
export function rescan() {
  scan();
  state.o = state.o.filter((no) => known.rows.has(no));
  if (state.k && !known.keywords.has(state.k)) state.k = null;
  if (state.t && !known.kinds.has(state.t)) state.t = null;
  sortedBy = null; // a row's place in the story may have changed
  render();
}

// Reads from the page the keywords, the kinds, the rows and the chapters' headings. While a search
// or another sort leaves the headings out of the list they are not on the page to be read, so
// those held stay, and any new one in the list joins them.
function scan() {
  keywordButtons = [...document.querySelectorAll('button[data-k]')];
  kindButtons = [...document.querySelectorAll('button[data-kind]')];
  labels = readJson('keyword-labels', {});
  kindLabels = readJson('kind-labels', {});
  onMapKeywords = new Set(readJson('keywords-on-map', []));
  rows = [...list.querySelectorAll('article.row')].map(readRow);
  byNo = new Map(rows.map((row) => [row.no, row]));
  known = {
    keywords: new Set(keywordButtons.map((b) => b.dataset.k)),
    kinds: new Set(kindButtons.map((b) => b.dataset.kind)),
    rows: new Set(byNo.keys()),
  };
  if (headed) headings.clear();
  for (const el of list.querySelectorAll('h2.chapter')) headings.set(el.dataset.chapter, el);
}

function readRow(el) {
  const why = el.querySelector('.why');
  return {
    el,
    no: el.dataset.no,
    at: Number(el.dataset.at),
    chapter: el.dataset.chapter,
    type: el.dataset.type,
    kind: el.dataset.kind,
    year: Number(el.dataset.year),
    kw: el.dataset.kw.split(' ').filter(Boolean),
    title: el.querySelector('.c-title button'),
    body: el.querySelector('.row-body'),
    why,
    said: why?.innerHTML ?? '', // the reasons now written under the title, as HTML
  };
}

// The state as the address gives it, applied without animation, the first open row in view.
function restore() {
  if (field && field.value !== state.q) field.value = state.q;
  list.classList.add('still');
  render();
  const first = [...list.children].find((el) => el.classList.contains('open') && !el.hidden);
  if (first) reveal(first, 'auto');
  requestAnimationFrame(() => requestAnimationFrame(() => list.classList.remove('still')));
}

function render() {
  if (state.s !== sortedBy) {
    sorted = [...rows].sort((a, b) => compare(a, b, state.s));
    sortedBy = state.s;
  }
  const typed = state.q.trim();
  if (typed) needIndex();
  // Until the index is there, and when it cannot be had, the list stays as the keyword and the
  // kind leave it; the status line says which.
  const found = typed && engine ? search(engine, state.q) : null;
  const view = layout(rows, state, found, { allPossible });

  // The rows that show, each with its reasons, and with a search the lines among them.
  const shown = new Map();
  const lines = [];
  for (const item of view.items) {
    if (item.row !== undefined) {
      const row = byNo.get(item.row);
      shown.set(row, item.reasons);
      lines.push(row.el);
    } else if (item.group) {
      groups[item.group].querySelector('sup').textContent = String(item.n);
      lines.push(groups[item.group]);
    } else if (item.more) {
      more.textContent = `${item.more} more possible ${item.more === 1 ? 'link' : 'links'}`;
      lines.push(more);
    }
  }
  if (view.searched && !view.items.length) {
    none.textContent = `Nothing found for “${typed}”.`;
    lines.push(none);
  }
  // Without a search every row keeps its place in the order of the column heads and the ones
  // left out are hidden where they stand; in the story order each chapter's heading stands over
  // its rows. With a search, the rows found come first, in their groups, and no heading stands.
  headed = !view.searched && state.s === 'no';
  let wanted;
  if (view.searched) {
    wanted = [...lines, ...sorted.filter((row) => !shown.has(row)).map((row) => row.el)];
  } else if (headed && headings.size) {
    wanted = inChapters(sorted, [...headings.keys()], { shows: (row) => shown.has(row), narrowed: Boolean(state.k || state.t) })
      .map((item) => (item.row ? item.row.el : heading(item)));
  } else {
    wanted = sorted.map((row) => row.el);
  }
  // Moved only when the order changes: a row put back in the list would lose the keyboard's focus.
  if (wanted.length !== list.children.length || wanted.some((el, n) => el !== list.children[n])) list.replaceChildren(...wanted);

  for (const row of rows) {
    const reasons = shown.get(row);
    row.el.hidden = reasons === undefined;
    const said = (reasons ?? []).map(reasonHtml).join('');
    if (row.why && row.said !== said) {
      row.why.innerHTML = said; // made by reasonHtml, which escapes every word of it
      row.said = said;
    }
    setOpen(row, state.o.includes(row.no));
  }
  for (const button of keywordButtons) button.setAttribute('aria-pressed', String(button.dataset.k === state.k));
  for (const button of kindButtons) button.setAttribute('aria-pressed', String(button.dataset.kind === state.t));
  for (const button of sortButtons) button.setAttribute('aria-pressed', String(button.dataset.sort === state.s));

  // Written only when it changes: the status is a live region and would be read out again.
  // The kind first, then the keyword, then what is searched: "Press · Typeface · “rosso”".
  const narrowed = [state.t && (kindLabels[state.t] ?? state.t), state.k && (labels[state.k] ?? state.k)].filter(Boolean);
  // What was typed counts as a search while the index is on its way, and once it is there only
  // if it holds a word: a lone quotation mark narrows nothing.
  const searching = Boolean(typed) && (view.searched || !engine);
  const says = summary({ total: rows.length, shown: view.shown, precise: view.precise, possible: view.possible, narrowed, q: searching ? state.q : '', ready: Boolean(engine), failed });
  setText(status.querySelector('.what'), says.what);
  setText(status.querySelector('.n'), says.n);
  status.querySelector('.show-all').hidden = !narrowed.length && !searching;
  onMap.hidden = !state.k || !onMapKeywords.has(state.k);
  onMap.href = state.k ? `${mapAddress}#k=${encodeURIComponent(state.k)}` : mapAddress;

  // The address follows at once, except while one types: then it waits for a pause, since a
  // browser allows only so many changes of the address in a short time (Safari: 100 in 30 s).
  clearTimeout(addressing);
  if (typing) addressing = setTimeout(writeAddress, 300);
  else writeAddress();
}

function writeAddress() {
  const hash = formatState(state);
  if (hash === location.hash) return;
  try {
    history.replaceState(null, '', hash || location.pathname + location.search);
  } catch {
    // The browser refused this change of the address; the page is right, the next change will tell.
  }
}

// Sends for the index once. Whether it comes or not, the page is drawn again: with what the
// search found, or with the status line saying that the search is not available.
function needIndex() {
  if (asked) return;
  asked = true;
  fetch('search.json')
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`search.json: ${response.status}`))))
    .then((index) => {
      engine = prepare(index);
    })
    .catch(() => {
      failed = true;
    })
    .finally(render);
}

function clearSearch() {
  state.q = '';
  allPossible = false;
  if (field) field.value = '';
}

function filter(k) {
  state.k = k;
  render();
  if (k) toList();
}

// To the top of the list: the kinds line when the page has one, so it stays in reach.
function toList() {
  const head = document.querySelector('.kinds') ?? colhead;
  scrollTo({ top: head.getBoundingClientRect().top + scrollY - status.offsetHeight, behavior: motion() });
}

function toggle(row) {
  state.o = state.o.includes(row.no) ? state.o.filter((no) => no !== row.no) : [...state.o, row.no];
  render();
}

// From a "Sources" number: open that row, showing all rows if a filter or the search hides it.
function openRow(row) {
  if (!state.o.includes(row.no)) state.o = [...state.o, row.no];
  if (!matches(row, state)) {
    state.k = null;
    state.t = null;
  }
  render();
  if (row.el.hidden) {
    clearSearch();
    render();
  }
  reveal(row.el, motion());
  row.title.focus({ preventScroll: true });
}

function setOpen(row, open) {
  if (row.el.classList.contains('open') === open) return;
  row.el.classList.toggle('open', open);
  row.title.setAttribute('aria-expanded', String(open));
  row.body.inert = !open;
  if (open) row.el.querySelectorAll('.pics figure:not([hidden]) img').forEach(load);
}

// A chapter's heading as the list wants it, shown or hidden.
function heading({ chapter, hidden }) {
  const el = headings.get(chapter);
  if (el.hidden !== hidden) el.hidden = hidden;
  return el;
}

// The line over a group: its name, the number of its rows, and in grey what the group is.
function groupLine(name, gloss) {
  const line = Object.assign(document.createElement('div'), { className: 'group' });
  line.append(name, document.createElement('sup'), Object.assign(document.createElement('span'), { className: 'gloss', textContent: gloss }));
  return line;
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
