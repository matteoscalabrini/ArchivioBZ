// What edit mode works out without the page: where a dragged row or chapter lands and what the
// order is meanwhile, a text as paragraphs and back, a typed year, a picture moved, the keywords
// offered, the queue that sends the edits one at a time, what is under way until the page has
// settled, the number of changes the summary names, and a record after a saved edit. Pure, shared
// by edit.js and the tests.

// Where a row dropped in the list goes. `sequence`: the list after the drop, its headings and rows
// in the order they now stand, [{ kind: 'chapter' | 'row', id }]. The row joins the chapter of the
// nearest heading above it, at its place among that chapter's rows (hidden rows are rows of the
// chapter, so they count). Dropped above every heading, it goes first in the first chapter.
export function dropTarget(sequence, draggedId) {
  let chapter = null;
  let index = 0;
  for (const item of sequence) {
    if (item.kind === 'chapter') {
      chapter = item.id;
      index = 0;
    } else if (item.id === draggedId) {
      break;
    } else {
      index++;
    }
  }
  if (chapter === null) return { chapter: sequence.find((item) => item.kind === 'chapter')?.id ?? null, index: 0 };
  return { chapter, index };
}

// Where a chapter dropped among the others goes: its place among the chapters, which is how many
// headings stand above it. The rows, folded away while it moved, do not count.
export function chapterIndex(sequence, chapterId) {
  let index = 0;
  for (const item of sequence) {
    if (item.kind !== 'chapter') continue;
    if (item.id === chapterId) return index;
    index++;
  }
  return index;
}

// Each row's place in the story, from the chapters in their order: id -> { at, chapter }, `at`
// counting every row before it, hidden ones too, as the page's data-at does.
export function storyPlaces(chapters) {
  const places = new Map();
  let at = 0;
  for (const chapter of chapters) for (const id of chapter.rows) places.set(id, { at: at++, chapter: chapter.id });
  return places;
}

// The chapters as rescan() takes them for the headings: each numbered by its place.
export function headingsOf(chapters) {
  return chapters.map(({ id, title }, i) => ({ id, no: String(i + 1), title }));
}

// Where a row stands: its chapter and its index among that chapter's rows, or null.
export function rowPlace(chapters, id) {
  for (const chapter of chapters) {
    const index = chapter.rows.indexOf(id);
    if (index >= 0) return { chapter: chapter.id, index };
  }
  return null;
}

// The chapters with a row taken out of where it stood and put in `chapter` at `index` (past the
// end is last), as the server's move-row does: what the page shows of a drag until the answer
// comes. New lists; those given are not changed.
export function placeRow(chapters, id, chapter, index) {
  const next = chapters.map((c) => ({ ...c, rows: c.rows.filter((r) => r !== id) }));
  const target = next.find((c) => c.id === chapter);
  if (target) target.rows.splice(Math.max(0, Math.min(index, target.rows.length)), 0, id);
  return next;
}

// The chapters with one of them moved to `index` among the others (past the end is last).
export function placeChapter(chapters, id, index) {
  const moved = chapters.find((c) => c.id === id);
  if (!moved) return chapters.slice();
  const next = chapters.filter((c) => c !== moved);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, moved);
  return next;
}

// The year as the author typed it: nothing is no year, a whole number is that number, anything
// else is sent as it was typed, for the server to refuse in its own words.
export function yearValue(text) {
  const typed = String(text ?? '').trim();
  if (!typed) return null;
  return /^-?\d+$/.test(typed) ? Number(typed) : typed;
}

