// A row's pictures in edit mode: under each, ✕ (off the row, never out of storage), ← and → (one
// place back or on) and ✎ on its caption; with two pictures or more, the switch "Side by side".
// Each change names the one picture it is about, by its source (remove-picture, move-picture,
// set-caption), and the server applies it to the row as it then stands: two clicks made before the
// first is answered both count, which a whole list sent from the page could not promise.
import { state, list, send, act, say, showPicture } from './core.js';
import { iconButton } from './icons.js';
import { openField, input } from './field.js';

const held = (id) => (state.doc.rows[id]?.pictures ?? []).filter((p) => p?.src);

// Each figure's tools carry its picture's source, as the row was drawn: the page's draft may run
// ahead of a row that waits to be drawn again (core.js), so an index would name another picture.
export function dressPictures(el) {
  const pics = el.querySelector('.row-body .pics');
  if (!pics) return;
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

list.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('.ed-pic button.ed, figcaption button.ed') : null;
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
  const box = event.target instanceof HTMLInputElement && event.target.dataset.ed === 'side' ? event.target : null;
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
