import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropTarget, chapterIndex, toParagraphs, fromParagraphs, OpQueue, Underway, changesIn, publishQuestion, removeQuestion, storyPlaces, headingsOf, placeRow, rowPlace, placeChapter, yearValue, numberValue, offered, placedLine, rowCount } from '../web/editmodel.js';
import { diffDocs } from '../cloud/doc.mjs';
import { summaryLine } from '../cloud/render.mjs';
import { sampleDoc } from './docs.mjs';

const seq = (...items) => items.map((item) => (item.startsWith('#') ? { kind: 'chapter', id: item.slice(1) } : { kind: 'row', id: item }));

test('a row dropped under the second heading lands in that chapter at its place', () =>
  assert.deepEqual(dropTarget([{ kind: 'chapter', id: 'c1' }, { kind: 'row', id: 'a' }, { kind: 'chapter', id: 'c2' }, { kind: 'row', id: 'b' }, { kind: 'row', id: 'x' }], 'x'), { chapter: 'c2', index: 1 }));
test('a row dropped above every heading goes first in the first chapter', () =>
  assert.deepEqual(dropTarget([{ kind: 'row', id: 'x' }, { kind: 'chapter', id: 'c1' }, { kind: 'row', id: 'a' }], 'x'), { chapter: 'c1', index: 0 }));
test('a row dropped just under a heading is first in that chapter, and hidden rows count', () => {
  assert.deepEqual(dropTarget(seq('#c1', 'a', 'b', '#c2', 'x', 'c'), 'x'), { chapter: 'c2', index: 0 });
  assert.deepEqual(dropTarget(seq('#c1', 'a', 'h', 'x', '#c2', 'c'), 'x'), { chapter: 'c1', index: 2 }, 'h stands for a hidden row: it is in the chapter, so it counts');
  assert.deepEqual(dropTarget(seq('#c1', 'a', '#c2', '#c3', 'x'), 'x'), { chapter: 'c3', index: 0 }, 'under an empty chapter that follows another');
});

// The compact view folds a chapter's rows away (display: none), and the dragged row may land among
// them, before or after: either way just under the folded heading, which is the chapter's head.
test('a row dropped under a folded chapter\'s heading is the first of that chapter, wherever among its folded rows it lands', () => {
  const folding = (...items) => seq(...items).map((item) => (item.kind === 'chapter' && item.id === 'c2' ? { ...item, folded: true } : item));
  assert.deepEqual(dropTarget(folding('#c1', 'a', '#c2', 'x', 'b', 'c', '#c3', 'd'), 'x'), { chapter: 'c2', index: 0 });
  assert.deepEqual(dropTarget(folding('#c1', 'a', '#c2', 'b', 'c', 'x', '#c3', 'd'), 'x'), { chapter: 'c2', index: 0 }, 'after the folded rows, before the next heading');
  assert.deepEqual(dropTarget(folding('#c1', 'a', 'x', '#c2', 'b', 'c', '#c3'), 'x'), { chapter: 'c1', index: 1 }, 'above the folded heading: the chapter before, as ever');
  assert.deepEqual(dropTarget(folding('#c1', 'a', '#c2', 'b', '#c3', 'x', 'd'), 'x'), { chapter: 'c3', index: 0 }, 'under the next heading, which is not folded');
});

test('a folded chapter\'s count of rows', () => {
  assert.equal(rowCount(31), '31 rows');
  assert.equal(rowCount(1), '1 row');
  assert.equal(rowCount(0), '0 rows');
});

// The author typed 18.07 in a chapter of three and the row went to 18.04, the end of chapter 18, at
// the bottom of a long page: it looked lost. The page follows the row and, when it is not where the
// number typed said, says where it went.
test('the line after a typed number: none at the place typed, else where the row went, and when it went to the end of its chapter, that', () => {
  assert.equal(placedLine('2.5', '2.05'), null);
  assert.equal(placedLine('2,05', '2.05'), null);
  assert.equal(placedLine(' 02.05 ', '2.05'), null);
  assert.equal(placedLine('18.07', '18.04'), 'Placed at 18.04, the end of chapter 18.');
  assert.equal(placedLine('4.02', '3.02'), 'Placed at 3.02.', 'the chapter it left was the only one before and is now empty: the chapters close up');
  assert.equal(placedLine('2.07', '1.05'), 'Placed at 1.05, the end of chapter 1.', 'past the end, and the chapters closed up');
  assert.equal(placedLine('2.01', ''), null, 'a hidden row has no number to say');
});

