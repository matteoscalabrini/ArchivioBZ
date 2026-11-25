import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, search } from '../web/search.js';
import { layout, summary, reasonHtml, inChapters, headingPlan, POSSIBLE_SHOWN } from '../web/results.js';
import { INDEX } from './search-index.mjs';

// The rows as library.js holds them: the rows of section 1 carry the keyword "posters".
const rows = INDEX.rows.map((r) => ({ no: r.no, type: r.line[2], year: Number(/\d{4}/.exec(r.line[3])[0]), kw: r.no.startsWith('1.') ? ['posters'] : [], kind: undefined }));
const state = (over = {}) => ({ q: '', k: null, t: null, o: [], s: 'no', ...over });
const e = prepare(INDEX);

test('no search: every row that passes, in order, no groups', () => {
  const view = layout(rows, state({ k: 'posters' }), null);
  assert.deepEqual(view.items.map((i) => i.row), ['1.01', '1.05', '1.10', '1.11', '1.12']);
  assert.equal(view.shown, 5);
});

test('a search: precise, then possible, each under its line', () => {
  const view = layout(rows, state({ q: 'Merano' }), search(e, 'Merano'));
  assert.deepEqual(view.items.map((i) => i.group ?? i.row), ['precise', '1.10', '1.11', 'possible', '1.01']);
  assert.deepEqual([view.precise, view.possible, view.shown], [2, 1, 3]);
  assert.deepEqual(view.items[4].reasons, [{ label: '', text: 'Meran', marks: [[0, 5]], road: 'same word family' }]);
});

test('a keyword narrows a search, and the counts follow', () => {
  const view = layout(rows, state({ q: 'rosso', k: 'posters' }), search(e, 'rosso'));
  assert.deepEqual(view.items.map((i) => i.group ?? i.row), ['precise', '1.05']);
  assert.equal(view.precise, 1);
});

test('a column head sorts inside each group', () => {
  const view = layout(rows, state({ q: 'Bozen', s: 'date' }), search(e, 'Bozen'));
  assert.deepEqual(view.items.map((i) => i.group ?? i.row), ['precise', '1.05', '15.01', '0.01']);
});

test('thirty possible links, then a line for the rest', () => {
  assert.equal(POSSIBLE_SHOWN, 30);
  const many = Array.from({ length: 40 }, (_, i) => ({ no: `9.${String(i).padStart(2, '0')}`, reasons: [] }));
  const lots = many.map((h) => ({ no: h.no, type: 'Poster', year: 1930, kw: [] }));
  const view = layout(lots, state({ q: 'x' }), { terms: 1, precise: [], possible: many });
  assert.equal(view.items.filter((i) => i.row).length, 30);
  assert.deepEqual(view.items.at(-1), { more: 10 });
  assert.equal(view.possible, 40);
  assert.equal(layout(lots, state({ q: 'x' }), { terms: 1, precise: [], possible: many }, { allPossible: true }).items.filter((i) => i.row).length, 40);
});

test('a search that finds nothing shows nothing', () => {
  const view = layout(rows, state({ q: 'xyzzy' }), search(e, 'xyzzy'));
  assert.deepEqual([view.items, view.shown, view.precise, view.possible], [[], 0, 0, 0]);
});

test('summary says what is shown', () => {
  assert.deepEqual(summary({ total: 400, shown: 400, narrowed: [], q: '' }), { what: 'All entries', n: '400 entries' });
  assert.deepEqual(summary({ total: 400, shown: 12, narrowed: ['Press', 'Typeface'], q: '' }), { what: 'Press · Typeface', n: '12 of 400 entries' });
  assert.deepEqual(summary({ total: 400, shown: 8, precise: 6, possible: 2, narrowed: ['Press'], q: 'rosso', ready: true }),
    { what: 'Press · “rosso”', n: '6 precise · 2 possible · of 400 entries' });
  assert.equal(summary({ total: 400, shown: 3, precise: 3, possible: 0, narrowed: [], q: 'x', ready: true }).n, '3 precise · of 400 entries');
  assert.equal(summary({ total: 400, shown: 400, narrowed: [], q: 'x', ready: false }).n, 'searching…');
  assert.equal(summary({ total: 400, shown: 400, narrowed: [], q: 'x', ready: false, failed: true }).n, 'the search is not available');
  assert.equal(summary({ total: 1, shown: 1, narrowed: [], q: ' ' }).n, '1 entry', 'only spaces typed is no search');
});

test('a reason as HTML: marked, quoted, escaped', () => {
  assert.equal(reasonHtml({ label: 'on it', text: 'die Königin des Hochetsch', marks: [[4, 11], [16, 25]], road: '' }),
    '<span>on it: “die <b>Königin</b> des <b>Hochetsch</b>”</span>');
  assert.equal(reasonHtml({ label: '', text: 'Führer', marks: [[0, 6]], road: 'near “<i>”' }), '<span><b>Führer</b> (near “&lt;i&gt;”)</span>');
  assert.equal(reasonHtml({ label: 'shows', text: 'a <b> & c', marks: [], road: '' }), '<span>shows: a &lt;b&gt; &amp; c</span>');
});

