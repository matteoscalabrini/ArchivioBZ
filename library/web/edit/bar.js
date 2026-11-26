// The edit bar, above the idea and held under the top of the window: "Draft · " and how the draft
// differs from what is public, then the switch Compact (compact.js), About ✎, Public site,
// Discard, Publish and Log out. Under its words, a line for what went wrong where no field was
// open, for a conflict, which asks for a reload since every later edit would meet it too, and for
// where a row went when it is not where its typed number said. A page in edit mode (pages.js) has
// the bar too, without Compact, since it has no list of rows.
import { state, bus, list, send, post, setSummary, settled, during, unsaved, leave, watchUnsaved, CONFLICT } from './core.js';
import { publishQuestion } from '../editmodel.js';
import { wordButton } from './icons.js';
import { ask } from './dialog.js';
import { textarea } from './field.js';
import { attachLinker } from './linker.js';
import { compactSwitch } from './compact.js';

const NOTHING = 'No changes since the last publish';

export function makeBar() {
  const bar = document.createElement('div');
  bar.className = 'ed-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Edit mode');

  const draft = document.createElement('p');
  draft.className = 'ed-draft';
  const label = Object.assign(document.createElement('span'), { className: 'ed-label', textContent: 'Draft' });
  const summary = Object.assign(document.createElement('span'), { className: 'ed-summary', textContent: state.summary });
  summary.setAttribute('aria-live', 'polite');
  draft.append(label, ' · ', summary);

  const actions = document.createElement('p');
  actions.className = 'ed-actions';
  const about = wordButton('About', { name: 'edit', className: 'ed-about' });
  const site = Object.assign(document.createElement('a'), { href: '/', textContent: 'Public site', className: 'ed-site' });
  const discard = wordButton('Discard');
  const publish = wordButton('Publish', { className: 'ed-publish' });
  const logout = wordButton('Log out');
  actions.append(...(list ? [compactSwitch()] : []), about, site, discard, publish, logout);

  const message = document.createElement('p');
  message.className = 'ed-msg';
  message.setAttribute('role', 'alert');
  message.hidden = true;

  bar.append(draft, actions, message);
  document.querySelector('main').prepend(bar);

  // The status line sticks under the bar: its height is the bar's, whatever it wraps to.
  const root = document.documentElement;
  new ResizeObserver(() => root.style.setProperty('--edit-bar', `${bar.offsetHeight}px`)).observe(bar);

  bus.addEventListener('summary', (event) => {
    if (summary.textContent !== event.detail) summary.textContent = event.detail;
  });
  bus.addEventListener('say', (event) => show(message, event.detail));
  bus.addEventListener('conflict', () => show(message, { text: CONFLICT, kind: 'conflict' }));
  // Logged in again on another tab: the next edit that goes through clears the line; it clears
  // the line about the edit before it too.
  bus.addEventListener('answered', () => {
    if (message.dataset.kind === 'logged-out' || message.dataset.kind === 'info') hide(message);
  });

  about.addEventListener('click', () => editAbout());
  discard.addEventListener('click', async () => {
    if (!(await ask('Discard the draft and go back to what is public?', 'Discard'))) return;
    try {
      await send({ op: 'discard' });
      leave(() => location.reload()); // asked already: what is typed goes with the draft
    } catch (error) {
      if (error.status !== 401 && error.status !== 409) show(message, { text: error.message });
    }
  });
  // The question waits for the edits on their way (a field left by this very click among them),
  // so that it counts what the publish will carry.
  publish.addEventListener('click', async () => {
    await settled();
    if (!(await ask(publishQuestion(state.summary), 'Publish'))) return;
    publish.disabled = true;
    try {
      await send({ op: 'publish' });
      published();
    } catch (error) {
      // 500 with an id: the publish is stored, only the edge's copies were not cleared.
      if (error.status === 500 && error.body?.id != null) {
        published();
        show(message, { text: error.message });
      } else if (error.status !== 401 && error.status !== 409) {
        show(message, { text: error.message });
      }
    } finally {
      publish.disabled = false;
    }
  });
  // The public site once the edits on their way are saved (a field left by this click among
  // them); a field still holding what is not saved makes the browser ask before the page goes.
  site.addEventListener('click', async (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    await settled();
    location.assign(site.href);
  });
  // Once the edits on their way are saved; if a field still holds what is not saved, asked first.
  // Then, whatever the answer (401 when the session had ended already), the way out is the login.
  logout.addEventListener('click', async () => {
    await settled();
    if (unsaved() && !(await ask('Log out? What is typed and not saved will be lost.', 'Log out'))) return;
    try {
      await post('logout', {});
    } finally {
      leave(() => location.assign('/edit/'));
    }
  });
}

