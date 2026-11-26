// 🔗 and the legend, around a text field (the idea, About, a row's text, a page's text). 🔗 over
// the field opens a finder under it: what is typed there lists the rows, keywords and pages it
// names (editmodel.js, linkMatches), ↑ and ↓ move along them, and the one chosen by Enter or a
// click is written as a link around the words selected in the field, or with its own name for
// words when none are (insertLink), in the form lib/links.mjs reads, through the field's own
// editing, so that ⌘Z takes it out again. Words that cannot be a link's (holding [ ] or |, across
// an empty line, in Markdown across any line end, touching a link already typed) are not linked:
// the finder says so and lists nothing; it says so too when nothing is found. Escape closes the
// finder and gives the field its focus and selection back. Under the field, for as long as it is
// open, the legend: a line and an example for each kind of link, and what else the field holds.
//
// The field keeps its focus and selection while 🔗 is pressed, and a press anywhere on 🔗's bar,
// the finder and the space between them, but the finder's own field, leaves the focus where it is. The finder stands inside the field's place
// (field.js), so going to it does not leave the field, and its Enter and Escape are its own: they
// neither save the field nor put back what was there, nor close the About dialog.
import { state } from './core.js';
import { icon, iconButton } from './icons.js';
import { linkMatches, insertLink, linkable } from '../editmodel.js';

const FINDER = 'Row number or title, keyword, page';
const UNLINKABLE = 'Select words inside one paragraph, outside any other link.';
const NOTHING = 'Nothing found.';
const LINKS = [
  ['[[the bridge|Ponte Druso]]', 'the words filter the Library by that keyword'],
  ['[[the postcard|@1.09]]', 'the words open that row (the code is its id, kept when it moves)'],
  ['[[more|page:on-the-bridge]]', 'the words open that page'],
];

let made = 0; // numbers the finders, for the ids that tie each one's field to its list

