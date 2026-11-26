import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary } from '../lib/records.mjs';
import { locatePlaces } from '../lib/places.mjs';
import { docFromLibrary, numbering, chapterNumbers, libFromDoc, diffDocs, checkDoc, raiseCounters, RECORD_FIELDS, withoutTerms } from '../cloud/doc.mjs';
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
  assert.deepEqual(doc.next, { row: 1, chapter: 4, page: 1 });
  assert.equal(doc.idea, 'x');
  const withFile = lib.entries.find((e) => e.file);
  assert.equal(doc.rows[withFile.no].record.file, withFile.abs.slice(root.length + 1));
});

// moveIn runs the build's picture step before it makes the document, and that step sets
// entry.pictures and entry.thumb with the build's own addresses: they belong to the row, as the
// cloud holds them, and never to its record.
test('a record holds only the record fields; pictures, thumb and the search terms go to the row, and back', async () => {
  const root = await cleanRoot();
  const lib = await loadLibrary(root);
  await locatePlaces(lib);
  for (const entry of lib.entries) {
    entry.pictures = entry.images.map((image, n) => ({ src: `img/${entry.no}-${n + 1}.jpg`, original: null, w: 4, h: 3, caption: '' }));
    entry.thumb = { src: `img/t/${entry.no}.jpg`, w: 2, h: 1 };
  }
  const withPictures = lib.entries.find((e) => e.images.length);
  const held = new Map([[withPictures.no, { pictures: [{ src: 'https://blob/x.jpg', w: 40, h: 30, caption: 'A caption' }], thumb: { src: 'https://blob/t.jpg', w: 20, h: 15 } }]]);
  const doc = docFromLibrary(lib, { root, chapterTitles: { 0: 'Zero', 5: 'Five', 12: 'Twelve' }, pictures: held });
  assert.deepEqual(checkDoc(doc), []);
  for (const [id, row] of Object.entries(doc.rows)) {
    for (const field of Object.keys(row.record)) assert.ok(RECORD_FIELDS.includes(field), `${id}: ${field}`);
  }
  const row = doc.rows[withPictures.no];
  assert.deepEqual(row.pictures, held.get(withPictures.no).pictures);
  assert.deepEqual(row.thumb, held.get(withPictures.no).thumb);
  assert.deepEqual(row.find, withPictures.find);
  const other = lib.entries.find((e) => !held.has(e.no));
  assert.deepEqual([doc.rows[other.no].pictures, doc.rows[other.no].thumb], [[], null]);
  // And back: the pages get the row's pictures, thumb and terms, not a copy from the record.
  const entry = libFromDoc(doc).entries.find((e) => e.id === withPictures.no);
  assert.deepEqual([entry.pictures, entry.thumb, entry.find], [row.pictures, row.thumb, row.find]);
});

test('a field of a record the document does not know stops the move-in, and checkDoc names one', async () => {
  const root = await cleanRoot();
  const lib = await loadLibrary(root);
  lib.entries[0].colour = 'red';
  assert.throws(() => docFromLibrary(lib, { root }), new RegExp(`row ${lib.entries[0].no.replace('.', '\\.')} has a field "colour"`));
  const doc = sample();
  doc.rows.a.record.pictures = [];
  assert.match(checkDoc(doc).join('\n'), /row a has a field "pictures" that a record does not have/);
});

// find:check --doc reads its rows from a pulled draft once the record files are gone, and with them
// find.json: a row whose search terms are missing is one with a picture and four empty lists.
test('the rows with a picture and no search terms, hidden ones too, in the story order', () => {
  const doc = sample();
  const picture = [{ src: '/p.jpg', w: 1, h: 1, caption: '' }];
  for (const id of ['a', 'b', 'd']) doc.rows[id].pictures = picture;
  doc.rows.a.find.shows = ['a wall'];
  doc.rows.d.hidden = true;
  assert.deepEqual(withoutTerms(doc), ['b', 'd']);
  doc.rows.b.find.colours = ['red'];
  assert.deepEqual(withoutTerms(doc), ['d']);
});

test('numbers follow the place and skip hidden rows', () => {
  const doc = sample();
  doc.rows.b.hidden = true;
  assert.deepEqual(Object.fromEntries(numbering(doc)), { a: '1.01', b: '', c: '1.02', d: '2.01' });
});

