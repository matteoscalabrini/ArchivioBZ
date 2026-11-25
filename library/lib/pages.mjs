// The site's three pages, the Library, the Map and About, each made from a library and what it is
// given, reading no file: the build's steps read the files and write what these return, and the
// same functions make the pages from the archive document in the cloud. A library made from the
// document has chapters (lib.chapters); one read from the record files has none.
import { esc, page } from './shell.mjs';
import { pictureSrc, rowArticle, rowDetail, rowKey } from './detail.mjs';
import { kindOf } from './kinds.mjs';
import { placesWithRows } from './places.mjs';

// The Library page, index.html: the idea (or the keyword index) at the top, under it every
// keyword with its count, a sticky status line, the kinds of entry (lib/kinds.mjs), and every row
// of the library in one list, closed. web/library.js filters, searches, sorts and opens the rows
// and keeps the address in step. Under each title stands an empty place for the reason a search
// found the row (web/results.js writes it). With chapters, every row says its chapter
// (data-chapter) and the chapter's number and title stand over its first row; a chapter with no
// row in the list has no heading.
//
// What earlier steps add is optional here: entry.pictures (pictures), the idea, entry.preview and
// entry.page (tables, long reads), place.inside (the map; undefined counts as inside). A read or
// table row links its page only when entry.page says it was written.
//
// `idea`: { html, standin } or null. `kinds`: as readKinds gives them. `present`: the page is for
// a showing, where a stand-in idea gives way to the keyword index. `depth`: how many folders down
// from the site's top the page stands. `sourceUrl(abs)`: the address of a file a row holds, or null.
// `extra`, for edit mode: { css, js, data, mark }: its stylesheets and scripts join the page's,
// `data` is written as the JSON of #edit-data, and mark(entry) gives the attributes it adds to
// that row's <article>. -> { html, problems }: the problems are the rows whose type no kind names.
export function libraryPage(lib, { idea = null, kinds = [], present = false, depth = 0, sourceUrl = () => null, extra = null } = {}) {
  const { entries, keywords, places } = lib;
  const up = '../'.repeat(depth);
  const ctx = { sourceUrl }; // what an open row asks of the build
  const problems = [];
  const label = (id) => keywords[id]?.label ?? id;
  const counts = new Map();
  for (const entry of entries) for (const id of entry.keywords) counts.set(id, (counts.get(id) ?? 0) + 1);
  const used = Object.keys(keywords).filter((id) => counts.has(id)); // in the vocabulary's order
  // The keywords with at least one row at a place on the map: only for these does the status
  // line offer "On the map →" (library.js reads the list).
  const placed = entries.filter((entry) => entry.place && places?.[entry.place] && places[entry.place].inside !== false);
  const onMap = used.filter((id) => placed.some((entry) => entry.keywords.includes(id)));

  // The kind of each row, and the rows whose type no kind names: they show under no kind.
  const kindOfRow = new Map(entries.map((entry) => [rowKey(entry), kindOf(entry.type, kinds)]));
  const inKind = new Map();
  for (const id of kindOfRow.values()) if (id) inKind.set(id, (inKind.get(id) ?? 0) + 1);
  if (kinds.length) {
    const stray = new Map(); // type -> row numbers
    for (const entry of entries) if (!kindOfRow.get(rowKey(entry))) stray.set(entry.type, [...(stray.get(entry.type) ?? []), entry.no]);
    for (const [type, nos] of stray) {
      problems.push({ level: 'warn', where: 'library/content/kinds.json', message: `no kind names the type "${type}" (${nos.join(', ')}): these rows show under no kind` });
    }
  }

  // The chapter of each row, by its key, when the library has chapters.
  const chapterOf = new Map();
  for (const chapter of Array.isArray(lib.chapters) ? lib.chapters : []) for (const id of chapter.ids) chapterOf.set(id, chapter);
  const headed = new Set();
  const list = [];
  entries.forEach((entry, at) => {
    const chapter = chapterOf.get(rowKey(entry));
    if (chapter && !headed.has(chapter.id)) {
      headed.add(chapter.id);
      list.push(chapterHeading(chapter));
    }
    list.push(row(entry, { ctx, label, places, at, up, kind: kindOfRow.get(rowKey(entry)), chapter: chapter?.id, mark: extra?.mark }));
  });

  const body = [
    top(idea, present, used, label),
    `<div class="keywords"><span class="lab">All keywords</span>${used
      .map((id) => keywordButton(id, `${esc(label(id))}<sup>${counts.get(id)}</sup>`))
      .join('')}</div>`,
    status(entries.length, up),
    kindLine(kinds, inKind),
    COLUMN_HEADS,
    '<div class="list">',
    ...list,
    '</div>',
    `<script type="application/json" id="keyword-labels">${json(Object.fromEntries(Object.keys(keywords).map((id) => [id, label(id)])))}</script>`,
    `<script type="application/json" id="keywords-on-map">${json(onMap)}</script>`,
    kinds.length ? `<script type="application/json" id="kind-labels">${json(Object.fromEntries(kinds.map((kind) => [kind.id, kind.label])))}</script>` : '',
    extra ? `<script type="application/json" id="edit-data">${json(extra.data ?? null)}</script>` : '',
  ].filter(Boolean).join('\n');

  const css = ['web/detail.css', 'web/library.css', ...(extra?.css ?? [])];
  const js = ['web/library.js', ...(extra?.js ?? [])];
  return { html: page({ title: 'Library', tab: 'library', body, css, js, depth }), problems };
}

