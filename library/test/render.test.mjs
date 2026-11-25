import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { loadLibrary, TYPES } from '../lib/records.mjs';
import { locatePlaces } from '../lib/places.mjs';
import { docFromLibrary } from '../cloud/doc.mjs';
import { loadLists, renderSite, renderEditPage, renderEditRow, editSearch, summaryLine, summaryOf, publishLine } from '../cloud/render.mjs';
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

test('a hidden row on the map, with a place and a small picture, is in no public file either', () => {
  const doc = fixtureDoc(); const id = '5.01';
  assert.equal(doc.rows[id].record.place, 'ponte-druso');
  doc.rows[id].hidden = true; doc.rows[id].record.title = 'HIDDEN-TITLE-7f3';
  doc.rows[id].thumb = { src: 'https://x/HIDDEN-THUMB.jpg', w: 1, h: 1 };
  const { files } = renderSite(doc, lists);
  for (const [path, { body }] of files) for (const mark of ['HIDDEN-TITLE-7f3', 'HIDDEN-THUMB', 'dev-img/5.01', `"${id}"`, `#o=${id}`]) assert.ok(!body.includes(mark), `${mark} in ${path}`);
  assert.doesNotMatch(files.get('map.html').body, /data-place="ponte-druso"/, 'a place whose only row is hidden is not drawn');
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
  assert.deepEqual(editData(page), { version: 1, doc, types: TYPES, summary: '1 hidden', changed: [id] });
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

test('the lists: colours, names and glossary of the root, its kinds, the dot data beside the code', async () => {
  assert.deepEqual(lists.colours.red, ['red', 'rosso', 'rot']);
  assert.deepEqual(lists.names, [['Bolzano', 'Bozen'], ['Ponte Druso', 'Drususbrücke']]);
  assert.deepEqual(lists.glossary, [['eagle', 'aquila', 'Adler'], ['bridge', 'ponte', 'Brücke']]);
  assert.deepEqual(lists.kinds.map((kind) => kind.id), ['press', 'pictures', 'film', 'documents', 'references', 'project']);
  const dots = fileURLToPath(new URL('../map-data/dots.json', import.meta.url));
  assert.deepEqual(lists.mapMeta, JSON.parse(await readFile(dots, 'utf8')));
  assert.deepEqual(lists.problems, []);
});
