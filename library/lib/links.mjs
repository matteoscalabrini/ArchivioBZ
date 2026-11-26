// The links typed in a text: `[[words|target]]`, or `[[target]]`, whose words are then the target's
// own (a keyword's label, a row's title, a page's title). One reading of them for every text that
// has them (the idea, About, a row's text, the pages) and for the search, which reads their words
// and never their code. A target names a keyword by its id or its label in any case, a folded id
// standing for its target; `@<row id>` a row, by its id, which never changes when the row moves;
// `page:<address>` a page.
//
// What a link knows of the document comes in `ctx`: { keywords, aliases, rows: Map<id, { no,
// title, shown }>, pages: Map<address, { title, shown }>, carried: Set<keyword id> (the keywords
// some shown row carries; none given, every keyword counts), here: 'library' | 'other' (the page
// the link is on), up: '' | '../' (the way from that page to the site's top folder), edit }.
// A target the public may not see (a hidden or unknown row, a hidden or unknown page, an unknown
// keyword or one no shown row carries) is drawn as its words alone on the public site, so that
// nothing only the draft holds leads anywhere, and in edit mode dotted, its title saying why.
import { esc } from './shell.mjs';

const LINK = /\[\[([^[\]]*)\]\]/g;
const ROW = '@';
const PAGE = 'page:';

// -> [{ start, end, words, target }]: each link, where it stands in `text`, its words (null for
// none) and its target, both with their spaces tidied. `[[` without its `]]`, and a link with
// empty words or no target (`[[|x]]`, `[[x|]]`), stay as typed.
export function linksIn(text) {
  const links = [];
  for (const match of String(text ?? '').matchAll(LINK)) {
    const bar = match[1].lastIndexOf('|');
    const target = tidy(match[1].slice(bar + 1));
    const words = bar < 0 ? null : tidy(match[1].slice(0, bar));
    if (!target || words === '') continue;
    links.push({ start: match.index, end: match.index + match[0].length, words, target });
  }
  return links;
}

// What a target names: { kind: 'keyword' | 'row' | 'page', id (a keyword's canonical id, a row's
// id, a page's address; undefined for an unknown keyword), name (its label or title, when it has
// one), dead (why the public may not see it, or null) }.
export function targetOf(target, ctx) {
  if (target.startsWith(ROW)) {
    const id = target.slice(ROW.length).trim();
    const row = ctx.rows?.get(id);
    return { kind: 'row', id, name: row?.title, dead: !row ? 'There is no such row.' : row.shown ? null : 'The row is hidden.' };
  }
  if (target.startsWith(PAGE)) {
    const id = target.slice(PAGE.length).trim();
    const page = ctx.pages?.get(id);
    return { kind: 'page', id, name: page?.title, dead: !page ? 'There is no such page.' : page.shown ? null : 'The page is hidden.' };
  }
  const id = keywordLookup(ctx.keywords ?? {}, ctx.aliases ?? {})(target);
  if (!id) return { kind: 'keyword', id, name: undefined, dead: 'There is no such keyword.' };
  const name = ctx.keywords[id]?.label ?? id;
  return { kind: 'keyword', id, name, dead: ctx.carried && !ctx.carried.has(id) ? 'No row shown carries this keyword.' : null };
}

// One link as HTML: a keyword's button on the Library (library.js filters by it) or a link to the
// Library so filtered; a row's link, which on the Library opens the row in place (data-row) and
// elsewhere leads to the Library with the row open; a page's link. A dead one as its words.
export function linkHtml(link, ctx) {
  const found = targetOf(link.target, ctx);
  const words = esc(wordsFor(link, found, ctx));
  if (found.dead) return ctx.edit ? `<span class="dead-link" title="${esc(found.dead)}">${words}</span>` : words;
  const id = esc(found.id);
  const address = esc(encodeURIComponent(found.id));
  const up = ctx.up ?? '';
  const library = ctx.here === 'library';
  if (found.kind === 'keyword') return library ? `<button type="button" data-k="${id}">${words}</button>` : `<a href="${up}index.html#k=${address}">${words}</a>`;
  if (found.kind === 'row') return library ? `<a href="#o=${address}" data-row="${id}">${words}</a>` : `<a href="${up}index.html#o=${address}">${words}</a>`;
  return `<a href="${up}pages/${address}.html">${words}</a>`;
}

// A text with its links drawn and every other character escaped.
export function withLinks(text, ctx) {
  return eachLink(String(text ?? ''), esc, (link) => linkHtml(link, ctx));
}

// A text as a reader reads it: each link its words, as drawn.
export function wordsOf(text, ctx) {
  return eachLink(String(text ?? ''), (part) => part, (link) => wordsFor(link, targetOf(link.target, ctx), ctx));
}

function eachLink(text, plain, linked) {
  let out = '';
  let from = 0;
  for (const link of linksIn(text)) {
    out += plain(text.slice(from, link.start)) + linked(link);
    from = link.end;
  }
  return out + plain(text.slice(from));
}

// The words a link shows: its own, else what it names. A target the public may not see shows on
// the public site no title and no code of a row or a page (a hidden one's title is the draft's
// alone), and a keyword's name as typed (its label may be one only a hidden row carries); edit
// mode shows the author what is there, or the code as typed when nothing is.
function wordsFor(link, found, ctx) {
  if (link.words !== null) return link.words;
  if (!found.dead) return found.name;
  if (ctx.edit) return found.name ?? link.target;
  return found.kind === 'keyword' ? link.target : '';
}

// name -> canonical id, case and spacing aside; an id wins over a folded id, which wins over a
// label.
function keywordLookup(keywords, aliases) {
  const ids = new Map();
  for (const [id, { label } = {}] of Object.entries(keywords)) if (label) ids.set(fold(label), id);
  for (const [id, target] of Object.entries(aliases)) ids.set(fold(id), target);
  for (const id of Object.keys(keywords)) ids.set(fold(id), id);
  return (name) => ids.get(fold(name));
}

const fold = (name) => String(name).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const tidy = (words) => words.replace(/\s+/g, ' ').trim();
