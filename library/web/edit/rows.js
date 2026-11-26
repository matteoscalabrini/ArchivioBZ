// A row in edit mode: the row as the server drew it, with its controls. In the head: the grip to
// drag it, ✎ on the number, the title and the date, the type as a choice, each keyword with ✕ and
// a ＋ for another, 👁 to hide or show it, 🗑 to remove it; on a closed row the number itself is a
// button too, the quick way to move a row without opening it. In the open row: ✎ on the text and
// on each line under it (Holder, Creator, Rights, Confidence, Source, Place), shown even when
// empty so that it can be filled. A click on any of these never opens or closes the row. Once a
// typed number is answered, the page follows the row to where it went.
import { state, list, onRow, send, act, say, rowEl, onTheirWay } from './core.js';
import { iconButton } from './icons.js';
import { openField, input, textarea, select } from './field.js';
import { ask } from './dialog.js';
import { openPicker } from './keywords.js';
import { dressPictures } from './pictures.js';
import { unfold } from './compact.js';
import { toParagraphs, fromParagraphs, yearValue, numberValue, removeQuestion, placedLine } from '../editmodel.js';

const CONFIDENCE = [['read', 'Read in the source'], ['secondary', 'From a secondary source'], ['lead', 'Lead, not yet a fact']];
// The lines under an open row's text, in the order lib/detail.mjs writes them.
const LINES = ['Holder', 'Creator', 'Rights', 'Confidence', 'Source', 'Place'];

const record = (id) => state.doc.rows[id]?.record ?? {};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

onRow(dressHead);
onRow(dressBody);
onRow(dressPictures);

function dressHead(el) {
  const id = el.dataset.no;
  const head = el.querySelector('.row-head');
  head.prepend(iconButton('grip', 'Drag to move the row', { className: 'ed-grip' }));

  // The number, a button that opens its field as ✎ does; on an open row it is the number as
  // text again (edit.css, and out of the keyboard's way after each drawing, below), so the open
  // row's head is as it was.
  const no = head.querySelector('.c-no');
  const number = Object.assign(document.createElement('button'), { type: 'button', className: 'ed ed-no', textContent: no.textContent || '—', title: 'Change the number' });
  number.dataset.ed = 'no'; // not ✎'s 'number': after the row is drawn anew, the focus finds the one it was on
  no.replaceChildren(number, iconButton('edit', 'Change the number', { key: 'number' }));

  head.querySelector('.c-title button').after(iconButton('edit', 'Edit the title', { key: 'title' }));

  const type = head.querySelector('.c-type');
  const choice = select(state.types.map((t) => [t, t]), record(id).type ?? type.textContent, 'Type');
  choice.dataset.ed = 'type';
  type.replaceChildren(choice);

  const date = head.querySelector('.c-date');
  const words = Object.assign(document.createElement('span'), { className: 'ed-v', textContent: date.textContent });
  date.replaceChildren(words, iconButton('edit', 'Edit the date', { key: 'date' }));

  const kw = head.querySelector('.c-kw');
  for (const button of kw.querySelectorAll('button[data-k]')) {
    button.after(iconButton('remove', `Take off the keyword ${button.textContent}`, { key: `kw:${button.dataset.k}`, className: 'ed-kw-x' }));
  }
  kw.append(' ', iconButton('add', 'Add a keyword', { key: 'kw-add', className: 'ed-kw-add' }));

  const acts = document.createElement('span');
  acts.className = 'ed-acts';
  const hidden = state.doc.rows[id]?.hidden === true;
  acts.append(
    iconButton(hidden ? 'hidden' : 'shown', hidden ? 'Show the row' : 'Hide the row', { key: 'hide' }),
    iconButton('trash', 'Remove the row', { key: 'remove' }),
  );
  head.append(acts);
}

function dressBody(el) {
  const txt = el.querySelector('.row-body .txt');
  if (!txt) return;
  const paragraphs = [...txt.children].filter((child) => child.tagName === 'P');
  let last = paragraphs.at(-1);
  if (!last) { // no text yet: a line that says where it goes
    last = Object.assign(document.createElement('p'), { className: 'ed-empty', textContent: 'Text' });
    txt.prepend(last);
  }
  last.append(' ', iconButton('edit', 'Edit the text', { key: 'text' }));

  // Every line, those the server left out because they are empty included, each with its ✎.
  let dl = txt.querySelector('dl.meta');
  if (!dl) {
    dl = Object.assign(document.createElement('dl'), { className: 'meta' });
    const more = txt.querySelector('.more');
    if (more) more.before(dl);
    else txt.append(dl);
  }
  const terms = new Map([...dl.querySelectorAll('dt')].map((dt) => [dt.textContent, dt]));
  const id = el.dataset.no;
  LINES.forEach((term, n) => {
    let dt = terms.get(term);
    if (!dt) {
      dt = Object.assign(document.createElement('dt'), { textContent: term });
      const dd = Object.assign(document.createElement('dd'), { className: 'ed-unset' });
      // Held but not shown (a confidence on a report): said in grey, as edit mode alone shows it.
      if (term === 'Confidence' && record(id).confidence) dd.textContent = confidenceWords(record(id).confidence);
      const next = LINES.slice(n + 1).map((t) => terms.get(t)).find(Boolean) ?? [...dl.querySelectorAll('dt')].find((d) => !LINES.includes(d.textContent));
      if (next) next.before(dt, dd);
      else dl.append(dt, dd);
      terms.set(term, dt);
    }
    const dd = dt.nextElementSibling;
    dd.append(dd.childNodes.length ? ' ' : '', iconButton('edit', `Edit ${term}`, { key: `line:${term}` }));
  });
}