test('a chapter dropped among the others takes the place of the headings before it', () => {
  assert.equal(chapterIndex(seq('#c1', 'a', '#c3', 'b', '#c2', 'c'), 'c3'), 1, 'rows folded away in between do not count');
  assert.equal(chapterIndex(seq('#c2', '#c1', 'a', '#c3'), 'c2'), 0);
  assert.equal(chapterIndex(seq('#c1', '#c2', 'a', 'b', '#c3'), 'c3'), 2);
});

test('paragraphs go both ways', () => { assert.deepEqual(toParagraphs(' One\n\n\n Two \n'), ['One', 'Two']); assert.equal(fromParagraphs(['One', 'Two']), 'One\n\nTwo'); });
test('a line of spaces or a Windows line end parts paragraphs too; a single line end does not', () => {
  assert.deepEqual(toParagraphs('One\r\n  \r\nTwo\nstill two'), ['One', 'Two\nstill two']);
  assert.deepEqual(toParagraphs('  \n\n '), []);
  assert.equal(fromParagraphs([]), '');
});

test('two ops pushed at once go in order, each with the version before it', async () => {
  const seen = []; const q = new OpQueue(async ({ version, op }) => { seen.push([version, op.n]); return { status: 200, body: { version: version + 1 } }; }, 4);
  await Promise.all([q.push({ n: 1 }), q.push({ n: 2 })]);
  assert.deepEqual(seen, [[4, 1], [5, 2]]); assert.equal(q.version, 6);
});

test('after a conflict the ops queued behind it are not sent', async () => {
  let calls = 0;
  const q = new OpQueue(async () => { calls++; return { status: 409, body: { error: 'Changed in another window. Reload to see it.', version: 9 } }; }, 4);
  const first = q.push({ n: 1 });
  const second = q.push({ n: 2 });
  await assert.rejects(first, { message: 'Changed in another window. Reload to see it.', status: 409 });
  await assert.rejects(second, { message: 'Changed in another window. Reload to see it.', status: 409 });
  assert.equal(calls, 1);
  assert.equal(q.version, 4, 'the version of another window is not taken: the page must be reloaded to see it');
});

test('logged out: the ops queued behind are not sent, and an op pushed after that goes with the same version', async () => {
  const seen = [];
  let session = false;
  const q = new OpQueue(async ({ version, op }) => {
    seen.push([version, op.n]);
    return session ? { status: 200, body: { version: version + 1 } } : { status: 401, body: { error: 'logged-out' } };
  }, 7);
  const first = q.push({ n: 1 });
  const second = q.push({ n: 2 });
  await assert.rejects(first, { message: 'logged-out', status: 401 });
  await assert.rejects(second, { message: 'logged-out', status: 401 });
  session = true; // logged in again in another tab
  assert.equal((await q.push({ n: 3 })).version, 8);
  assert.deepEqual(seen, [[7, 1], [7, 3]]);
});

test('an op refused for what it asks rejects alone; the next goes with the version unchanged', async () => {
  const seen = [];
  const q = new OpQueue(async ({ version, op }) => {
    seen.push([version, op.n]);
    return op.n === 1 ? { status: 422, body: { error: 'There is no chapter 7.' } } : { status: 200, body: { version: version + 1 } };
  }, 2);
  const [first, second] = await Promise.allSettled([q.push({ n: 1 }), q.push({ n: 2 })]);
  assert.equal(first.reason.message, 'There is no chapter 7.');
  assert.equal(first.reason.status, 422);
  assert.deepEqual(second.value, { version: 3 });
  assert.deepEqual(seen, [[2, 1], [2, 2]]);
});

