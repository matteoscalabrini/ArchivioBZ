import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { loadLibrary, TYPES } from '../lib/records.mjs';
import { locatePlaces } from '../lib/places.mjs';
import { docFromLibrary } from '../cloud/doc.mjs';
import { applyOp } from '../cloud/ops.mjs';
import { loadLists, renderSite, renderEditPage, renderEditRow, renderEditStrip, renderRelinked, editSearch, summaryLine, summaryOf, publishLine } from '../cloud/render.mjs';
import { parseState } from '../web/state.js';
import { esc } from '../lib/shell.mjs';
import { cleanRoot } from './helpers.mjs';
import { sampleWith } from './docs.mjs';

// The fixtures moved in once, as the cloud holds them: a picture per held image at a root path,
// a small one for a row with a place, three chapters, a stand-in idea and the fixtures' About.
const root = await cleanRoot();
const lists = await loadLists(root);
const lib = await loadLibrary(root);
await locatePlaces(lib);
const pictures = new Map(lib.entries.filter((e) => e.images.length).map((e) => [e.no, {
  pictures: e.images.map((image, n) => ({ src: `/dev-img/${e.no}-${n + 1}.jpg`, w: 40, h: 30, caption: image.caption ?? '' })),
  thumb: e.place ? { src: `/dev-img/${e.no}-thumb.jpg`, w: 40, h: 30 } : null,
}]));
const BASE = docFromLibrary(lib, {
  root,
  chapterTitles: { 0: 'Reports', 5: 'Thread five', 12: 'References' },
  pictures,
  idea: 'status: stand-in\n\nThe [[press]] at [[Ponte Druso]].',
  about: await readFile(path.join(root, 'library', 'content', 'about.md'), 'utf8'),
});
const fixtureDoc = () => structuredClone(BASE);
const firstId = (doc) => doc.chapters[0].rows[0];
const ids = (doc) => doc.chapters.flatMap((chapter) => chapter.rows);
const articleOf = (html, id) => new RegExp(`<article class="row" data-no="${id.replace('.', '\\.')}"[^>]*>[\\s\\S]*?</article>`).exec(html)?.[0];
const editData = (html) => JSON.parse(/<script type="application\/json" id="edit-data">([\s\S]*?)<\/script>/.exec(html)[1]);

test('a hidden row is in no public file', () => {
  const doc = fixtureDoc(); const id = firstId(doc);
  doc.rows[id].hidden = true; doc.rows[id].record.title = 'HIDDEN-TITLE-7f3';
  doc.rows[id].pictures = [{ src: 'https://x/HIDDEN-PIC.jpg', w: 1, h: 1, caption: '' }];
  doc.rows[id].find.on = ['HIDDEN-TERM'];
  const { files } = renderSite(doc, lists);
  assert.deepEqual([...files.keys()], ['index.html', 'map.html', 'about.html', 'search.json']);
  for (const [path, { body }] of files) for (const mark of ['HIDDEN-TITLE-7f3', 'HIDDEN-PIC', 'HIDDEN-TERM', `"${id}"`]) assert.ok(!body.includes(mark), `${mark} in ${path}`);
});

// The lists of keyword labels the page scripts read name only the keywords a visible row carries
// or the idea marks: a keyword that only a hidden row carries is draft, and stays out.
test('the label of a keyword only a hidden row carries is in no public file; edit mode has them all', () => {
  const doc = fixtureDoc(); const id = '5.01';
  doc.keywords['only-hidden'] = { label: 'HIDDEN-LABEL-q9' };
  doc.keywords.unused = { label: 'UNUSED-LABEL-q9' };
  doc.rows[id].record.keywords = ['only-hidden'];
  doc.rows[id].hidden = true;
  const { files } = renderSite(doc, lists);
  for (const [path, { body }] of files) for (const mark of ['HIDDEN-LABEL-q9', 'only-hidden', 'UNUSED-LABEL-q9']) assert.ok(!body.includes(mark), `${mark} in ${path}`);
  const labels = (html) => JSON.parse(/<script type="application\/json" id="keyword-labels">([\s\S]*?)<\/script>/.exec(html)[1]);
  const index = labels(files.get('index.html').body);
  assert.equal(index.press, 'Press', 'a keyword marked in the idea keeps its label');
  assert.equal(index.typeface, 'Typeface', 'a keyword a visible row carries keeps its label');
  const edit = labels(renderEditPage(doc, { version: 1, published: null, lists }));
  assert.equal(edit['only-hidden'], 'HIDDEN-LABEL-q9');
  assert.equal(edit.unused, 'UNUSED-LABEL-q9');
});

