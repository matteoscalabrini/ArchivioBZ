import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropTarget, chapterIndex, toParagraphs, fromParagraphs, OpQueue, changesIn, publishQuestion, mergeFields } from '../web/editmodel.js';
import { applyOp } from '../cloud/ops.mjs';
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
  assert.equal(changesIn(summaryLine(diffDocs(null, before))), diffDocs(null, before).count);
  assert.equal(changesIn('No changes since the last publish'), 0);
});

test('the question before a publish', () => {
  assert.equal(publishQuestion(9), 'Publish 9 changes?');
  assert.equal(publishQuestion(1), 'Publish 1 change?');
  assert.equal(publishQuestion(0), 'Publish again? Nothing has changed since the last publish.');
});

// The page keeps the records it edits; after a saved set-row it must hold what the server stored.
test('fields merged into a record as the server stores them', () => {
  const cases = [
    { title: '  A title with room  ' },
    { date: '1930s', year: 1934 },
    { date: '', year: null },
    { holder: 'Archivio', creator: '', rights: 'CC BY 4.0' },
    { text: ['One', '', '  ', 'Two'] },
    { keywords: ['wall', 'march'] },
    { confidence: { level: 'read', note: '' } },
    { confidence: { level: 'lead', note: 'Photographer unclear' } },
    { confidence: null },
    { source: { label: 'Teßmann', url: '' } },
    { source: { label: '', url: '' } },
    { source: { label: 'A paper', url: 'https://example.org/a' } },
    { place: 'piazza' },
    { place: '' },
    { side_by_side: true },
    { side_by_side: false },
    { type: 'Postcard' },
  ];
  let doc = sampleDoc({ c1: ['a'] });
  doc.rows.a.record = { ...doc.rows.a.record, holder: 'Old', creator: 'Someone', confidence: { level: 'secondary' }, source: { label: 'Old' }, place: 'piazza' };
  let local = structuredClone(doc.rows.a.record);
  for (const fields of cases) {
    doc = applyOp(doc, { op: 'set-row', id: 'a', fields }).doc;
    local = mergeFields(local, fields);
    assert.deepEqual(local, doc.rows.a.record, JSON.stringify(fields));
  }
});

test('merging leaves the record it is given as it was', () => {
  const record = { title: 'T', type: 'Poster', holder: 'H', keywords: [], text: [] };
  const copy = structuredClone(record);
  mergeFields(record, { holder: '', title: 'U' });
  assert.deepEqual(record, copy);
});
