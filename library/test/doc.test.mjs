import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary } from '../lib/records.mjs';
import { locatePlaces } from '../lib/places.mjs';
import { docFromLibrary, numbering, libFromDoc, diffDocs, checkDoc } from '../cloud/doc.mjs';
import { cleanRoot } from './helpers.mjs';
import { sampleDoc, sampleWith } from './docs.mjs';

const sample = () => sampleDoc();

test('moving in keeps every row, in order, under its section', async () => {
  const root = await cleanRoot();
  const lib = await loadLibrary(root);
  await locatePlaces(lib);
  const doc = docFromLibrary(lib, { root, chapterTitles: { 0: 'Zero', 5: 'Five', 12: 'Twelve' }, pictures: new Map(), idea: 'x', about: 'y' });
  assert.deepEqual(doc.chapters.flatMap((c) => c.rows), lib.entries.map((e) => e.no));
  assert.deepEqual(doc.chapters.map((c) => c.id), ['c1', 'c2', 'c3']);
  assert.equal(doc.chapters[1].title, 'Five');
  assert.deepEqual(checkDoc(doc), []);
  const row = doc.rows[lib.entries[0].no];
  for (const gone of ['no', 'images', 'section', 'dir', 'abs', 'find']) assert.equal(row.record[gone], undefined, gone);
  assert.deepEqual(doc.next, { row: 1, chapter: 4 });
  assert.equal(doc.idea, 'x');
  const withFile = lib.entries.find((e) => e.file);
  assert.equal(doc.rows[withFile.no].record.file, withFile.abs.slice(root.length + 1));
});

test('numbers follow the place and skip hidden rows', () => {
  const doc = sample();
  doc.rows.b.hidden = true;
  assert.deepEqual(Object.fromEntries(numbering(doc)), { a: '1.01', b: '', c: '1.02', d: '2.01' });
});

test('ten rows and more keep two digits', () => assert.equal(numbering(sampleWith(12)).get('l'), '1.12'));

test('the public lib leaves hidden rows out; the edit lib keeps them', () => {
  const doc = sample();
  doc.rows.b.hidden = true;
  assert.deepEqual(libFromDoc(doc).entries.map((e) => e.id), ['a', 'c', 'd']);
  assert.deepEqual(libFromDoc(doc, { hidden: true }).entries.map((e) => [e.id, e.no]), [['a', '1.01'], ['b', ''], ['c', '1.02'], ['d', '2.01']]);
  const pub = libFromDoc(doc);
  assert.deepEqual(pub.chapters.map((c) => [c.id, c.no, c.ids]), [['c1', '1', ['a', 'c']], ['c2', '2', ['d']]]);
  assert.equal(pub.entries[0].chapter, 'c1');
  assert.equal(pub.entries[2].section, 2);
  assert.equal(pub.entries[0].dir, null);
});

test('source numbers are the numbers the cited rows have now', () => {
  const doc = sample();
  doc.rows.d.record.sources = ['a', 'b'];
  doc.rows.b.hidden = true;
  const d = libFromDoc(doc, { hidden: true }).entries.find((e) => e.id === 'd');
  assert.deepEqual(d.sourceNumbers, ['1.01', '']);
});

test('diff names what changed', () => {
  const before = sample();
  const after = structuredClone(before);
  after.rows.a.record.title = 'New';
  after.rows.c.hidden = true;
  after.chapters[0].rows.reverse();
  const d = diffDocs(before, after);
  assert.deepEqual([d.changed, d.hidden, d.order], [['a'], ['c'], true]);
  assert.equal(d.count, 3);
  assert.deepEqual(diffDocs(before, structuredClone(before)).count, 0);
});

test('diff counts added and removed rows and chapters', () => {
  const before = sample();
  const after = structuredClone(before);
  delete after.rows.d;
  after.chapters.pop();
  after.rows.e = structuredClone(before.rows.a);
  after.chapters[0].rows.push('e');
  const d = diffDocs(before, after);
  assert.deepEqual([d.added, d.removed, d.chapters], [['e'], ['d'], true]);
});

test('checkDoc names a row in two chapters', () => {
  const doc = sample();
  doc.chapters[1].rows.push('a');
  assert.match(checkDoc(doc).join('\n'), /a.*two chapters/);
});

test('checkDoc names the other faults', () => {
  const text = (edit) => { const doc = sample(); edit(doc); return checkDoc(doc).join('\n'); };
  assert.match(text((d) => d.chapters.push({ id: 'c1', title: 'x', rows: [] })), /chapter c1.*twice/);
  assert.match(text((d) => delete d.rows.d), /d.*no row/);
  assert.match(text((d) => d.chapters[1].rows.pop()), /d.*no chapter/);
  assert.match(text((d) => (d.rows.a.record.type = 'Nope')), /unknown type/);
  assert.match(text((d) => (d.rows.a.record.keywords = ['nope'])), /unknown keyword/);
  assert.match(text((d) => (d.rows.a.record.place = 'nope')), /unknown place/);
  assert.match(text((d) => (d.rows.a.record.keywords = ['wall', 'poster', 'march', 'wall', 'poster', 'march'])), /at most 5/);
  assert.match(text((d) => (d.rows.a.record.title = ' ')), /empty title/);
  assert.match(text((d) => (d.rows.a.record.year = 1.5)), /year/);
  assert.deepEqual(checkDoc(sample()), []);
});

test('a row moved across a chapter boundary is an order change, though the flat order is the same', () => {
  const before = sample();
  const after = structuredClone(before);
  after.chapters[0].rows.pop(); // c
  after.chapters[1].rows.unshift('c');
  const d = diffDocs(before, after);
  assert.equal(d.order, true);
  assert.equal(d.count, 1);
});

test('with nothing published yet, every row is added', () => {
  const doc = sample();
  const d = diffDocs(null, doc);
  assert.deepEqual(d.added, ['a', 'b', 'c', 'd']);
  assert.deepEqual([d.changed, d.removed, d.hidden, d.shown], [[], [], [], []]);
});
