import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropTarget, chapterIndex, toParagraphs, fromParagraphs, OpQueue, Underway, IdeaDrawings, changesIn, publishQuestion, removeQuestion, pagesFirst, storyPlaces, headingsOf, placeRow, rowPlace, placeChapter, yearValue, numberValue, offered, placedLine, rowCount, linkMatches, insertLink, linkable } from '../web/editmodel.js';
import { linksIn, targetOf } from '../lib/links.mjs';
import { renderMarkdown } from '../lib/markdown.mjs';
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

// A row with pages about it is not removed (ops.mjs); 🗑 says why instead of asking.
test('a row with pages: what 🗑 says instead of the question, page or pages by the count', () => {
  assert.equal(pagesFirst('Mendola', 1), '“Mendola” has 1 page about it: remove them first, or hide the row.');
  assert.equal(pagesFirst('Mendola', 3), '“Mendola” has 3 pages about it: remove them first, or hide the row.');
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

// The idea's drawings come with the draft version each was drawn from, and not always in order:
// the page asked again after the idea is saved can answer after an edit queued behind that save,
// with the draft from before that edit (the race of Task 17's re-review).
test('IdeaDrawings: a drawing older than the one shown or waiting is never put in; one that comes while the field is open waits for it', () => {
  const ideas = new IdeaDrawings(5);
  assert.equal(ideas.offer('<v6>', 6), 'put');
  assert.equal(ideas.offer('<v5>', 5), 'old', 'older than the one shown');
  assert.equal(ideas.offer('<v6 again>', 6), 'put', 'as new as the one shown');
  assert.equal(ideas.closed(), null, 'nothing waits');

  // The idea saved at 7 with its field still open; the hide behind it answered at 8 with the idea
  // as it now reads; then the page asked again after the save answers, drawn at 7.
  ideas.saved();
  assert.equal(ideas.offer('<v8, 5.00 hidden>', 8, { fieldOpen: true }), 'wait');
  assert.equal(ideas.offer('<v7, 5.00 live>', 7, { fieldOpen: true, own: true }), 'old');
  assert.equal(ideas.closed(), '<v8, 5.00 hidden>', 'the field closed: what waited goes in');
  assert.equal(ideas.closed(), null);

  // The save's own drawing goes in though its field is open, and what waited before it is dropped.
  assert.equal(ideas.offer('<v9>', 9, { fieldOpen: true }), 'wait');
  assert.equal(ideas.offer('<v10, own>', 10, { fieldOpen: true, own: true }), 'put');
  assert.equal(ideas.closed(), null);
  // The idea's own save answered: what waited was drawn from the text before it.
  assert.equal(ideas.offer('<v11>', 11, { fieldOpen: true }), 'wait');
  ideas.saved();
  assert.equal(ideas.closed(), null);
});

// What the 🔗 finder lists for what is typed (Task 18): rows by the start of their number as it now
// stands or by words of their title, keywords by their label, pages by their title, whatever the
// accents and case; a keyword or page named just so first, then rows, keywords, pages, at most
// eight, the rows at most five of them when a keyword or a page is found too.
const FOUND = {
  rows: [
    { id: '2.07', no: '2.07', title: 'Laurin fountain' },
    { id: '18.04', no: '2.08', title: 'Oltrisarco, postcard with its German caption' },
    { id: 'r3', no: '2.09', title: 'Über die Brücke' },
    { id: '3.01', no: '3.01', title: 'A map of 2 bridges' },
    { id: 'r1', no: '', title: 'Oltrisarco kept back' }, // hidden: no number
  ],
  keywords: [{ id: 'ponte-druso', label: 'Ponte Druso' }, { id: 'oltrisarco', label: 'Oltrisarco' }],
  pages: [{ address: 'on-the-bridge', title: 'On the bridge' }],
};
const row = (id, label) => ({ kind: 'row', target: `@${id}`, label });

test('linkMatches: 2.0 finds the rows whose number starts so, in their order, by their id; a comma does as a full stop', () => {
  const want = [row('2.07', 'Laurin fountain'), row('18.04', 'Oltrisarco, postcard with its German caption'), row('r3', 'Über die Brücke')];
  assert.deepEqual(linkMatches('2.0', FOUND), want);
  assert.deepEqual(linkMatches(' 2,0 ', FOUND), want);
  assert.deepEqual(linkMatches('2.08', FOUND), [want[1]]);
});

test('linkMatches: rows found by their number come before those found by a word of their title', () => {
  assert.deepEqual(linkMatches('2', FOUND).map((m) => m.target), ['@2.07', '@18.04', '@r3', '@3.01']);
});

test('linkMatches: oltri finds the rows whose title has a word so begun, a hidden one too, then the keyword', () => {
  assert.deepEqual(linkMatches('oltri', FOUND), [
    row('18.04', 'Oltrisarco, postcard with its German caption'),
    row('r1', 'Oltrisarco kept back'),
    { kind: 'keyword', target: 'Oltrisarco', label: 'Oltrisarco' },
  ]);
  assert.deepEqual(linkMatches('sarco', FOUND), [], 'a word is found by its start, not its middle');
  assert.deepEqual(linkMatches('oltri POST', FOUND), [row('18.04', 'Oltrisarco, postcard with its German caption')], 'each word typed begins a word of the title');
});

test('linkMatches: ÜBER finds Über die Brücke, and so do uber and BRUCKE: case and accents aside', () => {
  for (const typed of ['ÜBER', 'uber', 'BRUCKE', 'die brü']) assert.deepEqual(linkMatches(typed, FOUND), [row('r3', 'Über die Brücke')], typed);
});

test('linkMatches: a keyword by its label, written as its label; a page by its title, by its address; rows, keywords, pages in that order', () => {
  assert.deepEqual(linkMatches('druso', FOUND), [{ kind: 'keyword', target: 'Ponte Druso', label: 'Ponte Druso' }]);
  assert.deepEqual(linkMatches('PONTE', FOUND), [{ kind: 'keyword', target: 'Ponte Druso', label: 'Ponte Druso' }]);
  assert.deepEqual(linkMatches('bridge', FOUND), [row('3.01', 'A map of 2 bridges'), { kind: 'page', target: 'page:on-the-bridge', label: 'On the bridge' }]);
  const all = { ...FOUND, keywords: [...FOUND.keywords, { id: 'bridges', label: 'Bridges' }] };
  assert.deepEqual(linkMatches('bridge', all).map((m) => m.kind), ['row', 'keyword', 'page']);
});

test('linkMatches: a keyword whose label reads as another keyword\'s id, or a folded id, is written by its own id, so that the link names it', () => {
  const keywords = [{ id: 'press', label: 'Newspapers' }, { id: 'papers', label: 'Press' }, { id: 'typeface', label: 'Typeface' }, { id: 'fraktur-2', label: 'Fraktur' }];
  const aliases = { fraktur: 'typeface' }; // folded into Typeface; a keyword Fraktur made since is fraktur-2 (cloud/ops.mjs)
  assert.deepEqual(linkMatches('press', { keywords }), [{ kind: 'keyword', target: 'papers', label: 'Press' }]);
  assert.deepEqual(linkMatches('news', { keywords }), [{ kind: 'keyword', target: 'Newspapers', label: 'Newspapers' }]);
  assert.deepEqual(linkMatches('fraktur', { keywords, aliases }), [{ kind: 'keyword', target: 'fraktur-2', label: 'Fraktur' }]);
  assert.deepEqual(linkMatches('typeface', { keywords, aliases }), [{ kind: 'keyword', target: 'Typeface', label: 'Typeface' }]);
});

test('linkMatches: at most eight; rows alone fill the eight, and take five when a keyword or a page is found too', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r${i + 1}`, no: `4.${String(i + 1).padStart(2, '0')}`, title: `Postcard ${i + 1}` }));
  assert.deepEqual(linkMatches('postcard', { rows }).map((m) => m.target), ['@r1', '@r2', '@r3', '@r4', '@r5', '@r6', '@r7', '@r8']);
  const found = linkMatches('postcard', { rows, keywords: [{ id: 'postcards', label: 'Postcards' }], pages: [{ address: 'postcards', title: 'Postcards' }] });
  assert.deepEqual(found.map((m) => m.target), ['@r1', '@r2', '@r3', '@r4', '@r5', 'Postcards', 'page:postcards']);
});

// On the 277 rows, "Semirurali" typed in full listed eight rows and never the keyword: with nothing
// more to type, 🔗 could not link it (Task 18 review, Important 2).
test('linkMatches: a keyword or a page named just what is typed comes first, whatever the rows that hold its name', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r${i + 1}`, no: `9.${String(i + 1).padStart(2, '0')}`, title: `Semirurali houses ${i + 1}` }));
  const keywords = [{ id: 'semirurali', label: 'Semirurali' }, { id: 'citta', label: 'Città nuova' }];
  const pages = [{ address: 'citta-nuova', title: 'Città nuova' }];
  const semirurali = { kind: 'keyword', target: 'Semirurali', label: 'Semirurali' };
  assert.deepEqual(linkMatches('semirurali', { rows, keywords }), [semirurali, ...['r1', 'r2', 'r3', 'r4', 'r5'].map((id, i) => row(id, `Semirurali houses ${i + 1}`))]);
  assert.deepEqual(linkMatches(' SÉMIRURALI ', { rows, keywords })[0], semirurali, 'case and accents aside');
  assert.deepEqual(linkMatches('semi', { rows, keywords }).map((m) => m.kind), ['row', 'row', 'row', 'row', 'row', 'keyword'], 'not named just so: after the rows');
  assert.deepEqual(linkMatches('citta  NUOVA', { rows, keywords, pages }), [
    { kind: 'keyword', target: 'Città nuova', label: 'Città nuova' },
    { kind: 'page', target: 'page:citta-nuova', label: 'Città nuova' },
  ]);
});

