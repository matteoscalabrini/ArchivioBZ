// The edit operations: each takes the archive document and one request from the author's page and
// returns a new document and a result, never touching its input. A request that cannot apply is
// refused with an OpError whose message is a sentence the author reads as it stands. After every
// operation the document is checked again, so a gap in an operation shows as an error here and not
// as a broken publish later.
import { TYPES } from '../lib/records.mjs';
import { parseIdea, withoutStandin } from '../lib/idea.mjs';
import { checkDoc, chapterNumbers, NUMBER_KEY, LEVELS } from './doc.mjs';

export class OpError extends Error {}

const MAX_KEYWORDS = 5;
const NUMBER = /^\s*(\d{1,3})\.(\d{1,3})\s*$/;
const STRING_FIELDS = ['date', 'holder', 'creator', 'rights'];
// Fields that stay in the record when emptied; every other emptied field is removed.
const KEPT = ['title', 'type', 'keywords', 'text'];

const refuse = (message) => { throw new OpError(message); };
const isText = (value) => typeof value === 'string';
const isEmpty = (value) => value === '' || value === null || (Array.isArray(value) && value.length === 0);
const clamp = (index, length) => Math.max(0, Math.min(length, Number.isInteger(index) ? index : length));

function rowOf(doc, id) {
  if (!isText(id) || !Object.hasOwn(doc.rows, id)) refuse(`There is no row ${id}.`);
  return doc.rows[id];
}
function chapterOf(doc, id) {
  const chapter = doc.chapters.find((c) => c.id === id);
  if (!chapter) refuse(`There is no chapter ${id}.`);
  return chapter;
}
function takeOut(doc, id) {
  for (const chapter of doc.chapters) {
    const at = chapter.rows.indexOf(id);
    if (at >= 0) chapter.rows.splice(at, 1);
  }
}
const needTitle = (title, what) => { if (!isText(title) || !title.trim()) refuse(`The ${what} needs a title.`); return title.trim(); };
const foldLabel = (label) => label.trim().replace(/\s+/g, ' ').toLowerCase();

// Each field of a row's record, checked; returns what to store, or undefined to remove the field.
function checkedField(doc, name, value) {
  if (name === 'title') return needTitle(value, 'row');
  if (name === 'type') {
    if (!TYPES.includes(value)) refuse(`"${value}" is not a type of row.`);
    return value;
  }
  if (STRING_FIELDS.includes(name)) {
    if (value !== null && !isText(value)) refuse(`The ${name} must be text.`);
    return isEmpty(value) ? undefined : value;
  }
  if (name === 'year') {
    if (value !== null && !Number.isInteger(value)) refuse('The year must be a whole number.');
    return value ?? undefined;
  }
  if (name === 'keywords') {
    if (!Array.isArray(value)) refuse('The keywords must be a list.');
    const ids = value.map((k) => {
      if (isText(k) && Object.hasOwn(doc.keywords, k)) return k;
      if (isText(k) && Object.hasOwn(doc.aliases, k)) return doc.aliases[k];
      return refuse(`"${k}" is not a keyword.`);
    });
    if (new Set(ids).size !== ids.length) refuse('A keyword can be given once.');
    if (ids.length > MAX_KEYWORDS) refuse(`A row has at most ${MAX_KEYWORDS} keywords.`);
    return ids;
  }
  if (name === 'text') {
    if (!Array.isArray(value) || !value.every(isText)) refuse('The text must be a list of paragraphs.');
    return value.filter((p) => p.trim());
  }
  if (name === 'confidence') {
    if (value === null) return undefined;
    if (!LIVE(value) || !LEVELS.includes(value.level)) refuse(`The confidence must be one of ${LEVELS.join(', ')}.`);
    if (value.note !== undefined && !isText(value.note)) refuse('The note on the confidence must be text.');
    return value.note ? { level: value.level, note: value.note } : { level: value.level };
  }
  if (name === 'source') {
    if (value === null) return undefined;
    if (!LIVE(value) || ['label', 'url'].some((k) => value[k] !== undefined && !isText(value[k]))) refuse('The source needs a label and an address, as text.');
    const source = Object.fromEntries(['label', 'url'].filter((k) => value[k]).map((k) => [k, value[k]]));
    return Object.keys(source).length ? source : undefined;
  }
  if (name === 'place') {
    if (value === null || value === '') return undefined;
    if (!isText(value) || !Object.hasOwn(doc.places, value)) refuse(`"${value}" is not a place.`);
    return value;
  }
  if (name === 'side_by_side') {
    if (typeof value !== 'boolean') refuse('Side by side is yes or no.');
    return value;
  }
  return refuse(`A row has no field "${name}".`);
}
const LIVE = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function pictureAt(row, id, src) {
  if (!isText(src)) refuse('A picture is named by its source.');
  const at = row.pictures.findIndex((p) => p.src === src);
  if (at < 0) refuse(`Row ${id} has no picture ${src}.`);
  return at;
}