test('an answer without a version (a publish) leaves the version as it is; a failed send rejects that op alone', async () => {
  let n = 0;
  const q = new OpQueue(async ({ op }) => {
    n++;
    if (op.fail) throw new TypeError('Failed to fetch');
    return { status: 200, body: op.publish ? { id: 3 } : { version: 11 } };
  }, 10);
  assert.deepEqual(await q.push({ publish: true }), { id: 3 });
  assert.equal(q.version, 10);
  await assert.rejects(q.push({ fail: true }), { message: 'Failed to fetch', status: 0 });
  await q.push({});
  assert.equal(q.version, 11);
  assert.equal(n, 3);
});

// The field left by a click on Log out: its edit is answered, then the field closes, a few
// microtasks later. Log out waits for settled() and then asks whether anything is unsaved; were it
// told before the field had closed, it would find the field still saving and ask for nothing.
test('settled waits for a save past the answer to its edit, until what follows the answer has run', async () => {
  const underway = new Underway();
  const seen = [];
  let answer;
  const edit = underway.during(new Promise((resolve) => { answer = resolve; }));
  const save = underway.during(edit.then(() => seen.push('field closed')));
  underway.settled().then(() => seen.push('settled'));
  answer();
  await save;
  await underway.settled();
  assert.deepEqual(seen, ['field closed', 'settled']);
});

test('settled answers at once when nothing is under way, and after a refusal as after a success', async () => {
  const underway = new Underway();
  let resolved = false;
  await underway.settled().then(() => { resolved = true; });
  assert.equal(resolved, true);
  const refused = underway.during(Promise.reject(new Error('There is no chapter 7.')));
  let after = false;
  const waited = underway.settled().then(() => { after = true; });
  await assert.rejects(refused, { message: 'There is no chapter 7.' });
  await waited;
  assert.equal(after, true);
});

test('settled waits for work begun while it waits (a keyword added, then given to the row)', async () => {
  const underway = new Underway();
  const seen = [];
  let addAnswered;
  let giveAnswered;
  const whole = underway.during((async () => {
    await underway.during(new Promise((resolve) => { addAnswered = resolve; }));
    seen.push('added');
    await underway.during(new Promise((resolve) => { giveAnswered = resolve; }));
    seen.push('given');
  })());
  underway.settled().then(() => seen.push('settled'));
  addAnswered();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ['added'], 'not settled between the two edits');
  giveAnswered();
  await whole;
  await underway.settled();
  assert.deepEqual(seen, ['added', 'given', 'settled']);
});

test('the number of changes is read from the summary line as diffDocs counts them', () => {
  const before = sampleDoc({ c1: ['a', 'b', 'c'], c2: ['d', 'e'] });
  const after = structuredClone(before);
  after.rows.a.record.title = 'New';
  after.rows.b.record.title = 'Newer';
  after.rows.c.hidden = true;
  delete after.rows.e;
  after.chapters[1].rows = ['d'];
  after.rows.r1 = structuredClone(before.rows.d);
  after.chapters[0].rows.push('r1');
  after.chapters[0].rows.reverse();
  after.idea = 'An idea';
  const diff = diffDocs(before, after);
  assert.equal(summaryLine(diff), '2 rows changed, 1 added, 1 removed, 1 hidden, order changed, idea changed');
  assert.equal(changesIn(summaryLine(diff)), diff.count);
  assert.equal(changesIn('No changes since the last publish'), 0);
});

// A removed row can be brought back from an older publish only if some publish holds it.
test('the question before a row is removed says whether it can come back', () => {
  assert.equal(removeQuestion('Mendola', true), 'Remove “Mendola”? It goes at the next publish and can be brought back from an older publish.');
  assert.equal(removeQuestion('New row', false), 'Remove “New row”? It has never been published, so it cannot be brought back.');
});

test('the question before a publish, from the summary', () => {
  assert.equal(publishQuestion('6 rows changed, 2 added, 1 hidden'), 'Publish 9 changes?');
  assert.equal(publishQuestion('order changed'), 'Publish 1 change?');
  assert.equal(publishQuestion('No changes since the last publish'), 'Publish again? Nothing has changed since the last publish.');
  assert.equal(publishQuestion('Nothing published yet: 277 rows in 18 chapters'), 'Publish for the first time? 277 rows in 18 chapters.');
});

const chapters = () => [{ id: 'c1', title: 'One', rows: ['a', 'h', 'b'] }, { id: 'c2', title: 'Two', rows: [] }, { id: 'c3', title: 'Three', rows: ['c'] }];

