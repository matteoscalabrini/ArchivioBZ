import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp, OpError } from '../cloud/ops.mjs';
import { checkDoc, numbering, diffDocs } from '../cloud/doc.mjs';
import { summaryOf } from '../cloud/render.mjs';
import { sampleDoc } from './docs.mjs';

const sample = () => sampleDoc({ c1: ['a', 'b', 'c', 'd'], c2: ['e', 'f'] });
const refused = (doc, op, message) => assert.throws(() => applyOp(doc, op), (e) => e instanceof OpError && (message === undefined || e.message === message));
const NUMBER_LINE = 'A number is a chapter and a place, as in 2.05.';

test('typing a number moves the row there and the rest move down', () => {
  const { doc } = applyOp(sample(), { op: 'set-number', id: 'e', number: '1.02' });
  assert.deepEqual(doc.chapters.map((c) => c.rows), [['a', 'e', 'b', 'c', 'd'], ['f']]);
  assert.deepEqual(checkDoc(doc), []);
});
// A phone whose region writes decimals with a comma (Italy) offers only a comma on its decimal
// keypad (I5, clean review): 2,05 is 2.05.
for (const [typed, rows] of [['1.2', ['a', 'f', 'b', 'c', 'd']], [' 01.02 ', ['a', 'f', 'b', 'c', 'd']], ['1.99', ['a', 'b', 'c', 'd', 'f']],
  ['1,02', ['a', 'f', 'b', 'c', 'd']], [' 1,2 ', ['a', 'f', 'b', 'c', 'd']]]) {
  test(`"${typed}" is understood`, () => assert.deepEqual(applyOp(sample(), { op: 'set-number', id: 'f', number: typed }).doc.chapters[0].rows, rows));
}
for (const typed of ['3', '1.00', '0.01', 'abc', '', '1,,02', '1.,02', '1,0,2']) {
  test(`"${typed}" is refused`, () => assert.throws(() => applyOp(sample(), { op: 'set-number', id: 'f', number: typed }), { message: NUMBER_LINE }));
}
test('a chapter that does not exist is refused by name', () =>
  assert.throws(() => applyOp(sample(), { op: 'set-number', id: 'f', number: '7.01' }), { message: 'There is no chapter 7.' }));
test('hidden rows are not counted when placing by number', () => {
  const doc = sample(); doc.rows.b.hidden = true;
  assert.deepEqual(applyOp(doc, { op: 'set-number', id: 'f', number: '1.02' }).doc.chapters[0].rows, ['a', 'b', 'f', 'c', 'd']);
});
// A typed number names a chapter as the page numbers it: one with no row shown has no number and
// is passed over; it is reached by dragging or by ＋ row here.
test('a typed chapter number counts only the chapters that have a number', () => {
  const doc = sampleDoc({ c1: ['a'], c2: ['b'], c3: ['c', 'd'] });
  doc.rows.b.hidden = true;
  assert.deepEqual(applyOp(doc, { op: 'set-number', id: 'a', number: '2.02' }).doc.chapters.map((c) => c.rows), [[], ['b'], ['c', 'a', 'd']]);
  refused(doc, { op: 'set-number', id: 'a', number: '3.01' }, 'There is no chapter 3.');
  const after = applyOp(doc, { op: 'set-number', id: 'a', number: '2.01' }).doc;
  assert.deepEqual(Object.fromEntries(numbering(after)), { a: '1.01', b: '', c: '1.02', d: '1.03' }, 'its old chapter emptied, the row is in chapter 1 now');
});
test('a row can be given a place later in its own chapter', () =>
  assert.deepEqual(applyOp(sample(), { op: 'set-number', id: 'a', number: '1.03' }).doc.chapters[0].rows, ['b', 'c', 'a', 'd']));

