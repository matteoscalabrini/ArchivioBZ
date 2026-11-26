// Pages in edit mode (design §14). On every page of edit mode "＋ page" stands after the tabs: it
// asks the title of a new site page, makes it and goes to it; an open row's "＋ page about this row"
// (rows.js) does the same for a page about that row, its title offered.
//
// A page of the draft, at /edit/pages/<address>, is drawn by the server as a publish would draw it,
// in edit mode's frame (cloud/render.mjs, renderPageEdit), and this file is its script: the bar,
// its title ✎, its text ✎ (Markdown, with 🔗 over it and the legend under it: linker.js), for a site
// page ← and → to move its tab among the site pages, Hide or Show, and Remove, asked first. After
// each edit of the page the answer's drawing of its tabs and its text takes the place of the page's
// (handlers.mjs, renderPageParts); the text's field stands outside the text, which it hides, so a
// drawing that comes while the field is open goes in under it.
import { state, send, act, settled, leave } from './core.js';
import { makeBar } from './bar.js';
import { iconButton, wordButton } from './icons.js';
import { openField, input, textarea } from './field.js';
import { attachLinker } from './linker.js';
import { ask, form } from './dialog.js';

const QUESTION = 'Title of the new page';
const NO_TITLE = 'A page needs a title.';

// Asks the title of a new page (`offered` in its field to begin with) and makes it: a site page,
// or one about the row `row`. Once every edit on its way is saved, the page opens in edit mode.
export async function addPage({ row = null, offered = '' } = {}) {
  const values = await form(QUESTION, [{ name: 'title', label: 'Title', kind: 'text', value: offered }], 'Add', {
    check: ({ title }) => (title.trim() ? null : NO_TITLE),
  });
  if (!values) return;
  const answer = await act({ op: 'add-page', title: values.title, row });
  if (!answer?.result?.address) return;
  await settled();
  location.assign(`/edit/pages/${encodeURIComponent(answer.result.address)}`);
}

// "＋ page" at the end of the tabs, before the search field.
export function dressTabs() {
  const nav = document.querySelector('header.site nav.tabs');
  if (!nav) return;
  const add = wordButton('page', { first: 'add', className: 'ed-add-page' });
  add.addEventListener('click', () => addPage());
  nav.insertBefore(add, nav.querySelector(':scope > form.find'));
}

const article = document.querySelector('article.page[data-page]');
if (article) dressPage(article);

function dressPage(text) {
  const id = text.dataset.page;
  const own = () => (state.doc.pages ?? []).find((page) => page.id === id);
  const site = own()?.row === null;
  document.body.classList.add('ed-on-page');
  makeBar();
  dressTabs();

  // The title, its words beside ✎.
  const h1 = document.querySelector('main > h1');
  const words = Object.assign(document.createElement('span'), { className: 'ed-v', textContent: h1.textContent });
  const editTitle = iconButton('edit', 'Edit the title', { key: 'page-title' });
  h1.replaceChildren(words, ' ', editTitle);

  // ✎ under the text, and "Text" there while it has none.
  const foot = Object.assign(document.createElement('p'), { className: 'ed-page-text' });
  const empty = Object.assign(document.createElement('span'), { className: 'ed-empty', textContent: 'Text ' });
  const editText = iconButton('edit', 'Edit the text', { key: 'page-text' });
  foot.append(empty, editText);
  text.after(foot);

  // Over the page: ← and → for a site page's tab, Hide or Show, Remove, and, while the public does
  // not see the page, why.
  const acts = Object.assign(document.createElement('p'), { className: 'ed-page-acts' });
  const back = iconButton('back', 'Move the tab back', { key: 'page-back' });
  const on = iconButton('on', 'Move the tab on', { key: 'page-on' });
  const hide = wordButton('Hide', { className: 'ed-page-hide' });
  const remove = wordButton('Remove', { className: 'ed-page-remove' });
  const unseen = Object.assign(document.createElement('span'), { className: 'ed-page-unseen' });
  if (site) acts.append(back, on);
  acts.append(hide, remove, unseen);
  (document.querySelector('main > .page-row') ?? h1).before(acts);

  // The page as the draft now has it: its title, Hide or Show, the arrows at the ends of the tabs
  // disabled (the focus going to the other where it was on one), "Text" while it has none.
  const show = () => {
    const page = own();
    if (!page) return;
    if (words.textContent !== page.title) words.textContent = page.title;
    document.title = page.title;
    hide.textContent = page.hidden ? 'Show' : 'Hide';
    const row = page.row === null ? null : state.doc.rows[page.row];
    unseen.textContent = page.hidden ? 'Hidden: not on the public site.' : row?.hidden ? 'Its row is hidden: not on the public site.' : '';
    if (site) {
      const sites = (state.doc.pages ?? []).filter((p) => p.row === null);
      const focused = document.activeElement;
      back.disabled = sites[0]?.id === id;
      on.disabled = sites.at(-1)?.id === id;
      if (focused?.disabled) (focused === back ? on : back).focus({ preventScroll: true });
    }
    empty.hidden = text.textContent.trim() !== '';
  };
  // An answer to an edit of the page: its tabs and its text as drawn again, put in.
  const put = (answer) => {
    if (answer?.page) {
      const nav = document.querySelector('header.site nav.tabs');
      const before = nav.querySelector(':scope > .ed-add-page, :scope > form.find');
      for (const tab of nav.querySelectorAll(':scope > a')) tab.remove();
      for (const tab of [...fromHtml(answer.page.nav).querySelectorAll(':scope > a')]) nav.insertBefore(tab, before);
      text.replaceChildren(...fromHtml(answer.page.article).childNodes);
    }
    show();
    return answer;
  };
  const edit = (op, box) => send(op, { field: box }).then(put);

  editTitle.addEventListener('click', () => {
    const field = input(own()?.title ?? words.textContent, 'Title', { className: 'ed-in-page-title' });
    openField({
      controls: [field],
      read: () => field.value,
      save: (title, box) => edit({ op: 'set-page', id, title }, box),
      place: (box) => editTitle.after(box),
      hide: [words, editTitle],
      opener: editTitle,
      key: 'page-title',
    });
  });
  editText.addEventListener('click', () => {
    const area = textarea(own()?.text ?? '', 'The text, in Markdown', { className: 'ed-in-page' });
    openField({
      controls: [area],
      read: () => area.value,
      save: (value, box) => edit({ op: 'set-page', id, text: value }, box),
      place: (box) => {
        box.append(attachLinker(area, { markdown: true, headings: true }).element);
        text.before(box);
      },
      errorPlace: (line) => area.after(line),
      hide: [text, foot],
      opener: editText,
      key: 'page-text',
      block: true,
    });
  });
  back.addEventListener('click', () => act({ op: 'move-page', id, step: -1 }).then(put));
  on.addEventListener('click', () => act({ op: 'move-page', id, step: 1 }).then(put));
  hide.addEventListener('click', () => act({ op: 'hide-page', id, hidden: own()?.hidden !== true }).then(put));
  // Asked first; once removed, back to the Library, whatever was being typed here going with it.
  remove.addEventListener('click', async () => {
    if (!(await ask(`Remove the page "${own()?.title ?? words.textContent}"?`, 'Remove'))) return;
    if (await act({ op: 'remove-page', id })) leave(() => location.assign('/edit/'));
  });
  show();
}

function fromHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html; // the server's drawing, every word in it escaped (lib/pages.mjs)
  return template.content.firstElementChild;
}
