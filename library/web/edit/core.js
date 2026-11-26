// What the parts of edit mode share: the draft as the page holds it, the queue that sends each
// edit to the server in turn, and what the page does with an answer. The rows on the page are
// the server's own drawing (lib/pages.mjs): an answer that carries a row is swapped in, the links
// the edit changed in other rows and the idea are put in theirs (`relinked`), "All keywords" is
// the answer's strip (strip.js), and the order, the numbers and the chapters' headings follow the
// answer's lists; library.js then reads the page again (rescan) and draws it in the state it was in.
import { OpQueue, Underway, IdeaDrawings, storyPlaces, headingsOf } from '../editmodel.js';
import { rescan, forgetIndex } from '../library.js';
import { load } from '../pictures.js';

export const LOGGED_OUT = 'Logged out. Log in again; what you typed is kept.';
export const CONFLICT = 'Changed in another window. Reload to see it.';

const data = JSON.parse(document.getElementById('edit-data').textContent);

export const list = document.querySelector('.list');

// `chapters`: the order the page shows, [{ id, title, rows }], which runs ahead of the server's
// while a dragged row is on its way; `confirmed`: the order of the last answer. `numbers`: each
// row's number by its id, '' for a hidden row.
export const state = {
  doc: data.doc,
  types: data.types,
  summary: data.summary,
  chapters: copy(data.doc.chapters),
  confirmed: copy(data.doc.chapters),
  numbers: Object.fromEntries([...list.querySelectorAll('article.row')].map((el) => [el.dataset.no, el.querySelector('.c-no').textContent.trim()])),
  published: new Set(data.published ?? []), // the rows some publish holds; a removal can bring them back
  originals: data.originals ?? null, // where a picture's original goes: 'upload' (the cloud) or 'original' (this computer)
};

// What the parts say to each other: 'summary' (the bar's line changed), 'say' ({ text, kind }:
// a line for the bar), 'conflict', 'answered' (an edit went through).
export const bus = new EventTarget();
export const tell = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const say = (text, kind = 'error') => tell('say', { text, kind });

// The ops go to /edit/op with the version; Publish and Discard to their own routes, in the same
// queue, so that they wait for the edits made before them and carry the version those left.
const ROUTES = { publish: 'publish', discard: 'discard' };
const queue = new OpQueue(({ version, op }) => (ROUTES[op.op] ? post(ROUTES[op.op], { version }) : post('op', { version, op })), data.version);
let pending = 0; // edits sent or waiting, not yet answered
// The edits on their way, and the saves that send them (a field, About, a keyword added and then
// given): an edit is answered before the field that sent it has closed, so settled() waits for
// the save as well, which the field marks with during().
const underway = new Underway();

// "All keywords" as the last answer drew it, the page's own until the first answer; what puts it
// on the page (strip.js) says whether the page changed.
let strip = document.querySelector('.keywords')?.outerHTML ?? '';
let putStrip = () => false;
export const onStrip = (fn) => {
  putStrip = fn;
};

// Resolves once every edit sent so far has its answer and every save has ended: each field left
// has closed, or stays open with what was refused.
export const settled = () => underway.settled();
export const during = (work) => underway.during(work);

function answered() {
  pending--;
  underway.end();
}

// Leaving the page (another address, a reload, closing the tab) asks first while an edit is on
// its way or a field holds what is not saved: typed and not yet left, refused, or saving. The
// parts that hold such a field say so here; leave() goes without asking, once the author has.
const unsavedChecks = new Set();
export function watchUnsaved(check) {
  unsavedChecks.add(check);
  return () => unsavedChecks.delete(check);
}
export const unsaved = () => pending > 0 || [...unsavedChecks].some((check) => check());
// Edits sent and not yet answered: the order the page shows may still change.
export const onTheirWay = () => pending > 0;
let leaving = false;
export function leave(go) {
  leaving = true;
  go();
}
addEventListener('beforeunload', (event) => {
  if (leaving || !unsaved()) return;
  event.preventDefault();
  event.returnValue = ''; // older browsers ask only when this is set
});

