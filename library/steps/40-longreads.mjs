// Long reads. For every row whose more.kind is 'read' and whose target is a Markdown or Word
// file: a page of its own, out/read/<no>.html, with the title, the whole text and, for a Story,
// the rows it rests on; entry.page names the page once it is written, and entry.pages keeps the
// text of each page. A target that is missing, cannot be rendered or is neither Markdown nor Word
// is a warning, and that row gets no page.
//
// A Markdown text with two or more headings of the first level is in parts, one page each: the
// first at out/read/<no>.html, the others at out/read/<no>-<n>.html. A part's heading is its
// page's title, and every part lists the others.
//
// A row may give its text a title of its own in more.title, where the row's title is a catalogue
// title and the text is written for a reader; the page is then headed by that one.
//
// A link in a Markdown text whose address is the source of a row, or of a record in a table the
// library holds, leads to the library, and so does one written "row:5.01". On the page such a
// row opens in a panel beside the text (web/read.js), as a row does on the Map page.
//
// On the web (build --web) the originals are not online: a link to a file a row holds leads to
// that row, a link to any other file of the base is words, and a picture of the text is converted
// as the Library's pictures are (steps/10-pictures.mjs, the same cache) and published at
// out/img/read/<key>.jpg.
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { esc, page } from '../lib/shell.mjs';
import { encodePath, rowArticle } from '../lib/detail.mjs';
import { renderDocx, renderParts } from '../lib/longread.mjs';
import { locatePlaces } from '../lib/places.mjs';
import { cached } from './10-pictures.mjs';

const URL_LIKE = /^[a-z][a-z\d+.-]*:/i;
const PICTURE = /\.(jpe?g|png|gif|webp|tiff?|heic)$/i;
const WEB = /^https?:\/\/\S+$/i;
const ROW = /^row:(\d{1,2}\.\d{2})$/i;
const RECORD_CELL = 600; // characters of a record's cell shown in the panel; the table page has the whole cell

export default async function longreads(ctx) {
  const byNo = new Map(ctx.lib.entries.map((entry) => [entry.no, entry]));
  const held = sourcesHeld(ctx.lib.entries);
  await locatePlaces(ctx.lib); // a row in the panel says where its place is
  const web = ctx.options?.web ? onTheWeb(ctx) : null;

  for (const entry of ctx.lib.entries) {
    if (entry.more?.kind !== 'read') continue;
    const target = entry.more.target;
    const where = path.relative(ctx.root, path.join(entry.dir, 'entries.json')).split(path.sep).join('/');
    const warn = (message) => ctx.problems.push({ level: 'warn', where, message: `row ${entry.no}: ${message}` });
    const noPage = (message) => warn(`${message}, so it has no page`);
    if (typeof target !== 'string' || !target || URL_LIKE.test(target)) {
      noPage('no Markdown or Word file in more.target');
      continue;
    }
    const file = path.resolve(entry.dir, target);
    const name = path.relative(ctx.root, file).split(path.sep).join('/');
    if (!/\.(md|docx)$/i.test(file)) {
      noPage(`${name} is not Markdown or Word`);
      continue;
    }
    let parts;
    try {
      if (/\.docx$/i.test(file)) {
        parts = [{ title: null, html: await renderDocx(file, {
          imageDir: path.join(ctx.out, 'read', 'img', entry.no),
          imageUrl: `img/${encodeURIComponent(entry.no)}/`,
        }) }];
      } else {
        const unknown = new Set();
        parts = renderParts(await readFile(file, 'utf8'), {
          linkBase: path.dirname(file),
          root: ctx.root,
          rowLink: (address) => rowLink(address, { entry, byNo, held, unknown }),
          ...(web && { held: (abs) => web.held(abs, entry), published: web.published }),
        });
        for (const no of unknown) warn(`${name} names row ${no}, which the library does not have`);
      }
    } catch (err) {
      noPage(`${name} cannot be rendered (${err.code ?? err.message})`);
      continue;
    }
    const pages = parts.map((part, n) => ({ ...part, file: n ? `${entry.no}-${n + 1}.html` : `${entry.no}.html` }));
    for (const [n, part] of pages.entries()) {
      await ctx.write(`read/${part.file}`, readPage(entry, pages, n, { byNo, ctx }));
    }
    entry.page = `read/${pages[0].file}`;
    entry.pages = pages.map(({ title, html }) => ({ title, html })); // the text, for the search (steps/80-search.mjs)
  }
  await web?.publish();
}