const slug = (label) => label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const OPS = {
  'set-row'(doc, { id, fields }) {
    const row = rowOf(doc, id);
    if (!LIVE(fields)) refuse('There are no fields to set.');
    // A row whose link at the bottom is its source ("Open the source →") holds the Source's address
    // again as more.target, as the record files had it. When the Source is set, that copy goes, so
    // the link follows the Source as it now is (lib/detail.mjs reads source.url without a target)
    // and goes with it when it is emptied. A target that is another page than the Source's is the
    // row's own and stays: edit mode has no field for it.
    const more = row.record.more;
    if (Object.hasOwn(fields, 'source') && more?.kind === 'source' && more.target !== undefined && more.target === row.record.source?.url) {
      row.record.more = Object.fromEntries(Object.entries(more).filter(([key]) => key !== 'target'));
    }
    for (const [name, value] of Object.entries(fields)) {
      const stored = checkedField(doc, name, value);
      if (stored === undefined || (isEmpty(stored) && !KEPT.includes(name))) delete row.record[name];
      else row.record[name] = stored;
    }
    return {};
  },
  'set-pictures'(doc, { id, pictures }) {
    const row = rowOf(doc, id);
    if (!Array.isArray(pictures)) refuse('The pictures must be a list.');
    const held = new Map(row.pictures.map((p) => [p.src, p]));
    const seen = new Set();
    row.pictures = pictures.map((entry) => {
      if (!LIVE(entry)) refuse('Each picture needs a source.');
      const { src, caption } = entry;
      if (!held.has(src)) refuse(`Row ${id} has no picture ${src}.`);
      if (seen.has(src)) refuse(`The picture ${src} is listed twice.`);
      seen.add(src);
      return { ...held.get(src), caption: isText(caption) ? caption : '' };
    });
    return {};
  },
  // One keyword given to the row or taken off it, applied to the row as it now stands, so that two
  // clicks made before the first is answered both count. Taking off one it lacks does nothing.
  'give-keyword'(doc, { id, keyword }) {
    const row = rowOf(doc, id);
    const held = row.record.keywords ?? [];
    const [wanted] = checkedField(doc, 'keywords', [keyword]);
    if (!held.includes(wanted)) row.record.keywords = checkedField(doc, 'keywords', [...held, wanted]);
    return {};
  },
  'remove-keyword'(doc, { id, keyword }) {
    const row = rowOf(doc, id);
    if (!isText(keyword)) refuse('A keyword is named by its id.');
    const wanted = Object.hasOwn(doc.aliases, keyword) ? doc.aliases[keyword] : keyword;
    row.record.keywords = (row.record.keywords ?? []).filter((k) => k !== wanted);
    return {};
  },
  // One picture, named by its source, taken off the row (never out of storage), moved one place on
  // (+1) or back (-1), held at the ends, or given a caption.
  'remove-picture'(doc, { id, src }) {
    const row = rowOf(doc, id);
    if (!isText(src)) refuse('A picture is named by its source.');
    row.pictures = row.pictures.filter((p) => p.src !== src);
    return {};
  },
  'move-picture'(doc, { id, src, step }) {
    const row = rowOf(doc, id);
    const at = pictureAt(row, id, src);
    if (step !== 1 && step !== -1) refuse('A picture moves one place on or back.');
    const to = at + step;
    if (to >= 0 && to < row.pictures.length) [row.pictures[at], row.pictures[to]] = [row.pictures[to], row.pictures[at]];
    return {};
  },
  'set-caption'(doc, { id, src, caption }) {
    const row = rowOf(doc, id);
    const at = pictureAt(row, id, src);
    if (!isText(caption)) refuse('A caption must be text.');
    row.pictures[at] = { ...row.pictures[at], caption: caption.trim() };
    return {};
  },
  'move-row'(doc, { id, chapter, index }) {
    rowOf(doc, id);
    const target = chapterOf(doc, chapter);
    takeOut(doc, id);
    target.rows.splice(clamp(index, target.rows.length), 0, id);
    return {};
  },
  'set-number'(doc, { id, number }) {
    rowOf(doc, id);
    const match = NUMBER.exec(String(number));
    const n = match ? Number(match[1]) : 0;
    const p = match ? Number(match[2]) : 0;
    if (!match || n < 1 || p < 1) refuse('A number is a chapter and a place, as in 2.05.');
    // Chapter n as the page numbers it before the move: a chapter with no row shown has no number.
    const numbered = chapterNumbers(doc);
    const chapter = doc.chapters.find((c) => numbered.get(c.id) === String(n));
    if (!chapter) refuse(`There is no chapter ${n}.`);
    takeOut(doc, id);
    const visible = chapter.rows.filter((r) => !doc.rows[r].hidden);
    const before = visible[p - 1];
    chapter.rows.splice(before === undefined ? chapter.rows.length : chapter.rows.indexOf(before), 0, id);
    return {};
  },
  'hide-row'(doc, { id, hidden }) {
    rowOf(doc, id).hidden = hidden === true;
    return {};
  },
  'remove-row'(doc, { id }) {
    rowOf(doc, id);
    takeOut(doc, id);
    delete doc.rows[id];
    return {};
  },
  'add-row'(doc, { chapter, index, title, type }) {
    const target = chapterOf(doc, chapter);
    const name = needTitle(title, 'row');
    if (!TYPES.includes(type)) refuse(`"${type}" is not a type of row.`);
    const id = `r${doc.next.row++}`;
    doc.rows[id] = {
      hidden: false,
      record: { title: name, type, date: '', year: null, keywords: [], text: [] },
      find: { on: [], shows: [], colours: [], names: [] },
      pictures: [],
      thumb: null,
    };
    target.rows.splice(clamp(index, target.rows.length), 0, id);
    return { id };
  },
  'add-chapter'(doc, { index, title }) {
    const name = needTitle(title, 'chapter');
    const id = `c${doc.next.chapter++}`;
    doc.chapters.splice(clamp(index, doc.chapters.length), 0, { id, title: name, rows: [] });
    return { id };
  },
  'rename-chapter'(doc, { chapter, title }) {
    const target = chapterOf(doc, chapter);
    target.title = needTitle(title, 'chapter');
    return {};
  },
  'move-chapter'(doc, { chapter, index }) {
    const target = chapterOf(doc, chapter);
    doc.chapters.splice(doc.chapters.indexOf(target), 1);
    doc.chapters.splice(clamp(index, doc.chapters.length), 0, target);
    return {};
  },
  'remove-chapter'(doc, { chapter }) {
    const target = chapterOf(doc, chapter);
    if (target.rows.length) refuse('Only an empty chapter can be removed.');
    doc.chapters.splice(doc.chapters.indexOf(target), 1);
    return {};
  },
  'add-keyword'(doc, { label }) {
    if (!isText(label) || !label.trim()) refuse('A keyword needs a label.');
    const shown = label.trim().replace(/\s+/g, ' ');
    for (const [id, keyword] of Object.entries(doc.keywords)) {
      if (foldLabel(keyword.label) === foldLabel(shown)) return { id, existed: true };
    }
    const words = slug(shown);
    if (!words) refuse('A keyword needs letters or digits.');
    const base = NUMBER_KEY.test(words) ? `k-${words}` : words; // a number would leave the vocabulary's order
    let id = base;
    for (let n = 2; Object.hasOwn(doc.keywords, id) || Object.hasOwn(doc.aliases, id); n++) id = `${base}-${n}`;
    doc.keywords[id] = { label: shown };
    return { id, existed: false };
  },
  // The author's own idea: the stand-in flag of the moved-in text goes at the first save.
  'set-idea'(doc, { text }) {
    if (!isText(text)) refuse('The idea must be text.');
    const error = parseIdea(text, doc).problems.find((p) => p.level === 'error');
    if (error) refuse(`The idea cannot be saved: ${error.message}.`);
    doc.idea = withoutStandin(text);
    return { text: doc.idea };
  },
  'set-about'(doc, { text }) {
    if (!isText(text)) refuse('The about page must be text.');
    doc.about = text;
    return {};
  },
};