export async function post(route, body) {
  const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let answer = null;
  try {
    answer = await response.json();
  } catch {
    // not JSON: the status says enough
  }
  return { status: response.status, body: answer };
}

// Sends one edit and, once the server has taken it, shows it on the page. `field`: the open field
// it comes from, which may stay while its row is drawn anew. A refusal rejects with an Error whose
// message is the sentence to show, and its status.
export async function send(op, { field = null } = {}) {
  pending++;
  underway.begin();
  let answer;
  try {
    answer = await queue.push(op);
  } catch (error) {
    answered();
    refused(error);
    throw Object.assign(new Error(wordsFor(error)), { status: error.status, body: error.body });
  }
  answered();
  applied(op, answer, field);
  return answer;
}

// For an edit that comes from no field: its refusal is said in the bar.
export function act(op) {
  return send(op).catch((error) => {
    if (error.status !== 401 && error.status !== 409) say(error.message);
    return null;
  });
}

// The sentence for a refused request, by its status (0: no answer came); pictures.js says its own
// requests' refusals in the same words.
export function wordsFor(error) {
  if (error.status === 401) return LOGGED_OUT;
  if (error.status === 409) return CONFLICT;
  if (error.status === 0) return 'The server could not be reached. Nothing was saved; try again.';
  return error.message;
}

// A conflict or the end of the session is said in the bar whatever was being edited. Once nothing
// is waiting, the order the page shows goes back to the server's, and "All keywords" to the last
// answer's, undoing a refused drag of a row, a chapter or a keyword.
function refused(error) {
  if (error.status === 409) {
    tell('conflict');
  } else if (error.status === 401) {
    say(LOGGED_OUT, 'logged-out');
  }
  if (pending > 0) return;
  const back = !sameOrder(state.chapters, state.confirmed);
  if (back) state.chapters = copy(state.confirmed);
  if (putStrip(strip) || back) redraw();
}

function applied(op, answer, field) {
  tell('answered');
  if (typeof answer?.summary === 'string') setSummary(answer.summary);
  if (answer?.numbers) state.numbers = answer.numbers;
  if (Array.isArray(answer?.chapters)) state.confirmed = copy(answer.chapters);
  keep(op, answer);
  if (op.op === 'remove-row') rowEl(op.id)?.remove();
  if (typeof answer?.row === 'string') putRow(answer.result?.id ?? op.id, answer.row, field);
  for (const [id, html] of Object.entries(answer?.relinked?.rows ?? {})) relink(id, html);
  if (op.op === 'set-idea') ideas.saved(); // the idea's own save draws it again (idea.js)
  if (typeof answer?.relinked?.idea === 'string') putIdea(answer.relinked.idea, answer.version);
  if (typeof answer?.strip === 'string') strip = answer.strip;
  if (!Array.isArray(answer?.chapters)) return;
  // While edits wait behind this one, the page keeps the order it shows and "All keywords" as it
  // stands (a drag made meanwhile); the answer to the last of them brings the server's.
  if (pending === 0) {
    state.chapters = copy(state.confirmed);
    putStrip(strip);
  }
  redraw();
  // The search's index is the draft's as it was: once nothing more is on its way, it is sent for
  // again, so a new title, an added row and a number as it now stands are found.
  if (pending === 0) forgetIndex();
}