// The idea paragraph, unless there is none or it is a stand-in and the page is for a showing:
// then every keyword that has rows, large, in its place.
function top(idea, present, used, label) {
  if (idea?.html && !(idea.standin && present)) {
    // A button is laid out as a block inside the line, so a comma after it could start the next
    // line; whatever follows a marked word without a space is held to it.
    const html = idea.html.replace(/(<button\b[^>]*>[^<]*<\/button>)([^\s<]+)/g, '<span class="kw">$1$2</span>');
    return `<section class="idea"><span class="lab">${idea.standin ? 'The idea (stand-in)' : 'The idea'}</span>${html}</section>`;
  }
  return `<section class="idea index"><p>${keywordList(used, label)}</p></section>`;
}

function status(total, up) {
  return '<div class="status">'
    + `<span class="now" aria-live="polite"><span class="what">All entries</span><span class="n">${total} ${total === 1 ? 'entry' : 'entries'}</span></span>`
    + '<button type="button" class="show-all" hidden>Show all</button>'
    + `<a class="on-map" href="${up}map.html" hidden>On the map →</a>`
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

// A chapter's line in the list: its number and its title. library.js shows it over the chapter's
// first row in the story order and leaves it out of a search and of the other sorts.
function chapterHeading({ id, no, title }) {
  return `<h2 class="chapter" data-chapter="${esc(id)}"><span class="ch-no">${esc(no)}</span> ${esc(title)}</h2>`;
}

// `at`: the row's place in the story (its index among the entries), which the No. sort follows.
// `chapter`: the id of its chapter, if the library has chapters. `mark`: edit mode's attributes.
function row(entry, { ctx, label, places, at, up, kind, chapter, mark }) {
  const key = esc(rowKey(entry));
  const no = esc(entry.no);
  const head = '<div class="row-head">'
    + `<span class="c-no">${no}</span>`
    + `<h2 class="c-title"><button type="button" aria-expanded="false" aria-controls="body-${key}">${esc(entry.title)}</button><span class="why"></span></h2>`
    + `<span class="c-type">${esc(entry.type)}</span>`
    + `<span class="c-date">${esc(entry.date)}</span>`
    + `<span class="c-kw">${keywordList(entry.keywords, label)}</span>`
    + '</div>';

  const detail = rowDetail(entry, { ctx, places, up });

  return `<article class="row" data-no="${key}" data-at="${at}"${chapter ? ` data-chapter="${esc(chapter)}"` : ''} data-kw="${esc(entry.keywords.join(' '))}" data-type="${esc(entry.type)}" data-year="${esc(entry.year)}"${kind ? ` data-kind="${esc(kind)}"` : ''}${mark ? mark(entry) : ''}>
${head}
<div class="row-body" id="body-${key}" inert><div class="row-inner">${detail}</div></div>
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

// A small picture on the map is 60 px high and as wide as its shape asks, between 40 and 90 px;
// the frame of a row without a picture is 46 px wide (web/map.js lays them out).
const PICTURE = { height: 60, min: 40, max: 90, blank: 46 };
const IMPORT_MAP = { imports: { three: './web/vendor/three.module.js', 'three/addons/': './web/vendor/addons/' } };

// The Map page, map.html: the dot field (drawn by web/map.js from map-data/); for every place on
// it that has rows, its name and one small picture per row; a panel with each place's rows and
// each row as the Library shows it open; the places beyond the field listed.
//
// `meta`: dots.json, as locatePlaces (lib/places.mjs) returns it. The places must be located
// already: this reads place.inside, x, y and z and works out none of them.
// -> { html, problems }: the one problem is the places drawn before the dot data knew they had rows.
export function mapPage(lib, { meta, sourceUrl = () => null } = {}) {
  const { places, entries, keywords } = lib;
  const ctx = { sourceUrl }; // what a row in the panel asks of the build
  const problems = [];

  const rowsAt = new Map();
  for (const entry of entries) {
    if (!entry.place || !Object.hasOwn(places, entry.place)) continue;
    if (!rowsAt.has(entry.place)) rowsAt.set(entry.place, []);
    rowsAt.get(entry.place).push(entry);
  }
  const withRows = placesWithRows(lib).filter((id) => rowsAt.has(id));
  const drawn = withRows.filter((id) => places[id].inside);
  const beyond = withRows.filter((id) => !places[id].inside);

  // The buildings of a place are drawn at full resolution only if the dot data was made when the
  // place already had rows (dots.json lists the places it was made for).
  const late = meta.focus ? drawn.filter((id) => !meta.focus.places.includes(id)) : [];
  if (late.length) {
    problems.push({ level: 'warn', where: 'library/map-data/dots.json',
      message: `made before ${late.map((id) => places[id].name ?? id).join(', ')} had rows: drawn like the rest of the city until "npm run map-data" is run again` });
  }

  const body = [
    '<div class="map" id="map">',
    '<canvas class="scene" id="scene" tabindex="0" aria-label="Map"></canvas>',
    `<div class="labels" id="labels">${drawn.map((id) => marker(id, places[id], rowsAt.get(id).length)
      + rowsAt.get(id).map((entry) => picture(id, entry)).join('')).join('')}</div>`,
    '<p class="filter" id="filter" hidden><span class="what"></span> <button type="button" class="show-all">Show all places</button></p>',
    '<aside class="panel" id="panel" hidden>',
    '<button type="button" class="close">Close</button>',
    ...drawn.map((id, n) => `<section class="rows-of" data-for="${esc(id)}" aria-labelledby="place-${n + 1}" hidden>`
      + `<h2 id="place-${n + 1}" tabindex="-1">${esc(places[id].name)}</h2>${rowList(rowsAt.get(id))}`
      + `${rowsAt.get(id).map((entry) => rowArticle(entry, { ctx, places, onMap: true })).join('')}</section>`),
    '</aside>',
    `<section class="beyond" id="beyond" aria-labelledby="beyond-head"${beyond.length ? '' : ' hidden'}>`,
    '<h2 class="lab" id="beyond-head">Beyond this map</h2>',
    `<ul>${beyond.map((id, n) => `<li data-beyond="${esc(id)}">`
      + `<button type="button" aria-expanded="false" aria-controls="beyond-${n + 1}">${nameAndCount(places[id].name, rowsAt.get(id).length)}</button>`
      + rowList(rowsAt.get(id), ` id="beyond-${n + 1}" hidden`) + '</li>').join('')}</ul>`,
    '</section>',
    `<p class="credit">${esc(credit(meta))}</p>`,
    '</div>',
    `<script type="application/json" id="keyword-labels">${json(Object.fromEntries(Object.entries(keywords).map(([id, k]) => [id, k.label ?? id])))}</script>`,
  ].join('\n');

  const head = `<script type="importmap">${json(IMPORT_MAP)}</script>\n<script type="module" src="web/map.js"></script>`;
  return { html: page({ title: 'Map', tab: 'map', body, css: ['web/detail.css', 'web/map.css'], head }), problems };
}

// The name and count of a place, a button that web/map.js stands on the point (x, y, z).
function marker(id, place, count) {
  const at = ['x', 'y', 'z'].map((axis) => ` data-${axis}="${place[axis].toFixed(1)}"`).join('');
  return `<button type="button" class="place" data-place="${esc(id)}"${at} aria-controls="panel" aria-expanded="false">`
    + `${nameAndCount(place.name, count)}</button>`;
}

// A row's small picture on the map, a button; without a picture, its type word in the same frame.
// data-w: the width of the picture in px. No `src` until web/map.js first shows it.
function picture(id, entry) {
  const attrs = `data-for="${esc(id)}" data-no="${esc(rowKey(entry))}" aria-label="${esc(`${entry.no} · ${entry.title}`)}"`;
  const thumb = entry.thumb;
  if (!thumb?.src || !(thumb.w > 0) || !(thumb.h > 0)) {
    return `<button type="button" class="pin blank" ${attrs} data-w="${PICTURE.blank}">${esc(entry.type)}</button>`;
  }
  const w = Math.max(PICTURE.min, Math.min(PICTURE.max, Math.round((PICTURE.height * thumb.w) / thumb.h)));
  return `<button type="button" class="pin" ${attrs} data-w="${w}">`
    + `<img data-src="${esc(pictureSrc(thumb.src))}" alt="" width="${thumb.w}" height="${thumb.h}"></button>`;
}

const nameAndCount = (name, count) => `<span class="name">${esc(name)}</span> <span class="n">${count}</span>`;

// No. · Title · Type, each a link to its row, open, in the Library.
function rowList(rows, attrs = '') {
  return `<ol class="rows"${attrs}>${rows.map((entry) => `<li data-no="${esc(rowKey(entry))}" data-kw="${esc(entry.keywords.join(' '))}">`
    + `<a href="index.html#o=${esc(encodeURIComponent(rowKey(entry)))}">`
    + `<span class="no">${esc(entry.no)}</span><span class="sep"> · </span>`
    + `<span class="title">${esc(entry.title)}</span><span class="sep"> · </span>`
    + `<span class="type">${esc(entry.type)}</span></a></li>`).join('')}</ol>`;
}

// The OpenStreetMap line of the dot data's sources, with the address of the licence as text.
function credit(meta) {
  const osm = (meta.sources ?? []).find((s) => /OpenStreetMap/.test(s.text ?? ''));
  return osm ? [osm.text, osm.url].filter(Boolean).join(', ') : '';
}

// The About page, about.html: its title, the About text (about.md, given as HTML) in the long-read
// column, then the entries counted by type and a line of totals. Without the text the counts stand
// alone.
export function aboutPage(lib, { aboutHtml = '' } = {}) {
  const { entries } = lib;
  const byType = new Map();
  for (const entry of entries) byType.set(entry.type, (byType.get(entry.type) ?? 0) + 1);
  const types = [...byType].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const places = new Set(entries.map((entry) => entry.place).filter(Boolean)).size;
  const keywords = new Set(entries.flatMap((entry) => entry.keywords ?? [])).size;
  const totals = [`${entries.length} entries`, places && `${places} places`, keywords && `${keywords} keywords`].filter(Boolean).join(' · ');

  const body = `<h1>About</h1>
<article class="read about">
${aboutHtml}
<h2>Entries by type</h2>
<div class="sheet"><table>
<thead><tr><th scope="col">Type</th><th scope="col">Entries</th></tr></thead>
<tbody>
${types.map(([type, count]) => `<tr><td>${esc(type)}</td><td>${count}</td></tr>`).join('\n')}
</tbody>
</table></div>
<p class="totals">${totals}</p>
</article>`;
  return page({ title: 'About', tab: 'about', body, css: ['web/read.css'] });
}

// JSON inside a <script>: a `<` written as <, so no text in it can close the tag.
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
