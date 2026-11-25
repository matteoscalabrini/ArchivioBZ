// A field in place of what ✎ follows, in the same place and font. It saves on Enter (in a line
// of its own, or in a select) and when the focus leaves it; Escape puts back what was there. A
// save the server refuses keeps the field open with what was typed and its answer under it, so
// nothing typed is lost (a session that ended, a number that is not one).
import { fieldClosed } from './core.js';

// `controls`: the inputs, selects and textareas of the field, filled. `read()`: their value now.
// `save(value, box)`: sends it; resolves when the server has taken it, rejects with the sentence
// to show. `place(box)`: puts the field on the page. `hide`: what it stands for, hidden meanwhile.
// `opener`: the ✎, which has the focus back after. `key`: what the field edits (data-ed).
// `changeSaves`: a choice saves at once (a lone select). `errorPlace(line)`: where the answer to a
// refused save goes, when the field's own place is too narrow for a sentence (the number's).
export function openField({ controls, read, save, place, hide = [], opener = null, key = '', block = false, changeSaves = false, errorPlace = null }) {
  const box = document.createElement(block ? 'div' : 'span');
  box.className = `ed-field${block ? ' ed-block' : ''}`;
  if (key) box.dataset.ed = key;
  const error = document.createElement('span');
  error.className = 'ed-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  box.append(...controls);
  place(box);
  if (errorPlace) errorPlace(error);
  else box.append(error);
  const row = box.closest('article.row');
  for (const el of hide) el.hidden = true;
  const initial = JSON.stringify(read());
  let saving = null;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    const had = box.contains(document.activeElement);
    box.remove();
    error.remove();
    for (const el of hide) el.hidden = false;
    if (had && opener?.isConnected) opener.focus({ preventScroll: true });
    fieldClosed(row);
  };

  // Resolves true once saved (or when nothing changed), false when refused.
  const commit = () => {
    if (closed) return Promise.resolve(true);
    if (saving) return saving;
    const value = read();
    if (JSON.stringify(value) === initial) {
      close();
      return Promise.resolve(true);
    }
    box.classList.add('busy');
    saving = Promise.resolve()
      .then(() => save(value, box))
      .then(() => {
        close();
        return true;
      }, (refusal) => {
        error.textContent = refusal?.message || String(refusal);
        error.hidden = false;
        return false;
      })
      .finally(() => {
        saving = null;
        box.classList.remove('busy');
      });
    return saving;
  };

  const cancel = () => {
    if (!saving) close();
  };

  box.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    } else if (event.key === 'Enter' && !event.isComposing) {
      const multiline = event.target instanceof HTMLTextAreaElement;
      if (multiline && !(event.metaKey || event.ctrlKey)) return; // a new line; ⌘ Enter saves
      event.preventDefault();
      commit();
    }
  });
  box.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && box.contains(event.relatedTarget)) return;
    // The focus may go nowhere for a moment (a click on the page): the field is left all the same.
    commit();
  });
  if (changeSaves) box.addEventListener('change', () => commit());

  const first = controls.find((el) => el.matches?.('input, textarea, select'));
  first?.focus({ preventScroll: true });
  if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) {
    if (first instanceof HTMLTextAreaElement) first.setSelectionRange(first.value.length, first.value.length);
    else first.select();
  }
  return { box, commit, cancel };
}

// The controls a field is made of, filled and named.
export function input(value, label, { placeholder = '', className = '', mode = '' } = {}) {
  const el = document.createElement('input');
  el.type = 'text';
  el.value = value ?? '';
  el.setAttribute('aria-label', label);
  el.autocomplete = 'off';
  el.spellcheck = false;
  if (placeholder) el.placeholder = placeholder;
  if (className) el.className = className;
  if (mode) el.inputMode = mode;
  sizeToText(el);
  el.addEventListener('input', () => sizeToText(el));
  return el;
}

// `grow`: as tall as what it holds (a row's text, the idea); else its height is the stylesheet's.
export function textarea(value, label, { className = '', grow: growing = true } = {}) {
  const el = document.createElement('textarea');
  el.value = value ?? '';
  el.setAttribute('aria-label', label);
  el.spellcheck = true;
  if (className) el.className = className;
  const grow = () => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  if (growing) {
    el.addEventListener('input', grow);
    requestAnimationFrame(grow);
  }
  return el;
}

// `options`: [[value, words]].
export function select(options, value, label, { className = '' } = {}) {
  const el = document.createElement('select');
  el.setAttribute('aria-label', label);
  if (className) el.className = className;
  for (const [v, words] of options) el.append(new Option(words, v, false, v === value));
  if (!options.some(([v]) => v === value) && options.length) el.value = options[0][0];
  return el;
}

// A one-line field as wide as what it holds, within what its place allows (edit.css).
function sizeToText(el) {
  el.style.setProperty('--chars', String(Math.max(4, el.value.length + 1)));
}