test('linkMatches: a keyword whose label holds [ ] or |, or reads as a row or a page, is written by its id', () => {
  const keywords = [{ id: 'radio', label: 'Press | radio' }, { id: 'eiar', label: 'EIAR [radio]' }, { id: 'at', label: '@home' }, { id: 'pg', label: 'page:one' }];
  for (const { id, label } of keywords) assert.deepEqual(linkMatches(label.replace(/[^\p{L}]+/gu, ' '), { keywords })[0], { kind: 'keyword', target: id, label }, label);
});

test('linkMatches: nothing typed, nothing found', () => {
  assert.deepEqual(linkMatches('', FOUND), []);
  assert.deepEqual(linkMatches('   ', FOUND), []);
  assert.deepEqual(linkMatches('2.0', {}), []);
});

test('insertLink: the words selected become the link\'s words, the caret after its ]]', () => {
  const text = 'See the bridge here.';
  const link = '[[the bridge|@1.09]]';
  assert.deepEqual(insertLink(text, 4, 14, '@1.09', 'Ponte Druso'), { value: `See ${link} here.`, caret: 4 + link.length });
});

test('insertLink: the spaces of a selection stay outside the brackets', () => {
  const link = '[[the bridge|@1.09]]';
  assert.deepEqual(insertLink('See the bridge here.', 3, 15, '@1.09', 'x'), { value: `See ${link} here.`, caret: 4 + link.length });
  assert.deepEqual(insertLink('One\n\n the bridge\n', 4, 17, '@1.09', 'x'), { value: `One\n\n ${link}\n`, caret: 6 + link.length }, 'line ends too');
});

