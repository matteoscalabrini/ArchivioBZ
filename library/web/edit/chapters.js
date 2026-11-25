// The chapters in edit mode: each heading with its grip, ✎ on its title and, once it holds no row,
// 🗑; "＋ row here" under each row (shown while the pointer is on the row) and at the end of each
// chapter, and "＋ chapter here" after each chapter's last row. Adding asks for a title (and a
// row for its type); a new row opens. Only in the story order: elsewhere a place in a chapter
// means nothing.
import { state, list, act, send, rowEl } from './core.js';
import { iconButton, wordButton } from './icons.js';
import { openField, input } from './field.js';
import { form } from './dialog.js';
import { rowPlace } from '../editmodel.js';

const dressed = new WeakSet();

// After each drawing of the list: the headings dressed, the lines at the ends of the chapters
// where they now are, 🗑 on the empty chapters only.
list.addEventListener('drawn', () => {
  const ends = new Map(); // the element that ends each chapter -> the chapter
  for (const chapter of state.chapters) {
    const last = chapter.rows.at(-1);
    const el = last ? rowEl(last) : list.querySelector(`h2.chapter[data-chapter="${CSS.escape(chapter.id)}"]`);
    if (el) ends.set(el, chapter.id);
  }
  for (const heading of list.querySelectorAll('h2.chapter')) {
    dressHeading(heading);
    const chapter = state.chapters.find((c) => c.id === heading.dataset.chapter);
    heading.querySelector('.ed-trash').hidden = Boolean(chapter?.rows.length);
  }
  for (const end of list.querySelectorAll('.ed-end')) {
    if (ends.get(end.parentElement) !== end.dataset.chapter) end.remove();
  }
  for (const [el, chapter] of ends) {
    if (!el.querySelector(':scope > .ed-end')) el.append(endLine(chapter));
  }
  for (const row of list.querySelectorAll('article.row')) {
    if (!row.querySelector(':scope > .ed-here')) row.append(hereLine());
  }
});

// A heading as the server wrote it holds its title as text after the number: the title goes into
// .ch-title (which library.js keeps up to date), with its controls beside it.
function dressHeading(heading) {
  if (dressed.has(heading)) return;
  dressed.add(heading);
  const number = heading.querySelector('.ch-no');
  const words = [...heading.childNodes].filter((node) => node !== number && node.nodeType === Node.TEXT_NODE);
  const title = Object.assign(document.createElement('span'), { className: 'ch-title', textContent: words.map((n) => n.textContent).join('').trim() });
  words.forEach((node) => node.remove());
  const line = document.createElement('span');
  line.className = 'ch-line';
  line.append(title, ' ', iconButton('edit', 'Rename the chapter', { key: 'chapter-title' }), ' ', iconButton('trash', 'Remove the chapter', { key: 'chapter-remove' }));
  heading.append(line);
  heading.prepend(iconButton('grip', 'Drag to move the chapter', { className: 'ed-grip' }));
}

function endLine(chapter) {
  const end = document.createElement('div');
  end.className = 'ed-end';
  end.dataset.chapter = chapter;
  end.append(wordButton('row here', { first: 'add', className: 'ed-add-row' }), wordButton('chapter here', { first: 'add', className: 'ed-add-chapter' }));
  return end;
}

function hereLine() {
  const here = document.createElement('div');
  here.className = 'ed-here';
  here.append(wordButton('row here', { first: 'add', className: 'ed-add-row' }));
  return here;
}

list.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest('button.ed');
  if (!button) return;
  const heading = button.closest('h2.chapter');
  if (button.dataset.ed === 'chapter-title' && heading) return renameChapter(heading, button);
  if (button.dataset.ed === 'chapter-remove' && heading) return act({ op: 'remove-chapter', chapter: heading.dataset.chapter });
  if (button.classList.contains('ed-add-row')) return addRow(button);
  if (button.classList.contains('ed-add-chapter')) return addChapter(button.closest('.ed-end').dataset.chapter);
  return undefined;
});

// The new row goes after the row whose line was used, or last in the chapter whose end it was.
async function addRow(button) {
  const end = button.closest('.ed-end');
  let chapter;
  let index;
  if (end && end.parentElement.matches('h2.chapter')) {
    chapter = end.dataset.chapter;
    index = 0;
  } else {
    const place = rowPlace(state.chapters, button.closest('article.row').dataset.no);
    if (!place) return;
    chapter = place.chapter;
    index = place.index + 1;
  }
  const values = await form('A new row', [
    { name: 'title', label: 'Title', kind: 'text' },
    { name: 'type', label: 'Type', kind: 'select', options: state.types.map((t) => [t, t]), value: state.types[0] },
  ], 'Add', { check: ({ title }) => (title.trim() ? null : 'The row needs a title.') });
  if (!values) return;
  const answer = await act({ op: 'add-row', chapter, index, title: values.title, type: values.type });
  const row = answer?.result?.id ? rowEl(answer.result.id) : null;
  if (!row) return;
  // Opened as a reader would open it, and brought into view under the status line.
  row.querySelector('.c-title button').click();
  row.scrollIntoView({ block: 'center' });
}

async function addChapter(after) {
  const values = await form('A new chapter', [{ name: 'title', label: 'Title', kind: 'text' }], 'Add',
    { check: ({ title }) => (title.trim() ? null : 'The chapter needs a title.') });
  if (!values) return;
  const index = state.chapters.findIndex((c) => c.id === after) + 1;
  await act({ op: 'add-chapter', index, title: values.title });
}

function renameChapter(heading, opener) {
  const title = heading.querySelector('.ch-title');
  const chapter = heading.dataset.chapter;
  const field = input(state.chapters.find((c) => c.id === chapter)?.title ?? title.textContent, 'Chapter title', { className: 'ed-in-chapter' });
  const trash = heading.querySelector('.ed-trash');
  openField({
    controls: [field],
    read: () => field.value,
    save: (text, box) => send({ op: 'rename-chapter', chapter, title: text }, { field: box }),
    place: (box) => title.after(box),
    hide: [title, opener],
    opener,
    key: 'chapter-title',
  });
  if (trash) trash.hidden = true;
}
