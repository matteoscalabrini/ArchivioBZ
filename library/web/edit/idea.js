// ✎ on the idea at the top: its Markdown in one field, [[word|Keyword]] as ever. The idea's words
// are drawn by the server (lib/idea.mjs, which knows the keywords), so once saved the page asks
// for itself again and takes the idea from it.
import { state, send, redraw } from './core.js';
import { iconButton } from './icons.js';
import { openField, textarea } from './field.js';

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
      await redrawIdea(section);
    },
    place: (box) => label.after(box),
    hide: [...section.children].filter((el) => el !== label),
    opener,
    key: 'idea',
    block: true,
  });
}

async function redrawIdea(section) {
  try {
    const response = await fetch(location.pathname, { headers: { Accept: 'text/html' } });
    const fresh = new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('section.idea');
    if (!response.ok || !fresh) return;
    section.replaceWith(document.adoptNode(fresh));
    dressIdea();
    redraw(); // library.js reads the idea's keywords again
  } catch {
    // The idea is saved; the page shows the new words at the next reload.
  }
}
