// The archive document: the whole library as one JSON value, which the database holds as the draft
// and as each publish. Made here from the record files once, then kept by the edit operations.
// This file holds only what is made of it: the shown numbers, the `lib` the page functions take,
// the difference between two documents and the check of one. It reads no file and touches no
// database, so the build, the cloud and the tests all use the same functions.
import path from 'node:path';
import { TYPES } from '../lib/records.mjs';

// The fields a row's record may hold, as in entries.json less `no` and `images`; a field the record
// does not have stays absent.
export const RECORD_FIELDS = ['title', 'type', 'date', 'year', 'keywords', 'text', 'confidence', 'facts', 'source', 'rights',
  'file', 'more', 'creator', 'holder', 'place', 'side_by_side', 'sources'];
// Fields of an entry that are not its record: what the loader adds (the search terms go to the
// row's `find`), and what the build's picture step sets (the row's own pictures and thumb, as the
// cloud holds them, replace them).
const NOT_RECORD = ['no', 'images', 'section', 'dir', 'abs', 'find', 'pictures', 'thumb'];
const MAX_KEYWORDS = 5;
// A key that JavaScript reads as an array index ("1939") goes before every other key of an object,
// whatever order the document has it in; the pages show the keywords and the places in the
// document's order, so neither may have such an id.
export const NUMBER_KEY = /^(0|[1-9]\d*)$/;

// The document made from a library read from files. `lib` has had locatePlaces run on it.
// `chapterTitles`: section number -> title; one chapter per section that has rows, in section
// order, ids c1…cN. `pictures`: row number -> { pictures, thumb } as held in the cloud.
// A row's id is the number it has today; it never changes after this. An entry with a field that
// is neither a record field nor one of NOT_RECORD throws, so that nothing is left behind unsaid.
export function docFromLibrary(lib, { root, chapterTitles = {}, pictures = new Map(), idea = '', about = '' }) {
  const rows = {};
  const bySection = new Map();
  for (const entry of lib.entries) {
    const stray = Object.keys(entry).find((key) => !RECORD_FIELDS.includes(key) && !NOT_RECORD.includes(key));
    if (stray) throw new Error(`row ${entry.no} has a field "${stray}" that the document does not keep`);
    const record = Object.fromEntries(Object.entries(entry).filter(([key]) => RECORD_FIELDS.includes(key)));
    if (entry.abs && record.file !== undefined) record.file = path.relative(path.resolve(root), entry.abs).split(path.sep).join('/');
    const held = pictures.get(entry.no);
    rows[entry.no] = {
      hidden: false,
      record: structuredClone(record),
      find: structuredClone(entry.find ?? { on: [], shows: [], colours: [], names: [] }),
      pictures: structuredClone(held?.pictures ?? []),
      thumb: structuredClone(held?.thumb ?? null),
    };
    if (!bySection.has(entry.section)) bySection.set(entry.section, []);
    bySection.get(entry.section).push(entry.no);
  }
  const sections = [...bySection.keys()].sort((a, b) => a - b);
  const chapters = sections.map((section, i) => ({ id: `c${i + 1}`, title: chapterTitles[section] ?? `Section ${section}`, rows: bySection.get(section) }));
  return {
    v: 1,
    chapters,
    rows,
    keywords: structuredClone(lib.keywords),
    aliases: structuredClone(lib.aliases),
    places: structuredClone(lib.places),
    idea,
    about,
    next: { row: 1, chapter: chapters.length + 1 },
  };
}

// Each row's number, which is its place: chapter, a dot, its position among the chapter's rows
// that are not hidden, two digits at least. A hidden row has none ('').
export function numbering(doc) {
  const numbers = new Map();
  doc.chapters.forEach((chapter, i) => {
    let position = 0;
    for (const id of chapter.rows) {
      numbers.set(id, doc.rows[id]?.hidden ? '' : `${i + 1}.${String(++position).padStart(2, '0')}`);
    }
  });
  return numbers;
}

// The `lib` the page functions take, from a document. Entries are in story order; hidden rows
// only when `hidden` (edit mode). `lists`: the shared search lists, which live in files, not here.
export function libFromDoc(doc, { hidden = false, lists = { colours: {}, names: [], glossary: [] } } = {}) {
  const numbers = numbering(doc);
  const entries = [];
  const chapters = [];
  doc.chapters.forEach((chapter, i) => {
    const ids = [];
    for (const id of chapter.rows) {
      const row = doc.rows[id];
      if (!row || (row.hidden && !hidden)) continue;
      const record = row.record;
      entries.push({
        ...structuredClone(record),
        id,
        no: numbers.get(id),
        section: i + 1,
        chapter: chapter.id,
        hidden: row.hidden === true,
        text: record.text ?? [],
        keywords: record.keywords ?? [],
        images: [],
        find: row.find,
        pictures: row.pictures ?? [],
        thumb: row.thumb ?? null,
        dir: null,
        abs: null,
        sourceNumbers: (record.sources ?? []).map((source) => numbers.get(source) ?? ''),
      });
      ids.push(id);
    }
    chapters.push({ id: chapter.id, no: String(i + 1), title: chapter.title, ids });
  });
  return {
    entries,
    chapters,
    keywords: doc.keywords,
    aliases: doc.aliases,
    places: doc.places,
    colours: lists.colours,
    names: lists.names,
    glossary: lists.glossary,
    problems: [],
  };
}