test('a hidden row on the map, with a place and a small picture, is in no public file either', () => {
  const doc = fixtureDoc(); const id = '5.01';
  assert.equal(doc.rows[id].record.place, 'ponte-druso');
  doc.rows[id].hidden = true; doc.rows[id].record.title = 'HIDDEN-TITLE-7f3';
  doc.rows[id].thumb = { src: 'https://x/HIDDEN-THUMB.jpg', w: 1, h: 1 };
  const { files } = renderSite(doc, lists);
  for (const [path, { body }] of files) for (const mark of ['HIDDEN-TITLE-7f3', 'HIDDEN-THUMB', 'dev-img/5.01', `"${id}"`, `#o=${id}`]) assert.ok(!body.includes(mark), `${mark} in ${path}`);
  assert.doesNotMatch(files.get('map.html').body, /data-place="ponte-druso"/, 'a place whose only row is hidden is not drawn');
});

// I2 (clean review): the small picture on the map is of the row's first picture. An edit that
// changes which picture is first lets the stored small one go, and the map shows the first picture
// as it now is; so does a row that had no place when it moved in and is given one.
test('the map shows the first picture a row has now: after a removal, a move, or a place given later', () => {
  const pin = (doc, id) => {
    const body = renderSite(doc, lists).files.get('map.html').body;
    return { body, pin: new RegExp(`<button type="button" class="pin[^"]*" data-for="[^"]*" data-no="${id.replace('.', '\\.')}"[^>]*>[\\s\\S]*?</button>`).exec(body)?.[0] };
  };
  const base = fixtureDoc();
  assert.match(pin(base, '5.01').pin, /data-src="\/dev-img\/5\.01-thumb\.jpg"/);
  const captioned = applyOp(base, { op: 'set-caption', id: '5.01', src: '/dev-img/5.01-1.jpg', caption: 'New words' }).doc;
  assert.deepEqual(captioned.rows['5.01'].thumb, base.rows['5.01'].thumb, 'a caption leaves the small picture as it is');

  const moved = applyOp(base, { op: 'move-picture', id: '5.01', src: '/dev-img/5.01-1.jpg', step: 1 }).doc;
  assert.equal(moved.rows['5.01'].thumb, null);
  let shown = pin(moved, '5.01');
  assert.match(shown.pin, /data-src="\/dev-img\/5\.01-2\.jpg" alt="" width="40" height="30"/);
  assert.ok(!shown.body.includes('5.01-thumb'), 'the old small picture is on no map');
  const back = applyOp(moved, { op: 'move-picture', id: '5.01', src: '/dev-img/5.01-1.jpg', step: -1 }).doc;
  assert.match(pin(back, '5.01').pin, /data-src="\/dev-img\/5\.01-1\.jpg"/, 'moved back, the first picture is shown again');

  const removed = applyOp(base, { op: 'remove-picture', id: '5.01', src: '/dev-img/5.01-1.jpg' }).doc;
  assert.equal(removed.rows['5.01'].thumb, null);
  shown = pin(removed, '5.01');
  assert.match(shown.pin, /data-src="\/dev-img\/5\.01-2\.jpg"/);
  assert.ok(!shown.body.includes('5.01-thumb') && !shown.body.includes('5.01-1.jpg'), 'the removed picture is on no map');
  const none = applyOp(removed, { op: 'remove-picture', id: '5.01', src: '/dev-img/5.01-2.jpg' }).doc;
  assert.match(pin(none, '5.01').pin, /^<button type="button" class="pin blank"[^>]*>Photograph<\/button>$/, 'with no picture, the type word');
  const set = applyOp(base, { op: 'set-pictures', id: '5.01', pictures: [{ src: '/dev-img/5.01-2.jpg' }, { src: '/dev-img/5.01-1.jpg' }] }).doc;
  assert.equal(set.rows['5.01'].thumb, null, 'set-pictures that reorders likewise');

  assert.equal(base.rows['0.01'].thumb, null, '0.01 has a picture and had no place');
  const placed = applyOp(base, { op: 'set-row', id: '0.01', fields: { place: 'semirurali' } }).doc;
  assert.match(pin(placed, '0.01').pin, /data-src="\/dev-img\/0\.01-1\.jpg"/);
});

