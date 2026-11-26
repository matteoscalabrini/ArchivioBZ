// A row's pictures in edit mode: under each, ✕ (off the row, never out of storage), ← and → (one
// place back or on) and ✎ on its caption; with two pictures or more, the switch "Side by side".
// Each change names the one picture it is about, by its source (remove-picture, move-picture,
// set-caption), and the server applies it to the row as it then stands: two clicks made before the
// first is answered both count, which a whole list sent from the page could not promise.
//
// ＋ picture, in an open row, under its pictures (after "Side by side") or, in a row with none,
// where they would be: it opens the file chooser, several files at once; files dropped on an open
// row do the same. The files go one at a time, in the order given: each original is sent as it is
// (to the private store with a token from /edit/upload, or on this computer to /edit/original),
// /edit/picture makes the site's two JPEGs of it, and add-picture puts them last in the row
// through the queue, which draws the row anew showing the new picture. A file refused is said in
// the bar, and the next one goes on; but once the session has ended or another window has changed
// the draft, every file after would be refused too, after its upload: those still waiting are not
// sent, and the bar says so. Until the last is added, the work is under way: leaving the page asks
// first, and Log out and Publish wait for it.
import { state, list, send, act, say, post, during, watchUnsaved, showPicture, rowEl, wordsFor } from './core.js';
import { iconButton, wordButton } from './icons.js';
import { openField, input } from './field.js';

const held = (id) => (state.doc.rows[id]?.pictures ?? []).filter((p) => p?.src);

// The kinds of file taken and the name each original is given, and the largest original, as the
// server takes them (cloud/pictures.mjs).
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const LARGEST = 104857600; // 100 MB
// The session ended while files were waiting: the files still waiting are not sent, and nothing
// keeps them, so the author chooses them again once logged in.
const LOGGED_OUT_WAITING = 'Logged out. Log in again and choose the pictures not yet added.';

// Each figure's tools carry its picture's source, as the row was drawn: the page's draft may run
// ahead of a row that waits to be drawn again (core.js), so an index would name another picture.
export function dressPictures(el) {
  const pics = el.querySelector('.row-body .pics');
  if (pics) dressFigures(el, pics);
  dressAdd(el, pics);
}

function dressFigures(el, pics) {
  const figures = [...pics.querySelectorAll(':scope > figure')];
  const pictures = held(el.dataset.no);
  figures.forEach((figure, n) => {
    const tools = document.createElement('p');
    tools.className = 'ed-pic';
    tools.dataset.picture = pictures[n]?.src ?? '';
    const back = iconButton('back', 'Move the picture back', { key: `pic-back:${n}` });
    const on = iconButton('on', 'Move the picture on', { key: `pic-on:${n}` });
    back.disabled = n === 0;
    on.disabled = n === figures.length - 1;
    tools.append(iconButton('remove', 'Take the picture off the row', { key: `pic-x:${n}` }), back, on);
    let caption = figure.querySelector('figcaption');
    if (!caption) {
      caption = Object.assign(document.createElement('figcaption'), { className: 'ed-unset' });
      figure.append(caption);
    }
    const words = Object.assign(document.createElement('span'), { className: 'ed-v', textContent: caption.textContent });
    caption.replaceChildren(words, caption.textContent ? ' ' : '', iconButton('edit', 'Edit the caption', { key: `pic-caption:${n}` }));
    caption.dataset.picture = tools.dataset.picture;
    caption.before(tools);
  });
  if (figures.length > 1) {
    const id = el.dataset.no;
    const label = document.createElement('label');
    label.className = 'ed-switch';
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: state.doc.rows[id]?.record.side_by_side === true });
    box.dataset.ed = 'side';
    box.setAttribute('role', 'switch');
    label.append(box, ' Side by side');
    pics.append(label); // inside the pictures' column, under them
  }
}

// The line of ＋ picture: the button, the file chooser it opens, and the words said while the
// row's pictures are being added. Not drawn where the server has no stores for pictures.
function dressAdd(el, pics) {
  const detail = el.querySelector('.row-body .detail');
  if (!state.originals || !detail) return;
  const line = document.createElement('p');
  line.className = 'ed-add-pic';
  const button = wordButton('picture', { first: 'add', className: 'ed-add-picture' });
  button.dataset.ed = 'pic-add';
  const chooser = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: Object.keys(EXTENSIONS).join(','), hidden: true });
  chooser.dataset.ed = 'pic-file';
  const adding = Object.assign(document.createElement('span'), { className: 'ed-adding' });
  adding.setAttribute('role', 'status');
  line.append(button, chooser, adding);
  if (pics) {
    pics.append(line);
  } else {
    const place = Object.assign(document.createElement('div'), { className: 'ed-pics' }); // where the pictures would be
    place.append(line);
    detail.prepend(place);
  }
  showRun(el);
}