// Whether a value sent holds, in any of its words, a NUL or half of a surrogate pair: a page cannot
// show either as typed (a browser turns both into a stand-in character).
const UNSAVABLE = 'The text holds a character that cannot be saved: an invisible NUL or half of an emoji. Type that part again.';
function unsavable(value) {
  if (isText(value)) return value.includes('\u0000') || !value.isWellFormed();
  if (Array.isArray(value)) return value.some(unsavable);
  return LIVE(value) && Object.values(value).some(unsavable);
}

// A row's small picture (`thumb`, the one the map shows) was made at the move-in from its first
// picture. Whatever operation changes which picture is first lets it go; the map then shows the
// first picture as it is now (libFromDoc), until a small one can be made in the cloud.
function letThumbsFollow(before, after) {
  for (const [id, row] of Object.entries(after.rows)) {
    if (row.thumb && row.pictures[0]?.src !== before.rows[id]?.pictures?.[0]?.src) row.thumb = null;
  }
}

// Applies one operation to a copy of the document: { doc, result }.
export function applyOp(doc, op) {
  const run = LIVE(op) && isText(op.op) && Object.hasOwn(OPS, op.op) ? OPS[op.op] : refuse(`There is no operation "${op?.op}".`);
  if (unsavable(op)) refuse(UNSAVABLE);
  const next = structuredClone(doc);
  const result = run(next, op);
  letThumbsFollow(doc, next);
  const problems = checkDoc(next);
  if (problems.length) throw new Error(`Operation ${op.op} left the document unsound: ${problems.join('; ')}`);
  return { doc: next, result };
}