test('insertLink: with nothing selected the words given are written where the caret is; a selection of spaces stays and the link follows it', () => {
  const link = '[[Ponte Druso|Ponte Druso]]';
  assert.deepEqual(insertLink('Over . Then', 5, 5, 'Ponte Druso', 'Ponte Druso'), { value: `Over ${link}. Then`, caret: 5 + link.length });
  assert.deepEqual(insertLink('', 0, 0, '@r3', 'Über die Brücke'), { value: '[[Über die Brücke|@r3]]', caret: 23 });
  assert.deepEqual(insertLink('a  b', 1, 3, 'page:x', 'X'), { value: 'a  [[X|page:x]]b', caret: 3 + '[[X|page:x]]'.length });
});

// What 🔗 writes is always one link that lib/links.mjs reads, to what was chosen (Task 18 review,
// Important 1). Row 15.14's real title holds [EIAR]: written as it is, its link was not one.
test('insertLink: with nothing selected, a name holding [ ] or | is written with ( ) and /; the target as it is', () => {
  const title = 'Radio italiana anno XVI [EIAR] (Istituto Luce documentary D032902)';
  assert.deepEqual(insertLink('See .', 4, 4, '@15.14', title), {
    value: 'See [[Radio italiana anno XVI (EIAR) (Istituto Luce documentary D032902)|@15.14]].',
    caret: 4 + '[[Radio italiana anno XVI (EIAR) (Istituto Luce documentary D032902)|@15.14]]'.length,
  });
  assert.equal(insertLink('', 0, 0, 'press-radio', 'Press | radio').value, '[[Press / radio|press-radio]]');
});