list.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const add = target?.closest('button.ed[data-ed="pic-add"]');
  if (add) {
    add.closest('.ed-add-pic').querySelector('input[type=file]').click();
    return;
  }
  const button = target?.closest('.ed-pic button.ed, figcaption button.ed');
  if (!button) return;
  const row = button.closest('article.row');
  const id = row.dataset.no;
  const [what, at] = button.dataset.ed.split(':');
  const n = Number(at);
  const src = button.closest('[data-picture]')?.dataset.picture;
  if (!src) return;
  if (what === 'pic-x') {
    showPicture.set(id, Math.max(0, n - 1));
    act({ op: 'remove-picture', id, src });
  } else if (what === 'pic-back' || what === 'pic-on') {
    const step = what === 'pic-back' ? -1 : 1;
    showPicture.set(id, n + step);
    act({ op: 'move-picture', id, src, step });
  } else if (what === 'pic-caption') {
    editCaption(button, id, n, src);
  }
});

list.addEventListener('change', (event) => {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  if (target?.dataset.ed === 'pic-file') {
    addFiles(target.closest('article.row').dataset.no, target.files);
    target.value = ''; // the same file can be chosen again
    return;
  }
  const box = target?.dataset.ed === 'side' ? target : null;
  if (!box) return;
  const id = box.closest('article.row').dataset.no;
  send({ op: 'set-row', id, fields: { side_by_side: box.checked } }).catch((error) => {
    if (box.isConnected) box.checked = !box.checked;
    if (error.status !== 401 && error.status !== 409) say(error.message);
  });
});

function editCaption(opener, id, n, src) {
  const caption = opener.closest('figcaption');
  const words = caption.querySelector('.ed-v');
  const field = input(held(id).find((p) => p.src === src)?.caption ?? '', 'Caption', { className: 'ed-in-line' });
  openField({
    controls: [field],
    read: () => field.value.trim(),
    save: (text, box) => send({ op: 'set-caption', id, src, caption: text }, { field: box }),
    place: (box) => opener.after(box),
    hide: [words, opener],
    opener,
    key: `pic-caption:${n}`,
  });
}

// Files dragged from the computer onto an open row: the row is marked while they are over it, and
// they are added as if chosen. Only a drag that carries files counts; rows and keywords are
// dragged by the pointer's own events (drag.js, strip.js) and never come here. Files let go
// anywhere else on the page are refused, so that the browser does not leave the page to show one.
const carriesFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
const openRowAt = (event) => (state.originals && event.target instanceof Element ? event.target.closest('article.row.open') : null);
function markDrop(row) {
  for (const el of list.querySelectorAll('article.row.ed-drop')) if (el !== row) el.classList.remove('ed-drop');
  row?.classList.add('ed-drop');
}

list.addEventListener('dragover', (event) => {
  const row = carriesFiles(event) ? openRowAt(event) : null;
  if (!row) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  markDrop(row);
});
list.addEventListener('drop', (event) => {
  const row = carriesFiles(event) ? openRowAt(event) : null;
  if (!row) return;
  event.preventDefault();
  markDrop(null);
  addFiles(row.dataset.no, event.dataTransfer.files);
});
document.addEventListener('dragover', (event) => {
  if (!carriesFiles(event) || event.defaultPrevented) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'none';
  markDrop(null);
});
document.addEventListener('drop', (event) => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  markDrop(null);
});
document.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) markDrop(null); // out of the window
});

// The files on their way, one after the other in the order given, whichever rows they go to; and,
// for each row with files on their way, which of them is being added: { at, of }. `round`: a file
// refused for the session's end or for another window's change ends the round, and a file of an
// earlier round is not sent; files chosen after it go on.
let chain = Promise.resolve();
let waiting = 0;
const runs = new Map();
let round = 0;
watchUnsaved(() => waiting > 0);

function endRound() {
  round += 1;
  for (const id of [...runs.keys()]) {
    runs.delete(id);
    showRun(rowEl(id));
  }
}

