// The search of the Library: what was typed, against the index the build writes (search.json,
// lib/searchindex.mjs). It answers with two lists, the rows where what was typed stands (precise)
// and the rows reached by a looser road (possible links), each row with the reasons it was found.
// Pure functions, shared by library.js and the tests.

const SMALL = new Set('the a an of in on and with for to di del della dei delle il lo la le i e da der die das und von des den dem im'.split(' '));
const QUOTES = /["“”„]/;
const WORD = /[\p{L}\p{N}\p{M}]+/gu;

// Lower case, accents off, ß as ss: Teßmann is tessmann, Romanità is romanita.
export function fold(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss');
}

// The words of `text`, folded, each with its place in it: [{ w, from, to }], `to` exclusive.
export function words(text) {
  const found = [];
  for (const match of String(text ?? '').matchAll(WORD)) {
    const w = fold(match[0]);
    if (w) found.push({ w, from: match.index, to: match.index + match[0].length });
  }
  return found;
}

const partsOf = (text) => words(text).map((word) => word.w);

// What was typed, as terms. A term: { typed, parts, exact, alts: [{ parts, road, says }], colour }.
// `alts` are the ways it may stand in a row, the term itself first; `road` is '' or 'glossary';
// `exact` terms (a quoted phrase, a name, a colour) take no loose road.
export function parseQuery(text, lists) {
  const known = lookup(lists);
  const terms = [];
  let quoted = false;
  for (const piece of String(text ?? '').split(QUOTES)) {
    if (quoted) {
      const parts = partsOf(piece);
      if (parts.length) terms.push({ typed: piece.trim(), parts, exact: true, alts: spellings(parts, piece.trim()), colour: null, kept: true });
    } else {
      terms.push(...unquoted(piece, known));
    }
    quoted = !quoted;
  }
  const kept = terms.filter((term) => term.kept || !SMALL.has(term.parts.join(' ')));
  return (kept.length ? kept : terms).map(({ kept: _, ...term }) => term);
}

// The terms of text outside quotation marks: cut at white space, then the longest run of chunks
// that spells a name, a colour or a glossary item becomes one term.
function unquoted(text, known) {
  const chunks = text.split(/\s+/).map((typed) => ({ typed, parts: partsOf(typed) })).filter((chunk) => chunk.parts.length);
  const terms = [];
  for (let at = 0; at < chunks.length;) {
    let taken = 0;
    for (let n = Math.min(known.longest, chunks.length - at); n >= 1 && !taken; n--) {
      const run = chunks.slice(at, at + n);
      const parts = run.flatMap((chunk) => chunk.parts);
      const entry = known.phrases.get(parts.join(' '));
      if (!entry) continue;
      terms.push(listed(entry, parts, run.map((chunk) => chunk.typed).join(' ')));
      taken = n;
    }
    if (!taken) {
      const { typed, parts } = chunks[at];
      terms.push({ typed, parts, exact: false, alts: spellings(parts, typed), colour: null, kept: parts.length > 1 });
      taken = 1;
    }
    at += taken;
  }
  return terms;
}

// A term for a run that a list knows. A name and a colour stand for every name of their set,
// exactly; a glossary item brings the others of its set as a possible road.
function listed(entry, parts, typed) {
  const others = entry.set.filter((item) => item !== entry.item);
  if (entry.kind === 'glossary') {
    return { typed, parts, exact: false, colour: null, kept: true,
      alts: [...spellings(parts, typed), ...others.map((item) => ({ parts: item.parts, road: 'glossary', says: item.says }))] };
  }
  return { typed, parts, exact: true, colour: entry.kind === 'colour' ? entry.id : null, kept: true,
    alts: [entry.item, ...others].map((item) => ({ parts: item.parts, road: '', says: item.says })) };
}

// The parts as typed and, where they hold ae, oe or ue, written a, o, u as well: fuehrer, fuhrer.
// Not for a part that would be left with three letters or fewer (poet is not pot).
function spellings(parts, says) {
  const plain = parts.map((part) => {
    const without = part.replace(/([aou])e/g, '$1');
    return without.length >= 4 ? without : part;
  });
  const alts = [{ parts, road: '', says }];
  if (plain.join(' ') !== parts.join(' ')) alts.push({ parts: plain, road: '', says });
  return alts;
}

// The three lists as one table from a folded phrase to its set; made once for each lists object.
const LOOKUPS = new WeakMap();
function lookup(lists) {
  if (!lists || typeof lists !== 'object') return { phrases: new Map(), longest: 1 };
  if (LOOKUPS.has(lists)) return LOOKUPS.get(lists);
  const phrases = new Map();
  let longest = 1;
  const add = (kind, names, id = null) => {
    const set = (Array.isArray(names) ? names : []).map((says) => ({ says: String(says), parts: partsOf(says) })).filter((item) => item.parts.length);
    for (const item of set) {
      const key = item.parts.join(' ');
      if (phrases.has(key)) continue; // the first list that knows a phrase keeps it: names, colours, glossary
      phrases.set(key, { kind, id, set, item });
      longest = Math.max(longest, item.parts.length);
    }
  };
  for (const names of lists.names ?? []) add('name', names);
  for (const [id, names] of Object.entries(lists.colours ?? {})) add('colour', names, id);
  for (const items of lists.glossary ?? []) add('glossary', items);
  const known = { phrases, longest };
  LOOKUPS.set(lists, known);
  return known;
}

// The sources of a row, in the order a reason prefers them, each with its strength: the row's own
// line 1 (with its place, maker and holder, which the closed row does not show), the thing
// itself 2, its description and notes 3, what hangs from it 4.
const SOURCES = [['line', 1, 0], ['place', 1, 0.2], ['maker', 1, 0.4], ['holder', 1, 0.6], ['on', 2, 1], ['shows', 2, 2], ['names', 2, 4],
  ['text', 3, 5], ['facts', 3, 6], ['table', 4, 7], ['read', 4, 8]];
const COLOURS = { src: 'colours', strength: 2, prefer: 3 };

// The index (search.json) made ready to be searched; made once.
export function prepare(index) {
  const lists = { colours: index?.colours ?? {}, names: index?.names ?? [], glossary: index?.glossary ?? [] };
  const rows = [];
  const units = []; // every string of every source: { id, row, src, strength, prefer, text, toks }
  const where = new Map(); // a folded word -> the ids of the units it stands in
  for (const [at, row] of (index?.rows ?? []).entries()) {
    // `heads`: the row's number and its title, folded: typed whole, they put the row first.
    const heads = (row.line ?? []).slice(0, 2).map((text) => partsOf(text).join(' '));
    rows.push({ no: String(row.no), at, colours: new Set(row.colours ?? []), heads });
    for (const [src, strength, prefer] of SOURCES) {
      for (const text of row[src] ?? []) {
        const unit = { id: units.length, row: at, src, strength, prefer, text: String(text), toks: partsOf(text) };
        units.push(unit);
        for (const word of new Set(unit.toks)) {
          if (!where.has(word)) where.set(word, []);
          where.get(word).push(unit.id);
        }
      }
    }
  }
  const glossary = lists.glossary.map((set) => (Array.isArray(set) ? set : []).map((says) => ({ says: String(says), parts: partsOf(says) })));
  // The words by their first four letters: two words of one family always share them.
  const stems = new Map();
  for (const word of where.keys()) {
    const stem = word.slice(0, 4);
    if (!stems.has(stem)) stems.set(stem, []);
    stems.get(stem).push(word);
  }
  return { lists, rows, units, where, glossary, stems, kin: new Map(), close: new Map() };
}

// What was typed, against the engine: { terms, precise: [{ no, reasons }], possible: [{ no, reasons }] }.
export function search(engine, text) {
  const terms = parseQuery(text, engine.lists);
  const answer = { terms: terms.length, precise: [], possible: [] };
  if (!terms.length) return answer;

  const stood = terms.map((term) => byRow(standing(engine, term)));
  const precise = [];
  for (const row of rowsOf(stood)) {
    const hits = stood.map((found) => found.get(row) ?? []);
    const strong = hits.map((list) => list.find((hit) => hit.strength <= 3));
    if (strong.every(Boolean)) {
      precise.push({ row, strength: Math.max(...strong.map((hit) => hit.strength)), hits: strong });
      continue;
    }
    // Or all of it in one record of its table, one paragraph of its read.
    const one = hits[0].find((hit) => hit.strength === 4 && hits.every((list) => list.some((other) => other.unit === hit.unit)));
    if (one) precise.push({ row, strength: 4, hits: hits.map((list) => list.find((other) => other.unit === one.unit)) });
  }
  // First the rows whose colours hold the colour that was typed; then the rows where every term
  // stands as it was typed, before those that hold only another of its names; then the strongest
  // source; among equals, the row whose number or whole title was typed.
  const typed = partsOf(text).join(' ');
  const held = (found) => (terms.every((term) => !term.colour || engine.rows[found.row].colours.has(term.colour)) ? 0 : 1);
  const other = (found) => (found.hits.some((hit) => !hit.typed) ? 1 : 0);
  const whole = (found) => (engine.rows[found.row].heads.includes(typed) ? 0 : 1);
  precise.sort((a, b) => held(a) - held(b) || other(a) - other(b) || a.strength - b.strength || whole(a) - whole(b) || a.row - b.row);
  answer.precise = precise.map((found) => ({ no: engine.rows[found.row].no, reasons: reasonsOf(found.hits) }));

  // Possible links: not precise, and at least half of what was typed reaches the row, as typed
  // or by a looser road. More of the words first, then the surer road, then the stronger source.
  const taken = new Set(precise.map((found) => found.row));
  const reached = terms.map((term, n) => byRow([...stood[n].values()].flat().concat(loose(engine, term))));
  const possible = [];
  for (const row of rowsOf(reached)) {
    if (taken.has(row)) continue;
    const hits = reached.map((found) => found.get(row)?.[0]).filter(Boolean);
    if (hits.length < Math.ceil(terms.length / 2)) continue;
    possible.push({ row, hits, rank: Math.max(...hits.map((hit) => hit.rank)), strength: Math.max(...hits.map((hit) => hit.strength)) });
  }
  possible.sort((a, b) => b.hits.length - a.hits.length || a.rank - b.rank || a.strength - b.strength || a.row - b.row);
  answer.possible = possible.map((found) => ({ no: engine.rows[found.row].no, reasons: reasonsOf(found.hits) }));
  return answer;
}

// Two words of one family: the same first letters and short endings. Five shared letters or
// more (eagle, eagles; aquila, aquile), or four when they are the whole shorter word and the
// longer adds one or two (film, films): spinne and spinta are not of one family.
export function family(a, b) {
  if (a === b || /\d/.test(a) || /\d/.test(b)) return false;
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  const [less, more] = [a.length - shared, b.length - shared].sort((x, y) => x - y);
  if (shared === 4) return less === 0 && more <= 2;
  return shared >= 5 && more <= 3 && shared / Math.max(a.length, b.length) >= 0.6;
}

// A near spelling of what was typed: one letter off in a word of five to seven, two in a longer one.
export function near(typed, word) {
  if (typed === word || typed.length < 5 || /\d/.test(typed) || /\d/.test(word)) return false;
  const off = typed.length >= 8 ? 2 : 1;
  return Math.abs(typed.length - word.length) <= off && distance(typed, word, off) <= off;
}

// The edit distance of two words, or more than `most` as soon as it is sure to pass it.
function distance(a, b, most) {
  let before = Array.from({ length: b.length + 1 }, (_, n) => n);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let least = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(before[j] + 1, row[j - 1] + 1, before[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (row[j] < least) least = row[j];
    }
    if (least > most) return most + 1;
    before = row;
  }
  return before[b.length];
}

// The looser roads from what was typed to the rows: 1 the same word family, 2 the glossary
// (another language, itself or a word of its family), 3 a near spelling. None for a quoted
// phrase, a name or a colour. A term of several words (camicia nera) takes the glossary only:
// word family and near spelling are for single words.
function loose(engine, term) {
  if (term.exact) return [];
  const hits = [];
  const typed = new Set(term.alts.filter((alt) => !alt.road && alt.parts.length === 1).map((alt) => alt.parts[0]));
  const wordHits = (word, rank, road) => {
    for (const id of engine.where.get(word) ?? []) {
      const unit = engine.units[id];
      hits.push({ row: unit.row, unit, strength: unit.strength, prefer: unit.prefer, at: unit.toks.indexOf(word), length: 1, term, rank, road });
    }
  };
  for (const word of typed) {
    for (const kin of kinOf(engine, word)) if (!typed.has(kin)) wordHits(kin, 1, 'same word family');
    for (const close of closeTo(engine, word)) if (!typed.has(close)) wordHits(close, 3, `near “${term.typed}”`);
  }
  // The glossary: the sets the query named, or the sets holding a word of the typed word's family.
  let others = term.alts.filter((alt) => alt.road === 'glossary');
  if (!others.length) {
    others = engine.glossary
      .filter((set) => set.some((item) => item.parts.length === 1 && [...typed].some((word) => family(item.parts[0], word))))
      .flatMap((set) => set.filter((item) => !(item.parts.length === 1 && typed.has(item.parts[0]))));
  }
  for (const item of others) {
    const road = `${term.typed} = ${item.says}`;
    for (const id of engine.where.get(item.parts[0]) ?? []) {
      const unit = engine.units[id];
      const at = phraseAt(unit.toks, item.parts);
      if (at >= 0) hits.push({ row: unit.row, unit, strength: unit.strength, prefer: unit.prefer, at, length: item.parts.length, term, rank: 2, road });
    }
    if (item.parts.length === 1) for (const kin of kinOf(engine, item.parts[0])) wordHits(kin, 2, road);
  }
  return hits;
}

// The words of the library of one family with `word`, and those a near spelling away; each asked once.
function kinOf(engine, word) {
  if (!engine.kin.has(word)) engine.kin.set(word, (engine.stems.get(word.slice(0, 4)) ?? []).filter((other) => family(other, word)));
  return engine.kin.get(word);
}

function closeTo(engine, word) {
  if (!engine.close.has(word)) engine.close.set(word, [...engine.where.keys()].filter((other) => near(word, other)));
  return engine.close.get(word);
}

// Where a term stands as typed, or as another exact way of saying it: one hit for each unit, and
// one for each row whose colours hold the colour it names.
function standing(engine, term) {
  const hits = [];
  const seen = new Set();
  for (const alt of term.alts) {
    if (alt.road) continue;
    for (const id of engine.where.get(alt.parts[0]) ?? []) {
      if (seen.has(id)) continue;
      const unit = engine.units[id];
      const at = phraseAt(unit.toks, alt.parts);
      if (at < 0) continue;
      seen.add(id);
      hits.push({ row: unit.row, unit, strength: unit.strength, prefer: unit.prefer, at, length: alt.parts.length, term, alt, rank: 0, typed: alt.says === term.alts[0].says });
    }
  }
  if (term.colour) {
    for (const row of engine.rows) {
      if (row.colours.has(term.colour)) hits.push({ row: row.at, unit: null, ...COLOURS, term, alt: term.alts[0], rank: 0, typed: true });
    }
  }
  return hits;
}

// Hits by row, each row's best first: the surest road, then where the term stands as it was
// typed (not under another of its names), then the strongest source, then the one a reason prefers.
function byRow(hits) {
  const rows = new Map();
  for (const hit of hits) {
    if (!rows.has(hit.row)) rows.set(hit.row, []);
    rows.get(hit.row).push(hit);
  }
  for (const list of rows.values()) list.sort(better);
  return rows;
}

const better = (a, b) => a.rank - b.rank || Number(!a.typed) - Number(!b.typed) || a.strength - b.strength || a.prefer - b.prefer || (a.unit?.id ?? 0) - (b.unit?.id ?? 0);

function rowsOf(maps) {
  return [...new Set(maps.flatMap((map) => [...map.keys()]))].sort((a, b) => a - b);
}

// The place in `toks` where `parts` stand together, in order; -1 when they do not.
function phraseAt(toks, parts) {
  for (let at = toks.indexOf(parts[0]); at >= 0; at = toks.indexOf(parts[0], at + 1)) {
    if (parts.every((part, n) => toks[at + n] === part)) return at;
  }
  return -1;
}

const LABELS = { line: '', place: 'place', maker: 'made by', holder: 'held by', on: 'on it', shows: 'shows', colours: 'colour', names: 'also called', text: 'in the description', facts: 'in the notes', table: 'in its table', read: 'in the long read' };
const CUT = 90; // characters of a description, a table record or a read paragraph shown as a reason
const REASONS = 3; // at most, for one row

// Why a row was found, from the hit chosen for each term: [{ label, text, marks, road }], the
// strongest source first. Terms found in one string share a reason. Nothing is said of a term
// that stands as typed in the row's own line: the reader sees it there. The notes are never
// quoted, only the word that stands in them.
function reasonsOf(hits) {
  const found = new Map();
  const note = (key, hit, make) => {
    if (!found.has(key)) found.set(key, { hit, spans: [], roads: new Set(), make });
    return found.get(key);
  };
  for (const hit of hits) {
    if (!hit) continue;
    const typed = hit.term.alts[0];
    if (!hit.unit) {
      note(`colour ${hit.term.colour}`, hit, () => ({ label: LABELS.colours, text: hit.term.colour, marks: [[0, hit.term.colour.length]] }));
    } else if (hit.rank === 0 && !hit.term.colour && hit.alt.says !== typed.says) {
      // Another name of the same thing stands in the row: say the one that was typed.
      note(`name ${typed.says}`, hit, () => ({ label: LABELS.names, text: typed.says, marks: [[0, typed.says.length]] }));
    } else if (hit.unit.src !== 'line' || hit.rank > 0) {
      const reason = note(`unit ${hit.unit.id}`, hit, null);
      reason.spans.push([hit.at, hit.length]);
      if (hit.road) reason.roads.add(hit.road);
    }
  }
  return [...found.values()]
    .sort((a, b) => a.hit.strength - b.hit.strength || a.hit.prefer - b.hit.prefer || (a.hit.unit?.id ?? 0) - (b.hit.unit?.id ?? 0))
    .slice(0, REASONS)
    .map(({ hit, spans, roads, make }) => ({ ...(make ? make() : fromUnit(hit.unit, spans)), road: [...roads].join(', ') }));
}

// The label and the text of a reason found in one string, with the places of the words in it.
function fromUnit(unit, spans) {
  const placed = words(unit.text);
  const marks = spans
    .map(([at, length]) => [placed[at].from, placed[at + length - 1].to])
    .sort((a, b) => a[0] - b[0])
    .filter((mark, n, all) => n === 0 || mark[0] >= all[n - 1][1]);
  const label = LABELS[unit.src];
  if (unit.src === 'line' || unit.src === 'facts') {
    // Only the words themselves: of the line the reader has the rest, of the notes nothing is quoted.
    let text = '';
    const own = [];
    for (const [from, to] of marks) {
      if (text) text += ' … ';
      own.push([text.length, text.length + to - from]);
      text += unit.text.slice(from, to);
    }
    return { label, text, marks: own };
  }
  if (unit.src === 'text' || unit.src === 'table' || unit.src === 'read') return { label, ...cut(unit.text, marks) };
  return { label, text: unit.text, marks };
}

// At most CUT characters of `text` around the first mark, cut at spaces, "…" where it was cut.
function cut(text, marks) {
  if (text.length <= CUT) return { text, marks };
  const [from, to] = marks[0];
  let start = Math.max(0, Math.min(from - Math.floor((CUT - (to - from)) / 2), text.length - CUT));
  let end = Math.min(text.length, start + CUT);
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space >= 0 && space < from) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space >= to) end = space;
  }
  const head = start > 0 ? '…' : '';
  return {
    text: head + text.slice(start, end) + (end < text.length ? '…' : ''),
    marks: marks.filter((mark) => mark[0] >= start && mark[1] <= end).map((mark) => [mark[0] - start + head.length, mark[1] - start + head.length]),
  };
}