// After a publish the draft is what is public: no row differs from it any more, and every row is
// in a publish.
function published() {
  setSummary(NOTHING);
  for (const id of Object.keys(state.doc.rows)) state.published.add(id);
  for (const row of document.querySelectorAll('article.row[data-changed]')) row.removeAttribute('data-changed');
}

// The bar's line: an error as it stands; the session's end as a link that logs in again in a new
// tab, so that this one keeps what is typed; a conflict with the reload it asks for; information
// (kind 'info') as words alone, read out politely, until the next edit is answered.
function show(message, { text, kind = 'error' }) {
  if (message.dataset.kind === 'conflict') return; // the reload stays asked for
  message.replaceChildren();
  message.hidden = false;
  message.dataset.kind = kind;
  message.setAttribute('role', kind === 'info' ? 'status' : 'alert');
  if (kind === 'info') {
    message.append(text);
  } else if (kind === 'logged-out') {
    message.append(Object.assign(document.createElement('a'), { href: '/edit/', target: '_blank', rel: 'opener', textContent: text }));
  } else if (kind === 'conflict') {
    const reload = Object.assign(document.createElement('button'), { type: 'button', className: 'ed ed-words', textContent: 'Reload' });
    reload.addEventListener('click', () => location.reload());
    message.append(text, ' ', reload);
  } else {
    message.append(text);
    const dismiss = Object.assign(document.createElement('button'), { type: 'button', className: 'ed ed-words ed-dismiss', textContent: 'OK' });
    dismiss.addEventListener('click', () => hide(message));
    message.append(' ', dismiss);
  }
}

function hide(message) {
  message.hidden = true;
  message.replaceChildren();
  delete message.dataset.kind;
}

// About, in a dialog: its Markdown in one field, with 🔗 over it and the legend under it (linker.js;
// About has ## headings, as the build draws them), saved each time the field is left and when the
// dialog is closed with Close, which waits for the save; refused, the dialog stays open with what
// was typed and the answer under it. Escape closes it and leaves unsaved what was typed since.
function editAbout() {
  const dialog = document.createElement('dialog');
  dialog.className = 'ed-dialog ed-about-dialog';
  const head = Object.assign(document.createElement('p'), { className: 'ed-question', textContent: 'About' });
  const area = textarea(state.doc.about ?? '', 'About, in Markdown', { className: 'ed-about-text', grow: false });
  const error = Object.assign(document.createElement('p'), { className: 'ed-error', hidden: true });
  error.setAttribute('role', 'alert');
  const close = Object.assign(document.createElement('button'), { type: 'button', className: 'ed-yes', textContent: 'Close' });
  const actions = Object.assign(document.createElement('p'), { className: 'ed-dialog-actions' });
  actions.append(close);
  dialog.append(head, attachLinker(area, { markdown: true, headings: true }).element, actions);
  area.after(error);
  document.body.append(dialog);

  let saved = area.value;
  let saving = null;
  const unwatch = watchUnsaved(() => saving !== null || area.value !== saved);
  // Read only while a save is on its way, so nothing is typed that the save would not carry.
  const save = () => {
    if (saving) return saving;
    const text = area.value;
    if (text === saved) return Promise.resolve(true);
    area.readOnly = true;
    saving = during(send({ op: 'set-about', text })
      .then(() => {
        saved = text;
        error.hidden = true;
        return true;
      }, (refusal) => {
        error.textContent = refusal.message;
        error.hidden = false;
        return false;
      })
      .finally(() => {
        saving = null;
        area.readOnly = false;
      }));
    return saving;
  };
  const end = () => {
    unwatch();
    dialog.close();
    dialog.remove();
  };
  area.addEventListener('blur', () => save());
  close.addEventListener('click', async () => {
    if (await save()) end();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!saving) end();
  });
  dialog.showModal();
  area.focus();
  area.setSelectionRange(0, 0);
}
