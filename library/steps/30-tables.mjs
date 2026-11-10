// Catalogue tables. For every row whose more.kind is 'table': entry.preview = {columns, rows, total}
// for the Library page (more.columns or the first three columns, the first five records, long cells
// cut short), and a page of its own, out/table/<no>.html, with the whole table; web/table.js sorts it.
// entry.page names the page once it is written. A CSV that is missing, unreadable or empty is a
// warning, and that row gets no page.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from '../lib/csv.mjs';
import { esc, page } from '../lib/shell.mjs';

const PREVIEW_COLUMNS = 3;
const PREVIEW_ROWS = 5;
const PREVIEW_CELL = 160; // characters; the table page has the whole cell
const URL_LIKE = /^[a-z][a-z\d+.-]*:/i;
const WEB = /^https?:\/\/\S+$/i;
const SHORT = /^\S{1,12}$/; // a number, a date, a code: kept on one line

export default async function tables(ctx) {
  for (const entry of ctx.lib.entries) {
    if (entry.more?.kind !== 'table') continue;
    const where = path.relative(ctx.root, path.join(entry.dir, 'entries.json')).split(path.sep).join('/');
    const fault = (message) => ctx.problems.push({ level: 'error', where, message: `row ${entry.no}: ${message}` });
    const noPage = (message) => ctx.problems.push({ level: 'warn', where, message: `row ${entry.no}: ${message}, so it has no page` });

    const target = entry.more.target;
    const file = typeof target === 'string' && target && !URL_LIKE.test(target) ? path.resolve(entry.dir, target) : entry.abs;
    const shown = file && path.relative(ctx.root, file).split(path.sep).join('/');
    if (!file || !/\.csv$/i.test(file)) {
      noPage(file ? `${shown} is not a CSV file` : 'no CSV file in more.target or file');
      continue;
    }
    const name = path.basename(file);
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      noPage(`${shown} cannot be read (${err.code ?? err.message})`);
      continue;
    }
    const { columns, rows } = parseCsv(text);
    if (!columns.length) {
      noPage(`${shown} is empty`);
      continue;
    }

    const wanted = Array.isArray(entry.more.columns) && entry.more.columns.length ? entry.more.columns : columns.slice(0, PREVIEW_COLUMNS);
    const picked = [];
    for (const column of wanted) {
      const at = columns.indexOf(column);
      if (at < 0) fault(`more.columns names "${column}", which ${name} does not have`);
      else picked.push([column, at]);
    }
    entry.preview = {
      columns: picked.map(([column]) => column),
      rows: rows.slice(0, PREVIEW_ROWS).map((cells) => picked.map(([, at]) => shorten(cells[at] ?? ''))),
      total: rows.length,
    };

    const page = `table/${entry.no}.html`;
    await ctx.write(page, tablePage(entry, columns, rows));
    entry.page = page;
  }
}

function tablePage(entry, columns, rows) {
  const n = rows.length;
  const head = columns
    .map((column, i) => `<th scope="col"><button type="button" data-col="${i}">${esc(column).replace(/_/g, '_<wbr>')}</button></th>`)
    .join('');
  const body = rows.map((cells) => `<tr>${columns.map((_, i) => cell(cells[i] ?? '')).join('')}</tr>`).join('\n');
  return page({
    title: entry.title,
    tab: 'library',
    depth: 1,
    js: ['web/table.js', 'web/back.js'],
    head: `<style>${CSS}</style>`,
    body: `<a class="back" href="../index.html#o=${esc(encodeURIComponent(entry.no))}">← Library</a>
<h1>${esc(entry.title)}</h1>
<p class="count">${n} ${n === 1 ? 'record' : 'records'}</p>
<div class="sheet"><table class="full">
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table></div>`,
  });
}

// A cell holding a long address, id, coordinate or code may break anywhere; a word never does.
const breakable = (value) => value.split(/\s+/).some((token) => {
  const bare = token.replace(/^\p{P}+|\p{P}+$/gu, '');
  return bare.length >= 13 && !/^[\p{L}\p{M}'’-]+$/u.test(bare);
});

function cell(text) {
  const value = text.trim();
  const kind = SHORT.test(value) ? ' class="short"' : breakable(value) ? ' class="long"' : '';
  if (WEB.test(value)) return `<td${kind}><a href="${esc(value)}" target="_blank" rel="noopener">${esc(value)}</a></td>`;
  return `<td${kind}>${esc(text)}</td>`;
}

// At most PREVIEW_CELL characters, cut after the last whole word, then an ellipsis.
function shorten(text) {
  const chars = [...String(text).replace(/\s+/g, ' ').trim()];
  if (chars.length <= PREVIEW_CELL) return chars.join('');
  const head = chars.slice(0, PREVIEW_CELL + 1).join('');
  const space = head.lastIndexOf(' ');
  const kept = space > 0 ? head.slice(0, space) : chars.slice(0, PREVIEW_CELL).join('');
  return `${kept.replace(/[\s,;:]+$/, '')}…`;
}

// The page's own rules, on top of base.css: 12 px, hairlines, cells that wrap, a header that stays.
const CSS = `
main { padding: 44px var(--gutter) 80px; }
.back { font-size: var(--size-meta); text-underline-offset: 4px; }
main h1 { margin: 26px 0 0; max-width: 26em; overflow-wrap: break-word; }
.count { margin: 12px 0 34px; font-size: var(--size-meta); color: var(--grey); }
table.full { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--size-meta); line-height: 1.4; }
table.full th { position: sticky; top: 0; padding: 8px 12px 7px 0; background: var(--paper); border-bottom: var(--rule); text-align: left; vertical-align: bottom; font-weight: 400; }
table.full th button { color: var(--grey); }
table.full th button:hover,
table.full th[aria-sort] button { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
table.full th[aria-sort="ascending"] button::after { content: " \\2191"; }
table.full th[aria-sort="descending"] button::after { content: " \\2193"; }
table.full td { padding: 6px 12px 6px 0; border-top: var(--rule); vertical-align: top; overflow-wrap: break-word; white-space: pre-line; }
table.full tbody tr:first-child td { border-top: 0; }
table.full td.short { white-space: nowrap; font-variant-numeric: tabular-nums; }
table.full td.long { overflow-wrap: anywhere; }
table.full th:last-child,
table.full td:last-child { padding-right: 0; }
table.full a { text-underline-offset: 2px; }
@media (max-width: 800px) {
  main { padding-top: 28px; }
  .sheet { overflow-x: auto; }
}
`;