// What differs between two documents, as ids and yes/no. `changed`: rows in both whose record,
// find or pictures differ. `order`: the visible rows both have sit in other chapters or another sequence. A null `before` (nothing published) counts as an empty document. `count`:
// how many things the author would be publishing.
export function diffDocs(before, after) {
  before ??= { chapters: [], rows: {}, keywords: {}, aliases: {}, places: {}, idea: '', about: '' }; // nothing published yet
  const same = (a, b) => stable(a) === stable(b);
  const ids = (doc) => Object.keys(doc.rows);
  const both = ids(after).filter((id) => before.rows[id]);
  const part = (row) => [row.record, row.find, row.pictures];
  const changed = both.filter((id) => !same(part(before.rows[id]), part(after.rows[id])));
  const added = ids(after).filter((id) => !before.rows[id]);
  const removed = ids(before).filter((id) => !after.rows[id]);
  const hidden = both.filter((id) => !before.rows[id].hidden && after.rows[id].hidden);
  const shown = both.filter((id) => before.rows[id].hidden && !after.rows[id].hidden);
  const common = new Set(both.filter((id) => !before.rows[id].hidden && !after.rows[id].hidden));
  const sequence = (doc) => doc.chapters.map((chapter) => chapter.rows.filter((id) => common.has(id))); // by chapter: a row that crosses a boundary has a new number
  const order = !same(sequence(before), sequence(after));
  const titles = (doc) => doc.chapters.map((chapter) => chapter.title);
  const chapters = !same(titles(before), titles(after));
  const idea = before.idea !== after.idea;
  const about = before.about !== after.about;
  const vocabulary = (doc) => [doc.keywords, doc.aliases, doc.places];
  const keywords = !same(vocabulary(before), vocabulary(after));
  const count = changed.length + added.length + removed.length + hidden.length + shown.length
    + [order, chapters, idea, about, keywords].filter(Boolean).length;
  return { changed, added, removed, hidden, shown, order, chapters, idea, about, keywords, count };
}

// JSON with keys sorted, so that two values that mean the same compare equal.
function stable(value) {
  return JSON.stringify(value, (key, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));
}

// The faults of a document, as plain sentences; none when it is sound.
export function checkDoc(doc, { types = TYPES } = {}) {
  const problems = [];
  const seenChapters = new Set();
  const placed = new Map(); // row id -> chapters that hold it
  for (const chapter of doc.chapters) {
    if (seenChapters.has(chapter.id)) problems.push(`chapter ${chapter.id} appears twice`);
    seenChapters.add(chapter.id);
    for (const id of chapter.rows) {
      if (!Object.hasOwn(doc.rows, id)) problems.push(`row ${id} is in chapter ${chapter.id}, but there is no row ${id}`);
      placed.set(id, [...(placed.get(id) ?? []), chapter.id]);
    }
  }
  for (const [id, where] of placed) {
    if (where.length > 1) problems.push(`row ${id} is in two chapters: ${where.join(', ')}`);
  }
  for (const [what, ids] of [['keyword', Object.keys(doc.keywords)], ['place', Object.keys(doc.places)]]) {
    for (const id of ids.filter((key) => NUMBER_KEY.test(key))) problems.push(`${what} id "${id}" is a whole number, which cannot keep its place in the order`);
  }
  for (const [id, row] of Object.entries(doc.rows)) {
    if (!placed.has(id)) problems.push(`row ${id} is in no chapter`);
    const record = row.record ?? {};
    if (!String(record.title ?? '').trim()) problems.push(`row ${id} has an empty title`);
    if (!types.includes(record.type)) problems.push(`row ${id} has an unknown type "${record.type}"`);
    if (record.year != null && !Number.isInteger(record.year)) problems.push(`row ${id} has a year that is not a whole number`);
    const keywords = record.keywords ?? [];
    if (keywords.length > MAX_KEYWORDS) problems.push(`row ${id} has ${keywords.length} keywords, at most ${MAX_KEYWORDS}`);
    for (const keyword of keywords) {
      if (!Object.hasOwn(doc.keywords, keyword) && !Object.hasOwn(doc.aliases, keyword)) problems.push(`row ${id} has an unknown keyword "${keyword}"`);
    }
    if (record.place != null && record.place !== '' && !Object.hasOwn(doc.places, record.place)) problems.push(`row ${id} has an unknown place "${record.place}"`);
    for (const field of Object.keys(record)) {
      if (!RECORD_FIELDS.includes(field)) problems.push(`row ${id} has a field "${field}" that a record does not have`);
    }
  }
  return problems;
}