// I3 (clean review): "Open the source →" follows the Source. Moved in, a row whose link is its
// source carries the address twice, as more.target and as source.url (112 of the 124 such rows);
// an edited Source must not leave the old address under the link, and an emptied one no link.
test('"Open the source →" follows an edited or emptied Source; a link to a page of its own stays', () => {
  const link = (doc, id) => /<a class="more" href="([^"]*)"[^>]*>([^<]*)<\/a>/.exec(articleOf(renderSite(doc, lists).files.get('index.html').body, id))?.slice(1);
  const doc = fixtureDoc();
  doc.rows['12.01'].record.more = { kind: 'source', target: 'https://example.org/reference' };
  assert.deepEqual(link(doc, '12.01'), ['https://example.org/reference', 'Open the source →']);
  const edited = applyOp(doc, { op: 'set-row', id: '12.01', fields: { source: { label: 'Example page', url: 'https://example.org/moved' } } }).doc;
  assert.deepEqual(link(edited, '12.01'), ['https://example.org/moved', 'Open the source →']);
  assert.ok(!renderSite(edited, lists).files.get('index.html').body.includes('https://example.org/reference'), 'the old address is nowhere');
  const emptied = applyOp(edited, { op: 'set-row', id: '12.01', fields: { source: null } }).doc;
  assert.equal(link(emptied, '12.01'), undefined, 'no Source, no link');
  const again = applyOp(emptied, { op: 'set-row', id: '12.01', fields: { source: { label: 'Back', url: 'https://example.org/back' } } }).doc;
  assert.deepEqual(link(again, '12.01'), ['https://example.org/back', 'Open the source →'], 'a Source given again brings the link back');
  const words = applyOp(doc, { op: 'set-row', id: '12.01', fields: { title: 'Another title' } }).doc;
  assert.deepEqual(words.rows['12.01'].record.more, doc.rows['12.01'].record.more, 'an edit of another field leaves the link as it is');

  // A link to another page than the Source's (a newspaper's page beside its catalogue record) is
  // the row's own, and stays until the link has a field of its own.
  doc.rows['12.01'].record.more = { kind: 'source', target: 'https://example.org/page-of-its-own' };
  const own = applyOp(doc, { op: 'set-row', id: '12.01', fields: { source: null } }).doc;
  assert.deepEqual(link(own, '12.01'), ['https://example.org/page-of-its-own', 'Open the source →']);
});

test('a row that cites a hidden or a removed row names neither in the public pages', () => {
  const doc = fixtureDoc();
  doc.rows['5.03'].record.sources = ['5.01', 'r404', '5.02'];
  doc.rows['5.01'].hidden = true;
  const { files } = renderSite(doc, lists);
  const row = articleOf(files.get('index.html').body, '5.03');
  assert.match(row, /<dt>Sources<\/dt><dd>1 row: <a href="#o=5\.02" data-jump="5\.02">2\.02<\/a><\/dd>/);
  for (const [path, { body }] of files) for (const mark of ['o=5.01', 'r404']) assert.ok(!body.includes(mark), `${mark} in ${path}`);
  const page = renderEditPage(doc, { version: 1, published: null, lists });
  assert.match(articleOf(page, '5.03'), /3 rows: .*5\.01.*r404.*2\.02/, 'edit mode shows the draft as it is');
});

// A link in a row's text (lib/links.mjs): on the Library it opens the row in place, in the map's
// panel it leads to the Library; once the row it names is hidden, no public file holds its id in a
// link, while edit mode draws it dotted, its title saying why.
test('a row whose text links another: in the Library, in the map\'s panel, and only while that row is shown', () => {
  const doc = fixtureDoc();
  doc.rows['5.01'].record.text = ['See [[the bridge|@5.02]] again.', 'And [[@5.02]].'];
  const { files } = renderSite(doc, lists);
  const row = articleOf(files.get('index.html').body, '5.01');
  assert.match(row, /<p>See <a href="#o=5\.02" data-row="5\.02">the bridge<\/a> again\.<\/p><p>And <a href="#o=5\.02" data-row="5\.02">Alpenzeitung, 29 October 1931, page 3<\/a>\.<\/p>/);
  const panel = /<article class="entry" data-no="5\.01"[\s\S]*?<\/article>/.exec(files.get('map.html').body)[0];
  assert.match(panel, /<p>See <a href="index\.html#o=5\.02">the bridge<\/a> again\.<\/p>/);
  assert.deepEqual(JSON.parse(files.get('search.json').body).rows.find((r) => r.no === '5.01').text, ['See the bridge again.', 'And Alpenzeitung, 29 October 1931, page 3.']);

  doc.rows['5.02'].hidden = true;
  const hidden = renderSite(doc, lists).files;
  for (const [path, { body }] of hidden) {
    assert.doesNotMatch(body, /<a\b[^>]*5\.02/, `a link to 5.02 in ${path}`);
    assert.ok(!body.includes('data-row="5.02"') && !body.includes('#o=5.02'), `5.02 named in ${path}`);
    assert.ok(!body.includes('Alpenzeitung'), `the hidden row's title in ${path}`);
  }
  assert.match(articleOf(hidden.get('index.html').body, '5.01'), /<p>See the bridge again\.<\/p><p>And \.<\/p>/);
  const edit = articleOf(renderEditPage(doc, { version: 1, published: null, lists }), '5.01');
  assert.match(edit, /<p>See <span class="dead-link" title="The row is hidden\.">the bridge<\/span> again\.<\/p>/);
  assert.match(edit, /<p>And <span class="dead-link" title="The row is hidden\.">Alpenzeitung, 29 October 1931, page 3<\/span>\.<\/p>/);
  assert.equal(renderEditRow(doc, '5.01', lists), edit, 'one row drawn as the page draws it');
});