// The author's ruling of 25 Nov 2026 (M2): chapters close up as rows do. A chapter counts only
// when it has a row that is not hidden; one with none, every row hidden or no row at all, has no
// number, and the chapters after it number on from the last that had one.
test('a chapter with no row shown has no number, and the chapters after it close up', () => {
  const doc = sampleDoc({ c1: ['a'], c2: ['b', 'c'], c3: [], c4: ['d'] });
  doc.rows.b.hidden = true;
  doc.rows.c.hidden = true;
  assert.deepEqual(Object.fromEntries(chapterNumbers(doc)), { c1: '1', c2: '', c3: '', c4: '2' });
  assert.deepEqual(Object.fromEntries(numbering(doc)), { a: '1.01', b: '', c: '', d: '2.01' });
  assert.deepEqual(libFromDoc(doc, { hidden: true }).chapters.map((c) => [c.id, c.no]), [['c1', '1'], ['c2', ''], ['c3', ''], ['c4', '2']]);
  assert.deepEqual(libFromDoc(doc).chapters.filter((c) => c.ids.length).map((c) => [c.id, c.no]), [['c1', '1'], ['c4', '2']]);
  doc.rows.c.hidden = false;
  assert.deepEqual(Object.fromEntries(numbering(doc)), { a: '1.01', b: '', c: '2.01', d: '3.01' });
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
  assert.match(text((d) => (d.keywords['1939'] = { label: '1939' })), /keyword id "1939" is a whole number/);
  assert.match(text((d) => (d.places['7'] = d.places.piazza)), /place id "7" is a whole number/);
  assert.deepEqual(checkDoc(sample()), []);
});

