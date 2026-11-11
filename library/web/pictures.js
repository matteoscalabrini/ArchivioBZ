// The pictures of a row, on the Library page and in the Map page's panel: a picture is fetched
// only when it is first shown, and "← 2 / 6 →" under a picture steps to the one before or after.
import { pictureAt } from './state.js';

// Gives a picture its address the first time it is shown (the build leaves it in data-src).
export function load(img) {
  if (img && !img.getAttribute('src')) img.src = img.dataset.src;
}

// One picture on (+1) or back (-1) from the one whose arrow was used. Each picture carries its own
// "← n / N →"; if the arrow used had the focus, the focus moves to the same arrow under the picture
// now shown, or to the other one where that is disabled, at the first or the last.
export function stepPicture(arrow, step) {
  const figures = [...arrow.closest('.pics').querySelectorAll('figure')];
  const from = figures.indexOf(arrow.closest('figure'));
  const to = pictureAt(from, step, figures.length);
  if (from < 0 || to === from) return;
  const focused = document.activeElement === arrow;
  figures.forEach((figure, i) => (figure.hidden = i !== to));
  load(figures[to].querySelector('img'));
  if (!focused) return;
  const arrows = [...figures[to].querySelectorAll('.pic-nav button[data-step]')].filter((button) => !button.disabled);
  (arrows.find((button) => button.dataset.step === arrow.dataset.step) ?? arrows[0])?.focus({ preventScroll: true });
}
