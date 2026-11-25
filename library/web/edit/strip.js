// "All keywords" in edit mode. The strip is the server's drawing (keywordStrip in lib/pages.mjs),
// and every answer carries it as the draft now has it: core.js puts it here, so a keyword a row
// has just been given joins it at once, with its count, and library.js reads the page again. Its
// keywords are dragged into the author's order (design §7): the drop sends move-keyword, and the
// answer draws the strip in that order; a move refused puts back the strip as the last answer drew
// it. A press without a move filters, as on the public page; on a touch screen a short hold starts
// the drag, so that a swipe across the strip still scrolls the page. The strip's order is not the
// list's, so it drags whatever the sort, the filter or the search.
import Sortable from '../vendor/sortable.esm.js';
import { act, onStrip, redraw } from './core.js';

const strip = document.querySelector('.keywords');
let shown = strip.outerHTML; // the drawing the strip shows; null once a drag has changed it
let waiting = null; // a drawing that came while a keyword was pressed or held

Sortable.create(strip, {
  draggable: 'button[data-k]', // "All keywords", the label, is no keyword and stays first
  // As the rows (drag.js), moved by the pointer's own events, which a phone's browser has; the held
  // keyword is drawn inside the strip, not on the page's body, so it keeps the strip's type.
  forceFallback: true,
  // A press that slips a pixel or two is a press: as a drag that changed nothing, Sortable would
  // swallow its click, and it would filter nothing.
  fallbackTolerance: 3,
  delay: 150,
  delayOnTouchOnly: true,
  animation: 100,
  // The press is over, dragged or not: what came meanwhile goes in once the browser has sent the
  // click a press makes, so that the click reaches the keyword it was made on.
  onUnchoose: () => setTimeout(putWaiting),
  onEnd: ({ item, oldIndex, newIndex }) => {
    if (oldIndex !== newIndex) moved(item);
  },
});

// Told by core.js: the strip as an answer drew it. -> whether the page changed, so that the caller
// has library.js read it again. While a keyword of the strip is pressed or dragged (Sortable.dragged
// from the press on), the strip stays as the hand has it and the drawing waits: put in its place,
// it would take the keyword from under the hand.
onStrip((html) => {
  if (strip.contains(Sortable.dragged)) {
    waiting = html;
    return false;
  }
  waiting = null;
  return put(html);
});

function put(html) {
  if (html === shown) return false;
  const template = document.createElement('template');
  template.innerHTML = html; // the server's drawing, every label in it escaped (lib/pages.mjs)
  const focused = strip.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  strip.replaceChildren(...template.content.firstElementChild.childNodes);
  shown = html;
  if (focused) strip.querySelector(`button[data-k="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  return true;
}

function putWaiting() {
  if (waiting === null) return;
  const html = waiting;
  waiting = null;
  if (put(html)) redraw();
}

// A keyword let go in another place: sent with the keyword now after it, or none when it is last.
// The answer to the move brings the strip as it then stands, in place of what came meanwhile.
function moved(item) {
  waiting = null;
  shown = null;
  const next = item.nextElementSibling;
  act({ op: 'move-keyword', id: item.dataset.k, before: next?.matches('button[data-k]') ? next.dataset.k : null });
}