function confidenceWords({ level, note }) {
  const words = CONFIDENCE.find(([l]) => l === level)?.[1] ?? level;
  return note ? `${words}; ${note}` : words;
}

// One listener for the whole list. It runs before library.js's, which opens and closes a row on a
// click in its head, and keeps every click on a control of edit mode from reaching it.
list.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !target.closest('.ed, .ed-field, .ed-pick, input, select, textarea, label')) return;
  event.stopPropagation();
  const button = target.closest('button.ed[data-ed]');
  const row = target.closest('article.row');
  if (!button || !row) return;
  const key = button.dataset.ed;
  const id = row.dataset.no;
  if (key === 'number' || key === 'no') return editNumber(row, id, button);
  if (key === 'title') return editTitle(row, id, button);
  if (key === 'date') return editDate(row, id, button);
  if (key === 'text') return editText(row, id, button);
  if (key.startsWith('line:')) return editLine(row, id, button, key.slice(5));
  // The one keyword clicked, not the row's list less it: a second ✕ made before the first is
  // answered would otherwise send the list the first had not yet changed, and put its keyword back.
  if (key.startsWith('kw:')) return act({ op: 'remove-keyword', id, keyword: key.slice(3) });
  if (key === 'kw-add') return openPicker(row, id, button);
  if (key === 'hide') return act({ op: 'hide-row', id, hidden: state.doc.rows[id]?.hidden !== true });
  if (key === 'remove') return removeRow(id);
  return undefined;
});

// An open row's number is out of the keyboard's way, as its pointer's (edit.css): ✎ beside it
// opens the field there, as before.
list.addEventListener('drawn', () => {
  for (const number of list.querySelectorAll('button.ed-no')) number.tabIndex = number.closest('article.row').classList.contains('open') ? -1 : 0;
});

// The type, a choice that saves at once; refused, it goes back.
list.addEventListener('change', (event) => {
  const choice = event.target instanceof HTMLSelectElement && event.target.dataset.ed === 'type' ? event.target : null;
  if (!choice) return;
  const id = choice.closest('article.row').dataset.no;
  const before = record(id).type;
  send({ op: 'set-row', id, fields: { type: choice.value } }).catch((error) => {
    if (choice.isConnected) choice.value = before;
    if (error.status !== 401 && error.status !== 409) say(error.message);
  });
});

const setRow = (id, fields) => (value, box) => send({ op: 'set-row', id, fields: fields(value) }, { field: box });

// The number on the decimal keypad, which has digits and the region's decimal separator, a full
// stop or a comma (an iPhone set to Italy shows only a comma; the numeric keypad would show
// neither); both are taken. Opened by ✎ or by the number itself; either way both stand aside.
function editNumber(row, id, opener) {
  const shown = row.querySelector('.ed-no');
  const pencil = row.querySelector('.c-no > button.ed-edit');
  const field = input(state.numbers[id] ?? '', 'Number', { className: 'ed-in-no', mode: 'decimal' });
  openField({
    controls: [field],
    read: () => numberValue(field.value),
    save: (number, box) => send({ op: 'set-number', id, number }, { field: box }).then(() => {
      requestAnimationFrame(() => follow(id, number)); // once the field has closed
    }),
    place: (box) => shown.after(box),
    hide: [shown, pencil],
    opener,
    key: 'number',
    errorPlace: (line) => row.querySelector('.row-head').append(line),
  });
}

// After a typed number, the row where it went: its chapter unfolded, its head in the middle of the
// window (at once for a reader who asks for less motion), an outline that fades on it for a moment,
// and, when it is not at the number typed (past its chapter's end, or the chapters closed up after
// the one it left), a line in the bar that says where it is. A drag does not come here: the row is
// under the pointer already. Nor does the page move when the author has gone on by the time the
// answer comes (another field open, a question asked, a row or a keyword held) or more edits are on
// their way, which will move the rows again: then the line alone says where the row went.
function follow(id, typed) {
  const row = rowEl(id);
  if (!row) return;
  const line = placedLine(typed, state.numbers[id]);
  if (line) say(line, 'info');
  if (document.querySelector('.ed-field, dialog[open], .sortable-chosen') || onTheirWay()) return;
  unfold(row.dataset.chapter);
  row.querySelector('.row-head').scrollIntoView({ block: 'center', behavior: reduced.matches ? 'instant' : 'smooth' });
  row.classList.remove('ed-placed');
  void row.offsetWidth; // the outline starts again on a row marked a moment ago
  row.classList.add('ed-placed');
}

