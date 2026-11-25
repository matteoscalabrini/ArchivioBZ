// A row's pictures in edit mode: under each, ✕ (off the row, never out of storage), ← and → (one
// place back or on) and ✎ on its caption; with two pictures or more, the switch "Side by side".
// Each change sends the row's whole list of pictures (set-pictures), as the server keeps it.
import { state, list, send, act, say, showPicture } from './core.js';
import { iconButton } from './icons.js';
import { openField, input } from './field.js';
import { movePicture } from '../editmodel.js';

const held = (id) => (state.doc.rows[id]?.pictures ?? []).filter((p) => p?.src);
const listed = (pictures) => pictures.map(({ src, caption }) => ({ src, caption: caption ?? '' }));

export function dressPictures(el) {
  const pics = el.querySelector('.row-body .pics');
  if (!pics) return;
  const figures = [...pics.querySelectorAll(':scope > figure')];
  figures.forEach((figure, n) => {
    const tools = document.createElement('p');
    tools.className = 'ed-pic';
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
  const pictures = listed(held(id));
  if (what === 'pic-x') {
    showPicture.set(id, Math.max(0, n - 1));
    act({ op: 'set-pictures', id, pictures: pictures.filter((_, i) => i !== n) });
  } else if (what === 'pic-back' || what === 'pic-on') {
    const step = what === 'pic-back' ? -1 : 1;
    showPicture.set(id, n + step);
    act({ op: 'set-pictures', id, pictures: movePicture(pictures, n, step) });
  } else if (what === 'pic-caption') {
    editCaption(button, id, n);
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

function editCaption(opener, id, n) {
  const caption = opener.closest('figcaption');
  const words = caption.querySelector('.ed-v');
  const field = input(held(id)[n]?.caption ?? '', 'Caption', { className: 'ed-in-line' });
  openField({
    controls: [field],
    read: () => field.value.trim(),
    save: (text, box) => send({ op: 'set-pictures', id, pictures: listed(held(id)).map((p, i) => (i === n ? { ...p, caption: text } : p)) }, { field: box }),
    place: (box) => opener.after(box),
    hide: [words, opener],
    opener,
    key: `pic-caption:${n}`,
  });
}