test('insertLink and linkable: a selection holding [ ] or |, crossing an empty line, or touching a link already typed is not linked', () => {
  const text = 'See [[the bridge|@1.09]] here.\n\nOne\n\nTwo [x] a|b';
  const at = (words) => [text.indexOf(words), text.indexOf(words) + words.length];
  const refused = [
    ['the bridge', 'inside a link'],
    ['bridge|@1.09', 'inside a link, its bar'],
    ['See [[the', 'across the start of a link'],
    ['@1.09]] here', 'across the end of a link'],
    ['See [[the bridge|@1.09]] here', 'around a link'],
    ['One\n\nTwo', 'across an empty line'],
    ['[x]', 'holding brackets'],
    ['a|b', 'holding a bar'],
  ];
  for (const [words, why] of refused) {
    assert.equal(linkable(text, ...at(words)), false, why);
    assert.equal(insertLink(text, ...at(words), '@2.08', 'x'), null, why);
  }
  const inside = text.indexOf('bridge');
  assert.equal(insertLink(text, inside, inside, '@2.08', 'x'), null, 'nothing selected, the caret inside a link');
  for (const words of ['See', 'See ', 'here', 'One', 'Two']) assert.equal(linkable(text, ...at(words)), true, words);
  const [, end] = at('[[the bridge|@1.09]]');
  assert.equal(insertLink(text, end, end, '@2.08', 'x').value, text.replace('@1.09]]', '@1.09]][[x|@2.08]]'), 'the caret just after a link: the link follows it');
  assert.equal(linksIn(insertLink(text, end, end, '@2.08', 'x').value).length, 2);
  assert.equal(insertLink('a\n \nb', 0, 5, '@2.08', 'x'), null, 'an empty line of spaces is an empty line');
  assert.equal(insertLink('one\ntwo', 0, 7, '@2.08', 'x').value, '[[one\ntwo|@2.08]]', 'one line end inside a paragraph stays');
});