// A keyword only hidden rows carry filters nothing on the public site, where its links are words;
// edit mode dots them, as it dots a link to a hidden row, so that the author sees it before a publish.
test('a keyword only hidden rows carry: words on the public site, dotted in edit mode with its sentence', () => {
  const doc = fixtureDoc(); // 5.01 alone carries ponte-druso
  doc.idea = 'The [[press]] at [[Ponte Druso]].';
  doc.rows['5.02'].record.text = ['On [[the bridge|ponte druso]].'];
  doc.rows['5.01'].hidden = true;
  const index = renderSite(doc, lists).files.get('index.html').body;
  assert.match(index, /<p>The <button data-k="press">press<\/button> at Ponte Druso\.<\/p>/);
  assert.match(articleOf(index, '5.02'), /<p>On the bridge\.<\/p>/);
  const edit = renderEditPage(doc, { version: 1, published: null, lists });
  const dead = (words) => `<span class="dead-link" title="No row shown carries this keyword.">${words}</span>`;
  assert.ok(edit.includes(`<p>The <button data-k="press">press</button> at ${dead('Ponte Druso')}.</p>`), 'the idea');
  assert.ok(articleOf(edit, '5.02').includes(`<p>On ${dead('the bridge')}.</p>`), 'a row\'s text');
});

// After an edit the page swaps in what the answer carries: the row edited, and, from this, every
// other row and the idea whose links now read otherwise, each exactly as the edit page draws it.
test('after an edit, the other rows and the idea whose links it changed are drawn again; nothing else', () => {
  const before = fixtureDoc();
  before.idea = 'The [[notes|@5.00]] and the [[press]].';
  before.rows['5.01'].record.text = ['See [[@5.00]].'];
  before.rows['5.02'].record.text = ['Also [[the notes|@5.00]], and [[the bridge|ponte-druso]].'];
  before.rows['5.03'].record.text = ['Nothing linked.'];
  const ideaOf = (html) => /<section class="idea">[\s\S]*?<\/section>/.exec(html)[0];

  const hidden = applyOp(before, { op: 'hide-row', id: '5.00', hidden: true }).doc;
  const parts = renderRelinked(before, hidden, lists, { skip: ['5.00'] });
  const page = renderEditPage(hidden, { version: 1, published: null, lists });
  assert.deepEqual(Object.keys(parts.rows), ['5.01', '5.02']);
  for (const id of ['5.01', '5.02']) assert.equal(parts.rows[id], articleOf(page, id), id);
  assert.match(parts.rows['5.02'], /<span class="dead-link" title="The row is hidden\.">the notes<\/span>/);
  assert.equal(parts.idea, ideaOf(page));
  assert.match(parts.idea, /<span class="dead-link" title="The row is hidden\.">notes<\/span>/);
  const published = fixtureDoc();
  assert.equal(renderRelinked(before, hidden, lists, { published, skip: ['5.00'] }).rows['5.02'],
    articleOf(renderEditPage(hidden, { version: 1, published, lists }), '5.02'), 'marked changed as the page marks it');

  const removed = applyOp(before, { op: 'remove-row', id: '5.00' }).doc;
  const gone = renderRelinked(before, removed, lists);
  assert.deepEqual(Object.keys(gone.rows), ['5.01', '5.02']);
  assert.match(gone.rows['5.01'], /<span class="dead-link" title="There is no such row\.">@5\.00<\/span>/);

  const retitled = applyOp(before, { op: 'set-row', id: '5.00', fields: { title: 'Notes, retitled' } }).doc;
  const again = renderRelinked(before, retitled, lists, { skip: ['5.00'] });
  assert.deepEqual(Object.keys(again.rows), ['5.01'], 'only the link that shows the title');
  assert.match(again.rows['5.01'], /<a href="#o=5\.00" data-row="5\.00">Notes, retitled<\/a>/);
  assert.equal(again.idea, null, 'the idea names 5.00 in words of its own');

  const uncarried = applyOp(before, { op: 'hide-row', id: '5.01', hidden: true }).doc; // ponte-druso's one row
  assert.deepEqual(Object.keys(renderRelinked(before, uncarried, lists, { skip: ['5.01'] }).rows), ['5.02']);
  const unrelated = applyOp(before, { op: 'set-row', id: '5.03', fields: { title: 'Other' } }).doc;
  assert.deepEqual(renderRelinked(before, unrelated, lists, { skip: ['5.03'] }), { rows: {}, idea: null });
  const idea = applyOp(hidden, { op: 'set-idea', text: 'The [[notes|@5.00]], once more.' }).doc;
  assert.equal(renderRelinked(hidden, idea, lists).idea, null, 'the idea edited draws itself again');
});