test('a search of nothing but punctuation is no search', () => {
  const view = layout(rows, state({ q: '"' }), search(e, '"'));
  assert.equal(view.searched, false);
  assert.equal(view.items.length, rows.length);
  assert.equal(view.items.some((item) => item.group), false);
  assert.equal(layout(rows, state({ q: 'Merano' }), search(e, 'Merano')).searched, true);
  assert.equal(layout(rows, state({ q: 'xyzzy' }), search(e, 'xyzzy')).searched, true, 'words that find nothing are still a search');
  assert.equal(layout(rows, state(), null).searched, false);
});

// Rows of chapters as library.js holds them, in the story order; `shown`: the ids of those that pass.
const story = [['a', 'c1'], ['b', 'c1'], ['c', 'c2'], ['d', 'c3'], ['e', 'c3']].map(([id, chapter]) => ({ id, chapter }));
const drawn = (items) => items.map((item) => (item.row ? item.row.id : `${item.hidden ? '-' : '#'}${item.chapter}`));

test('each heading stands over the first row of its chapter', () => {
  assert.deepEqual(drawn(inChapters(story, ['c1', 'c2', 'c3'])), ['#c1', 'a', 'b', '#c2', 'c', '#c3', 'd', 'e']);
});

test('a heading whose rows are all filtered out is hidden; the others stay', () => {
  const shows = (row) => ['b', 'e'].includes(row.id);
  assert.deepEqual(drawn(inChapters(story, ['c1', 'c2', 'c3'], { shows, narrowed: true })), ['#c1', 'a', 'b', '-c2', 'c', '#c3', 'd', 'e']);
});

test('a chapter without rows keeps its place among the others, hidden only when the list is narrowed', () => {
  const chapters = ['c0', 'c1', 'cx', 'c2', 'c3', 'cz'];
  assert.deepEqual(drawn(inChapters(story, chapters)), ['#c0', '#c1', 'a', 'b', '#cx', '#c2', 'c', '#c3', 'd', 'e', '#cz']);
  assert.deepEqual(drawn(inChapters(story, chapters, { shows: () => true, narrowed: true })), ['-c0', '#c1', 'a', 'b', '-cx', '#c2', 'c', '#c3', 'd', 'e', '-cz']);
});

test('rows in no chapter have no heading', () => {
  const loose = [{ id: 'x' }, ...story.slice(0, 2), { id: 'y' }];
  assert.deepEqual(drawn(inChapters(loose, ['c1'])), ['x', '#c1', 'a', 'b', 'y']);
  assert.deepEqual(drawn(inChapters(loose, [])), ['x', 'a', 'b', 'y']);
});

// Edit mode: after an edit the chapters come from the server's answer, in the story order, and
// the headings follow them, whatever the list showed when the edit was made.
test('the headings follow the chapters given: kept, made, put in order, and the gone ones dropped', () => {
  const plan = headingPlan([{ id: 'c2', no: '1', title: 'Two' }, { id: 'c4', no: '2', title: 'New' }, { id: 'c1', no: '3', title: 'One' }], ['c1', 'c2', 'c3']);
  assert.deepEqual(plan.order, [{ id: 'c2', no: '1', title: 'Two', make: false }, { id: 'c4', no: '2', title: 'New', make: true }, { id: 'c1', no: '3', title: 'One', make: false }]);
  assert.deepEqual(plan.drop, ['c3']);
  assert.deepEqual(headingPlan([], ['c1']), { order: [], drop: ['c1'] });
});

test('in edit mode a chapter emptied by a move keeps its heading in the story order, between its neighbours', () => {
  // c1's only row went to c2: c1 now has no rows, and its heading still stands first.
  const moved = [['a', 'c2'], ['c', 'c2'], ['d', 'c3']].map(([id, chapter]) => ({ id, chapter }));
  assert.deepEqual(drawn(inChapters(moved, ['c1', 'c2', 'c3'])), ['#c1', '#c2', 'a', 'c', '#c3', 'd']);
  // A new chapter at the end, before it has rows; a keyword or a kind filter hides it.
  assert.deepEqual(drawn(inChapters(moved, ['c1', 'c2', 'c3', 'c9'])), ['#c1', '#c2', 'a', 'c', '#c3', 'd', '#c9']);
  assert.deepEqual(drawn(inChapters(moved, ['c1', 'c2', 'c3', 'c9'], { shows: () => true, narrowed: true })), ['-c1', '#c2', 'a', 'c', '#c3', 'd', '-c9']);
});