test('the input is never changed', () => {
  const doc = sample(); const copy = structuredClone(doc);
  applyOp(doc, { op: 'remove-row', id: 'a' });
  assert.deepEqual(doc, copy);
});
test('add-row gives r1, then r2', () => {
  const one = applyOp(sample(), { op: 'add-row', chapter: 'c2', index: 0, title: 'T', type: 'Poster' });
  const two = applyOp(one.doc, { op: 'add-row', chapter: 'c2', index: 0, title: 'U', type: 'Poster' });
  assert.deepEqual([one.result.id, two.result.id, two.doc.chapters[1].rows.slice(0, 2)], ['r1', 'r2', ['r2', 'r1']]);
  assert.deepEqual(two.doc.rows.r1, {
    hidden: false,
    record: { title: 'T', type: 'Poster', date: '', year: null, keywords: [], text: [] },
    find: { on: [], shows: [], colours: [], names: [] },
    pictures: [],
    thumb: null,
  });
  assert.equal(two.doc.next.row, 3);
  assert.deepEqual(checkDoc(two.doc), []);
});
test('add-row refuses an empty title and an unknown type, and clamps the index', () => {
  refused(sample(), { op: 'add-row', chapter: 'c2', index: 0, title: '  ', type: 'Poster' });
  refused(sample(), { op: 'add-row', chapter: 'c2', index: 0, title: 'T', type: 'Nonsense' });
  refused(sample(), { op: 'add-row', chapter: 'c9', index: 0, title: 'T', type: 'Poster' });
  assert.deepEqual(applyOp(sample(), { op: 'add-row', chapter: 'c2', index: 99, title: 'T', type: 'Poster' }).doc.chapters[1].rows, ['e', 'f', 'r1']);
});

test('move-row takes the row out and puts it at the index, clamped', () => {
  assert.deepEqual(applyOp(sample(), { op: 'move-row', id: 'a', chapter: 'c2', index: 1 }).doc.chapters.map((c) => c.rows), [['b', 'c', 'd'], ['e', 'a', 'f']]);
  assert.deepEqual(applyOp(sample(), { op: 'move-row', id: 'a', chapter: 'c1', index: 99 }).doc.chapters[0].rows, ['b', 'c', 'd', 'a']);
  assert.deepEqual(applyOp(sample(), { op: 'move-row', id: 'd', chapter: 'c1', index: -3 }).doc.chapters[0].rows, ['d', 'a', 'b', 'c']);
  refused(sample(), { op: 'move-row', id: 'zz', chapter: 'c1', index: 0 });
  refused(sample(), { op: 'move-row', id: 'a', chapter: 'c9', index: 0 });
});
test('hide-row sets hidden and the number goes', () => {
  const { doc } = applyOp(sample(), { op: 'hide-row', id: 'a', hidden: true });
  assert.equal(doc.rows.a.hidden, true);
  assert.equal(applyOp(doc, { op: 'hide-row', id: 'a', hidden: false }).doc.rows.a.hidden, false);
  refused(sample(), { op: 'hide-row', id: 'zz', hidden: true });
});
test('remove-row deletes the row and its place', () => {
  const { doc } = applyOp(sample(), { op: 'remove-row', id: 'b' });
  assert.deepEqual(doc.chapters[0].rows, ['a', 'c', 'd']);
  assert.equal('b' in doc.rows, false);
  refused(sample(), { op: 'remove-row', id: 'zz' });
});

