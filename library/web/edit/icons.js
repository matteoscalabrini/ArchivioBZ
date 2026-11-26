// The icons of edit mode, drawn here as inline SVG: 14 px, black lines in the text's colour
// (currentColor), no fill but the grip's dots. Each control is a button whose name a screen
// reader says and a pointer shows (title), since an icon alone says nothing to either.
const NS = 'http://www.w3.org/2000/svg';

const DRAWINGS = {
  edit: '<path d="M2.5 11.5 3 9l6.8-6.8a1.1 1.1 0 0 1 1.6 0l.4.4a1.1 1.1 0 0 1 0 1.6L5 11l-2.5.5Z"/><path d="m8.8 3.2 2 2"/>',
  grip: '<circle cx="5" cy="3" r="1"/><circle cx="9" cy="3" r="1"/><circle cx="5" cy="7" r="1"/><circle cx="9" cy="7" r="1"/><circle cx="5" cy="11" r="1"/><circle cx="9" cy="11" r="1"/>',
  remove: '<path d="m3.5 3.5 7 7m0-7-7 7"/>',
  add: '<path d="M7 2.5v9M2.5 7h9"/>',
  shown: '<path d="M1.5 7S3.5 3.5 7 3.5 12.5 7 12.5 7 10.5 10.5 7 10.5 1.5 7 1.5 7Z"/><circle cx="7" cy="7" r="1.8"/>',
  hidden: '<path d="M1.5 7S3.5 3.5 7 3.5 12.5 7 12.5 7 10.5 10.5 7 10.5 1.5 7 1.5 7Z"/><circle cx="7" cy="7" r="1.8"/><path d="m2.5 11.5 9-9"/>',
  trash: '<path d="M2.5 4h9M5.5 4V2.5h3V4M3.8 4l.6 7.5h5.2l.6-7.5M6 6.2v3.3M8 6.2v3.3"/>',
  back: '<path d="M11.5 7h-9M5.5 4 2.5 7l3 3"/>',
  on: '<path d="M2.5 7h9M8.5 4l3 3-3 3"/>',
  link: '<rect x="1.6" y="6.8" width="7.6" height="3.6" rx="1.8" transform="rotate(-45 5.4 8.6)"/><rect x="4.8" y="3.6" width="7.6" height="3.6" rx="1.8" transform="rotate(-45 8.6 5.4)"/>',
};

export function icon(name) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `ed-icon ed-icon-${name}`);
  svg.innerHTML = DRAWINGS[name]; // the drawings above, never words from the page
  return svg;
}

// A button holding one icon. `key`: what it acts on (data-ed), by which the focus is found again
// after its row is drawn anew.
export function iconButton(name, label, { key = '', className = '' } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ed ed-${name}${className ? ` ${className}` : ''}`;
  button.setAttribute('aria-label', label);
  button.title = label;
  if (key) button.dataset.ed = key;
  button.append(icon(name));
  return button;
}

// A button of words with an icon after them ("About ✎", `name`) or before them ("＋ row here",
// `first`).
export function wordButton(words, { name = '', first = '', className = '' } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ed ed-words${className ? ` ${className}` : ''}`;
  if (first) button.append(icon(first), ' ');
  button.append(words);
  if (name) button.append(' ', icon(name));
  return button;
}
