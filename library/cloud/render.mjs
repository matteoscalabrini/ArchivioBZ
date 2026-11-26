// The pages made from the archive document: the public site from a publish, and the Library in edit
// mode from the draft. The same page functions as the build's (lib/pages.mjs), given what the steps
// give them, so a publish shows the rows as a build of the same rows would. A hidden row is on the
// edit page and nowhere in the public files, not even as a source another row cites.
// The rows come from the document; the shared lists and the dot data are files of the code, read
// once in loadLists.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { libFromDoc, diffDocs } from './doc.mjs';
import { libraryPage, mapPage, aboutPage, keywordStrip } from '../lib/pages.mjs';
import { searchIndex } from '../lib/searchindex.mjs';
import { parseIdea } from '../lib/idea.mjs';
import { renderMarkdown } from '../lib/markdown.mjs'; // not longread.mjs, which loads mammoth
import { readKinds } from '../lib/kinds.mjs';
import { readSearchLists } from '../lib/find.mjs';
import { TYPES } from '../lib/records.mjs';
import { esc } from '../lib/shell.mjs';

const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';
// The dot data belongs to the site's code, so it is found beside this folder, as the build finds
// it (lib/places.mjs), and the places in the document were located against this same file.
const DOTS = fileURLToPath(new URL('../map-data/dots.json', import.meta.url));
// About is read as if it were library/content/about.md of this repository, as the build reads it.
const CONTENT = fileURLToPath(new URL('../content/', import.meta.url));
const REPO = fileURLToPath(new URL('../../', import.meta.url));

// What the pages take besides the document: the colours' names, the sets of names and the glossary
// (the search's lists), the kinds of entry, all from library/content/ under `root`, and what
// dots.json says of the dot data. `problems`: the faults of those files, for the caller to log; a
// missing or broken list leaves that list empty, as in the build. A missing dots.json throws.
export async function loadLists(root) {
  const problems = [];
  const where = (abs) => path.relative(path.resolve(root), abs).split(path.sep).join('/');
  const { colours, names, glossary } = await readSearchLists(root, (level, abs, message) => problems.push({ level, where: where(abs), message }));
  const kinds = await readKinds(root);
  problems.push(...kinds.problems);
  const mapMeta = JSON.parse(await readFile(DOTS, 'utf8'));
  return { colours, names, glossary, kinds: kinds.kinds, mapMeta, problems };
}

// The four public files of a publish, hidden rows left out of each:
// path -> { body, type }. `problems`: the idea's unknown keywords (errors) and what the page
// functions warn of (a type no kind names, a place the dot data was made without).
export function renderSite(doc, lists) {
  const lib = publicLib(doc, lists);
  const { idea, problems } = theIdea(doc);
  const library = libraryPage(lib, { idea, kinds: lists.kinds });
  const map = mapPage(lib, { meta: lists.mapMeta });
  const aboutHtml = renderMarkdown(doc.about ?? '', { linkBase: CONTENT, root: REPO });
  const files = new Map([
    ['index.html', { body: library.html, type: HTML }],
    ['map.html', { body: map.html, type: HTML }],
    ['about.html', { body: aboutPage(lib, { aboutHtml }), type: HTML }],
    ['search.json', { body: JSON.stringify(searchIndex(lib)), type: JSON_TYPE }],
  ]);
  return { files, problems: [...problems, ...library.problems, ...map.problems] };
}

// The Library in edit mode, at /edit/: every row of the draft, hidden ones too, a hidden row marked
// data-hidden and a row that differs from the latest publish data-changed; the draft itself, its
// version, the row types, the summary line, the changed rows' ids, the ids of the rows the
// latest publish holds (which a removal can bring back) and where the page sends the original of a
// picture added (`originals`: the route 'upload' or 'original', null when pictures cannot be
// added; handlers.mjs) as #edit-data for web/edit.js.
// `published`: the latest publish's document, or null when there is none: then no row is marked,
// since every one would be, and the summary counts what the first publish would show.
export function renderEditPage(doc, { version, published, lists, originals = null }) {
  const changed = changedRows(doc, published);
  const data = { version, doc, types: TYPES, summary: summaryOf(published, doc), changed: [...changed], published: published ? Object.keys(published.rows) : [], originals };
  return editPage(doc, lists, changed, data);
}

// One row of the edit page, its <article class="row"> exactly as renderEditPage draws it for the
// same `published`, to be swapped into the page after an edit. The page is drawn and the row cut
// out of it, so the two cannot differ: every word of a row is escaped, so the first </article>
// after the row's start is its end.
export function renderEditRow(doc, id, lists, { published = null } = {}) {
  const html = editPage(doc, lists, changedRows(doc, published), null);
  const start = html.indexOf(`<article class="row" data-no="${esc(id)}"`);
  if (start < 0) throw new Error(`no row ${id} in the draft`);
  const end = html.indexOf('</article>', start) + '</article>'.length;
  return html.slice(start, end);
}