test('add-chapter makes c3 at the index; rename and move work', () => {
  const one = applyOp(sample(), { op: 'add-chapter', index: 1, title: 'New' });
  assert.deepEqual(one.result, { id: 'c3' });
  assert.deepEqual(one.doc.chapters.map((c) => c.id), ['c1', 'c3', 'c2']);
  assert.equal(one.doc.next.chapter, 4);
  const renamed = applyOp(one.doc, { op: 'rename-chapter', chapter: 'c3', title: 'Other' });
  assert.equal(renamed.doc.chapters[1].title, 'Other');
  assert.deepEqual(applyOp(renamed.doc, { op: 'move-chapter', chapter: 'c3', index: 99 }).doc.chapters.map((c) => c.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(applyOp(renamed.doc, { op: 'move-chapter', chapter: 'c2', index: 0 }).doc.chapters.map((c) => c.id), ['c2', 'c1', 'c3']);
  refused(sample(), { op: 'add-chapter', index: 0, title: ' ' });
  refused(sample(), { op: 'rename-chapter', chapter: 'c1', title: '' });
  refused(sample(), { op: 'rename-chapter', chapter: 'c9', title: 'x' });
  refused(sample(), { op: 'move-chapter', chapter: 'c9', index: 0 });
});
test('a chapter with rows, hidden or not, cannot be removed', () => {
  const doc = sample(); doc.rows.e.hidden = true; doc.rows.f.hidden = true;
  assert.throws(() => applyOp(doc, { op: 'remove-chapter', chapter: 'c2' }), { message: 'Only an empty chapter can be removed.' });
});
test('an empty chapter can be removed', () => {
  const { doc } = applyOp(sampleDoc({ c1: ['a'], c2: [] }), { op: 'remove-chapter', chapter: 'c2' });
  assert.deepEqual(doc.chapters.map((c) => c.id), ['c1']);
});

test('set-row merges fields and drops empty optional ones', () => {
  const one = applyOp(sample(), { op: 'set-row', id: 'a', fields: { title: ' New ', date: '1938', year: 1938, holder: 'Archive', place: 'piazza', side_by_side: true } }).doc;
  assert.deepEqual([one.rows.a.record.title, one.rows.a.record.date, one.rows.a.record.year, one.rows.a.record.holder, one.rows.a.record.place, one.rows.a.record.side_by_side], ['New', '1938', 1938, 'Archive', 'piazza', true]);
  const two = applyOp(one, { op: 'set-row', id: 'a', fields: { date: '', year: null, holder: '', place: null } }).doc.rows.a.record;
  for (const field of ['date', 'year', 'holder', 'place']) assert.equal(field in two, false, field);
  assert.equal(two.title, 'New');
});
test('set-row text drops empty paragraphs and keeps text, keywords as arrays', () => {
  const record = applyOp(sample(), { op: 'set-row', id: 'a', fields: { text: ['One', '  ', 'Two'] } }).doc.rows.a.record;
  assert.deepEqual(record.text, ['One', 'Two']);
  const empty = applyOp(sample(), { op: 'set-row', id: 'a', fields: { text: [], keywords: [] } }).doc.rows.a.record;
  assert.deepEqual([empty.text, empty.keywords], [[], []]);
});
test('set-row refuses an empty title, an unknown field and an unknown type', () => {
  refused(sample(), { op: 'set-row', id: 'a', fields: { title: '  ' } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { type: null } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { colour: 'red' } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { type: 'Nonsense' } });
  refused(sample(), { op: 'set-row', id: 'zz', fields: { title: 'x' } });
  assert.equal(applyOp(sample(), { op: 'set-row', id: 'a', fields: { type: 'Poster' } }).doc.rows.a.record.type, 'Poster');
});
test('set-row checks year, place, confidence, source, side_by_side and strings', () => {
  refused(sample(), { op: 'set-row', id: 'a', fields: { year: 1938.5 } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { year: '1938' } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { place: 'nowhere' } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { confidence: { level: 'sure' } } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { side_by_side: 'yes' } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { holder: 5 } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { source: { label: 5 } } });
  const record = applyOp(sample(), { op: 'set-row', id: 'a', fields: { confidence: { level: 'read', note: 'seen' }, source: { label: 'L', url: 'https://x.org' }, creator: 'C', rights: 'R' } }).doc.rows.a.record;
  assert.deepEqual([record.confidence, record.source, record.creator, record.rights], [{ level: 'read', note: 'seen' }, { label: 'L', url: 'https://x.org' }, 'C', 'R']);
});
// Minor 9 (clean review): a year far out of range is a slip of the keys, a date is stored trimmed,
// and a Source address that is not a web address would be stored and shown as words that link
// nowhere, so it is refused with a sentence.
test('set-row: the year within 1000 to 2100, the words trimmed, a Source address on the web', () => {
  const YEAR = 'The year must be a whole number between 1000 and 2100.';
  for (const year of [1.939e22, 19340, 999, 2101, -50]) refused(sample(), { op: 'set-row', id: 'a', fields: { year } }, YEAR);
  for (const year of [1000, 1858, 2026, 2100]) assert.equal(applyOp(sample(), { op: 'set-row', id: 'a', fields: { year } }).doc.rows.a.record.year, year);
  const trimmed = applyOp(sample(), { op: 'set-row', id: 'a', fields: { date: ' 1931–34 ', holder: ' Archive ', creator: '\tC ', rights: ' R' } }).doc.rows.a.record;
  assert.deepEqual([trimmed.date, trimmed.holder, trimmed.creator, trimmed.rights], ['1931–34', 'Archive', 'C', 'R']);
  assert.ok(!Object.hasOwn(applyOp(sample(), { op: 'set-row', id: 'a', fields: { holder: '   ' } }).doc.rows.a.record, 'holder'), 'spaces alone are nothing');
  const ADDRESS = 'The address of a source starts with http:// or https://.';
  for (const url of ['www.example.org', 'javascript:alert(1)', 'ftp://x.org', 'example.org/https://']) {
    refused(sample(), { op: 'set-row', id: 'a', fields: { source: { label: 'L', url } } }, ADDRESS);
  }
  const source = (value) => applyOp(sample(), { op: 'set-row', id: 'a', fields: { source: value } }).doc.rows.a.record.source;
  assert.deepEqual(source({ label: ' L ', url: ' HTTPS://x.org/a ' }), { label: 'L', url: 'HTTPS://x.org/a' });
  assert.deepEqual(source({ label: 'Words only', url: '' }), { label: 'Words only' });
  assert.deepEqual(source({ label: '', url: 'http://x.org' }), { url: 'http://x.org' });
});

test('a sixth keyword is refused, a folded one resolved', () => {
  const doc = sample();
  for (const id of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']) doc.keywords[id] = { label: id };
  const five = applyOp(doc, { op: 'set-row', id: 'a', fields: { keywords: ['k1', 'k2', 'k3', 'k4', 'k5'] } }).doc;
  assert.deepEqual(five.rows.a.record.keywords, ['k1', 'k2', 'k3', 'k4', 'k5']);
  refused(doc, { op: 'set-row', id: 'a', fields: { keywords: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'] } });
  assert.deepEqual(applyOp(sample(), { op: 'set-row', id: 'a', fields: { keywords: ['walls', 'march'] } }).doc.rows.a.record.keywords, ['wall', 'march']);
  refused(sample(), { op: 'set-row', id: 'a', fields: { keywords: ['wall', 'walls'] } });
  refused(sample(), { op: 'set-row', id: 'a', fields: { keywords: ['unknown'] } });
});

test('add-keyword: "Città nuova" → "citta-nuova", again → existed', () => {
  const one = applyOp(sample(), { op: 'add-keyword', label: 'Città nuova' });
  assert.deepEqual(one.result, { id: 'citta-nuova', existed: false });
  assert.deepEqual(one.doc.keywords['citta-nuova'], { label: 'Città nuova' });
  const again = applyOp(one.doc, { op: 'add-keyword', label: '  città   NUOVA ' });
  assert.deepEqual(again.result, { id: 'citta-nuova', existed: true });
  assert.deepEqual(again.doc.keywords, one.doc.keywords);
});
test('add-keyword numbers a taken id, an alias counting as taken, and refuses no letters', () => {
  const doc = sample(); doc.keywords['a-b'] = { label: 'Other' };
  assert.equal(applyOp(doc, { op: 'add-keyword', label: 'A / B' }).result.id, 'a-b-2');
  assert.deepEqual(applyOp(sample(), { op: 'add-keyword', label: 'Walls' }).result, { id: 'walls-2', existed: false });
  assert.equal(applyOp(sample(), { op: 'add-keyword', label: '--X!!' }).result.id, 'x');
  refused(sample(), { op: 'add-keyword', label: ' ' });
  refused(sample(), { op: 'add-keyword', label: '!!!' });
});
// JavaScript puts a key that is a whole number before every other key of an object, so such an id
// would leave its place in the vocabulary's order.
test('add-keyword gives a label of digits an id that is not a number, and keeps it last', () => {
  const { doc, result } = applyOp(sample(), { op: 'add-keyword', label: '1939' });
  assert.deepEqual(result, { id: 'k-1939', existed: false });
  assert.deepEqual(Object.keys(doc.keywords), ['wall', 'poster', 'march', 'k-1939']);
  assert.equal(applyOp(sample(), { op: 'add-keyword', label: '1939 – 1943' }).result.id, '1939-1943');
});

// The order of "All keywords" is the author's (design §7): a keyword dragged in the strip goes just
// before the keyword it was let go in front of, or last; the vocabulary's order is the strip's.
test('move-keyword puts a keyword just before another, or last, and leaves the labels as they were', () => {
  const doc = sample(); // wall, poster, march
  const order = (op) => Object.keys(applyOp(doc, { op: 'move-keyword', ...op }).doc.keywords);
  assert.deepEqual(order({ id: 'march', before: 'wall' }), ['march', 'wall', 'poster']);
  assert.deepEqual(order({ id: 'wall', before: 'march' }), ['poster', 'wall', 'march']);
  assert.deepEqual(order({ id: 'wall', before: null }), ['poster', 'march', 'wall']);
  assert.deepEqual(order({ id: 'march', before: null }), ['wall', 'poster', 'march'], 'last already');
  assert.deepEqual(order({ id: 'wall', before: 'poster' }), ['wall', 'poster', 'march'], 'in front of it already');
  assert.deepEqual(order({ id: 'poster', before: 'poster' }), ['wall', 'poster', 'march'], 'before itself: nothing changes');
  const { doc: moved } = applyOp(doc, { op: 'move-keyword', id: 'march', before: 'wall' });
  assert.deepEqual(moved.keywords, doc.keywords, 'the same keywords and labels');
  assert.deepEqual(moved.aliases, doc.aliases);
  assert.deepEqual(checkDoc(moved), []);
  refused(doc, { op: 'move-keyword', id: 'nothing', before: 'wall' }, 'There is no keyword nothing.');
  refused(doc, { op: 'move-keyword', id: 'wall', before: 'nothing' }, 'There is no keyword nothing.');
});

// diffDocs compares objects whatever the order of their keys, so the order of the keywords is
// compared on its own: a publish carries it to the public strip.
test('keywords in another order are a change: the summary says keywords changed', () => {
  const doc = sample();
  const { doc: moved } = applyOp(doc, { op: 'move-keyword', id: 'march', before: 'wall' });
  const diff = diffDocs(doc, moved);
  assert.equal(diff.keywords, true);
  assert.equal(diff.count, 1);
  assert.equal(summaryOf(doc, moved), 'keywords changed');
  assert.equal(diffDocs(doc, applyOp(moved, { op: 'move-keyword', id: 'march', before: null }).doc).keywords, false, 'moved back');
});

test('set-pictures keeps the named pictures in the given order and refuses a stranger', () => {
  const doc = sample();
  doc.rows.a.pictures = [{ src: '/p/1.jpg', w: 1, h: 2, caption: 'one' }, { src: '/p/2.jpg', w: 3, h: 4, caption: 'two' }, { src: '/p/3.jpg', w: 5, h: 6, caption: '' }];
  const { doc: out } = applyOp(doc, { op: 'set-pictures', id: 'a', pictures: [{ src: '/p/3.jpg', caption: 'three' }, { src: '/p/1.jpg', caption: 'uno' }] });
  assert.deepEqual(out.rows.a.pictures, [{ src: '/p/3.jpg', w: 5, h: 6, caption: 'three' }, { src: '/p/1.jpg', w: 1, h: 2, caption: 'uno' }]);
  refused(doc, { op: 'set-pictures', id: 'a', pictures: [{ src: '/p/9.jpg', caption: '' }] });
  refused(doc, { op: 'set-pictures', id: 'a', pictures: [{ src: '/p/1.jpg', caption: '' }, { src: '/p/1.jpg', caption: '' }] });
});

// Edit mode sends what the author meant, one keyword or one picture, so that two clicks made
// before the first is answered each apply to the row as the one before left it.
test('give-keyword and remove-keyword change one keyword of the row as it stands', () => {
  let { doc } = applyOp(sample(), { op: 'give-keyword', id: 'a', keyword: 'wall' });
  ({ doc } = applyOp(doc, { op: 'give-keyword', id: 'a', keyword: 'march' }));
  ({ doc } = applyOp(doc, { op: 'give-keyword', id: 'a', keyword: 'poster' }));
  assert.deepEqual(doc.rows.a.record.keywords, ['wall', 'march', 'poster']);
  assert.deepEqual(applyOp(doc, { op: 'give-keyword', id: 'a', keyword: 'walls' }).doc.rows.a.record.keywords, ['wall', 'march', 'poster'], 'a folded id is its target, held already');
  // Two removals, each from the list the one before left: both go.
  const one = applyOp(doc, { op: 'remove-keyword', id: 'a', keyword: 'wall' }).doc;
  const two = applyOp(one, { op: 'remove-keyword', id: 'a', keyword: 'march' }).doc;
  assert.deepEqual(two.rows.a.record.keywords, ['poster']);
  assert.deepEqual(applyOp(two, { op: 'remove-keyword', id: 'a', keyword: 'wall' }).doc.rows.a.record.keywords, ['poster'], 'removed twice is removed once');
  refused(doc, { op: 'give-keyword', id: 'a', keyword: 'nothing' }, '"nothing" is not a keyword.');
  const full = sample();
  full.keywords = { k1: { label: '1' }, k2: { label: '2' }, k3: { label: '3' }, k4: { label: '4' }, k5: { label: '5' }, k6: { label: '6' } };
  full.aliases = {};
  full.rows.a.record.keywords = ['k1', 'k2', 'k3', 'k4', 'k5'];
  refused(full, { op: 'give-keyword', id: 'a', keyword: 'k6' }, 'A row has at most 5 keywords.');
  refused(sample(), { op: 'remove-keyword', id: 'a', keyword: ['wall'] });
});

test('remove-picture, move-picture and set-caption change one picture, named by its source', () => {
  const doc = sample();
  doc.rows.a.pictures = [{ src: '/p/1.jpg', w: 1, h: 2, caption: 'one' }, { src: '/p/2.jpg', w: 3, h: 4, caption: 'two' }, { src: '/p/3.jpg', w: 5, h: 6, caption: '' }];
  const srcs = (d) => d.rows.a.pictures.map((p) => p.src);
  let out = applyOp(doc, { op: 'remove-picture', id: 'a', src: '/p/1.jpg' }).doc;
  out = applyOp(out, { op: 'remove-picture', id: 'a', src: '/p/2.jpg' }).doc;
  assert.deepEqual(out.rows.a.pictures, [{ src: '/p/3.jpg', w: 5, h: 6, caption: '' }]);
  assert.deepEqual(srcs(applyOp(out, { op: 'remove-picture', id: 'a', src: '/p/1.jpg' }).doc), ['/p/3.jpg'], 'removed twice is removed once');
  // → twice on the first picture moves it two places; at the end it stays.
  out = applyOp(doc, { op: 'move-picture', id: 'a', src: '/p/1.jpg', step: 1 }).doc;
  out = applyOp(out, { op: 'move-picture', id: 'a', src: '/p/1.jpg', step: 1 }).doc;
  assert.deepEqual(srcs(out), ['/p/2.jpg', '/p/3.jpg', '/p/1.jpg']);
  assert.deepEqual(srcs(applyOp(out, { op: 'move-picture', id: 'a', src: '/p/1.jpg', step: 1 }).doc), ['/p/2.jpg', '/p/3.jpg', '/p/1.jpg']);
  assert.deepEqual(srcs(applyOp(out, { op: 'move-picture', id: 'a', src: '/p/2.jpg', step: -1 }).doc), ['/p/2.jpg', '/p/3.jpg', '/p/1.jpg']);
  assert.deepEqual(srcs(applyOp(out, { op: 'move-picture', id: 'a', src: '/p/1.jpg', step: -1 }).doc), ['/p/2.jpg', '/p/1.jpg', '/p/3.jpg']);
  const captioned = applyOp(doc, { op: 'set-caption', id: 'a', src: '/p/2.jpg', caption: 'Deux' }).doc;
  assert.deepEqual(captioned.rows.a.pictures[1], { src: '/p/2.jpg', w: 3, h: 4, caption: 'Deux' });
  refused(doc, { op: 'move-picture', id: 'a', src: '/p/9.jpg', step: 1 }, 'Row a has no picture /p/9.jpg.');
  refused(doc, { op: 'move-picture', id: 'a', src: '/p/1.jpg', step: 2 });
  refused(doc, { op: 'set-caption', id: 'a', src: '/p/9.jpg', caption: 'x' }, 'Row a has no picture /p/9.jpg.');
  refused(doc, { op: 'set-caption', id: 'a', src: '/p/1.jpg', caption: 3 });
  refused(doc, { op: 'remove-picture', id: 'a', src: 7 });
});

// ＋ picture (design §6): a picture made in the cloud is 1600 px with a small one of 220 px, the
// map's picture for the row while it is first. A session may add a picture without a small one.
const ADDED = {
  src: 'https://p.public.blob.vercel-storage.com/pictures/a-mf3k2a-R4nd.jpg',
  w: 1600,
  h: 1067,
  small: { src: 'https://p.public.blob.vercel-storage.com/pictures/a-mf3k2a-small-S7mL.jpg', w: 220, h: 147 },
};
const MOVED_IN = { src: 'https://p.public.blob.vercel-storage.com/pictures/18.04-1-Old.jpg', w: 1600, h: 1200, caption: 'one' };

test('add-picture puts the picture last in the row, with its small one, or without for a session', () => {
  const doc = sample();
  doc.rows.a.pictures = [MOVED_IN];
  const { doc: out, result } = applyOp(doc, { op: 'add-picture', id: 'a', picture: ADDED });
  assert.deepEqual(out.rows.a.pictures, [MOVED_IN, ADDED]);
  assert.deepEqual(result, {});
  assert.deepEqual(checkDoc(out), []);
  const plain = applyOp(sample(), { op: 'add-picture', id: 'b', picture: { src: '/dev-img/b-1.jpg', w: 4, h: 3 } }).doc;
  assert.deepEqual(plain.rows.b.pictures, [{ src: '/dev-img/b-1.jpg', w: 4, h: 3 }]);
  const extra = applyOp(sample(), { op: 'add-picture', id: 'b', picture: { ...ADDED, caption: 'x', original: '/elsewhere', small: { ...ADDED.small, more: 1 } } }).doc;
  assert.deepEqual(extra.rows.b.pictures, [ADDED], 'only the source, the size and the small one are kept');
  assert.deepEqual(diffDocs(doc, out).changed, ['a'], 'a picture added is a row changed');
});

test('add-picture refuses a row that does not exist, a source that is not an address, a size that is not one, and a picture the row has', () => {
  refused(sample(), { op: 'add-picture', id: 'z', picture: ADDED }, 'There is no row z.');
  for (const src of [undefined, null, 7, '', 'img/x.jpg', 'http://p.test/x.jpg', 'javascript:alert(1)', 'data:image/jpeg;base64,AA', '//elsewhere.test/x.jpg', ' https://p.test/x.jpg']) {
    refused(sample(), { op: 'add-picture', id: 'a', picture: { ...ADDED, src } }, undefined);
    refused(sample(), { op: 'add-picture', id: 'a', picture: { ...ADDED, small: { ...ADDED.small, src } } }, undefined);
  }
  for (const [w, h] of [[0, 3], [4, 0], [-4, 3], [1.5, 3], ['4', 3], [4, null], [4, undefined], [NaN, 3], [Infinity, 3]]) {
    refused(sample(), { op: 'add-picture', id: 'a', picture: { ...ADDED, w, h } }, undefined);
    refused(sample(), { op: 'add-picture', id: 'a', picture: { ...ADDED, small: { ...ADDED.small, w, h } } }, undefined);
  }
  for (const picture of [null, 'x.jpg', [ADDED], undefined]) refused(sample(), { op: 'add-picture', id: 'a', picture }, undefined);
  for (const small of [null, 'x.jpg', [ADDED.small]]) refused(sample(), { op: 'add-picture', id: 'a', picture: { ...ADDED, small } }, undefined);
  const held = applyOp(sample(), { op: 'add-picture', id: 'a', picture: ADDED }).doc;
  refused(held, { op: 'add-picture', id: 'a', picture: ADDED }, 'Row a already has that picture.');
  refused(held, { op: 'add-picture', id: 'a', picture: { src: ADDED.src, w: 1, h: 1 } }, 'Row a already has that picture.');
  assert.equal(applyOp(held, { op: 'add-picture', id: 'b', picture: ADDED }).doc.rows.b.pictures.length, 1, 'another row may hold it');
});

// The thumb rule: whenever the first picture of a row changes, its thumb is the new first picture's
// small one, or null for a picture that has none (the moved-in ones), which the map then draws from
// the picture itself (mapPicture in doc.mjs).
test('the thumb follows the first picture: its small one, or null', () => {
  const first = applyOp(sample(), { op: 'add-picture', id: 'a', picture: ADDED }).doc;
  assert.deepEqual(first.rows.a.thumb, ADDED.small, 'a row with no picture: the new one sets the thumb');

  const doc = sample();
  doc.rows.a.pictures = [MOVED_IN];
  doc.rows.a.thumb = { src: 'https://p.public.blob.vercel-storage.com/pictures/t-18.04-Old.jpg', w: 220, h: 165 };
  let out = applyOp(doc, { op: 'add-picture', id: 'a', picture: ADDED }).doc;
  assert.deepEqual(out.rows.a.thumb, doc.rows.a.thumb, 'added second, the first and its thumb stay');
  out = applyOp(out, { op: 'move-picture', id: 'a', src: ADDED.src, step: -1 }).doc;
  assert.deepEqual(out.rows.a.thumb, ADDED.small, 'its second picture moved first: the thumb follows');
  assert.notEqual(out.rows.a.thumb, out.rows.a.pictures[0].small, 'a copy, not the same object');
  const back = applyOp(out, { op: 'move-picture', id: 'a', src: MOVED_IN.src, step: -1 }).doc;
  assert.equal(back.rows.a.thumb, null, 'a moved-in picture moved first: null');
  assert.deepEqual(applyOp(back, { op: 'remove-picture', id: 'a', src: MOVED_IN.src }).doc.rows.a.thumb, ADDED.small, 'the first removed: the next one\'s small');
  assert.deepEqual(applyOp(back, { op: 'set-pictures', id: 'a', pictures: [{ src: ADDED.src, caption: '' }, { src: MOVED_IN.src, caption: 'one' }] }).doc.rows.a.thumb, ADDED.small);
  assert.equal(applyOp(out, { op: 'remove-picture', id: 'a', src: ADDED.src }).doc.rows.a.thumb, null);
  const none = applyOp(first, { op: 'remove-picture', id: 'a', src: ADDED.src }).doc;
  assert.equal(none.rows.a.thumb, null, 'no picture left: no thumb');
  assert.deepEqual(applyOp(out, { op: 'set-caption', id: 'a', src: ADDED.src, caption: 'New' }).doc.rows.a.thumb, ADDED.small, 'a caption changes nothing of it');
});

test('set-idea refuses an unknown marked keyword, accepts a known one', () => {
  assert.equal(applyOp(sample(), { op: 'set-idea', text: 'A [[wall]] and [[Walls]].' }).doc.idea, 'A [[wall]] and [[Walls]].');
  refused(sample(), { op: 'set-idea', text: 'A [[nothing]] here.' });
});
// The design (§5): the stand-in flag goes when the author first saves an idea of their own.
test('set-idea drops the stand-in line, and says what it stored', () => {
  const { doc, result } = applyOp(sample(), { op: 'set-idea', text: 'status: stand-in\n\nMy own idea, about a [[wall]].' });
  assert.equal(doc.idea, 'My own idea, about a [[wall]].');
  assert.deepEqual(result, { text: 'My own idea, about a [[wall]].' });
  assert.equal(applyOp(sample(), { op: 'set-idea', text: 'Status: Stand-in  \r\nOne line.' }).doc.idea, 'One line.');
  assert.equal(applyOp(sample(), { op: 'set-idea', text: 'A line.\nstatus: stand-in' }).doc.idea, 'A line.\nstatus: stand-in', 'only a first line is the flag');
});
test('set-about stores the text', () => assert.equal(applyOp(sample(), { op: 'set-about', text: 'Hello' }).doc.about, 'Hello'));

// A NUL, or half of a surrogate pair (half an emoji, from a broken paste), cannot reach a page as
// typed: the operation is refused with a sentence and nothing changes.
test('text holding a NUL or half an emoji is refused with a sentence; a whole emoji is text', () => {
  const line = 'The text holds a character that cannot be saved: an invisible NUL or half of an emoji. Type that part again.';
  refused(sample(), { op: 'set-row', id: 'a', fields: { title: 'a\u0000b' } }, line);
  refused(sample(), { op: 'set-row', id: 'a', fields: { text: ['fine', 'x\uD83D'] } }, line);
  refused(sample(), { op: 'set-about', text: '\uDE00 alone' }, line);
  refused(sample(), { op: 'add-keyword', label: 'Nul\u0000' }, line);
  assert.equal(applyOp(sample(), { op: 'set-row', id: 'a', fields: { title: 'A 😀 title' } }).doc.rows.a.record.title, 'A 😀 title');
});

test('an unknown operation is refused', () => refused(sample(), { op: 'explode' }));

test('malformed requests are refused as OpError and change nothing', () => {
  const bad = [
    { op: 'set-row', fields: { title: 'x' } },
    { op: 'set-row', id: ['a'], fields: { title: 'x' } },
    { op: 'set-row', id: '__proto__', fields: { title: 'x' } },
    { op: 'set-row', id: 'constructor', fields: { title: 'x' } },
    { op: 'set-row', id: 'a', fields: 'title' },
    { op: 'set-row', id: 'a', fields: null },
    { op: 'set-row', id: 'a', fields: JSON.parse('{"__proto__": "x"}') },
    { op: 'set-row', id: 'a', fields: { constructor: 'x' } },
    { op: 'set-row', id: 'a', fields: { place: ['piazza'] } },
    { op: 'set-row', id: 'a', fields: { keywords: [['wall']] } },
    { op: 'set-row', id: 'a', fields: { keywords: ['constructor'] } },
    { op: 'set-pictures', id: 'a', pictures: [null] },
    { op: 'set-pictures', id: 'a', pictures: ['x'] },
    { op: 'set-pictures', id: 'a', pictures: 'x' },
    { op: 'remove-row', id: ['a'] },
    { op: 'move-row', id: ['a'], chapter: 'c1', index: 0 },
    { op: 'move-row', id: 'a', chapter: ['c1'], index: 0 },
    { op: 'set-number', id: ['f'], number: '1.01' },
    { op: 'hide-row', id: ['a'], hidden: true },
    { op: 'remove-chapter', chapter: ['c2'] },
    { op: 'move-keyword', id: ['wall'], before: null },
    { op: 'move-keyword', id: 'constructor', before: null },
    { op: 'move-keyword', id: 'wall', before: '__proto__' },
    { op: 'move-keyword', id: 'wall' },
    { op: 'move-keyword', id: 'walls', before: null },
    { op: 'add-picture', id: ['a'], picture: { src: '/p/1.jpg', w: 1, h: 1 } },
    { op: 'add-picture', id: 'constructor', picture: { src: '/p/1.jpg', w: 1, h: 1 } },
    { op: 'add-picture', id: 'a', picture: JSON.parse('{"__proto__": {"src": "/p/1.jpg"}, "w": 1, "h": 1}') },
    { op: '__proto__' },
    { op: ['set-about'], text: 'x' },
    { op: 'constructor' },
    null,
    'set-about',
  ];
  for (const op of bad) {
    const doc = sample();
    const copy = structuredClone(doc);
    assert.throws(() => applyOp(doc, op), (e) => e instanceof OpError, JSON.stringify(op));
    assert.deepEqual(doc, copy);
  }
});