// Why a file is not sent, in the words of the bar; or '' when it is taken.
function refusal(file) {
  if (!Object.hasOwn(EXTENSIONS, file.type)) return `${file.name}: only JPEG, PNG and WebP pictures are taken.`;
  if (file.size > LARGEST) return `${file.name} is larger than 100 MB.`;
  return '';
}

function addFiles(id, files) {
  const given = [...(files ?? [])];
  const refused = given.map(refusal).filter(Boolean);
  if (refused.length) say(refused.join(' '));
  const taken = given.filter((file) => !refusal(file));
  if (!taken.length) return;
  const run = runs.get(id) ?? { at: 0, of: 0 };
  run.of += taken.length;
  runs.set(id, run);
  showRun(rowEl(id));
  const mine = round;
  for (const file of taken) {
    waiting++;
    const job = chain
      .then(() => {
        if (mine !== round) return undefined;
        run.at++;
        showRun(rowEl(id));
        return addOne(id, file);
      })
      .finally(() => {
        waiting--;
        if (runs.get(id) === run && run.at === run.of) runs.delete(id);
        showRun(rowEl(id));
      });
    chain = job.catch(() => {}); // addOne says what went wrong; the next file goes on all the same
    during(chain);
  }
}

// One file: its original sent, its pictures made, then added to the row. Never rejects: what goes
// wrong is said in the bar, and the next file goes on, unless the session has ended (401) or
// another window has changed the draft (409, which the queue says in the bar itself): then the
// round ends.
async function addOne(id, file) {
  try {
    if (!state.doc.rows[id]) return; // the row was removed meanwhile
    const pathname = await sendOriginal(id, file);
    const { picture } = await ask('picture', { id, pathname });
    if (!state.doc.rows[id]) return;
    showPicture.set(id, held(id).length); // the new picture, last, is the one shown
    await send({ op: 'add-picture', id, picture });
  } catch (error) {
    showPicture.delete(id);
    if (error.status === 401 || error.status === 409) endRound();
    if (error.status === 401) say(LOGGED_OUT_WAITING, 'logged-out');
    else if (error.status !== 409) say(error.message);
  }
}

// The original as it is, under a name made of the row's id and the time (never the name it has on
// the author's computer), into the private store with a token from /edit/upload, or on this
// computer to /edit/original. -> the name the store keeps it under, its random suffix added.
async function sendOriginal(id, file) {
  const pathname = `originals/${id}-${Date.now().toString(36)}.${EXTENSIONS[file.type]}`;
  if (state.originals === 'original') {
    const sent = await answered(async () => {
      const response = await fetch('original', { method: 'POST', headers: { 'Content-Type': file.type, 'X-Pathname': pathname }, body: file });
      return { status: response.status, body: await response.json().catch(() => null) };
    });
    return sent.pathname;
  }
  const { clientToken } = await ask('upload', { type: 'blob.generate-client-token', payload: { pathname, clientPayload: null, multipart: false } });
  const { put } = await import('../vendor/blob-client.esm.js');
  try {
    return (await put(pathname, file, { access: 'private', token: clientToken, contentType: file.type })).pathname;
  } catch (error) {
    throw new Error(`${file.name} could not be sent: ${error.message}`);
  }
}

// A request of edit mode outside the queue (`request()` -> { status, body }), answered with its
// JSON; refused with an Error whose message is the sentence to show (core.js's words), and its
// status.
async function answered(request) {
  let response;
  try {
    response = await request();
  } catch {
    throw Object.assign(new Error(wordsFor({ status: 0 })), { status: 0 });
  }
  if (response.status === 200) return response.body;
  const refusal = { status: response.status, message: response.body?.error ?? `The server answered ${response.status}.` };
  throw Object.assign(new Error(wordsFor(refusal)), { status: response.status });
}
const ask = (route, body) => answered(() => post(route, body));

// The line of ＋ picture as the row's run stands: the button, or "Adding picture 2 of 3…".
function showRun(row) {
  const line = row?.querySelector('.ed-add-pic');
  if (!line) return;
  const run = runs.get(row.dataset.no);
  const words = run ? `Adding picture ${Math.max(1, run.at)} of ${run.of}…` : '';
  line.querySelector('button').hidden = Boolean(run);
  const adding = line.querySelector('.ed-adding');
  if (adding.textContent !== words) adding.textContent = words;
}
