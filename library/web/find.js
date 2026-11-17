// The search field in the frame, on every page (lib/shell.mjs): the key "/" puts the cursor in
// it, Escape empties it, Enter leads to the Library with what was typed. The Library page
// answers as one types and marks the form "live" (web/library.js); there Enter is left to it.
const form = document.querySelector('form.find');
const field = form?.querySelector('input');

if (field) {
  addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const at = event.target;
    if (at instanceof HTMLElement && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName))) return;
    event.preventDefault();
    field.focus();
    field.select();
  });

  // Escape empties a field that holds something, and goes no further: the page's own Escape
  // (a panel, a picture full screen) is for when the field is empty.
  field.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !field.value) return;
    event.stopPropagation();
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if ('live' in form.dataset) return;
    const typed = field.value.trim();
    if (typed) location.assign(`${form.action}#q=${encodeURIComponent(typed)}`);
  });
}