list.addEventListener('animationend', (event) => {
  if (event.animationName === 'ed-placed') event.target.classList.remove('ed-placed');
});

function editTitle(row, id, opener) {
  const button = row.querySelector('.c-title button');
  const field = input(record(id).title ?? '', 'Title', { className: 'ed-in-title' });
  openField({
    controls: [field],
    read: () => field.value,
    save: setRow(id, (title) => ({ title })),
    place: (box) => opener.after(box),
    hide: [button, opener],
    opener,
    key: 'title',
  });
}

// The date as words and the year as a whole number (the date sort reads it), saved together.
function editDate(row, id, opener) {
  const words = row.querySelector('.c-date .ed-v');
  const { date = '', year = null } = record(id);
  const date1 = input(date, 'Date', { placeholder: 'Date', className: 'ed-in-date' });
  const year1 = input(year ?? '', 'Year, for the date sort', { placeholder: 'Year', className: 'ed-in-year', mode: 'numeric' });
  openField({
    controls: [date1, year1],
    read: () => ({ date: date1.value.trim(), year: yearValue(year1.value) }),
    save: setRow(id, (value) => value),
    place: (box) => opener.after(box),
    hide: [words, opener],
    opener,
    key: 'date',
    errorPlace: (line) => row.querySelector('.row-head').append(line),
  });
}

// The text in one field, its paragraphs parted by an empty line.
function editText(row, id, opener) {
  const txt = row.querySelector('.row-body .txt');
  const paragraphs = [...txt.children].filter((child) => child.tagName === 'P');
  const area = textarea(fromParagraphs(record(id).text ?? []), 'Text; an empty line between paragraphs', { className: 'ed-in-text' });
  openField({
    controls: [area],
    read: () => toParagraphs(area.value),
    save: setRow(id, (text) => ({ text })),
    place: (box) => txt.prepend(box),
    hide: paragraphs,
    opener,
    key: 'text',
    block: true,
  });
}

function editLine(row, id, opener, term) {
  const dd = opener.closest('dd');
  const shown = [...dd.childNodes].filter((node) => node !== opener);
  const rec = record(id);
  let controls;
  let read;
  let fields;
  let changeSaves = false;
  if (term === 'Holder' || term === 'Creator' || term === 'Rights') {
    const name = term.toLowerCase();
    const field = input(rec[name] ?? '', term, { className: 'ed-in-line' });
    controls = [field];
    read = () => field.value.trim();
    fields = (value) => ({ [name]: value });
  } else if (term === 'Confidence') {
    const level = select([['', 'None'], ...CONFIDENCE], rec.confidence?.level ?? '', 'Confidence');
    const note = input(rec.confidence?.note ?? '', 'Note on the confidence', { placeholder: 'Note', className: 'ed-in-line' });
    controls = [level, note];
    read = () => (level.value ? { level: level.value, note: note.value.trim() } : null);
    fields = (confidence) => ({ confidence });
  } else if (term === 'Source') {
    const label = input(rec.source?.label ?? '', 'Source, in words', { placeholder: 'Words', className: 'ed-in-line' });
    const url = input(rec.source?.url ?? '', 'Source, its address', { placeholder: 'Address', className: 'ed-in-line' });
    controls = [label, url];
    read = () => ({ label: label.value.trim(), url: url.value.trim() });
    fields = (source) => ({ source });
  } else if (term === 'Place') {
    const places = Object.entries(state.doc.places ?? {})
      .map(([pid, place]) => [pid, place.name ?? pid])
      .sort((a, b) => a[1].localeCompare(b[1], 'en'));
    const choice = select([['', 'None'], ...places], rec.place ?? '', 'Place');
    controls = [choice];
    read = () => choice.value || null;
    fields = (place) => ({ place });
    changeSaves = true;
  } else {
    return;
  }
  // The shown value is wrapped, so it can be hidden while the field is open.
  let wrap = dd.querySelector(':scope > .ed-v');
  if (!wrap) {
    wrap = Object.assign(document.createElement('span'), { className: 'ed-v' });
    wrap.append(...shown);
    dd.prepend(wrap);
  }
  openField({
    controls,
    read,
    save: setRow(id, fields),
    place: (box) => opener.after(box),
    hide: [wrap, opener],
    opener,
    key: `line:${term}`,
    changeSaves,
  });
}

async function removeRow(id) {
  const title = record(id).title ?? id;
  if (!(await ask(removeQuestion(title, state.published.has(id)), 'Remove'))) return;
  await act({ op: 'remove-row', id });
}
