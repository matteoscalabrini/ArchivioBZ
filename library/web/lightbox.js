// A row's picture, clicked, opens as large as the window allows over the page, which is dimmed
// and blurred behind it. A click beside the picture, or Escape, closes it and gives the focus back
// to the picture. Off the web it also links the original file (the button's data-original).
// Loaded by the Library, the Map and the read pages.
let box = null;
let opener = null;

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('.pic-open') : null;
  if (!button) return;
  event.preventDefault();
  open(button);
});

// Before any page's own keys: while a picture is open, Escape closes only the picture, and Tab
// stays inside it.
addEventListener('keydown', (event) => {
  if (!box || box.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  } else if (event.key === 'Tab') {
    event.preventDefault();
    const link = box.querySelector('.lb-original');
    (link.hidden || document.activeElement === link ? box : link).focus();
  }
}, true);

function open(button) {
  const img = button.querySelector('img');
  const src = img?.getAttribute('src') || img?.dataset.src;
  if (!src) return;
  box ??= make();
  const picture = box.querySelector('img');
  // As the browser shows it (a phone's portrait turned upright), else as the build measured it.
  const w = img.naturalWidth || Number(img.getAttribute('width')) || 4;
  const h = img.naturalHeight || Number(img.getAttribute('height')) || 3;
  picture.style.setProperty('--ratio', String(w / h));
  picture.src = src;
  picture.alt = button.closest('figure')?.querySelector('figcaption')?.textContent ?? '';
  const link = box.querySelector('.lb-original');
  link.hidden = !button.dataset.original;
  if (button.dataset.original) link.href = button.dataset.original;
  opener = button;
  box.hidden = false;
  document.documentElement.classList.add('lb-open');
  box.focus({ preventScroll: true });
}

function close() {
  box.hidden = true;
  document.documentElement.classList.remove('lb-open');
  box.querySelector('img').removeAttribute('src');
  opener?.focus({ preventScroll: true });
  opener = null;
}

function make() {
  const element = document.createElement('div');
  element.className = 'lightbox';
  element.hidden = true;
  element.tabIndex = -1;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', 'The picture, full screen. Escape or a click beside it closes it.');
  const link = Object.assign(document.createElement('a'), { className: 'lb-original', target: '_blank', rel: 'noopener', hidden: true, textContent: 'Original file →' });
  element.append(document.createElement('img'), link); // the picture's src is set by open()
  element.addEventListener('click', (event) => {
    if (event.target === element) close();
  });
  document.body.append(element);
  return element;
}
