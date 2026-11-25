// The ＋ after a row's keywords: a list of the vocabulary under it, the keywords the row has left
// out, narrowed as one types, with a last line "New keyword…" that adds a keyword to the
// vocabulary and gives it to the row. A row has at most five; the server says so.
import { state, send } from './core.js';
import { offered } from '../editmodel.js';

let open = null; // the list now open: { pick, close }

export function openPicker(row, id, opener) {
  open?.close();
  const held = () => state.doc.rows[id]?.record.keywords ?? [];
  const pick = document.createElement('div');
  pick.className = 'ed-pick';
  pick.setAttribute('role', 'dialog');
  pick.setAttribute('aria-label', 'Keywords');
  const find = Object.assign(document.createElement('input'), { type: 'text', placeholder: 'Keyword', autocomplete: 'off', spellcheck: false });
  find.setAttribute('aria-label', 'Find a keyword, or type a new one');
  const choices = document.createElement('ul');
  const error = Object.assign(document.createElement('p'), { className: 'ed-error', hidden: true });
  error.setAttribute('role', 'alert');
  pick.append(find, choices, error);
  let making = false; // "New keyword…" chosen: what is typed is the new keyword's label
  let busy = false;

  const draw = () => {
    choices.replaceChildren();
    if (making) return;
    for (const { id: kid, label } of offered(state.doc.keywords, held(), find.value)) {
      const li = document.createElement('li');
      li.append(Object.assign(document.createElement('button'), { type: 'button', className: 'ed-pick-k', textContent: label, value: kid }));
      choices.append(li);
    }
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('button'), { type: 'button', className: 'ed-pick-new', textContent: 'New keyword…' }));
    choices.append(li);
  };

  const fail = (refusal) => {
    error.textContent = refusal.message;
    error.hidden = false;
  };
  const give = async (kid) => {
    if (busy) return;
    busy = true;
    try {
      await send({ op: 'set-row', id, fields: { keywords: [...held(), kid] } });
      close();
    } catch (refusal) {
      fail(refusal);
    } finally {
      busy = false;
    }
  };
  const make = async (label) => {
    if (busy || !label.trim()) return;
    busy = true;
    try {
      const answer = await send({ op: 'add-keyword', label });
      busy = false;
      await give(answer.result.id);
    } catch (refusal) {
      fail(refusal);
      busy = false;
    }
  };

  const outside = (event) => {
    if (!pick.contains(event.target) && event.target !== opener && !opener.contains(event.target)) close();
  };
  const close = () => {
    if (open?.pick !== pick) return;
    open = null;
    document.removeEventListener('pointerdown', outside, true);
    const had = pick.contains(document.activeElement);
    pick.remove();
    if (had && opener.isConnected) opener.focus({ preventScroll: true });
  };

  find.addEventListener('input', () => {
    error.hidden = true;
    draw();
  });
  pick.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter' && event.target === find) {
      event.preventDefault();
      const first = making ? null : choices.querySelector('.ed-pick-k');
      if (first) give(first.value);
      else make(find.value);
    }
  });
  pick.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    if (button.classList.contains('ed-pick-k')) give(button.value);
    else if (button.classList.contains('ed-pick-new')) {
      if (find.value.trim()) return make(find.value);
      making = true;
      find.placeholder = 'New keyword';
      draw();
      find.focus();
    }
    return undefined;
  });

  opener.closest('.c-kw').append(pick);
  open = { pick, close };
  document.addEventListener('pointerdown', outside, true);
  draw();
  find.focus({ preventScroll: true });
}
