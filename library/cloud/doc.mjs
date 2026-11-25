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
// A row's confidence: read in the source, from a secondary source, a lead.
export const LEVELS = ['read', 'secondary', 'lead'];
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

// Each chapter's number: its place among the chapters that have a row not hidden, from 1. A chapter
// with no such row, every row hidden or none at all, has none (''): it is not on the public page,
// and the chapters after it close up, as the rows after a hidden row do (the author, 25 Nov 2026).
export function chapterNumbers(doc) {
  const numbers = new Map();
  let n = 0;
  for (const chapter of doc.chapters) {
    numbers.set(chapter.id, chapter.rows.some((id) => doc.rows[id] && !doc.rows[id].hidden) ? String(++n) : '');
  }
  return numbers;
}

// Each row's number, which is its place: its chapter's number, a dot, its position among the
// chapter's rows that are not hidden, two digits at least. A hidden row has none ('').
export function numbering(doc) {
  const chapters = chapterNumbers(doc);
  const numbers = new Map();
  for (const chapter of doc.chapters) {
    let position = 0;
    for (const id of chapter.rows) {
      numbers.set(id, doc.rows[id]?.hidden ? '' : `${chapters.get(chapter.id)}.${String(++position).padStart(2, '0')}`);
    }
  }
  return numbers;
}

// The small picture a row shows on the map: the one made at the move-in, or, once an edit has
// changed which picture is first (the operations then set thumb to null) or for a row given its
// place after the move-in, the first picture itself, which the map draws at the same small size.
const mapPicture = (row) => row.thumb ?? (row.pictures?.[0] ? { src: row.pictures[0].src, w: row.pictures[0].w, h: row.pictures[0].h } : null);

// The `lib` the page functions take, from a document. Entries are in story order; hidden rows
// only when `hidden` (edit mode). `lists`: the shared search lists, which live in files, not here.
export function libFromDoc(doc, { hidden = false, lists = { colours: {}, names: [], glossary: [] } } = {}) {
  const numbers = numbering(doc);
  const chapterNo = chapterNumbers(doc);
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
        thumb: mapPicture(row),
        dir: null,
        abs: null,
        sourceNumbers: (record.sources ?? []).map((source) => numbers.get(source) ?? ''),
      });
      ids.push(id);
    }
    chapters.push({ id: chapter.id, no: chapterNo.get(chapter.id), title: chapter.title, ids });
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

