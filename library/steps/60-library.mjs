// The Library page, out/index.html: the idea (or the keyword index) at the top, under it every
// keyword with its count, a sticky status line, the kinds of entry (lib/kinds.mjs), and every row
// of the library in one list, closed. web/library.js filters, sorts and opens the rows and keeps
// the address in step.
//
// What earlier steps add is optional here: entry.pictures (pictures), ctx.idea (the idea),
// entry.preview and entry.page (tables, long reads), place.inside (the map; undefined counts as
// inside). A read or table row links its page only when entry.page says it was written.
import { esc, page } from '../lib/shell.mjs';
import { rowDetail } from '../lib/detail.mjs';
import { readKinds, kindOf } from '../lib/kinds.mjs';


export default async function library(ctx) {
  const { entries, keywords, places } = ctx.lib;
  const label = (id) => keywords[id]?.label ?? id;
  const counts = new Map();
  for (const entry of entries) for (const id of entry.keywords) counts.set(id, (counts.get(id) ?? 0) + 1);
  const used = Object.keys(keywords).filter((id) => counts.has(id)); // in the vocabulary's order
  // The keywords with at least one row at a place on the map: only for these does the status
  // line offer "On the map →" (library.js reads the list).
  const placed = entries.filter((entry) => entry.place && places?.[entry.place] && places[entry.place].inside !== false);
  const onMap = used.filter((id) => placed.some((entry) => entry.keywords.includes(id)));

  // The kind of each row, and the rows whose type no kind names: they show under no kind.
  const { kinds, problems } = await readKinds(ctx.root);
  ctx.problems.push(...problems);
  const kindOfRow = new Map(entries.map((entry) => [entry.no, kindOf(entry.type, kinds)]));
  const inKind = new Map();
  for (const id of kindOfRow.values()) if (id) inKind.set(id, (inKind.get(id) ?? 0) + 1);
  if (kinds.length) {
    const stray = new Map(); // type -> row numbers
    for (const entry of entries) if (!kindOfRow.get(entry.no)) stray.set(entry.type, [...(stray.get(entry.type) ?? []), entry.no]);
    for (const [type, nos] of stray) {
      ctx.problems.push({ level: 'warn', where: 'library/content/kinds.json', message: `no kind names the type "${type}" (${nos.join(', ')}): these rows show under no kind` });
    }
  }

  const body = [
    top(ctx, used, label),
    `<div class="keywords"><span class="lab">All keywords</span>${used
      .map((id) => keywordButton(id, `${esc(label(id))}<sup>${counts.get(id)}</sup>`))
      .join('')}</div>`,
    status(entries.length),
    kindLine(kinds, inKind),
    COLUMN_HEADS,
    '<div class="list">',
    ...entries.map((entry) => row(entry, { ctx, label, places, kind: kindOfRow.get(entry.no) })),
    '</div>',
    `<script type="application/json" id="keyword-labels">${json(Object.fromEntries(Object.keys(keywords).map((id) => [id, label(id)])))}</script>`,
    `<script type="application/json" id="keywords-on-map">${json(onMap)}</script>`,
    kinds.length ? `<script type="application/json" id="kind-labels">${json(Object.fromEntries(kinds.map((kind) => [kind.id, kind.label])))}</script>` : '',
  ].filter(Boolean).join('\n');

  await ctx.write('index.html', page({ title: 'Library', tab: 'library', body, css: ['web/detail.css', 'web/library.css'], js: ['web/library.js'] }));
}

// The idea paragraph, unless there is none or it is a stand-in and this build is for presenting:
// then every keyword that has rows, large, in its place.
function top(ctx, used, label) {
  const idea = ctx.idea;
  if (idea?.html && !(idea.standin && ctx.options?.present)) {
    // A button is laid out as a block inside the line, so a comma after it could start the next
    // line; whatever follows a marked word without a space is held to it.
    const html = idea.html.replace(/(<button\b[^>]*>[^<]*<\/button>)([^\s<]+)/g, '<span class="kw">$1$2</span>');
    return `<section class="idea"><span class="lab">${idea.standin ? 'The idea (stand-in)' : 'The idea'}</span>${html}</section>`;
  }
  return `<section class="idea index"><p>${keywordList(used, label)}</p></section>`;
}

function status(total) {
  return '<div class="status">'
    + `<span class="now" aria-live="polite"><span class="what">All entries</span><span class="n">${total} ${total === 1 ? 'entry' : 'entries'}</span></span>`
    + '<button type="button" class="show-all" hidden>Show all</button>'
    + '<a class="on-map" href="map.html" hidden>On the map →</a>'
    + '</div>';
}

// One button for every kind that has rows, with its count; nothing when the library has no kinds.
function kindLine(kinds, inKind) {
  const shown = kinds.filter((kind) => inKind.has(kind.id));
  if (!shown.length) return '';
  return `<div class="kinds"><span class="lab">Kind</span>${shown
    .map((kind) => `<button type="button" data-kind="${esc(kind.id)}" aria-pressed="false">${esc(kind.label)}<sup>${inKind.get(kind.id)}</sup></button>`)
    .join('')}</div>`;
}

const COLUMN_HEADS = '<div class="colhead">'
  + '<button type="button" data-sort="no" aria-pressed="true">No.</button>'
  + '<span>Title</span>'
  + '<button type="button" data-sort="type" aria-pressed="false">Type</button>'
  + '<button type="button" data-sort="date" aria-pressed="false">Date</button>'
  + '<span>Keywords</span>'
  + '</div>';

function row(entry, { ctx, label, places, kind }) {
  const no = esc(entry.no);
  const head = '<div class="row-head">'
    + `<span class="c-no">${no}</span>`
    + `<h2 class="c-title"><button type="button" aria-expanded="false" aria-controls="body-${no}">${esc(entry.title)}</button></h2>`
    + `<span class="c-type">${esc(entry.type)}</span>`
    + `<span class="c-date">${esc(entry.date)}</span>`
    + `<span class="c-kw">${keywordList(entry.keywords, label)}</span>`
    + '</div>';

  const detail = rowDetail(entry, { ctx, places });

  return `<article class="row" data-no="${no}" data-kw="${esc(entry.keywords.join(' '))}" data-type="${esc(entry.type)}" data-year="${esc(entry.year)}"${kind ? ` data-kind="${esc(kind)}"` : ''}>
${head}
<div class="row-body" id="body-${no}" inert><div class="row-inner">${detail}</div></div>
</article>`;
}

function keywordButton(id, inner) {
  return `<button type="button" data-k="${esc(id)}" aria-pressed="false">${inner}</button>`;
}

// "Press, Typeface": each keyword holds on to its comma, so a line never starts with one.
function keywordList(ids, label) {
  const last = ids.length - 1;
  return ids.map((id, n) => `<span class="kw">${keywordButton(id, esc(label(id)))}${n < last ? '<span class="sep">,</span>' : ''}</span>`).join(' ');
}

const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