// The round trip: each match linkMatches gives, written by insertLink with words selected and with
// none, read back by lib/links.mjs as exactly one link to what was chosen. This also ties the
// finder's reading of a keyword's name to the one links.mjs uses (ids, then folded ids, then labels).
test('insertLink round trip: rows, pages and keywords, a folded one and one with | in its label among them, are read back as one link to what was chosen', () => {
  const vocabulary = {
    'ponte-druso': { label: 'Ponte Druso' },
    press: { label: 'Newspapers' },
    papers: { label: 'Press' },
    typeface: { label: 'Typeface' },
    'fraktur-2': { label: 'Fraktur' },
    radio: { label: 'Press | radio' },
    eiar: { label: 'EIAR [radio]' },
    at: { label: '@home' },
  };
  const aliases = { fraktur: 'typeface' };
  const rows = [
    { id: '15.14', no: '7.02', title: 'Radio italiana anno XVI [EIAR] (Istituto Luce documentary D032902)' },
    { id: 'r3', no: '2.09', title: 'Über die Brücke | a postcard' },
  ];
  const pages = [{ address: 'on-the-bridge', title: 'On the bridge' }];
  const ctx = {
    keywords: vocabulary,
    aliases,
    rows: new Map(rows.map((r) => [r.id, { no: r.no, title: r.title, shown: true }])),
    pages: new Map(pages.map((p) => [p.address, { title: p.title, shown: true }])),
  };
  const found = { rows, pages, aliases, keywords: Object.entries(vocabulary).map(([id, { label }]) => ({ id, label })) };
  const chosen = [
    ...rows.map((r) => ({ query: r.no, kind: 'row', id: r.id })),
    ...pages.map((p) => ({ query: p.title, kind: 'page', id: p.address })),
    ...Object.entries(vocabulary).map(([id, { label }]) => ({ query: label.replace(/[^\p{L}]+/gu, ' '), kind: 'keyword', id })),
  ];
  const text = 'Before the words here.';
  for (const want of chosen) {
    const match = linkMatches(want.query, found).find((m) => m.kind === want.kind);
    assert.ok(match, `${want.query} finds no ${want.kind}`);
    for (const [start, end] of [[7, 16], [7, 7]]) {
      const { value } = insertLink(text, start, end, match.target, match.label);
      const links = linksIn(value);
      assert.equal(links.length, 1, `${value}: ${links.length} links read`);
      const read = targetOf(links[0].target, ctx);
      assert.deepEqual({ kind: read.kind, id: read.id }, { kind: want.kind, id: want.id }, value);
      assert.equal(value.slice(0, links[0].start) + value.slice(links[0].end), start === end ? text : 'Before  here.', `${value}: the text around the link`);
    }
  }
});

// In Markdown (About, the pages) one line end can end a paragraph: a heading, an item or a quote
// may start on the next line, and the link would be cut in two (Task 18 re-review). There a
// selection holding a line end is not linked; a row's text and the idea part only at empty lines.
test('linkable and insertLink in a Markdown field: a selection holding a line end is not linked; one on one line is', () => {
  const md = { markdown: true };
  for (const text of ['Intro words\n## A heading', 'One line\n- an item', 'A line\n> quoted']) {
    assert.equal(linkable(text, 0, text.length, md), false, text);
    assert.equal(insertLink(text, 0, text.length, '@2.08', 'x', md), null, text);
    assert.equal(linkable(text, 0, text.length), true, `${text}: a row's text and the idea keep one line end`);
  }
  const text = 'Intro words\n## A heading';
  const made = insertLink(text, 0, 12, '@2.08', 'x', md); // the line end selected too, outside the brackets
  assert.deepEqual(made, { value: '[[Intro words|@2.08]]\n## A heading', caret: 21 });
  const ctx = { keywords: {}, aliases: {}, rows: new Map([['2.08', { no: '2.08', title: 'Oltrisarco', shown: true }]]), pages: new Map(), here: 'other', up: '' };
  assert.match(renderMarkdown(made.value, { links: ctx }), /^<p><a href="index\.html#o=2\.08">Intro words<\/a><\/p>\s*<h2>A heading<\/h2>/, 'drawn as a link, the heading after it');
  assert.match(renderMarkdown('[[Intro words\n## A heading|@2.08]]', { links: ctx }), /<p>\[\[Intro words<\/p>/, 'what it would have written: two halves');
});