// `field`: the textarea, taken into `element` between 🔗 and the legend; the caller places
// `element` where the field goes. `markdown`: the field is Markdown (About, a page), else plain
// paragraphs (a row's text, the idea); `headings`: it takes ## headings too. `detach()` puts the
// field back where `element` stands, without them.
export function attachLinker(field, { markdown = false, headings = false } = {}) {
  const n = ++made;
  const element = document.createElement('div');
  element.className = 'ed-linker';
  element.tabIndex = -1; // a click on the legend stays in the field's place, which leaving would save

  const button = iconButton('link', 'Link the selected words');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `ed-finder-${n}`);
  const finder = Object.assign(document.createElement('div'), { className: 'ed-finder', id: `ed-finder-${n}`, hidden: true });
  const find = Object.assign(document.createElement('input'), { type: 'text', placeholder: FINDER, autocomplete: 'off', spellcheck: false });
  find.setAttribute('aria-label', FINDER);
  find.setAttribute('role', 'combobox');
  find.setAttribute('aria-autocomplete', 'list');
  find.setAttribute('aria-expanded', 'false');
  find.setAttribute('aria-controls', `ed-matches-${n}`);
  const list = Object.assign(document.createElement('ul'), { id: `ed-matches-${n}` });
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', FINDER);
  const say = Object.assign(document.createElement('p'), { className: 'ed-finder-say', hidden: true });
  say.setAttribute('role', 'status');
  finder.append(find, say, list);
  const bar = Object.assign(document.createElement('div'), { className: 'ed-link-bar' });
  bar.append(button, finder);
  element.append(bar, field, legendOf({ markdown, headings }));

  let found = [];
  let active = 0;
  let selection = [0, 0]; // the field's, as 🔗 found it
  let unlinkable = false; // those words cannot be a link's

  // The rows in the order the page shows them, with their numbers as they now stand.
  const rows = () => state.chapters.flatMap((chapter) => chapter.rows)
    .filter((id) => state.doc.rows[id])
    .map((id) => ({ id, no: state.numbers[id] ?? '', title: state.doc.rows[id].record?.title ?? '' }));

  const draw = () => {
    const all = rows();
    found = unlinkable ? [] : linkMatches(find.value, {
      rows: all,
      keywords: Object.entries(state.doc.keywords ?? {}).map(([id, keyword]) => ({ id, label: keyword.label ?? id })),
      pages: (state.doc.pages ?? []).map(({ address, title }) => ({ address, title })),
      aliases: state.doc.aliases ?? {},
    });
    const line = unlinkable ? UNLINKABLE : find.value.trim() && !found.length ? NOTHING : '';
    if (say.textContent !== line) say.textContent = line;
    say.hidden = !line;
    const numbers = new Map(all.map((row) => [`@${row.id}`, row.no]));
    list.replaceChildren(...found.map((match, i) => {
      const li = Object.assign(document.createElement('li'), { id: `ed-match-${n}-${i}` });
      li.setAttribute('role', 'option');
      const kind = match.kind === 'row' ? numbers.get(match.target) || '—' : match.kind === 'keyword' ? 'Keyword' : 'Page';
      li.append(Object.assign(document.createElement('span'), { className: 'ed-match-kind', textContent: kind }), ` · ${match.label}`);
      return li;
    }));
    active = 0;
    mark();
  };
  const mark = () => {
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    find.setAttribute('aria-expanded', String(found.length > 0));
    const li = list.children[active];
    if (li) {
      find.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    } else {
      find.removeAttribute('aria-activedescendant');
    }
  };

  // Not while a save is on its way: the field then closes with what the save carried, and a link
  // written meanwhile would go with it.
  const open = () => {
    if (field.readOnly) return;
    selection = [field.selectionStart, field.selectionEnd];
    unlinkable = !linkable(field.value, ...selection, { markdown });
    find.value = '';
    draw();
    finder.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    find.focus({ preventScroll: true });
  };
  // `back`: the field has its selection again (Escape, 🔗 pressed again); not when the focus went
  // elsewhere of itself, a click in the field among them. The focus goes to the field before the
  // finder is hidden: hidden with the focus in it, the finder would leave the field's place, which
  // saves the field (field.js). Moving it closes the finder already (its focusout, below); what
  // follows here then finds it closed.
  const close = (back) => {
    if (finder.hidden) return;
    if ((back || finder.contains(document.activeElement)) && field.isConnected) {
      field.focus({ preventScroll: true });
      if (back) field.setSelectionRange(...selection);
    }
    finder.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    find.setAttribute('aria-expanded', 'false');
    find.removeAttribute('aria-activedescendant');
    list.replaceChildren();
    found = [];
  };
  // The link written in place of the words selected, the caret after it. It goes in as typing does
  // (insertText), which fires the field's input event, so that what grows the field and what
  // watches for unsaved text see it, and ⌘Z takes it out; where the browser does not take that (a
  // field read only while About saves), the value is set and its input event fired.
  const choose = (match) => {
    const made = insertLink(field.value, selection[0], selection[1], match.target, match.label, { markdown });
    if (!made) return;
    close(false);
    const [start, end] = selection;
    const written = made.value.slice(start, made.value.length - (field.value.length - end)); // the link, and the selection's spaces
    field.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, written) || field.value !== made.value) {
      const top = field.scrollTop;
      field.value = made.value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.scrollTop = top;
    }
    field.setSelectionRange(made.caret, made.caret);
  };

  // A press on 🔗, the finder's frame, its lines or the bar around them leaves the focus where it
  // is: in the field, its selection kept, or in the finder's own field, the finder open.
  bar.addEventListener('mousedown', (event) => {
    if (event.target !== find) event.preventDefault();
  });
  button.addEventListener('click', () => (finder.hidden ? open() : close(true)));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.stopPropagation(); // the button's own, not the field's save
  });
  find.addEventListener('input', draw);
  find.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!found.length) return;
      active = Math.max(0, Math.min(found.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
      mark();
    } else if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      if (found[active]) choose(found[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  });
  list.addEventListener('click', (event) => {
    const li = event.target instanceof Element ? event.target.closest('li[role="option"]') : null;
    const match = li ? found[[...list.children].indexOf(li)] : null;
    if (match) choose(match);
  });
  finder.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && finder.contains(event.relatedTarget)) return;
    close(false);
  });

  return {
    element,
    detach() {
      close(false);
      if (element.parentNode) element.replaceWith(field);
      else field.remove();
    },
  };
}

// The legend: each kind of link with an example, what 🔗 does, and what else the field holds.
function legendOf({ markdown, headings }) {
  const legend = Object.assign(document.createElement('ul'), { className: 'ed-legend' });
  const line = (...parts) => {
    const li = document.createElement('li');
    li.append(...parts);
    legend.append(li);
  };
  const code = (text) => Object.assign(document.createElement('code'), { textContent: text });
  for (const [example, says] of LINKS) line(code(example), ` — ${says}`);
  const link = icon('link');
  link.removeAttribute('aria-hidden');
  link.setAttribute('role', 'img');
  link.setAttribute('aria-label', '🔗');
  line(link, ' writes these for you; you can also type them.');
  if (!markdown) {
    line('An empty line starts a paragraph.');
    return legend;
  }
  line('An empty line starts a paragraph · ', code('*italic*'), ' · ', code('**bold**'), ' · ', code('[words](https://…)'), ' a web link');
  if (headings) line(code('## a heading'));
  return legend;
}
