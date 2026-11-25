// Dragging, by the grip: a row among the rows, into another chapter or to another place in its
// own; a chapter among the chapters, its rows folded away while it is held so that only the
// headings move. The page shows the new order at once and sends it; the server's answer brings
// the numbers. Dragging works only in the story order (the No. sort, nothing searched, no
// filter): elsewhere a place in the list says nothing of a place in the story, and the status
// line says so.
import Sortable from '../vendor/sortable.esm.js';
import { state, list, act, redraw } from './core.js';
import { dropTarget, chapterIndex, rowPlace, placeRow, placeChapter } from '../editmodel.js';

const OFF = 'Drag works in the story order: clear the search, the filters and the sort.';

const off = Object.assign(document.createElement('span'), { className: 'ed-dragoff', textContent: OFF, hidden: true });
document.querySelector('.status .now').after(off);

const sortable = Sortable.create(list, {
  handle: '.ed-grip',
  draggable: 'article.row, h2.chapter',
  // Moved by the pointer's own events rather than the browser's drag and drop, which a phone's
  // browser lacks and which draws the held element differently in each browser.
  forceFallback: true,
  fallbackOnBody: true,
  animation: 100,
  disabled: true,
  onChoose: ({ item }) => {
    if (item.matches('h2.chapter')) fold(item, true);
  },
  onUnchoose: ({ item }) => {
    if (list.classList.contains('folding')) fold(item, false);
  },
  onEnd: ({ item }) => dropped(item),
});

list.addEventListener('drawn', (event) => {
  const story = event.detail?.story === true;
  if (sortable.option('disabled') === story) sortable.option('disabled', !story);
  list.classList.toggle('story', story);
  off.hidden = story;
});

// The rows fold away or come back with the held heading kept where it was in the window.
function fold(heading, on) {
  const before = heading.getBoundingClientRect().top;
  list.classList.toggle('folding', on);
  window.scrollBy({ top: heading.getBoundingClientRect().top - before, behavior: 'instant' });
}

function dropped(item) {
  const sequence = [...list.children]
    .filter((el) => el.matches('article.row, h2.chapter'))
    .map((el) => (el.matches('h2.chapter') ? { kind: 'chapter', id: el.dataset.chapter } : { kind: 'row', id: el.dataset.no }));
  if (item.matches('h2.chapter')) {
    const chapter = item.dataset.chapter;
    const index = chapterIndex(sequence, chapter);
    if (index === state.chapters.findIndex((c) => c.id === chapter)) return redraw();
    state.chapters = placeChapter(state.chapters, chapter, index);
    redraw();
    return act({ op: 'move-chapter', chapter, index });
  }
  const id = item.dataset.no;
  const to = dropTarget(sequence, id);
  const from = rowPlace(state.chapters, id);
  if (!to.chapter || (from && from.chapter === to.chapter && from.index === to.index)) return redraw();
  state.chapters = placeRow(state.chapters, id, to.chapter, to.index);
  redraw();
  return act({ op: 'move-row', id, chapter: to.chapter, index: to.index });
}
