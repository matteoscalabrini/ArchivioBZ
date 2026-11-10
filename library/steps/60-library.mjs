// The Library page, out/index.html: the idea (or the keyword index) at the top, a sticky status
// line, every row of the library in one list, closed, and all keywords at the foot. web/library.js
// filters, sorts and opens the rows and keeps the address in step.
//
// What earlier steps add is optional here: entry.pictures (pictures), ctx.idea (the idea),
// entry.preview and entry.page (tables, long reads), place.inside (the map; undefined counts as
// inside). A read or table row links its page only when entry.page says it was written.
import path from 'node:path';
import { esc, page } from '../lib/shell.mjs';

const CONFIDENCE = { read: 'Read in the source', secondary: 'From a secondary source', lead: 'Lead, not yet a fact' };
const NO_CONFIDENCE = new Set(['Report', 'Notes', 'Map']);
const READ = { Story: 'Read the full story →', Report: 'Read the report →', Notes: 'Read the notes →' };
const WEB = /^https?:\/\//i;

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

  const body = [
    top(ctx, used, label),
    status(entries.length),
    COLUMN_HEADS,
    '<div class="list">',
    ...entries.map((entry) => row(entry, { ctx, label, places })),
    '</div>',
    `<footer class="foot"><span class="lab">All keywords</span>${used
      .map((id) => keywordButton(id, `${esc(label(id))}<sup>${counts.get(id)}</sup>`))
      .join('')}</footer>`,
    `<script type="application/json" id="keyword-labels">${json(Object.fromEntries(Object.keys(keywords).map((id) => [id, label(id)])))}</script>`,
    `<script type="application/json" id="keywords-on-map">${json(onMap)}</script>`,
  ].join('\n');

  await ctx.write('index.html', page({ title: 'Library', tab: 'library', body, css: ['web/library.css'], js: ['web/library.js'] }));
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

const COLUMN_HEADS = '<div class="colhead">'
  + '<button type="button" data-sort="no" aria-pressed="true">No.</button>'
  + '<span>Title</span>'
  + '<button type="button" data-sort="type" aria-pressed="false">Type</button>'
  + '<button type="button" data-sort="date" aria-pressed="false">Date</button>'
  + '<span>Keywords</span>'
  + '</div>';

function row(entry, { ctx, label, places }) {
  const no = esc(entry.no);
  const head = '<div class="row-head">'
    + `<span class="c-no">${no}</span>`
    + `<h2 class="c-title"><button type="button" aria-expanded="false" aria-controls="body-${no}">${esc(entry.title)}</button></h2>`
    + `<span class="c-type">${esc(entry.type)}</span>`
    + `<span class="c-date">${esc(entry.date)}</span>`
    + `<span class="c-kw">${keywordList(entry.keywords, label)}</span>`
    + '</div>';

  const pictures = (Array.isArray(entry.pictures) ? entry.pictures : []).filter((p) => p?.src);
  const preview = !pictures.length && entry.preview?.rows?.length ? entry.preview : null;
  const text = entry.text.filter((p) => String(p).trim()).map((p) => `<p>${esc(p)}</p>`).join('');
  const lines = meta(entry, places);
  const link = more(entry, ctx);
  const txt = `<div class="txt">${text}${lines}${link}</div>`;
  const detail = pictures.length ? `<div class="detail">${pictureBlock(pictures)}${txt}</div>`
    : preview ? `<div class="detail table">${previewTable(preview)}${txt}</div>`
    : `<div class="detail wide">${txt}</div>`;

  return `<article class="row" data-no="${no}" data-kw="${esc(entry.keywords.join(' '))}" data-type="${esc(entry.type)}" data-year="${esc(entry.year)}">
${head}
<div class="row-body" id="body-${no}" inert><div class="row-inner">${detail}</div></div>
</article>`;
}

// The first picture shows. With several, each picture has under it, above its caption, a line
// "← 2 / 6 →" whose arrows step to the picture before and after (library.js), the first's "←"
// and the last's "→" disabled. No `src` until the row opens: library.js copies `data-src` across then.
function pictureBlock(pictures) {
  const count = pictures.length;
  const figures = pictures.map((picture, n) => {
    const size = Number.isInteger(picture.w) && Number.isInteger(picture.h) ? ` width="${picture.w}" height="${picture.h}"` : '';
    let image = `<img data-src="${esc(encodePath(picture.src))}" alt=""${size}>`;
    if (picture.original) image = `<a href="${esc(picture.original)}">${image}</a>`;
    const nav = count < 2 ? '' : '<p class="pic-nav">'
      + `<button type="button" data-step="-1" aria-label="Previous picture"${n === 0 ? ' disabled' : ''}>←</button>`
      + `<span class="pic-n">${n + 1} / ${count}</span>`
      + `<button type="button" data-step="1" aria-label="Next picture"${n === count - 1 ? ' disabled' : ''}>→</button>`
      + '</p>';
    const caption = picture.caption ? `<figcaption>${esc(picture.caption)}</figcaption>` : '';
    return `<figure${n ? ' hidden' : ''}>${image}${nav}${caption}</figure>`;
  });
  return `<div class="pics">${figures.join('')}</div>`;
}