test('About links a row and a keyword to the Library; a hidden row\'s link is its words', () => {
  const doc = fixtureDoc();
  doc.about = 'See [[x|@5.02]], the [[press]] and [[y|@5.01]].\n\n[[*not* emphasis|@5.03]] and `[[code|@5.02]]`.';
  doc.rows['5.01'].hidden = true;
  const about = renderSite(doc, lists).files.get('about.html').body;
  assert.match(about, /<p>See <a href="index\.html#o=5\.02">x<\/a>, the <a href="index\.html#k=press">Press<\/a> and y\.<\/p>/);
  assert.match(about, /<p><a href="index\.html#o=5\.03">\*not\* emphasis<\/a> and <code>\[\[code\|@5\.02\]\]<\/code>\.<\/p>/);
  assert.ok(!about.includes('5.01'));
});

test('markup typed into a title, a text, a chapter title and the idea stays words', () => {
  const doc = fixtureDoc(); const id = firstId(doc);
  doc.rows[id].record.title = '<script>alert(1)</script> & "q"';
  doc.rows[id].record.text = ['</script><b>x</b>'];
  doc.chapters[0].title = '<img src=x onerror=alert(1)>';
  doc.idea = 'A <i>tag</i> and [[press]]';
  const page = renderEditPage(doc, { version: 1, published: null, lists });
  const site = renderSite(doc, lists).files.get('index.html').body;
  for (const html of [page, site]) {
    assert.ok(!html.includes('<script>alert'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('<b>x</b>'));
    assert.ok(!html.includes('<i>tag'));
    assert.ok(html.includes(esc('<script>alert(1)</script> & "q"')), 'the title shows as typed');
    assert.ok(html.includes(esc('</script><b>x</b>')), 'the text shows as typed');
    assert.ok(html.includes(esc('<img src=x onerror=alert(1)>')), 'the chapter title shows as typed');
    assert.ok(html.includes(`A ${esc('<i>tag</i>')} and <button data-k="press">press</button>`), 'the idea shows as typed');
  }
  assert.equal(page.match(/<\/script>/g).length, page.match(/<script\b/g).length); // the JSON cannot close its own tag
  assert.equal(editData(page).doc.rows[id].record.title, '<script>alert(1)</script> & "q"', 'the data keeps what was typed');
});

test('the public Library has chapter headings and numbers from the place', () => {
  const doc = fixtureDoc();
  const html = renderSite(doc, lists).files.get('index.html').body;
  assert.match(html, /<h2 class="chapter" data-chapter="c1"><span class="ch-no">1<\/span> Reports<\/h2>/);
  assert.match(html, /<h2 class="chapter" data-chapter="c2"><span class="ch-no">2<\/span> Thread five<\/h2>/);
  assert.match(articleOf(html, '0.01'), /<div class="row-head"><span class="c-no">1\.01<\/span>/);
  assert.match(articleOf(html, '5.01'), /<span class="c-no">2\.02<\/span>/);
  assert.match(articleOf(html, '12.01'), /<span class="c-no">3\.01<\/span>/);
  doc.rows['5.00'].hidden = true;
  assert.match(articleOf(renderSite(doc, lists).files.get('index.html').body, '5.01'), /<span class="c-no">2\.01<\/span>/, 'a hidden row takes no place');
});

// M2: a chapter whose rows are all hidden has no heading on the public page, and the chapters
// after it number on from the one before; in edit mode its heading stands with no number (the page
// script shows — there, as for a hidden row).
test('a chapter whose rows are all hidden leaves no gap in the numbers', () => {
  const doc = fixtureDoc();
  doc.rows['0.01'].hidden = true;
  const { files } = renderSite(doc, lists);
  const html = files.get('index.html').body;
  assert.doesNotMatch(html, /data-chapter="c1"/);
  assert.match(html, /<h2 class="chapter" data-chapter="c2"><span class="ch-no">1<\/span> Thread five<\/h2>/);
  assert.match(html, /<h2 class="chapter" data-chapter="c3"><span class="ch-no">2<\/span> References<\/h2>/);
  assert.match(articleOf(html, '5.00'), /<span class="c-no">1\.01<\/span>/);
  assert.match(articleOf(html, '12.01'), /<span class="c-no">2\.01<\/span>/);
  assert.deepEqual(JSON.parse(files.get('search.json').body).rows.find((row) => row.no === '12.01').line[0], '2.01');
  assert.match(files.get('map.html').body, /<a href="index\.html#o=5\.01"><span class="no">1\.02<\/span>/);
  const page = renderEditPage(doc, { version: 1, published: fixtureDoc(), lists });
  assert.match(page, /<h2 class="chapter" data-chapter="c1"><span class="ch-no"><\/span> Reports<\/h2>/);
  assert.match(page, /<h2 class="chapter" data-chapter="c2"><span class="ch-no">1<\/span> Thread five<\/h2>/);
});

test('an address naming a hidden row opens nothing: the row is not on the page', () => {
  const doc = fixtureDoc(); const id = '5.01';
  doc.rows[id].hidden = true;
  const html = renderSite(doc, lists).files.get('index.html').body;
  const known = { keywords: new Set(), kinds: new Set(), rows: new Set([...html.matchAll(/<article class="row" data-no="([^"]+)"/g)].map((m) => m[1])) };
  assert.equal(known.rows.size, ids(doc).length - 1);
  assert.deepEqual(parseState(`#o=${encodeURIComponent(id)}`, known).o, []);
  assert.deepEqual(parseState(`#o=${encodeURIComponent(id)},5.02`, known).o, ['5.02'], 'a shown row beside it still opens');
  assert.deepEqual(parseState('#o=r404', known).o, [], 'nor does a removed row');
});

test('the edit page carries hidden rows, marked, and the draft as data', () => {
  const published = fixtureDoc();
  const doc = fixtureDoc(); const id = '5.01';
  doc.rows[id].hidden = true;
  const page = renderEditPage(doc, { version: 1, published, lists });
  const row = articleOf(page, id);
  assert.match(row, /^<article class="row" data-no="5\.01"[^>]* data-hidden="true" data-changed="true">/);
  assert.match(row, /<span class="c-no"><\/span>/, 'a hidden row has no number');
  assert.doesNotMatch(articleOf(page, '5.02'), /data-hidden|data-changed/);
  assert.match(articleOf(page, '5.02'), /<span class="c-no">2\.02<\/span>/);
  assert.match(page, /<link rel="stylesheet" href="\.\.\/web\/edit\.css">/);
  assert.match(page, /<script type="module" src="\.\.\/web\/edit\.js"><\/script>/);
  assert.match(page, /<a href="\.\.\/map\.html"/, 'the page lives one folder down, at /edit/');
  assert.deepEqual(editData(page), { version: 1, doc, types: TYPES, summary: '1 hidden', changed: [id], published: ids(published), originals: null });
  assert.equal(editData(renderEditPage(doc, { version: 1, published, lists, originals: 'upload' })).originals, 'upload', 'where the page sends an original');
});

test('the edit page marks what changed since the last publish', () => {
  const published = fixtureDoc();
  const doc = fixtureDoc();
  doc.rows['5.02'].record.title = 'A new title';
  doc.rows['5.00'].hidden = true;
  published.rows['12.01'].hidden = true;
  const page = renderEditPage(doc, { version: 7, published, lists });
  const marked = [...page.matchAll(/<article class="row" data-no="([^"]+)"[^>]* data-changed="true"/g)].map((m) => m[1]);
  assert.deepEqual(marked, ['5.00', '5.02', '12.01']);
  assert.deepEqual(editData(page).changed, marked);
  assert.equal(editData(page).summary, '1 row changed, 1 hidden, 1 shown again');
  // Nothing published yet: the bar counts what a publish would show, and no row is marked.
  const first = fixtureDoc();
  first.rows['5.01'].hidden = true;
  const fresh = renderEditPage(first, { version: 1, published: null, lists });
  assert.equal(editData(fresh).summary, `Nothing published yet: ${ids(BASE).length - 1} rows in 3 chapters`);
  assert.doesNotMatch(fresh, /data-changed/);
  assert.deepEqual(editData(fresh).changed, []);
  assert.deepEqual(editData(fresh).published, [], 'no row is in a publish yet');
  const same = renderEditPage(fixtureDoc(), { version: 1, published: fixtureDoc(), lists });
  assert.equal(editData(same).summary, 'No changes since the last publish');
  assert.doesNotMatch(same, /data-changed/);
});

test('one row is drawn exactly as the edit page draws it', () => {
  const published = fixtureDoc();
  const doc = fixtureDoc();
  doc.rows['5.01'].hidden = true;
  doc.rows['5.02'].record.title = 'A <new> title';
  const page = renderEditPage(doc, { version: 3, published, lists });
  for (const id of ids(doc)) assert.equal(renderEditRow(doc, id, lists, { published }), articleOf(page, id), id);
  assert.match(renderEditRow(doc, '5.01', lists, { published }), /data-hidden="true" data-changed="true"/);
  assert.doesNotMatch(renderEditRow(doc, '5.01', lists), /data-changed/, 'with nothing published, no row is marked');
  assert.throws(() => renderEditRow(doc, 'r404', lists), /r404/);
});

// "All keywords" in edit mode counts the rows the edit page draws, the hidden ones too; the public
// strip counts the rows a publish shows. An op's answer carries the edit page's own strip.
test('the strip is drawn as the edit page draws it, hidden rows counted; the public one leaves them out', () => {
  const doc = fixtureDoc();
  doc.rows['5.01'].hidden = true; // ponte-druso, which no other row carries
  doc.rows['5.03'].hidden = true; // archives, which 5.00 carries too
  const stripOf = (html) => /<div class="keywords">[\s\S]*?<\/div>/.exec(html)[0];
  const counts = (strip) => Object.fromEntries([...strip.matchAll(/data-k="([^"]+)" aria-pressed="false">[^<]*<sup>(\d+)<\/sup>/g)].map((m) => [m[1], Number(m[2])]));
  const strip = renderEditStrip(doc);
  assert.equal(strip, stripOf(renderEditPage(doc, { version: 1, published: null, lists })));
  assert.equal(counts(strip)['ponte-druso'], 1);
  assert.equal(counts(strip).archives, 2);
  const shown = counts(stripOf(renderSite(doc, lists).files.get('index.html').body));
  assert.equal(shown['ponte-druso'], undefined);
  assert.equal(shown.archives, 1);
});

test('the summary and the stored line before the first publish and after it', () => {
  const doc = sampleWith(1);
  assert.equal(summaryOf(null, doc), 'Nothing published yet: 1 row in 1 chapter');
  assert.equal(publishLine(null, fixtureDoc()), `First publish: ${ids(BASE).length} rows in 3 chapters`);
  const changed = structuredClone(doc);
  changed.rows.a.record.title = 'Other';
  assert.equal(summaryOf(doc, changed), '1 row changed');
  assert.equal(publishLine(doc, changed), '1 row changed');
});

test('summaryLine', () => {
  assert.equal(summaryLine({ changed: ['a', 'b'], added: ['r1'], removed: [], hidden: ['c'], shown: [], order: true, chapters: false, idea: false, about: false, keywords: false }), '2 rows changed, 1 added, 1 hidden, order changed');
  assert.equal(summaryLine({ changed: [], added: [], removed: [], hidden: [], shown: [], order: false, chapters: false, idea: false, about: false, keywords: false }), 'No changes since the last publish');
  assert.equal(summaryLine({ changed: ['a'], added: ['r1', 'r2'], removed: ['x', 'y', 'z'], hidden: ['c'], shown: ['d', 'e'], order: true, chapters: true, idea: true, about: true, keywords: true }),
    '1 row changed, 2 added, 3 removed, 1 hidden, 2 shown again, order changed, chapters changed, idea changed, About changed, keywords changed');
  assert.equal(summaryLine({ changed: [], added: [], removed: [], hidden: [], shown: [], order: false, chapters: false, idea: false, about: true, keywords: false }), 'About changed');
});

test('the published site from a fresh move-in lists every fixture row with its title and pictures', () => {
  const doc = fixtureDoc();
  const { files, problems } = renderSite(doc, lists);
  const html = files.get('index.html').body;
  for (const entry of lib.entries) {
    const row = articleOf(html, entry.no);
    assert.ok(row, `row ${entry.no}`);
    assert.ok(row.includes(esc(entry.title)), `title of ${entry.no}`);
    assert.equal(row.match(/<img /g)?.length ?? 0, doc.rows[entry.no].pictures.length, `pictures of ${entry.no}`);
  }
  assert.match(articleOf(html, '5.01'), /<img data-src="\/dev-img\/5\.01-1\.jpg" alt="" width="40" height="30">/);
  assert.match(files.get('map.html').body, /<button type="button" class="pin" data-for="ponte-druso" data-no="5\.01" aria-label="2\.02 · Two photographs of a bridge" data-w="80"><img data-src="\/dev-img\/5\.01-thumb\.jpg"/);
  assert.match(files.get('map.html').body, /<a href="index\.html#o=5\.01"><span class="no">2\.02<\/span>/);
  assert.deepEqual(problems.filter((p) => p.level === 'error'), []);
});

test('the four public files: their types, the About text and counts, the search keyed by id', () => {
  const { files } = renderSite(fixtureDoc(), lists);
  assert.deepEqual([...files].map(([path, { type }]) => [path, type]), [
    ['index.html', 'text/html; charset=utf-8'],
    ['map.html', 'text/html; charset=utf-8'],
    ['about.html', 'text/html; charset=utf-8'],
    ['search.json', 'application/json; charset=utf-8'],
  ]);
  for (const name of ['index.html', 'map.html', 'about.html']) assert.match(files.get(name).body, /^<!doctype html>/);
  assert.doesNotMatch(files.get('index.html').body, /edit-data|edit\.js|data-hidden|data-changed/, 'nothing of edit mode');
  const about = files.get('about.html').body;
  assert.match(about, /<h2>What this is<\/h2>\n<p>A fixture about text\.<\/p>/);
  assert.match(about, new RegExp(`<p class="totals">${ids(BASE).length} entries`));
  const search = JSON.parse(files.get('search.json').body);
  assert.deepEqual(search.rows.map((row) => row.no), ids(BASE));
  assert.deepEqual(search.rows.find((row) => row.no === '5.01').line.slice(0, 2), ['2.02', 'Two photographs of a bridge']);
  assert.deepEqual(search.rows.find((row) => row.no === '5.01').on, ['PONTE DRUSO']);
  assert.deepEqual([search.colours.red, search.names[0], search.glossary[0]], [['red', 'rosso', 'rot'], ['Bolzano', 'Bozen'], ['eagle', 'aquila', 'Adler']]);
});

test('the stand-in label stays while the idea starts with status: stand-in', () => {
  const doc = fixtureDoc();
  const idea = (d) => /<section class="idea">([\s\S]*?)<\/section>/.exec(renderSite(d, lists).files.get('index.html').body)?.[1];
  assert.match(idea(doc), /^<span class="lab">The idea \(stand-in\)<\/span><p>The <button data-k="press">press<\/button> at <span class="kw"><button data-k="ponte-druso">Ponte Druso<\/button>\.<\/span><\/p>$/);
  doc.idea = 'The [[press]] at [[Ponte Druso]].';
  assert.match(idea(doc), /^<span class="lab">The idea<\/span><p>/);
  doc.idea = '';
  assert.equal(idea(doc), undefined, 'no idea: the keyword index stands there');
  assert.match(renderSite(doc, lists).files.get('index.html').body, /<section class="idea index">/);
  doc.idea = 'The [[nope]].';
  assert.deepEqual(renderSite(doc, lists).problems, [{ level: 'error', where: 'the idea', message: 'unknown keyword "nope"' }]);
});

test('edit mode searches the hidden rows too; the public search does not', () => {
  const doc = fixtureDoc();
  doc.rows['5.01'].hidden = true;
  const edit = editSearch(doc, lists);
  assert.deepEqual(edit.rows.map((row) => row.no), ids(doc));
  assert.deepEqual(edit.rows.find((row) => row.no === '5.01').on, ['PONTE DRUSO']);
  assert.equal(edit.rows.find((row) => row.no === '5.01').line[0], 'Two photographs of a bridge', 'a hidden row has no number');
  assert.equal(edit.rows.find((row) => row.no === '5.02').line[0], '2.02', 'and takes no place');
  const pub = JSON.parse(renderSite(doc, lists).files.get('search.json').body);
  assert.ok(!pub.rows.some((row) => row.no === '5.01'));
});

test('the edit search reads a row\'s links as the edit page shows them', () => {
  const doc = fixtureDoc();
  doc.rows['5.02'].record.text = ['See [[@5.01]] and [[ponte druso]].'];
  doc.rows['5.01'].hidden = true; // which alone carries ponte-druso
  assert.deepEqual(editSearch(doc, lists).rows.find((row) => row.no === '5.02').text, ['See Two photographs of a bridge and Ponte Druso.']);
  assert.deepEqual(JSON.parse(renderSite(doc, lists).files.get('search.json').body).rows.find((row) => row.no === '5.02').text, ['See and ponte druso.']);
});

test('the lists: colours, names and glossary of the root, its kinds, the dot data beside the code', async () => {
  assert.deepEqual(lists.colours.red, ['red', 'rosso', 'rot']);
  assert.deepEqual(lists.names, [['Bolzano', 'Bozen'], ['Ponte Druso', 'Drususbrücke']]);
  assert.deepEqual(lists.glossary, [['eagle', 'aquila', 'Adler'], ['bridge', 'ponte', 'Brücke']]);
  assert.deepEqual(lists.kinds.map((kind) => kind.id), ['press', 'pictures', 'film', 'documents', 'references', 'project']);
  const dots = fileURLToPath(new URL('../map-data/dots.json', import.meta.url));
  assert.deepEqual(lists.mapMeta, JSON.parse(await readFile(dots, 'utf8')));
  assert.deepEqual(lists.problems, []);
});