test('each row takes its place in the story from the chapters, hidden rows counted', () => {
  assert.deepEqual([...storyPlaces(chapters())], [['a', { at: 0, chapter: 'c1' }], ['h', { at: 1, chapter: 'c1' }], ['b', { at: 2, chapter: 'c1' }], ['c', { at: 3, chapter: 'c3' }]]);
});

test('the headings rescan takes: each chapter numbered among those with a row shown, the others —', () => {
  const shown = (id) => id !== 'h';
  assert.deepEqual(headingsOf(chapters(), shown), [{ id: 'c1', no: '1', title: 'One' }, { id: 'c2', no: '—', title: 'Two' }, { id: 'c3', no: '2', title: 'Three' }]);
  assert.deepEqual(headingsOf(chapters(), (id) => id === 'c').map((c) => c.no), ['—', '—', '1'], 'a chapter of hidden rows has no number either');
});

test('a row put at a place leaves where it was and goes there, the chapters given unchanged', () => {
  const given = chapters();
  assert.deepEqual(placeRow(given, 'a', 'c3', 1).map((c) => c.rows), [['h', 'b'], [], ['c', 'a']]);
  assert.deepEqual(placeRow(given, 'b', 'c1', 0).map((c) => c.rows), [['b', 'a', 'h'], [], ['c']]);
  assert.deepEqual(placeRow(given, 'c', 'c2', 9).map((c) => c.rows), [['a', 'h', 'b'], ['c'], []], 'past the end is last');
  assert.deepEqual(placeRow(given, 'new', 'c2', 0).map((c) => c.rows), [['a', 'h', 'b'], ['new'], ['c']], 'a row not yet anywhere is added');
  assert.deepEqual(given, chapters());
  assert.deepEqual(rowPlace(given, 'b'), { chapter: 'c1', index: 2 });
  assert.equal(rowPlace(given, 'zz'), null);
});

test('a chapter put at a place among the others', () => {
  const given = chapters();
  assert.deepEqual(placeChapter(given, 'c3', 0).map((c) => c.id), ['c3', 'c1', 'c2']);
  assert.deepEqual(placeChapter(given, 'c1', 2).map((c) => c.id), ['c2', 'c3', 'c1']);
  assert.deepEqual(placeChapter(given, 'c1', 7).map((c) => c.id), ['c2', 'c3', 'c1']);
  assert.deepEqual(given, chapters());
});

test('the year as typed: empty is none, a whole number is a number, anything else goes as typed for the server to refuse', () => {
  assert.equal(yearValue(''), null);
  assert.equal(yearValue('  '), null);
  assert.equal(yearValue(' 1934 '), 1934);
  assert.equal(yearValue('-50'), -50);
  assert.equal(yearValue('1934–40'), '1934–40');
  assert.equal(yearValue('19.5'), '19.5');
});

// I5 (clean review): the decimal keypad of a phone set to a region that writes 2,05 has a comma and
// no full stop; the number goes to the server with a full stop, anything else as typed for the
// server to refuse in its own words.
test('a number typed with a comma goes with a full stop; anything else as typed', () => {
  assert.equal(numberValue('2,05'), '2.05');
  assert.equal(numberValue(' 2,5 '), '2.5');
  assert.equal(numberValue(' 2.05 '), '2.05');
  assert.equal(numberValue('abc'), 'abc');
  assert.equal(numberValue('1,0,2'), '1,0,2');
  assert.equal(numberValue(''), '');
});

test('the keywords offered to a row: the others, by label, narrowed by what is typed whatever its accents and case', () => {
  const vocabulary = { press: { label: 'Press' }, citta: { label: 'Città nuova' }, alpha: { label: 'Alpha' }, wall: { label: 'Wall' } };
  assert.deepEqual(offered(vocabulary, ['wall'], '').map((k) => k.id), ['alpha', 'citta', 'press']);
  assert.deepEqual(offered(vocabulary, [], 'CITTA').map((k) => k.id), ['citta']);
  assert.deepEqual(offered(vocabulary, [], ' re ').map((k) => k.id), ['press']);
  assert.deepEqual(offered(vocabulary, [], 'zz'), []);
});
