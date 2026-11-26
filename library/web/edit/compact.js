// The compact view, for arranging the story: a switch in the bar (bar.js) makes every closed row
// one short line (edit.css, .list.compact) and gives each chapter's heading a fold, so that a
// chapter fits on the screen and a drag is short. A folded chapter's rows stay on the page, out of
// sight (.ed-folded), and its heading says how many they are; a row dropped just under it goes
// first in it (dropTarget, from drag.js). Folds act in the story order only, as dragging does:
// while a keyword, a kind or a search narrows the list, every row it holds is in sight. A row the
// page opens (its title, a Sources link, an address #o=, a row just added, a typed number) unfolds
// its chapter, since an open row is shown in full; folding a chapter closes its open rows; and a
// row that is open or holds the focus is never folded away (a row typed or dropped into a folded
// chapter while it is open, or while a field in it is open), so the count says only what is
// hidden. The switch and the folds are this browser's own, kept in localStorage when the browser
// allows it; without, the page works the same for the visit. Switched off, the page is as it was
// and the folds are forgotten.
import { list } from './core.js';
import { rowCount } from '../editmodel.js';

// Absent while the view is off; while it is on, the folded chapters' ids as JSON.
const KEY = 'archivio-edit-compact';

let on = false;
const folded = new Set();
let story = false; // the list stands in the story order (the last drawing said so)
let wasOpen = new Set(); // the rows open at the last drawing, by id
try {
  const kept = localStorage.getItem(KEY);
  on = kept !== null;
  const ids = on ? JSON.parse(kept) : [];
  if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') folded.add(id);
} catch {
  // Storage refused: the view is off, as the page comes. A kept value that cannot be read leaves
  // it on, with nothing folded.
}
list?.classList.toggle('compact', on); // a page in edit mode has no list, and no switch (bar.js)

function keep() {
  try {
    if (on) localStorage.setItem(KEY, JSON.stringify([...folded]));
    else localStorage.removeItem(KEY);
  } catch {
    // Not kept: the view holds for this visit all the same.
  }
}

// A folded chapter's rows are out of sight only while the view is on.
export const isFolded = (chapter) => on && folded.has(chapter);

// The switch, as the bar shows it.
export function compactSwitch() {
  const label = Object.assign(document.createElement('label'), { className: 'ed-switch ed-compact' });
  const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: on });
  box.setAttribute('role', 'switch');
  label.append(box, ' Compact');
  box.addEventListener('change', () => keepingPlace(() => {
    on = box.checked;
    if (!on) folded.clear();
    list?.classList.toggle('compact', on); // a page in edit mode has no list, and no switch (bar.js)
    keep();
    showFolds();
  }));
  return label;
}

// The row or heading in the middle of the window stays where it is while every row above it
// changes height, so that the switch does not lose the author's place.
function keepingPlace(change) {
  const at = document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.list > article.row, .list > h2.chapter');
  const before = at?.getBoundingClientRect().top;
  change();
  if (at?.isConnected) window.scrollBy({ top: at.getBoundingClientRect().top - before, behavior: 'instant' });
}

// Opened for a row brought into view there (rows.js, after a typed number).
export function unfold(chapter) {
  if (!folded.delete(chapter)) return;
  keep();
  showFolds();
}

// Folded, a chapter's open rows close as a reader closes them (library.js, which keeps the address
// in step): out of sight, they would stay open in the address and unfold the chapter at a reload.
list?.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('h2.chapter button.ed-fold') : null;
  if (!button) return;
  const chapter = button.closest('h2.chapter').dataset.chapter;
  if (!folded.delete(chapter)) {
    folded.add(chapter);
    for (const row of list.querySelectorAll(':scope > article.row.open')) {
      if (row.dataset.chapter === chapter) row.querySelector('.c-title > button:not(.ed)').click();
    }
  }
  keep();
  showFolds();
});

// A heading's fold before its title and the count after it, for chapters.js, which dresses the
// heading; shown in the compact view only (edit.css).
export function dressFold(heading) {
  const line = heading.querySelector('.ch-line');
  const button = Object.assign(document.createElement('button'), { type: 'button', className: 'ed ed-fold' });
  const count = Object.assign(document.createElement('span'), { className: 'ed-count', hidden: true });
  line.prepend(button, ' ');
  line.append(' ', count);
}

// After each drawing of the list (chapters.js, with `inStory`: whether the list now stands in the
// story order) and each fold: the chapters of the rows opened since the last drawing unfolded; in
// the story order the rows of a folded chapter out of sight, but for one that is open or holds the
// focus (out of sight, a field in it would close as if left and save what was half typed); every
// fold's sign and name, and on a folded heading the count of the rows it hides. Out of the story
// order (the fold and the count are then out of sight, edit.css) a fold hides nothing.
export function showFolds(inStory = story) {
  story = inStory;
  const open = [...list.querySelectorAll(':scope > article.row.open')];
  let opened = false;
  for (const row of open) if (!wasOpen.has(row.dataset.no) && folded.delete(row.dataset.chapter)) opened = true;
  wasOpen = new Set(open.map((row) => row.dataset.no));
  if (opened) keep();
  const hides = new Map(); // chapter -> how many of its rows the fold hides
  for (const row of list.querySelectorAll(':scope > article.row')) {
    const chapter = row.dataset.chapter;
    const away = story && isFolded(chapter) && !row.classList.contains('open') && !row.contains(document.activeElement);
    row.classList.toggle('ed-folded', away);
    if (away) hides.set(chapter, (hides.get(chapter) ?? 0) + 1);
  }
  for (const heading of list.querySelectorAll(':scope > h2.chapter')) {
    const id = heading.dataset.chapter;
    const button = heading.querySelector('.ed-fold');
    if (!button) continue;
    const shut = isFolded(id);
    const sign = shut ? '▸' : '▾';
    if (button.textContent !== sign) {
      const name = shut ? 'Unfold the chapter' : 'Fold the chapter';
      button.textContent = sign;
      button.setAttribute('aria-label', name);
      button.title = name;
    }
    const count = heading.querySelector('.ed-count');
    count.hidden = !shut;
    const words = shut ? rowCount(hides.get(id) ?? 0) : '';
    if (count.textContent !== words) count.textContent = words;
  }
}