// The rows, hidden ones too, in the story order, that have a picture and no search terms: what
// the build warned of as "with a picture and no entry in find.json" while the terms were files.
export function withoutTerms(doc) {
  const empty = (find) => !find || ['on', 'shows', 'colours', 'names'].every((list) => !find[list]?.length);
  return doc.chapters.flatMap((chapter) => chapter.rows).filter((id) => doc.rows[id]?.pictures?.length && empty(doc.rows[id].find));
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

// The faults of a document, as plain sentences; none when it is sound. Sound is what the edit
// operations leave and the pages take: a document pushed from a session passes through this alone,
// so each field's shape is checked as well as what it names.
export function checkDoc(doc, { types = TYPES } = {}) {
  if (!isObject(doc) || !Array.isArray(doc.chapters) || ![doc.rows, doc.keywords, doc.aliases, doc.places].every(isObject)) {
    return ['the document has no chapters, rows, keywords, aliases or places'];
  }
  const problems = [];
  const seenChapters = new Set();
  const placed = new Map(); // row id -> chapters that hold it
  for (const chapter of doc.chapters) {
    if (!isObject(chapter) || !isText(chapter.id) || !isList(chapter.rows, isText)) {
      problems.push(`a chapter is not an id, a title and a list of rows: ${JSON.stringify(chapter)?.slice(0, 80)}`);
      continue;
    }
    if (seenChapters.has(chapter.id)) problems.push(`chapter ${chapter.id} appears twice`);
    seenChapters.add(chapter.id);
    if (!isText(chapter.title) || !chapter.title.trim()) problems.push(`chapter ${chapter.id} has no title`);
    for (const id of chapter.rows) {
      if (!Object.hasOwn(doc.rows, id)) problems.push(`row ${id} is in chapter ${chapter.id}, but there is no row ${id}`);
      placed.set(id, [...(placed.get(id) ?? []), chapter.id]);
    }
  }
  for (const [id, where] of placed) {
    if (where.length > 1) problems.push(`row ${id} is in two chapters: ${where.join(', ')}`);
  }
  // The counters that name the next row and chapter added must lie past every id already used.
  for (const [what, ids, prefix] of [['row', Object.keys(doc.rows), 'r'], ['chapter', [...seenChapters], 'c']]) {
    const next = doc.next?.[what];
    if (!Number.isInteger(next) || next < 1) {
      problems.push(`next.${what} is not a whole number`);
      continue;
    }
    for (const id of ids) {
      const n = new RegExp(`^${prefix}(\\d+)$`).exec(id);
      if (n && Number(n[1]) >= next) problems.push(`${what} ${id} is not below next.${what} (${next})`);
    }
  }
  if (!isText(doc.idea)) problems.push('the idea is not text');
  if (!isText(doc.about)) problems.push('About is not text');
  for (const [what, ids] of [['keyword', Object.keys(doc.keywords)], ['place', Object.keys(doc.places)]]) {
    for (const id of ids.filter((key) => NUMBER_KEY.test(key))) problems.push(`${what} id "${id}" is a whole number, which cannot keep its place in the order`);
  }
  for (const [id, keyword] of Object.entries(doc.keywords)) {
    if (!isObject(keyword) || !isText(keyword.label) || !keyword.label.trim()) problems.push(`keyword ${id} has no label`);
  }
  for (const [id, target] of Object.entries(doc.aliases)) {
    if (!isText(target) || !Object.hasOwn(doc.keywords, target)) problems.push(`alias ${id} names no keyword`);
  }
  for (const [id, place] of Object.entries(doc.places)) {
    if (!isObject(place) || !isText(place.name) || !place.name.trim()) problems.push(`place ${id} has no name`);
    else if (place.inside === true && !['x', 'y', 'z'].every((axis) => Number.isFinite(place[axis]))) problems.push(`place ${id} is on the map without its x, y and z`);
  }
  for (const [id, row] of Object.entries(doc.rows)) {
    if (!placed.has(id)) problems.push(`row ${id} is in no chapter`);
    if (!isObject(row) || !isObject(row.record)) {
      problems.push(`row ${id} has no record`);
      continue;
    }
    problems.push(...rowFaults(doc, id, row, types));
  }
  return problems;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string';
const isList = (value, item) => Array.isArray(value) && value.every(item);
const isSize = (value) => Number.isFinite(value) && value >= 0;
const TEXT_FIELDS = ['date', 'rights', 'file', 'creator', 'holder', 'place'];
const LIST_FIELDS = ['keywords', 'text', 'facts', 'sources'];
const FIND = ['on', 'shows', 'colours', 'names'];

// The faults of one row: its record's fields, its search terms, its pictures.
function rowFaults(doc, id, row, types) {
  const problems = [];
  const { record } = row;
  if (typeof row.hidden !== 'boolean') problems.push(`row ${id}: hidden is not true or false`);
  if (!isText(record.title) || !record.title.trim()) problems.push(`row ${id} has an empty title`);
  if (!types.includes(record.type)) problems.push(`row ${id} has an unknown type "${record.type}"`);
  if (record.year != null && !Number.isInteger(record.year)) problems.push(`row ${id} has a year that is not a whole number`);
  for (const field of TEXT_FIELDS) {
    if (record[field] !== undefined && !isText(record[field])) problems.push(`row ${id}: ${field} is not text`);
  }
  for (const field of LIST_FIELDS) {
    if (record[field] !== undefined && !isList(record[field], isText)) problems.push(`row ${id}: ${field} is not a list of text`);
  }
  const { confidence, source, more } = record;
  if (confidence !== undefined) {
    if (!isObject(confidence) || !LEVELS.includes(confidence.level)) problems.push(`row ${id}: confidence is not one of ${LEVELS.join(', ')}`);
    else if (confidence.note !== undefined && !isText(confidence.note)) problems.push(`row ${id}: the note on its confidence is not text`);
  }
  if (source !== undefined && (!isObject(source) || ['label', 'url'].some((k) => source[k] !== undefined && !isText(source[k])))) {
    problems.push(`row ${id}: source is not a label and an address`);
  }
  if (more !== undefined && (!isObject(more) || !isText(more.kind))) problems.push(`row ${id}: more is not a kind of link`);
  if (record.side_by_side !== undefined && typeof record.side_by_side !== 'boolean') problems.push(`row ${id}: side_by_side is not true or false`);
  const keywords = Array.isArray(record.keywords) ? record.keywords : [];
  if (keywords.length > MAX_KEYWORDS) problems.push(`row ${id} has ${keywords.length} keywords, at most ${MAX_KEYWORDS}`);
  for (const keyword of keywords) {
    if (!Object.hasOwn(doc.keywords, keyword) && !Object.hasOwn(doc.aliases, keyword)) problems.push(`row ${id} has an unknown keyword "${keyword}"`);
  }
  if (isText(record.place) && record.place !== '' && !Object.hasOwn(doc.places, record.place)) problems.push(`row ${id} has an unknown place "${record.place}"`);
  for (const field of Object.keys(record)) {
    if (!RECORD_FIELDS.includes(field)) problems.push(`row ${id} has a field "${field}" that a record does not have`);
  }
  if (!isObject(row.find) || !FIND.every((list) => isList(row.find[list], isText))) problems.push(`row ${id}: find is not four lists of text`);
  const picture = (p) => isObject(p) && isText(p.src) && p.src !== '' && isSize(p.w) && isSize(p.h) && (p.caption === undefined || isText(p.caption));
  if (!isList(row.pictures, picture)) problems.push(`row ${id}: pictures is not a list of pictures`);
  if (row.thumb !== null && !(isObject(row.thumb) && isText(row.thumb.src) && isSize(row.thumb.w) && isSize(row.thumb.h))) problems.push(`row ${id}: thumb is not a small picture`);
  return problems;
}
