// What the search reads, as one object: steps/80-search.mjs writes it as search.json and
// web/search.js searches it. For every row, in the library's order, its sources by strength:
//   line   its own line, as the closed row shows it: number, title, type, date, keywords
//   place, maker, holder   what belongs to that line and the closed row does not show
//   on, shows, colours, names   the thing itself, from find.json (lib/find.mjs)
//   text, facts   its description, and its notes with their source tags taken out
//   table, read   what hangs from it: each record of its table, each paragraph of its read
// and the three shared lists. A list that is empty is left out of its row. A link typed in the
// text or the read (lib/links.mjs) is there as its words, as the page shows them, never its code;
// every row of the lib counts as there, and a keyword counts while one of its rows carries it.
//
// Earlier steps add what is optional here: entry.records (tables), entry.pages (long reads).

import { rowKey } from './detail.mjs';
import { wordsOf } from './links.mjs';

const TAG = /\s*\[[A-Z][A-Za-z✓,/ -]*\]/g; // [V], [S], [IMG✓], [VERIFIED-DOC]; not [1924], not […]
const TAIL = /\s*\((?:manifest|notes?|file|the file|record|row|own photograph)\b[^()]*\)\.?\s*$/i;
const BLOCK = /<(p|li|h[2-6]|blockquote|figcaption|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const BREAK = /<\/?(?:br|p|li|ul|ol|div|blockquote|h[1-6]|td|tr|figure|figcaption)\b[^>]*>/gi;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function searchIndex(lib) {
  const label = (id) => lib.keywords?.[id]?.label ?? id;
  const links = {
    keywords: lib.keywords ?? {},
    aliases: lib.aliases ?? {},
    rows: new Map(lib.entries.map((entry) => [rowKey(entry), { no: entry.no, title: entry.title, shown: true }])),
    pages: new Map(),
    carried: new Set(lib.entries.flatMap((entry) => entry.keywords ?? [])),
  };
  const words = (text) => wordsOf(text, links);
  const rows = lib.entries.map((entry) => {
    const row = { no: rowKey(entry) };
    const put = (key, list) => {
      const kept = list.map(tidy).filter(Boolean);
      if (kept.length) row[key] = kept;
    };
    put('line', [entry.no, entry.title, entry.type, entry.date, ...(entry.keywords ?? []).map(label)]);
    put('place', [entry.place ? lib.places?.[entry.place]?.name : '']);
    put('maker', [entry.creator]);
    put('holder', [entry.holder]);
    put('on', entry.find?.on ?? []);
    put('shows', entry.find?.shows ?? []);
    put('colours', entry.find?.colours ?? []);
    put('names', entry.find?.names ?? []);
    put('text', (Array.isArray(entry.text) ? entry.text : []).map(words));
    put('facts', (Array.isArray(entry.facts) ? entry.facts : []).map(stripTags));
    put('table', (entry.records?.rows ?? []).map((cells) => cells.map(tidy).filter(Boolean).join(' · ')));
    put('read', (entry.pages ?? []).flatMap((page) => [page.title ?? '', ...paragraphs(page.html ?? '')]).map(words));
    return row;
  });
  return { v: 1, colours: lib.colours ?? {}, names: lib.names ?? [], glossary: lib.glossary ?? [], rows };
}

// A fact without the tags that say where it comes from: "(manifest)", "(notes 01, Q4, [IMG✓])", "[V]".
export function stripTags(fact) {
  let text = String(fact ?? '').replace(TAG, '');
  while (TAIL.test(text)) text = text.replace(TAIL, '');
  return tidy(text);
}

// The text of a page of a read, block by block: paragraphs, list items, headings, captions, cells.
export function paragraphs(html) {
  return [...String(html ?? '').matchAll(BLOCK)]
    .map(([, , inner]) => tidy(decode(inner.replace(BREAK, ' ').replace(/<[^>]+>/g, ''))))
    .filter(Boolean);
}

function decode(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

const tidy = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
