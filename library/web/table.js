// A table page in the browser: a column head sorts the rows by that column, ascending, and the
// same head again reverses it. Numbers sort as numbers, dates by time, words alphabetically, empty
// cells last.
const NUMBER = /^-?(\d+(\.\d+)?|\.\d+)$/;
const ISO = /^\[?(\d{4})(?:-(0[1-9]|1[0-2])(?:-(\d{2}))?)?(?!\d)/; // 1931, 1931-10, 1931-10-28
const DAY_FIRST = /^\[?(?:(\d{1,2})[./])?(\d{1,2})[./](\d{4})(?!\d)/; // 28/10/1931, 28.10.1931, 10/1931
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareCells(a, b) {
  const [x, y] = [a.trim(), b.trim()];
  if (!x || !y) return !x - !y;
  if (NUMBER.test(x) && NUMBER.test(y)) return Number(x) - Number(y);
  const [p, q] = [dateKey(x), dateKey(y)];
  if (p && q && p !== q) return p < q ? -1 : 1;
  return collator.compare(x, y);
}

// "1931-10-28" from the date a cell starts with, however it is written; null when it starts with none.
function dateKey(text) {
  const two = (n) => n.padStart(2, '0');
  let match = DAY_FIRST.exec(text);
  if (match) return [match[3], two(match[2]), match[1] && two(match[1])].filter(Boolean).join('-');
  match = ISO.exec(text);
  return match && [match[1], match[2], match[3]].filter(Boolean).join('-');
}

const table = globalThis.document?.querySelector('table.full');
if (table) {
  const body = table.tBodies[0];
  const rows = [...body.rows].map((tr, n) => ({ tr, n }));
  const heads = [...table.tHead.rows[0].cells];

  table.tHead.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-col]') : null;
    if (!button) return;
    const head = button.closest('th');
    const direction = head.getAttribute('aria-sort') === 'ascending' ? -1 : 1;
    for (const other of heads) other.removeAttribute('aria-sort');
    head.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');

    const column = Number(button.dataset.col);
    const keyed = rows.map((row) => ({ ...row, text: row.tr.cells[column]?.textContent ?? '' }));
    keyed.sort((p, q) => {
      const blank = !p.text.trim() - !q.text.trim(); // empty cells stay last either way
      return blank || direction * compareCells(p.text, q.text) || p.n - q.n;
    });
    body.append(...keyed.map((row) => row.tr));
  });
}