// "All keywords" of the edit page, exactly as renderEditPage draws it: from the rows that page
// draws, hidden ones too, with their counts, in the vocabulary's order. Every op is answered with
// it, to be swapped into the page, so a keyword a row has just been given is in it at once.
export function renderEditStrip(doc) {
  return keywordStrip(libFromDoc(doc, { hidden: true }));
}

// What the search in edit mode reads: search.json of the draft, hidden rows included.
export function editSearch(doc, lists) {
  return searchIndex(libFromDoc(doc, { hidden: true, lists }));
}

// "277 rows in 18 chapters": the rows a publish of the document shows (not the hidden ones), and
// its chapters.
export function counted(doc) {
  const rows = doc.chapters.reduce((n, chapter) => n + chapter.rows.filter((id) => doc.rows[id] && !doc.rows[id].hidden).length, 0);
  const chapters = doc.chapters.length;
  return `${rows} ${rows === 1 ? 'row' : 'rows'} in ${chapters} ${chapters === 1 ? 'chapter' : 'chapters'}`;
}

// The edit bar's line for the draft against the latest publish (`published`, null when there is
// none): what a publish would carry, or, before the first, "Nothing published yet: 277 rows in 18
// chapters", where every row, title and word would otherwise count as a change.
export function summaryOf(published, doc) {
  return published ? summaryLine(diffDocs(published, doc)) : `Nothing published yet: ${counted(doc)}`;
}

// The line a publish is stored with, which the list of publishes shows.
export function publishLine(published, doc) {
  return published ? summaryLine(diffDocs(published, doc)) : `First publish: ${counted(doc)}`;
}

// The words in the edit bar for what a publish would carry, from diffDocs: "6 rows changed, 2 added,
// 1 hidden, order changed", or that nothing differs.
export function summaryLine(diff) {
  const n = (list) => list?.length ?? 0;
  const parts = [
    n(diff.changed) && `${n(diff.changed)} ${n(diff.changed) === 1 ? 'row' : 'rows'} changed`,
    n(diff.added) && `${n(diff.added)} added`,
    n(diff.removed) && `${n(diff.removed)} removed`,
    n(diff.hidden) && `${n(diff.hidden)} hidden`,
    n(diff.shown) && `${n(diff.shown)} shown again`,
    diff.order && 'order changed',
    diff.chapters && 'chapters changed',
    diff.idea && 'idea changed',
    diff.about && 'About changed',
    diff.keywords && 'keywords changed',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'No changes since the last publish';
}

// The lib of the public pages: the rows that are not hidden, and of the sources each cites only
// those that are among them. A cited row that is hidden has no number, and one that was removed
// has none either, so the page would show its id and link to it: it is left out instead.
function publicLib(doc, lists) {
  const lib = libFromDoc(doc, { lists });
  const shown = new Set(lib.entries.map((entry) => entry.id));
  for (const entry of lib.entries) {
    if (!Array.isArray(entry.sources)) continue;
    const kept = entry.sources.map((id, i) => [id, entry.sourceNumbers[i]]).filter(([id]) => shown.has(id));
    entry.sources = kept.map(([id]) => id);
    entry.sourceNumbers = kept.map(([, no]) => no);
  }
  return lib;
}

// The idea as the Library page takes it, parsed against the document's keywords; its stand-in label
// stays while the text starts with `status: stand-in` (the cloud has no build for a showing).
function theIdea(doc) {
  const { html, standin, keywords, problems } = parseIdea(doc.idea ?? '', doc);
  return { idea: { html, standin, keywords }, problems: problems.map(({ level, message }) => ({ level, where: 'the idea', message })) };
}

// The rows of the draft that differ from the publish, in the story order: changed, added, hidden
// or shown again. A row that only moved is not one of them; the summary says the order changed.
// None before the first publish.
function changedRows(doc, published) {
  if (!published) return new Set();
  const diff = diffDocs(published, doc);
  const ids = new Set([...diff.changed, ...diff.added, ...diff.hidden, ...diff.shown]);
  return new Set(doc.chapters.flatMap((chapter) => chapter.rows).filter((id) => ids.has(id)));
}

// The edit page, with `data` as #edit-data (null when only a row is wanted from it).
function editPage(doc, lists, changed, data) {
  const lib = libFromDoc(doc, { hidden: true, lists });
  const mark = (entry) => (entry.hidden ? ' data-hidden="true"' : '') + (changed.has(entry.id) ? ' data-changed="true"' : '');
  const extra = { css: ['web/edit.css'], js: ['web/edit.js'], data, mark };
  return libraryPage(lib, { idea: theIdea(doc).idea, kinds: lists.kinds, depth: 1, extra }).html;
}