// A row's pictures with the one at `index` moved one place on (+1) or back (-1), held at the
// ends. A new list.
export function movePicture(pictures, index, step) {
  const next = pictures.slice();
  const to = index + step;
  if (to < 0 || to >= next.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// The keywords a row can be given: those of the vocabulary it does not hold, by label, narrowed
// to the labels holding what is typed, whatever its accents and case. -> [{ id, label }]
export function offered(keywords, held, typed = '') {
  const want = fold(typed.trim());
  return Object.entries(keywords)
    .filter(([id]) => !held.includes(id))
    .map(([id, keyword]) => ({ id, label: keyword.label ?? id }))
    .filter(({ label }) => fold(label).includes(want))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

const fold = (text) => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// A row's text is one field, its paragraphs parted by an empty line (a line of spaces counts as
// empty). Each paragraph is trimmed; one line end inside a paragraph stays as typed.
export function toParagraphs(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);
}

export function fromParagraphs(list) {
  return (list ?? []).join('\n\n');
}

// An edit the server did not take: its sentence (the answer's `error`), the status (0 when the
// server could not be reached) and the answer.
export class Refused extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Sends the edits one at a time, in the order they were made, each with the version of the draft
// the answer before it gave: two edits in quick succession (a field left, a row dragged at once)
// both land, and neither is taken for an edit from another window. `send({ version, op })` makes
// the request and gives back { status, body }. A conflict (409) or the end of the session (401)
// rejects that edit and every edit already waiting behind it, with the answer's `error`: they were
// made on a page that no longer holds. An edit made after that is sent again, with the same
// version, so a field saved again after logging in on another tab goes through. Any other refusal
// (a number that is not one, 422) rejects that edit alone.
export class OpQueue {
  #send;
  #tail = Promise.resolve();
  #round = 0; // grows at each conflict or logout; edits made before it are not sent
  #stopped = null; // { round, error }

  constructor(send, version) {
    this.#send = send;
    this.version = version;
  }

  push(op) {
    const round = this.#round;
    const run = this.#tail.then(async () => {
      if (this.#stopped && this.#stopped.round >= round) throw this.#stopped.error;
      let answer;
      try {
        answer = await this.#send({ version: this.version, op });
      } catch (error) {
        throw new Refused(error?.message || 'The server could not be reached.', 0);
      }
      const { status, body } = answer;
      if (status >= 200 && status < 300) {
        if (Number.isInteger(body?.version)) this.version = body.version;
        return body;
      }
      const error = new Refused(typeof body?.error === 'string' ? body.error : `The server answered ${status}.`, status, body);
      if (status === 409 || status === 401) {
        this.#stopped = { round, error };
        this.#round++;
      }
      throw error;
    });
    this.#tail = run.catch(() => {});
    return run;
  }
}

// What is under way: each edit from its sending to its answer, and each save around it, from a
// field left to the field closed (or keeping what was refused). settled() resolves once nothing
// is: what waits for it (Log out, Public site) then finds every field as its save left it, not
// still saving in the moment between the answer and the field's own closing. A count, not a list:
// work begun while settled() waits (the second edit of a keyword added, then given) is waited for.
export class Underway {
  #count = 0;
  #waiting = [];

  begin() {
    this.#count++;
  }

  end() {
    this.#count--;
    if (this.#count > 0) return;
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const resolve of waiting) resolve();
  }

  // `work`, a promise, counted until it settles; given back as it settles.
  during(work) {
    this.begin();
    return Promise.resolve(work).finally(() => this.end());
  }

  settled() {
    return this.#count === 0 ? Promise.resolve() : new Promise((resolve) => this.#waiting.push(resolve));
  }
}

// How many changes a publish would carry, read from the summary line (summaryLine in
// cloud/render.mjs): each "N …" counts N, each "… changed" one, as diffDocs counts them.
export function changesIn(summary) {
  const line = String(summary ?? '');
  if (!line || line.startsWith('No changes')) return 0;
  return line.split(', ').reduce((sum, part) => {
    const n = /^(\d+) /.exec(part);
    return sum + (n ? Number(n[1]) : 1);
  }, 0);
}

// The question before a publish. With nothing changed a publish still refreshes the public site.
export function publishQuestion(n) {
  if (n === 0) return 'Publish again? Nothing has changed since the last publish.';
  return `Publish ${n} ${n === 1 ? 'change' : 'changes'}?`;
}

// A row's record after a saved set-row, as cloud/ops.mjs stores it: the title trimmed, empty
// paragraphs dropped, an emptied field removed (but the title, type, keywords and text, which stay
// even when empty), a confidence or source reduced to what it holds. Only for fields the server
// took: what it refuses never reaches here. Returns a new record.
export function mergeFields(record, fields) {
  const next = structuredClone(record);
  for (const [name, value] of Object.entries(fields)) {
    const stored = storedValue(name, value);
    if (stored === undefined || (empty(stored) && !KEPT.includes(name))) delete next[name];
    else next[name] = stored;
  }
  return next;
}

const KEPT = ['title', 'type', 'keywords', 'text'];
const empty = (value) => value === '' || value === null || (Array.isArray(value) && value.length === 0);

function storedValue(name, value) {
  if (name === 'title') return value.trim();
  if (name === 'year') return value ?? undefined;
  if (name === 'text') return value.filter((p) => p.trim());
  if (name === 'confidence') {
    if (value === null) return undefined;
    return value.note ? { level: value.level, note: value.note } : { level: value.level };
  }
  if (name === 'source') {
    if (value === null) return undefined;
    const source = Object.fromEntries(['label', 'url'].filter((k) => value[k]).map((k) => [k, value[k]]));
    return Object.keys(source).length ? source : undefined;
  }
  if (name === 'place') return value === null || value === '' ? undefined : value;
  if (['date', 'holder', 'creator', 'rights'].includes(name)) return empty(value) ? undefined : value;
  return value; // type, keywords, side_by_side
}