// For the web: the row that holds a file, and the pictures of the texts, copied in by publish().
function onTheWeb(ctx) {
  const holders = new Map();
  for (const entry of ctx.lib.entries) {
    for (const abs of [entry.abs, ...(entry.images ?? []).map((image) => image.abs)]) {
      if (abs && !holders.has(abs)) holders.set(abs, entry);
    }
  }
  const pictures = new Map(); // the picture's file -> where it is published, relative to out
  return {
    held(abs, reading) {
      const holder = holders.get(abs);
      return holder && holder !== reading ? { no: holder.no, href: libraryHref(holder.no) } : null;
    },
    published(abs) {
      if (!PICTURE.test(abs)) return null;
      if (!pictures.has(abs)) {
        const key = createHash('sha256').update(path.relative(ctx.root, abs)).digest('hex').slice(0, 16);
        pictures.set(abs, `img/read/${key}.jpg`);
      }
      return `../${pictures.get(abs)}`;
    },
    async publish() {
      const cache = path.join(ctx.root, 'library', '.cache', 'img');
      await mkdir(cache, { recursive: true });
      for (const [abs, src] of pictures) {
        try {
          await ctx.copyFile((await cached(abs, cache)).file, src);
        } catch (err) {
          const where = path.relative(ctx.root, abs).split(path.sep).join('/');
          ctx.problems.push({ level: 'warn', where, message: `a picture of a read cannot be published: ${err.code ?? err.message}` });
        }
      }
    },
  };
}

// What the library holds, by the address it came from: a row by its source, when no other row
// has the same one, and a record of a table by any address in its cells. A row comes first.
function sourcesHeld(entries) {
  const rows = new Map();
  for (const entry of entries) {
    const address = plain(entry.source?.url);
    if (WEB.test(address)) rows.set(address, rows.has(address) ? null : { entry });
  }
  const held = new Map([...rows].filter(([, hit]) => hit));
  for (const entry of entries) {
    entry.records?.rows.forEach((cells, rec) => {
      for (const cell of cells) {
        const address = plain(cell);
        if (WEB.test(address) && !rows.has(address) && !held.has(address)) held.set(address, { entry, rec });
      }
    });
  }
  return held;
}

const plain = (address) => String(address ?? '').trim().replace(/\/$/, '');

// Where a link of the text leads when it is to something the library holds: the row, open, in
// the Library; for a record of a table, the table's page.
function rowLink(address, { entry, byNo, held, unknown }) {
  const named = ROW.exec(address);
  if (named) {
    const row = byNo.get(named[1]);
    if (!row) unknown.add(named[1]);
    return row ? { no: row.no, href: libraryHref(row.no) } : null;
  }
  const hit = WEB.test(address) ? held.get(plain(address)) : null;
  if (!hit || hit.entry === entry) return null;
  if (hit.rec === undefined) return { no: hit.entry.no, href: libraryHref(hit.entry.no) };
  return { no: hit.entry.no, rec: hit.rec, href: hit.entry.page ? `../${encodePath(hit.entry.page)}` : libraryHref(hit.entry.no) };
}

const libraryHref = (no) => `../index.html#o=${encodeURIComponent(no)}`;

