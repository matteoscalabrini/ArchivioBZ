// "← Library" on a read or table page. Opened from the Library, the link goes back in history
// instead, so the Library returns as the reader left it: the keyword, the order, the open rows.
// Opened from a row in the Map page's panel it reads "← Map" and goes back to the map the same
// way. Opened any other way (a typed address, a new tab, another page) it keeps its own address.

// True when `referrer` is the Library page that `href` names (resolved against `here`), as
// index.html or as its folder, on this site.
export function cameFromLibrary(referrer, href, here) {
  if (!referrer) return false;
  try {
    const from = new URL(referrer);
    const library = new URL(href, here);
    const folder = library.pathname.replace(/index\.html$/, '');
    return from.origin === library.origin && (from.pathname === library.pathname || from.pathname === folder);
  } catch {
    return false;
  }
}

// True when `referrer` is this site's Map page, which stands beside the Library page `href` names.
export function cameFromMap(referrer, href, here) {
  if (!referrer) return false;
  try {
    const from = new URL(referrer);
    const map = new URL('map.html', new URL(href, here));
    return from.origin === map.origin && from.pathname === map.pathname;
  } catch {
    return false;
  }
}

const back = globalThis.document?.querySelector('a.back');
// history.length 1: a page opened in a tab of its own, with nothing to go back to.
if (back && history.length > 1) {
  const fromMap = cameFromMap(document.referrer, back.getAttribute('href'), location.href);
  if (fromMap) { // opened from a row in the map's panel: the way back is the map, as it was left
    back.textContent = '← Map';
    back.setAttribute('href', new URL('map.html', new URL(back.getAttribute('href'), location.href)).pathname);
  }
  if (fromMap || cameFromLibrary(document.referrer, back.getAttribute('href'), location.href)) {
    back.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.back();
    });
  }
}