// The draft the page holds, brought up to what the server stored, for the fields' values. An edit
// of a row is answered with the row as stored (`stored`), which the page takes as it is: what each
// field then starts from is the server's own, and the next edit is built on it.
function keep(op, answer) {
  const { doc } = state;
  if (answer?.stored && typeof answer.stored === 'object') doc.rows[answer.result?.id ?? op.id] = answer.stored;
  else if (op.op === 'remove-row') delete doc.rows[op.id];
  else if (op.op === 'add-keyword' && answer.result?.id && !answer.result.existed) {
    const label = op.label.trim().replace(/\s+/g, ' ');
    doc.keywords[answer.result.id] = { label };
    // library.js names a keyword in the status line from this list.
    const labels = document.getElementById('keyword-labels');
    if (labels) labels.textContent = JSON.stringify({ ...JSON.parse(labels.textContent), [answer.result.id]: label }).replace(/</g, '\\u003c');
  } else if (op.op === 'set-idea') doc.idea = typeof answer.result?.text === 'string' ? answer.result.text : op.text; // without the stand-in line
  else if (op.op === 'set-about') doc.about = op.text;
}

export function setSummary(summary) {
  state.summary = summary;
  tell('summary', summary);
}

export const rowEl = (id) => list.querySelector(`article.row[data-no="${CSS.escape(id)}"]`);

// What each part does to a row drawn by the server, once per row element (rows.js).
const rowParts = [];
export const onRow = (fn) => rowParts.push(fn);
const dressed = new WeakSet();

// The page brought to the order and the numbers held: each row's place in the story and its
// chapter, its number ('—' for a hidden row), its controls; then library.js reads the page again,
// with the chapters for the headings.
export function redraw() {
  const places = storyPlaces(state.chapters);
  for (const el of list.querySelectorAll('article.row')) {
    const id = el.dataset.no;
    const place = places.get(id);
    if (place) {
      el.dataset.at = String(place.at);
      el.dataset.chapter = place.chapter;
    }
    dress(el);
    const no = el.querySelector('.ed-no') ?? el.querySelector('.c-no');
    if (Object.hasOwn(state.numbers, id)) {
      const shown = state.numbers[id] || '—';
      if (no.textContent !== shown) no.textContent = shown;
    }
  }
  rescan({ chapters: headingsOf(state.chapters, (id) => Boolean(state.doc.rows[id]) && state.doc.rows[id].hidden !== true) });
}

function dress(el) {
  if (dressed.has(el)) return;
  dressed.add(el);
  for (const part of rowParts) part(el);
}

// Rows drawn anew by the server wait while a field other than the one that sent the edit is open
// in them, so that nothing typed there is lost; they go in when the last such field closes.
const waiting = new Map(); // row id -> its HTML

function putRow(id, html, field) {
  const fresh = fromHtml(html);
  const old = rowEl(id);
  if (!old) {
    list.append(fresh); // a new row: rescan puts it in its place
    return;
  }
  if ([...old.querySelectorAll('.ed-field')].some((open) => open !== field)) {
    waiting.set(id, html);
    return;
  }
  waiting.delete(id);
  swap(old, fresh);
}

// Another row whose links an edit changed (a row it names hidden or retitled, a keyword no longer
// carried): `html`, the row as the server now draws it, gives the links, and only the links that
// read otherwise are put in, each in place of its old one. The row itself stays, and with it what
// is open or under way in it: a field, the keyword list, a file chooser, a held drag, the focus, a
// link a jump left from. Its text's own field hides those paragraphs and reads none of them, so
// they are brought up to date under it. A drawing of the row that waits for a field (putRow) is
// older than this one, which takes its place.
function relink(id, html) {
  if (waiting.has(id)) waiting.set(id, html);
  const row = rowEl(id);
  if (!row) return;
  const fresh = [...fromHtml(html).querySelectorAll('.row-body .txt > p')];
  const shown = [...row.querySelectorAll('.row-body .txt > p:not(.ed-empty)')];
  if (fresh.length !== shown.length) return; // not the text the server drew: the row's own answer brings it
  shown.forEach((p, i) => {
    const old = [...p.children].filter((el) => !el.matches('.ed')); // the links, less edit mode's ✎
    const now = [...fresh[i].children];
    if (old.length !== now.length) return;
    old.forEach((el, k) => {
      if (sameLink(el, now[k])) return;
      const focused = el === document.activeElement;
      el.replaceWith(now[k]);
      if (focused) now[k].focus({ preventScroll: true });
    });
  });
}