function readPage(entry, pages, n, { byNo, ctx }) {
  const part = pages[n];
  const inParts = pages.length > 1;
  const whole = typeof entry.more.title === 'string' && entry.more.title.trim() ? entry.more.title.trim() : entry.title;
  const sources = (entry.type === 'Story' ? entry.sources ?? [] : []).map((no) => byNo.get(no)).filter(Boolean);
  const closing = sources.length && n === pages.length - 1
    ? `\n<section class="sources"><h2>Sources</h2>\n<ul>\n${sources
      .map((row) => `<li><a href="${esc(libraryHref(row.no))}">${esc(row.no)} ${esc(row.title)}</a></li>`)
      .join('\n')}\n</ul></section>`
    : '';
  const panel = panelOf(part.html, { byNo, ctx });
  const head = inParts
    ? `<p class="series">${esc(whole)} · ${n + 1} of ${pages.length}</p>
<h1>${esc(part.title)}</h1>
<nav class="parts" aria-label="Parts"><ol>${pages.map((other, i) => `<li><a href="${esc(encodeURIComponent(other.file))}"${i === n ? ' aria-current="page"' : ''}>${esc(other.title)}</a></li>`).join('')}</ol></nav>`
    : `<h1>${esc(whole)}</h1>`;
  const step = (i, rel, words) => (pages[i] ? `<a rel="${rel}" href="${esc(encodeURIComponent(pages[i].file))}">${words(esc(pages[i].title))}</a>` : '<span></span>');
  const foot = inParts
    ? `\n<nav class="part-step" aria-label="Previous and next part">${step(n - 1, 'prev', (t) => `← ${t}`)}${step(n + 1, 'next', (t) => `${t} →`)}</nav>`
    : '';
  return page({
    title: inParts ? `${part.title} · ${whole}` : whole,
    tab: 'library',
    depth: 1,
    css: panel ? ['web/detail.css', 'web/read.css'] : ['web/read.css'],
    js: panel ? ['web/back.js', 'web/read.js'] : ['web/back.js'],
    body: `<a class="back" href="${esc(libraryHref(entry.no))}">← Library</a>
${head}
<article class="read">
${part.html}${closing}
</article>${foot}${panel}`,
  });
}

// The panel of a page: every row its text cites, closed, as the Map page's panel has them, and
// under a table's title each of its records that the text cites.
function panelOf(html, { byNo, ctx }) {
  const cited = new Map(); // row number -> the records of it that are cited
  for (const [, no, , rec] of html.matchAll(/<a href="[^"]*" data-row="([^"]+)"( data-rec="(\d+)")?>/g)) {
    if (!cited.has(no)) cited.set(no, new Set());
    if (rec !== undefined) cited.get(no).add(Number(rec));
  }
  const rows = [...cited].map(([no, recs]) => [byNo.get(no), recs]).filter(([row]) => row);
  if (!rows.length) return '';
  return `\n<aside class="panel" id="panel" aria-label="A source in the library" hidden>
<button type="button" class="close">Close</button>
${rows.map(([row, recs]) => rowArticle(row, { ctx, places: ctx.lib.places, up: '../', under: [...recs].map((rec) => record(row, rec)).join('') })).join('\n')}
</aside>`;
}

// One record of a table, as the panel shows it above the table's own row: every cell that holds
// something, an address as a link to where the record came from.
function record(row, rec) {
  const { columns, rows } = row.records;
  const lines = columns.flatMap((column, i) => {
    const value = String(rows[rec]?.[i] ?? '').trim();
    if (!value) return [];
    const shown = WEB.test(value)
      ? `<a href="${esc(value)}" target="_blank" rel="noopener">${esc(host(value))}</a>`
      : esc(shorten(value));
    return [`<dt>${esc(column.replace(/_/g, ' '))}</dt><dd>${shown}</dd>`];
  });
  return `<div class="e-record" data-rec="${rec}" hidden><p class="e-meta">The record cited</p><dl class="meta">${lines.join('')}</dl></div>`;
}

function host(address) {
  try {
    return new URL(address).hostname.replace(/^www\./, '');
  } catch {
    return address;
  }
}

function shorten(text) {
  const chars = [...text.replace(/\s+/g, ' ')];
  return chars.length <= RECORD_CELL ? chars.join('') : `${chars.slice(0, RECORD_CELL).join('').replace(/\s+\S*$/, '')}…`;
}