function previewTable({ columns = [], rows, total }) {
  const head = columns.length ? `<thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : '';
  const body = rows.map((cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="recs"><caption>First ${rows.length} of ${total ?? rows.length} records</caption>${head}<tbody>${body}</tbody></table>`;
}

function meta(entry, places) {
  const lines = [];
  if (entry.holder) lines.push(['Holder', esc(entry.holder)]);
  if (entry.creator) lines.push(['Creator', esc(entry.creator)]);
  if (entry.rights) lines.push(['Rights', esc(entry.rights)]);
  if (entry.confidence && CONFIDENCE[entry.confidence.level] && !NO_CONFIDENCE.has(entry.type)) {
    lines.push(['Confidence', esc(confidence(entry.confidence))]);
  }
  const source = entry.source;
  if (source?.label || source?.url) {
    const words = esc(source.label || source.url);
    lines.push(['Source', WEB.test(source.url ?? '') ? external(source.url, words) : words]);
  }
  if (entry.place) {
    const place = places?.[entry.place];
    const name = esc(place?.name ?? entry.place);
    const where = place?.inside === false ? 'beyond the map' : 'on the map';
    lines.push(['Place', `<a href="map.html#p=${esc(encodeURIComponent(entry.place))}">${name}, ${where} →</a>`]);
  }
  if (Array.isArray(entry.sources) && entry.sources.length) {
    const n = entry.sources.length;
    const links = entry.sources.map((no) => `<a href="#o=${esc(encodeURIComponent(no))}" data-jump="${esc(no)}">${esc(no)}</a>`);
    lines.push(['Sources', `${n} ${n === 1 ? 'row' : 'rows'}: ${links.join(', ')}`]);
  }
  if (!lines.length) return '';
  return `<dl class="meta">${lines.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join('')}</dl>`;
}

// "Read in the source; photographer unclear", or ". " before a note written as a sentence.
function confidence({ level, note }) {
  const words = CONFIDENCE[level];
  if (!note) return words;
  return `${words}${/^\p{Lu}/u.test(note) ? '. ' : '; '}${note}`;
}

// The one link at the bottom of an open row, by more.kind; more.label overrides the wording. A
// read or table row whose page was not written links the file it holds instead, or nothing.
function more(entry, ctx) {
  const kind = entry.more?.kind;
  const target = entry.more?.target;
  let href;
  let words;
  let away = false;
  if ((kind === 'read' || kind === 'table') && !entry.page) {
    return entry.abs ? link(ctx.sourceUrl(entry.abs), openWords(entry.abs)) : '';
  }
  if (kind === 'read') {
    href = encodePath(entry.page);
    words = READ[entry.type] ?? READ.Story;
  } else if (kind === 'file') {
    const file = typeof target === 'string' && target && !WEB.test(target) ? path.resolve(entry.dir, target) : entry.abs;
    if (!file) return '';
    href = ctx.sourceUrl(file);
    words = openWords(file);
  } else if (kind === 'table') {
    href = encodePath(entry.page);
    words = 'Open the full table →';
  } else if (kind === 'map') {
    href = 'map.html';
    words = 'Open the map →';
  } else if (kind === 'source') {
    href = [target, entry.source?.url].find((url) => typeof url === 'string' && WEB.test(url));
    if (!href) return '';
    words = 'Open the source →';
    away = true;
  } else {
    return '';
  }
  if (entry.more.label) words = entry.more.label;
  return link(href, words, away);
}

const link = (href, words, away = false) => `<a class="more" href="${esc(href)}"${away ? ' target="_blank" rel="noopener"' : ''}>${esc(words)}</a>`;
const openWords = (file) => (path.extname(file).toLowerCase() === '.pdf' ? 'Open the PDF →' : 'Open the file →');

function keywordButton(id, inner) {
  return `<button type="button" data-k="${esc(id)}" aria-pressed="false">${inner}</button>`;
}

// "Press, Typeface": each keyword holds on to its comma, so a line never starts with one.
function keywordList(ids, label) {
  const last = ids.length - 1;
  return ids.map((id, n) => `<span class="kw">${keywordButton(id, esc(label(id)))}${n < last ? '<span class="sep">,</span>' : ''}</span>`).join(' ');
}

const external = (url, words) => `<a href="${esc(url)}" target="_blank" rel="noopener">${words}</a>`;
const encodePath = (relPath) => String(relPath).split('/').map(encodeURIComponent).join('/');
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
