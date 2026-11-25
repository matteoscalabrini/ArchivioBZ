// The compact view, for arranging the story: a switch in the bar (bar.js) makes every closed row
// one short line (edit.css, .list.compact) and gives each chapter's heading a fold, so that a
// chapter fits on the screen and a drag is short. A folded chapter's rows stay on the page, out of
// sight (.ed-folded), and its heading says how many they are; a row dropped just under it goes
// first in it (dropTarget, from drag.js). The switch and the folds are this browser's own, kept in
// localStorage when the browser allows it; without, the page works the same for the visit.
// Switched off, the page is as it was and the folds are forgotten.
import { state, list } from './core.js';
import { rowCount } from '../editmodel.js';

// Absent while the view is off; while it is on, the folded chapters' ids as JSON.
const KEY = 'archivio-edit-compact';

let on = false;
const folded = new Set();
try {
  const kept = localStorage.getItem(KEY);
  if (kept !== null) {
    on = true;
    const ids = JSON.parse(kept);
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') folded.add(id);
  }
} catch {
  // Nothing kept, or nothing that can be read: the view is off, as the page comes.
}
list.classList.toggle('compact', on);

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
    list.classList.toggle('compact', on);
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

list.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('h2.chapter button.ed-fold') : null;
  if (!button) return;
  const chapter = button.closest('h2.chapter').dataset.chapter;
  if (!folded.delete(chapter)) folded.add(chapter);
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

// After each drawing of the list (chapters.js) and each fold: every fold's sign and name, the
// count on a folded heading, and the rows of a folded chapter out of sight while its heading
// stands in the list; a search or another sort lists the rows without headings, every one in sight.
export function showFolds() {
  const standing = new Set();
  for (const heading of list.querySelectorAll(':scope > h2.chapter')) {
    const id = heading.dataset.chapter;
    standing.add(id);
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
    const words = shut ? rowCount(state.chapters.find((c) => c.id === id)?.rows.length ?? 0) : '';
    if (count.textContent !== words) count.textContent = words;
  }
  for (const row of list.querySelectorAll(':scope > article.row')) {
    const chapter = row.dataset.chapter;
    row.classList.toggle('ed-folded', standing.has(chapter) && isFolded(chapter));
  }
}