// The same link as drawn, less what library.js sets on a keyword's button (aria-pressed).
const sameLink = (a, b) => a.outerHTML.replace(/ aria-pressed="(?:true|false)"/, '') === b.outerHTML;

// Called by a field when it closes, with its row or the idea: what waited for it goes in now.
export function fieldClosed(row) {
  if (!row?.isConnected) return;
  if (row.matches('section.idea')) {
    if (row.querySelector('.ed-field')) return;
    const html = ideas.closed();
    if (html) {
      showIdea(row, html);
      redraw();
    }
    return;
  }
  const id = row.dataset.no;
  if (!waiting.has(id) || row.querySelector('.ed-field')) return;
  const html = waiting.get(id);
  waiting.delete(id);
  swap(row, fromHtml(html));
  redraw();
}

// The idea as the server draws it, with the draft version it was drawn from: after an edit changed
// what one of its links names (an answer's `relinked.idea`), or once the idea is saved (idea.js,
// `own`, which takes the place of its open field). Put in place of the page's and dressed again
// (idea.js, onIdea), unless a newer drawing is shown or waiting; while its field is open it waits,
// and goes in when the field closes (editmodel.js, IdeaDrawings). -> whether it went in.
let dressIdea = () => {};
export const onIdea = (fn) => {
  dressIdea = fn;
};
const ideas = new IdeaDrawings(data.version);

export function putIdea(html, version, { own = false } = {}) {
  const section = document.querySelector('section.idea');
  if (!section) return false;
  if (ideas.offer(html, version, { fieldOpen: Boolean(section.querySelector('.ed-field')), own }) !== 'put') return false;
  showIdea(section, html);
  return true;
}

function showIdea(section, html) {
  section.replaceWith(fromHtml(html));
  dressIdea();
}

// Before a row's pictures are drawn anew: the picture to show then, by its index (pictures.js).
export const showPicture = new Map();

// The new drawing of a row in place of the old, as the old one stood: open or closed, the same
// picture showing, hidden by a filter or not, the focus on the same control.
function swap(old, fresh) {
  const id = old.dataset.no;
  const focused = old.contains(document.activeElement) ? document.activeElement.closest('[data-ed]')?.dataset.ed : null;
  const figures = [...old.querySelectorAll('.pics figure')];
  const shownAt = figures.findIndex((figure) => !figure.hidden);
  fresh.hidden = old.hidden;
  if (old.classList.contains('open')) {
    fresh.classList.add('open');
    fresh.querySelector('.c-title button')?.setAttribute('aria-expanded', 'true');
    const body = fresh.querySelector('.row-body');
    if (body) body.inert = false;
  }
  const pics = fresh.querySelector('.pics');
  if (pics && !pics.classList.contains('side')) {
    const all = [...pics.querySelectorAll('figure')];
    const want = showPicture.get(id) ?? shownAt;
    if (want > 0 && want < all.length) all.forEach((figure, i) => (figure.hidden = i !== want));
  }
  showPicture.delete(id);
  if (fresh.classList.contains('open')) fresh.querySelectorAll('.pics figure:not([hidden]) img').forEach(load);
  old.replaceWith(fresh);
  dress(fresh);
  if (focused) fresh.querySelector(`button[data-ed="${CSS.escape(focused)}"], select[data-ed="${CSS.escape(focused)}"], input[data-ed="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

function fromHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html; // the server's drawing, every word in it escaped (lib/pages.mjs)
  return template.content.firstElementChild;
}

function copy(chapters) {
  return chapters.map(({ id, title, rows }) => ({ id, title, rows: [...rows] }));
}

function sameOrder(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
