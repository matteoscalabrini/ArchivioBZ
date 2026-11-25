// The questions edit mode asks, each in a <dialog> on the page (never window.confirm, which a
// browser may stop showing): a question with one button that does it, and a short form.
import { select } from './field.js';

// Resolves true when the author chose `yes`, false on Cancel or Escape.
export function ask(question, yes) {
  return new Promise((resolve) => {
    const { dialog, buttons } = frame(yes);
    const p = document.createElement('p');
    p.className = 'ed-question';
    p.textContent = question;
    dialog.prepend(p);
    finish(dialog, buttons, resolve, () => true, false);
    buttons.yes.focus();
  });
}

// A form of a few fields: `fields` = [{ name, label, kind: 'text' | 'select', options, value }].
// Resolves { name: value } on `yes`, null on Cancel or Escape. `check(values)`: a sentence when
// the values cannot go (a title missing), shown under the fields; null when they can.
export function form(title, fields, yes, { check = () => null } = {}) {
  return new Promise((resolve) => {
    const { dialog, buttons } = frame(yes);
    const head = document.createElement('p');
    head.className = 'ed-question';
    head.textContent = title;
    const controls = new Map();
    const rows = fields.map((field) => {
      const label = document.createElement('label');
      label.className = 'ed-form-line';
      const words = document.createElement('span');
      words.textContent = field.label;
      const control = field.kind === 'select'
        ? select(field.options, field.value, field.label)
        : Object.assign(document.createElement('input'), { type: 'text', value: field.value ?? '', autocomplete: 'off' });
      controls.set(field.name, control);
      label.append(words, control);
      return label;
    });
    const line = document.createElement('p');
    line.className = 'ed-error';
    line.setAttribute('role', 'alert');
    line.hidden = true;
    dialog.prepend(head, ...rows, line);
    const values = () => Object.fromEntries([...controls].map(([name, control]) => [name, control.value]));
    finish(dialog, buttons, resolve, () => {
      const problem = check(values());
      if (!problem) return values();
      line.textContent = problem;
      line.hidden = false;
      return undefined; // stays open
    }, null);
    controls.values().next().value?.focus();
  });
}

function frame(yes) {
  const dialog = document.createElement('dialog');
  dialog.className = 'ed-dialog';
  const actions = document.createElement('p');
  actions.className = 'ed-dialog-actions';
  const make = (words, className) => Object.assign(document.createElement('button'), { type: 'button', textContent: words, className });
  const buttons = { yes: make(yes, 'ed-yes'), no: make('Cancel', 'ed-no') };
  actions.append(buttons.yes, buttons.no);
  dialog.append(actions);
  document.body.append(dialog);
  return { dialog, buttons };
}

// `take()`: the answer for `yes`, or undefined to stay open. `none`: the answer for Cancel.
function finish(dialog, buttons, resolve, take, none) {
  let done = false;
  const end = (value) => {
    if (done) return;
    done = true;
    dialog.close();
    dialog.remove();
    resolve(value);
  };
  buttons.yes.addEventListener('click', () => {
    const value = take();
    if (value !== undefined) end(value);
  });
  buttons.no.addEventListener('click', () => end(none));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    end(none);
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      buttons.yes.click();
    }
  });
  dialog.showModal();
}
