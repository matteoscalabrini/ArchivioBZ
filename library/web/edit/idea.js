// ✎ on the idea at the top: its text in one field, [[word|Keyword]] as ever, with 🔗 over it and
// the legend under it (linker.js). Paragraphs and links are all the idea's text holds (lib/idea.mjs
// reads no *italic*, bold or web link), so its legend is that of a row's text. The idea's words
// are drawn by the server (lib/idea.mjs, which knows the keywords), so once saved the page asks
// for itself again and takes the idea from it. The idea an answer brings (core.js: an edit changed
// what one of its links names) is dressed here too.
import { state, send, redraw, onIdea, putIdea } from './core.js';
import { iconButton } from './icons.js';
import { openField, textarea } from './field.js';
import { attachLinker } from './linker.js';

onIdea(() => dressIdea());

export function dressIdea() {
  const section = document.querySelector('section.idea');
  if (!section) return;
  let label = section.querySelector('.lab');
  if (!label) { // no idea yet: the keyword index stands in its place
    label = Object.assign(document.createElement('span'), { className: 'lab', textContent: 'The idea' });
    section.prepend(label);
  }
  const opener = iconButton('edit', 'Edit the idea', { key: 'idea' });
  label.append(' ', opener);
  opener.addEventListener('click', () => editIdea(section, label, opener));
}

function editIdea(section, label, opener) {
  const area = textarea(state.doc.idea ?? '', 'The idea, in Markdown', { className: 'ed-in-idea' });
  openField({
    controls: [area],
    read: () => area.value,
    save: async (text, box) => {
      await send({ op: 'set-idea', text }, { field: box });
      await redrawIdea();
    },
    place: (box) => {
      box.append(attachLinker(area).element);
      label.after(box);
    },
    errorPlace: (line) => area.after(line),
    hide: [...section.children].filter((el) => el !== label),
    opener,
    key: 'idea',
    block: true,
  });
}

// The idea as the page drawn now has it, with the draft version that page was drawn from: an edit
// answered meanwhile may have brought a newer drawing already, which stays (core.js, putIdea).
async function redrawIdea() {
  try {
    const response = await fetch(location.pathname, { headers: { Accept: 'text/html' } });
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const fresh = page.querySelector('section.idea');
    if (!response.ok || !fresh) return;
    const { version } = JSON.parse(page.getElementById('edit-data').textContent);
    if (putIdea(fresh.outerHTML, version, { own: true })) redraw(); // library.js reads the idea's keywords again
  } catch {
    // The idea is saved; the page shows the new words at the next reload.
  }
}