// A document a session pushes passes through checkDoc alone, and the pages take every field as the
// edit operations leave it: a shape they never leave would stop the edit page and the publish.
test('checkDoc names every shape the edit operations never leave', () => {
  const text = (edit) => { const doc = sample(); edit(doc); return checkDoc(doc).join('\n'); };
  const cases = [
    [(d) => (d.rows.a.record.text = 'one paragraph'), /row a: text is not a list of text/],
    [(d) => (d.rows.a.record.keywords = 'wall'), /row a: keywords is not a list of text/],
    [(d) => (d.rows.a.record.facts = [1]), /row a: facts is not a list of text/],
    [(d) => (d.rows.a.record.sources = 'b'), /row a: sources is not a list of text/],
    [(d) => (d.rows.a.record.date = 1931), /row a: date is not text/],
    [(d) => (d.rows.a.record.holder = ['x']), /row a: holder is not text/],
    [(d) => (d.rows.a.record.title = 7), /row a has an empty title/],
    [(d) => (d.rows.a.record.confidence = 'read'), /row a: confidence is not one of read, secondary, lead/],
    [(d) => (d.rows.a.record.confidence = { level: 'sure' }), /row a: confidence is not one of read, secondary, lead/],
    [(d) => (d.rows.a.record.confidence = { level: 'read', note: 3 }), /row a: the note on its confidence is not text/],
    [(d) => (d.rows.a.record.source = 'https://x'), /row a: source is not a label and an address/],
    [(d) => (d.rows.a.record.more = 'map'), /row a: more is not a kind of link/],
    [(d) => (d.rows.a.record.side_by_side = 'yes'), /row a: side_by_side is not true or false/],
    [(d) => (d.rows.a.hidden = 'yes'), /row a: hidden is not true or false/],
    [(d) => delete d.rows.a.hidden, /row a: hidden is not true or false/],
    [(d) => (d.rows.a.record = null), /row a has no record/],
    [(d) => (d.rows.a.find = { on: [] }), /row a: find is not four lists of text/],
    [(d) => (d.rows.a.find.colours = 'red'), /row a: find is not four lists of text/],
    [(d) => (d.rows.a.pictures = 'x.jpg'), /row a: pictures is not a list of pictures/],
    [(d) => (d.rows.a.pictures = [{ src: '/p/1.jpg', w: '4', h: 3 }]), /row a: pictures is not a list of pictures/],
    [(d) => (d.rows.a.pictures = [{ src: '/p/1.jpg', w: 4, h: 3, caption: null }]), /row a: pictures is not a list of pictures/],
    [(d) => (d.rows.a.thumb = { src: '/t.jpg' }), /row a: thumb is not a small picture/],
    [(d) => (d.rows.a.pictures = [{ src: '/p/1.jpg', w: 4, h: 3, small: { src: '/s.jpg' } }]), /row a: pictures is not a list of pictures/],
    [(d) => (d.rows.a.pictures = [{ src: '/p/1.jpg', w: 4, h: 3, small: { src: '', w: 2, h: 1 } }]), /row a: pictures is not a list of pictures/],
    [(d) => (d.rows.a.pictures = [{ src: '/p/1.jpg', w: 4, h: 3, small: { src: '/s.jpg', w: '2', h: 1 } }]), /row a: pictures is not a list of pictures/],
    [(d) => (d.rows.a.pictures = [{ src: '/p/1.jpg', w: 4, h: 3, small: '/s.jpg' }]), /row a: pictures is not a list of pictures/],
    [(d) => (d.rows.a.pictures = [{ src: '/p/1.jpg', w: 4, h: 3, small: null }]), /row a: pictures is not a list of pictures/],
    [(d) => { d.rows.r1 = structuredClone(d.rows.a); d.chapters[0].rows.push('r1'); }, /row r1 is not below next\.row \(1\)/],
    [(d) => d.chapters.push({ id: 'c3', title: 'Three', rows: [] }), /chapter c3 is not below next\.chapter \(3\)/],
    [(d) => (d.chapters[0].title = ''), /chapter c1 has no title/],
    [(d) => (d.next = { row: 1 }), /next\.chapter is not a whole number/],
    [(d) => (d.idea = null), /the idea is not text/],
    [(d) => (d.about = 3), /About is not text/],
    [(d) => (d.keywords.wall = 'Wall'), /keyword wall has no label/],
    [(d) => (d.aliases.walls = 'nothing'), /alias walls names no keyword/],
    [(d) => (d.places.piazza.x = '10'), /place piazza is on the map without its x, y and z/],
    [(d) => (d.places.piazza.name = ''), /place piazza has no name/],
  ];
  for (const [edit, pattern] of cases) assert.match(text(edit), pattern, String(edit));
  const fine = sample();
  fine.rows.a.record = { title: 'A', type: 'Poster', date: '1931', year: 1931, keywords: ['wall'], text: ['p'], confidence: { level: 'lead', note: 'n' }, facts: ['f'], source: { label: 'l', url: 'https://x' }, rights: 'r', file: 'f.pdf', more: { kind: 'source' }, creator: 'c', holder: 'h', place: 'piazza', side_by_side: true, sources: ['b'] };
  fine.rows.a.pictures = [{ src: '/p/1.jpg', w: 4, h: 3, caption: '' }, { src: '/p/2.jpg', w: 4, h: 3 },
    { src: 'https://p.test/3.jpg', w: 1600, h: 1067, small: { src: 'https://p.test/3-small.jpg', w: 220, h: 147 } }];
  fine.rows.a.thumb = { src: '/t.jpg', w: 2, h: 1 };
  fine.rows.r4 = structuredClone(fine.rows.b); fine.chapters[1].rows.push('r4'); fine.next.row = 5;
  fine.places.away = { name: 'Away', lat: 45, lon: 11, inside: false, x: null, y: null, z: null };
  assert.deepEqual(checkDoc(fine), []);
  assert.deepEqual(checkDoc({}), ['the document has no chapters, rows, keywords, aliases or places']);
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

// Minor 4 (clean review): a chapter that holds no row is on no page and in no row's number, so
// adding one, naming it or removing it changes nothing a publish would carry; it counts once it
// holds a row.
test('an empty chapter added, renamed or removed is no change; a row moved into it is', () => {
  const before = sample();
  const after = structuredClone(before);
  after.chapters.splice(1, 0, { id: 'c3', title: 'New', rows: [] });
  after.next.chapter = 4;
  let d = diffDocs(before, after);
  assert.deepEqual([d.order, d.chapters, d.count], [false, false, 0]);
  after.chapters[1].title = 'Renamed';
  assert.equal(diffDocs(before, after).count, 0);
  after.chapters[0].rows = ['a', 'c'];
  after.chapters[1].rows = ['b'];
  d = diffDocs(before, after);
  assert.deepEqual([d.order, d.chapters, d.count], [true, true, 2], 'its row has another chapter, the page another heading');
  assert.deepEqual(diffDocs(after, before).count, 2, 'and back');
  after.rows.b.hidden = true;
  d = diffDocs(before, after);
  assert.deepEqual([d.hidden, d.order, d.chapters, d.count], [['b'], false, true, 2], 'holding a hidden row, the chapter is the author\'s change all the same');
  const emptied = structuredClone(before);
  emptied.chapters.push({ id: 'c3', title: 'Empty', rows: [] });
  assert.equal(diffDocs(emptied, before).count, 0, 'an empty chapter removed');
});

test('with nothing published yet, every row is added', () => {
  const doc = sample();
  const d = diffDocs(null, doc);
  assert.deepEqual(d.added, ['a', 'b', 'c', 'd']);
  assert.deepEqual([d.changed, d.removed, d.hidden, d.shown], [[], [], [], []]);
});

// Pages (design §14): `pages: [{ id, address, title, text, row, hidden }]` and next.page. A
// document from before them has neither: no pages, and next.page 1.
const withPages = () => {
  const doc = sample();
  doc.pages = [
    { id: 'p1', address: 'on-the-bridge', title: 'On the bridge', text: 'Words.', row: null, hidden: false },
    { id: 'p2', address: 'more-on-b', title: 'More on b', text: '', row: 'b', hidden: false },
    { id: 'p3', address: 'kept-back', title: 'Kept back', text: '', row: null, hidden: true },
  ];
  doc.addresses = ['on-the-bridge', 'more-on-b', 'gone-since', 'kept-back']; // gone-since: a page removed
  doc.next.page = 5;
  return doc;
};

test('a document moved in has no pages yet and next.page 1; one without them is sound', async () => {
  const root = await cleanRoot();
  const lib = await loadLibrary(root);
  await locatePlaces(lib);
  const doc = docFromLibrary(lib, { root });
  assert.deepEqual(doc.pages, []);
  assert.deepEqual(doc.addresses, []);
  assert.equal(doc.next.page, 1);
  assert.deepEqual(Object.keys(doc), ['v', 'chapters', 'rows', 'keywords', 'aliases', 'places', 'idea', 'about', 'pages', 'addresses', 'next']);
  assert.deepEqual(checkDoc(sample()), [], 'no pages and no next.page');
  assert.deepEqual(checkDoc(withPages()), []);
});

test('checkDoc on pages: an unknown row, an address twice, a bad id, and every other shape the operations never leave', () => {
  const text = (edit) => { const doc = withPages(); edit(doc); return checkDoc(doc).join('\n'); };
  const cases = [
    [(d) => (d.pages[1].row = 'zz'), /page p2 is about row zz, but there is no row zz/],
    [(d) => (d.pages[2].address = 'on-the-bridge'), /the address on-the-bridge is given to two pages: p1, p3/],
    [(d) => (d.pages[0].id = 'x1'), /a page has no id of the form p1/],
    [(d) => (d.pages[0].id = 'p0'), /a page has no id of the form p1/],
    [(d) => (d.pages[2].id = 'p1'), /page p1 appears twice/],
    [(d) => (d.pages[0].address = 'On-the-bridge'), /page p1 has an address that is not one: "On-the-bridge"/],
    [(d) => (d.pages[0].address = '-on'), /page p1 has an address that is not one/],
    [(d) => (d.pages[0].address = 'on--the'), /page p1 has an address that is not one/],
    [(d) => (d.pages[0].address = ''), /page p1 has an address that is not one/],
    [(d) => (d.pages[0].title = ' '), /page p1 has no title/],
    [(d) => (d.pages[0].text = null), /page p1: its text is not text/],
    [(d) => (d.pages[0].row = undefined), /page p1 is about no row and is no site page/],
    [(d) => (d.pages[0].row = 7), /page p1 is about no row and is no site page/],
    [(d) => (d.pages[0].hidden = 'no'), /page p1: hidden is not true or false/],
    [(d) => (d.pages[0].order = 1), /page p1 has a field "order" that a page does not have/],
    [(d) => (d.pages = {}), /pages is not a list/],
    [(d) => (d.pages[1] = 'p2'), /a page has no id of the form p1/],
    [(d) => (d.next.page = 3), /page p3 is not below next\.page \(3\)/],
    [(d) => delete d.next.page, /next\.page is not a whole number/],
    [(d) => (d.addresses = 'on-the-bridge'), /addresses is not a list of addresses/],
    [(d) => d.addresses.push('Not One'), /addresses is not a list of addresses/],
    [(d) => d.addresses.push('gone-since'), /the address gone-since is given twice in addresses/],
    [(d) => d.addresses.splice(0, 1), /page p1's address on-the-bridge is not among the addresses given/],
    [(d) => delete d.addresses, /page p1's address on-the-bridge is not among the addresses given/],
  ];
  for (const [edit, pattern] of cases) assert.match(text(edit), pattern, String(edit));
  const empty = sample();
  empty.pages = [];
  assert.deepEqual(checkDoc(empty), [], 'an empty list wants no next.page');
});

test('diffDocs reports the pages; raiseCounters raises next.page', () => {
  const before = withPages();
  assert.equal(diffDocs(before, structuredClone(before)).pages, false);
  for (const edit of [(d) => (d.pages[0].text = 'Other words.'), (d) => (d.pages[2].hidden = false), (d) => d.pages.reverse(), (d) => d.pages.pop()]) {
    const after = structuredClone(before);
    edit(after);
    const d = diffDocs(before, after);
    assert.deepEqual([d.pages, d.count], [true, 1], String(edit));
  }
  assert.equal(diffDocs(null, withPages()).pages, true, 'the first publish carries them');
  assert.equal(diffDocs(sample(), { ...sample(), pages: [] }).pages, false);
  assert.deepEqual(raiseCounters(sample(), withPages()).next, { row: 1, chapter: 3, page: 5 });
  assert.deepEqual(raiseCounters(withPages(), sample()).next, { row: 1, chapter: 3, page: 5 });
  assert.deepEqual(raiseCounters({ ...withPages(), next: { row: 1, chapter: 3, page: 9 } }, withPages()).next.page, 9);
});

// The addresses given are kept as the counters are: a document put in place of the draft (a publish
// restored, the latest at a discard, a move-in afresh, a session's push) keeps every address the
// draft has given, so that none is given again.
test('raiseCounters keeps every address given, the document\'s first, then the others\' it lacks', () => {
  const older = { ...sample(), pages: [], addresses: ['on-the-bridge', 'first-one'] };
  const raised = raiseCounters(older, withPages());
  assert.deepEqual(raised.addresses, ['on-the-bridge', 'first-one', 'more-on-b', 'gone-since', 'kept-back']);
  assert.deepEqual(raiseCounters(sample(), withPages()).addresses, withPages().addresses, 'a document from before the pages gains them');
  assert.deepEqual(Object.keys(raiseCounters(sample(), sample())), Object.keys(sample()), 'and with none given, nothing is added');
  assert.deepEqual(checkDoc(raiseCounters(withPages(), older)), []);
});

test('libFromDoc: the public lib holds the pages a publish shows, the edit lib every one, and each row its own', () => {
  const doc = withPages();
  doc.pages.push({ id: 'p4', address: 'about-c', title: 'About c', text: '', row: 'c', hidden: false });
  doc.next.page = 5;
  doc.rows.c.hidden = true;
  const pub = libFromDoc(doc);
  assert.deepEqual(pub.pages.map((p) => [p.address, p.shown]), [['on-the-bridge', true], ['more-on-b', true]]);
  assert.deepEqual(pub.entries.find((e) => e.id === 'b').rowPages.map((p) => p.address), ['more-on-b']);
  assert.deepEqual(pub.entries.find((e) => e.id === 'a').rowPages, []);
  const edit = libFromDoc(doc, { hidden: true });
  assert.deepEqual(edit.pages.map((p) => [p.address, p.shown]), [['on-the-bridge', true], ['more-on-b', true], ['kept-back', false], ['about-c', false]]);
  assert.deepEqual(edit.entries.find((e) => e.id === 'c').rowPages.map((p) => [p.address, p.shown]), [['about-c', false]]);
  assert.deepEqual(libFromDoc(sample()).pages, [], 'a document without pages');
});
