// What edit mode works out without the page: where a dragged row or chapter lands and what the
// order is meanwhile, what the bar says after a typed number, a folded chapter's count, a text as
// paragraphs and back, a typed year, the keywords offered, the queue that sends the edits one at a
// time, what is under way until the page has settled, and the number of changes the summary names.
// Pure, shared by edit.js and the tests.

// Where a row dropped in the list goes. `sequence`: the list after the drop, its headings and rows
// in the order they now stand, [{ kind: 'chapter' | 'row', id, folded? }]. The row joins the
// chapter of the nearest heading above it, at its place among that chapter's rows (hidden rows are
// rows of the chapter, so they count). Dropped above every heading, it goes first in the first
// chapter. Under a folded heading (the compact view) the chapter's rows are not on the screen, so
// wherever among them the row landed it was dropped just under the heading: it goes first.
export function dropTarget(sequence, draggedId) {
  let chapter = null;
  let folded = false;
  let index = 0;
  for (const item of sequence) {
    if (item.kind === 'chapter') {
      chapter = item.id;
      folded = item.folded === true;
      index = 0;
    } else if (item.id === draggedId) {
      break;
    } else {
      index++;
    }
  }
  if (chapter === null) return { chapter: sequence.find((item) => item.kind === 'chapter')?.id ?? null, index: 0 };
  return { chapter, index: folded ? 0 : index };
}

// How many rows a folded chapter holds, as its heading says it: "31 rows", "1 row".
export function rowCount(n) {
  return `${n} ${n === 1 ? 'row' : 'rows'}`;
}

// The line the bar says once a typed number is answered, from the number typed and the number the
// answer gives the row; null when the row is where the number said (2.5 and 2,05 are 2.05). The
// server puts a row typed past its chapter's end last in it, so a place smaller than the one
// typed is the chapter's end; a chapter number smaller than the one typed means the chapter the
// row left is now empty and the chapters after it closed up. A hidden row has no number to say.
export function placedLine(typed, given) {
  const want = /^\s*(\d+)[.,](\d+)\s*$/.exec(String(typed ?? ''));
  const got = /^(\d+)\.(\d+)$/.exec(String(given ?? ''));
  if (!want || !got) return null;
  const [chapter, place] = [Number(got[1]), Number(got[2])];
  if (Number(want[1]) === chapter && Number(want[2]) === place) return null;
  return place < Number(want[2]) ? `Placed at ${given}, the end of chapter ${chapter}.` : `Placed at ${given}.`;
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

// The chapters as rescan() takes them for the headings in edit mode: each numbered by its place
// among the chapters that have a row shown (`shown(id)`: the row is not hidden), as the server
// numbers them (chapterNumbers in cloud/doc.mjs); a chapter with none is marked —, as a hidden row is.
export function headingsOf(chapters, shown) {
  let n = 0;
  return chapters.map(({ id, title, rows }) => ({ id, no: rows.some(shown) ? String(++n) : '—', title }));
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

// A typed number as it is sent: trimmed, and with a full stop where it was typed with a comma, as
// the decimal keypad of a phone set to a region that writes 2,05 offers (the server takes either).
// Anything else goes as typed, for the server to refuse in its own words.
export function numberValue(text) {
  const typed = String(text ?? '').trim();
  return /^\d+,\d+$/.test(typed) ? typed.replace(',', '.') : typed;
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

// Which drawing of the idea the page shows (edit/core.js). Each comes with the draft version it
// was drawn from (the page's own, an answer's `relinked.idea`, the page asked again once the idea
// is saved), and they can come out of order: the page asked for after a save may answer after an
// edit queued behind that save, with the draft from before it. One older than the drawing shown or
// waiting is never put in. One that comes while the idea's field is open waits for the field to
// close, unless it is that field's own save's, which takes the field's place.
export class IdeaDrawings {
  #version;
  #waiting = null;

  constructor(version) {
    this.#version = version;
  }

  // -> 'put' (put it in now), 'wait' (kept until the field closes) or 'old' (never put in).
  offer(html, version, { fieldOpen = false, own = false } = {}) {
    if (version < this.#version) return 'old';
    this.#version = version;
    if (fieldOpen && !own) {
      this.#waiting = html;
      return 'wait';
    }
    this.#waiting = null;
    return 'put';
  }

  // The idea's field has closed: the drawing that waited for it, or null.
  closed() {
    const html = this.#waiting;
    this.#waiting = null;
    return html;
  }

  // The idea's own save was answered: what waited was drawn from the text before it.
  saved() {
    this.#waiting = null;
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

// The question before a row is removed. `published`: whether a publish holds the row, from which
// it could be brought back; a row added since the last publish is in none.
export function removeQuestion(title, published) {
  return published
    ? `Remove “${title}”? It goes at the next publish and can be brought back from an older publish.`
    : `Remove “${title}”? It has never been published, so it cannot be brought back.`;
}

// The question before a publish, from the bar's summary line. Before the first publish it says
// what the site will show ("Nothing published yet: 277 rows in 18 chapters" asks "Publish for the
// first time? 277 rows in 18 chapters."); with nothing changed a publish still refreshes the
// public site.
export function publishQuestion(summary) {
  const first = /^Nothing published yet: (.+)$/.exec(String(summary ?? ''));
  if (first) return `Publish for the first time? ${first[1]}.`;
  const n = changesIn(summary);
  if (n === 0) return 'Publish again? Nothing has changed since the last publish.';
  return `Publish ${n} ${n === 1 ? 'change' : 'changes'}?`;
}
