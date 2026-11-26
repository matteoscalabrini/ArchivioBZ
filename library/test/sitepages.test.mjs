// Pages (design §14) as a publish draws them and as edit mode draws them: the files a publish
// writes, the tabs on every page, a site page and a row page, the Read: lines of an open row, a
// link to a page from a row's text, the search, and a page in edit mode. Nothing only the draft
// holds (a hidden page, a page of a hidden row, a link to either) reaches a public file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp } from '../cloud/ops.mjs';
import { loadLists, renderSite, renderEditPage, renderEditRow, renderPageEdit, renderPageParts, editSearch } from '../cloud/render.mjs';
import { cleanRoot } from './helpers.mjs';
import { sampleDoc } from './docs.mjs';

const lists = await loadLists(await cleanRoot());

// Rows a b c in chapter c1 (1.01 to 1.03), d in c2 (2.01); b with two pictures and a place. The
// pages: p1 On the bridge (a site page, with Markdown and links), p2 More on b (about row b), p3
// Kept back (a site page, hidden), p4 Second (a site page), p5 On row c (about row c).
function pagesDoc() {
  let doc = sampleDoc();
  doc.rows.b.pictures = [{ src: 'https://p.test/b-1.jpg', w: 40, h: 30, caption: '' }, { src: 'https://p.test/b-2.jpg', w: 40, h: 30, caption: '' }];
  doc = run(doc, [
    { op: 'set-row', id: 'b', fields: { title: 'The bridge, a postcard', place: 'piazza' } },
    { op: 'set-row', id: 'a', fields: { keywords: ['wall'] } },
    { op: 'add-page', title: 'On the bridge', row: null },
    { op: 'add-page', title: 'More on b', row: 'b' },
    { op: 'add-page', title: 'Kept back', row: null },
    { op: 'add-page', title: 'Second', row: null },
    { op: 'add-page', title: 'On row c', row: 'c' },
    { op: 'set-page', id: 'p1', text: '# Not a second title\n\nThe [[bridge|@b]] and [[a wall|wall]].\n\n## Built\n\nIn 1928, *after* the [[other page|page:second]].' },
    { op: 'set-page', id: 'p2', text: 'A QUOKKA crossed [[the bridge|@b]].\n\n- one\n- two' },
    { op: 'set-page', id: 'p3', text: 'SECRET-WORDS-x7' },
    { op: 'hide-page', id: 'p3', hidden: true },
    { op: 'set-page', id: 'p5', text: 'ROW-C-WORDS-k2' },
  ]);
  return doc;
}
function run(doc, ops) {
  for (const op of ops) doc = applyOp(doc, op).doc;
  return doc;
}
const body = (files, path) => files.get(path)?.body;
const tabsOf = (html) => [.../<nav class="tabs"[^>]*>([\s\S]*?)<form/.exec(html)[1].matchAll(/<a href="([^"]*)"([^>]*)>([^<]*)<\/a>/g)]
  .map(([, href, attrs, words]) => `${words} ${href}${attrs}`);
const articleOf = (html, id) => new RegExp(`<article class="row" data-no="${id}"[^>]*>[\\s\\S]*?</article>`).exec(html)?.[0];
const editData = (html) => JSON.parse(/<script type="application\/json" id="edit-data">([\s\S]*?)<\/script>/.exec(html)[1]);

test('a publish writes a file for each page it shows: none for a hidden page, none for a page of a hidden row', () => {
  const { files, problems } = renderSite(pagesDoc(), lists);
  assert.deepEqual(problems.filter((p) => p.level === 'error'), []);
  assert.deepEqual([...files.keys()], ['index.html', 'map.html', 'about.html', 'search.json',
    'pages/on-the-bridge.html', 'pages/more-on-b.html', 'pages/second.html', 'pages/on-row-c.html']);
  for (const path of [...files.keys()].filter((p) => p.startsWith('pages/'))) assert.match(files.get(path).type, /^text\/html/, path);
  const hidden = run(pagesDoc(), [{ op: 'hide-row', id: 'c', hidden: true }]);
  const later = renderSite(hidden, lists).files;
  assert.deepEqual([...later.keys()].filter((p) => p.startsWith('pages/')), ['pages/on-the-bridge.html', 'pages/more-on-b.html', 'pages/second.html']);
  for (const [path, { body: html }] of later) {
    for (const mark of ['Kept back', 'kept-back', 'SECRET-WORDS-x7', 'On row c', 'on-row-c', 'ROW-C-WORDS-k2']) assert.ok(!html.includes(mark), `${mark} in ${path}`);
  }
});

test('the tabs on every page: Library, Map, the shown site pages in their order, About; a site page\'s own marked', () => {
  const { files } = renderSite(pagesDoc(), lists);
  assert.deepEqual(tabsOf(body(files, 'index.html')), ['Library index.html aria-current="page"', 'Map map.html', 'On the bridge pages/on-the-bridge.html', 'Second pages/second.html', 'About about.html']);
  assert.deepEqual(tabsOf(body(files, 'map.html')).map((t) => t.split(' ')[0]), ['Library', 'Map', 'On', 'Second', 'About']);
  assert.deepEqual(tabsOf(body(files, 'about.html')), ['Library index.html', 'Map map.html', 'On the bridge pages/on-the-bridge.html', 'Second pages/second.html', 'About about.html aria-current="page"']);
  assert.deepEqual(tabsOf(body(files, 'pages/on-the-bridge.html')), ['Library ../index.html', 'Map ../map.html', 'On the bridge ../pages/on-the-bridge.html aria-current="page"', 'Second ../pages/second.html', 'About ../about.html']);
  assert.deepEqual(tabsOf(body(files, 'pages/more-on-b.html')), ['Library ../index.html', 'Map ../map.html', 'On the bridge ../pages/on-the-bridge.html', 'Second ../pages/second.html', 'About ../about.html'], 'a row page has no tab');
  // Second moved back past Kept back, which the public does not see, and then past On the bridge.
  const moved = renderSite(run(pagesDoc(), [{ op: 'move-page', id: 'p4', step: -1 }, { op: 'move-page', id: 'p4', step: -1 }]), lists).files;
  assert.deepEqual(tabsOf(body(moved, 'index.html')).map((t) => t.split(' ')[0]), ['Library', 'Map', 'Second', 'On', 'About']);
  const none = renderSite(sampleDoc(), lists).files;
  assert.deepEqual(tabsOf(body(none, 'index.html')), ['Library index.html aria-current="page"', 'Map map.html', 'About about.html'], 'no pages, the three tabs');
});

test('a site page: its title as the one <h1>, then its text in article.read.page, Markdown with its links and headings', () => {
  const html = body(renderSite(pagesDoc(), lists).files, 'pages/on-the-bridge.html');
  assert.match(html, /<title>On the bridge<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/web\/read\.css">/);
  // A heading typed at the top, of the first level, is drawn as every other heading is: the page's
  // title is its own <h1>, and the words typed are kept.
  assert.match(html, /<h1>On the bridge<\/h1>\n<article class="read page">\n<h2>Not a second title<\/h2>\n<p>The <a href="\.\.\/index\.html#o=b">bridge<\/a> and <a href="\.\.\/index\.html#k=wall">a wall<\/a>\.<\/p>/);
  assert.match(html, /<h2>Built<\/h2>\n<p>In 1928, <em>after<\/em> the <a href="\.\.\/pages\/second\.html">other page<\/a>\.<\/p>/);
  assert.equal(html.match(/<h1>/g).length, 1);
  assert.ok(!html.includes('page-row'), 'no row at its top');
  const only = body(renderSite(run(pagesDoc(), [{ op: 'set-page', id: 'p4', text: '# Only a heading' }]), lists).files, 'pages/second.html');
  assert.match(only, /<article class="read page">\n<h2>Only a heading<\/h2>\s*<\/article>/);
});

test('a row page opens with its row: number, title, first picture and the way back to the row; then its title and text', () => {
  const html = body(renderSite(pagesDoc(), lists).files, 'pages/more-on-b.html');
  const top = /<div class="page-row">[\s\S]*?<\/div>/.exec(html)?.[0];
  assert.ok(top, 'no row at the top');
  assert.match(top, /<img src="https:\/\/p\.test\/b-1\.jpg" alt="" width="40" height="30">/);
  assert.ok(!html.includes('b-2.jpg'), 'its first picture only');
  assert.match(top, /<span class="no">1\.02<\/span> The bridge, a postcard/);
  assert.match(top, /<a class="back" href="\.\.\/index\.html#o=b">← Back to the row<\/a>/);
  assert.ok(html.indexOf(top) < html.indexOf('<h1>More on b</h1>'), 'the row stands above the title');
  assert.match(html, /<h1>More on b<\/h1>\n<article class="read page">\n<p>A QUOKKA crossed <a href="\.\.\/index\.html#o=b">the bridge<\/a>\.<\/p>\n<ul>\n<li>one<\/li>/);
  const bare = body(renderSite(run(pagesDoc(), [{ op: 'add-page', title: 'On d', row: 'd' }]), lists).files, 'pages/on-d.html');
  assert.match(bare, /<div class="page-row"><p class="page-row-head"><span class="no">2\.01<\/span> Row d<\/p>/, 'a row without a picture: its number and title');
});

test('an open row says Read: <title> → for each page of it a publish shows, on the Library and on the map; nothing for a hidden one', () => {
  const { files } = renderSite(run(pagesDoc(), [{ op: 'add-page', title: 'Also on b', row: 'b' }]), lists);
  const read = '<ul class="reads"><li><a href="pages/more-on-b.html">Read: More on b →</a></li><li><a href="pages/also-on-b.html">Read: Also on b →</a></li></ul>';
  assert.ok(articleOf(body(files, 'index.html'), 'b').includes(read), articleOf(body(files, 'index.html'), 'b'));
  assert.ok(body(files, 'map.html').includes(read), 'in the map\'s panel');
  assert.ok(!articleOf(body(files, 'index.html'), 'a').includes('class="reads"'), 'a row without pages has no such list');
  const hidden = renderSite(run(pagesDoc(), [{ op: 'hide-page', id: 'p2', hidden: true }]), lists).files;
  assert.ok(!articleOf(body(hidden, 'index.html'), 'b').includes('class="reads"'));
  for (const [path, { body: html }] of hidden) assert.ok(!html.includes('more-on-b') && !html.includes('More on b'), path);
});

test('a link [[more|page:<address>]] in a row\'s text leads to the page; to a hidden page it is its words, and the address goes nowhere public', () => {
  const doc = run(pagesDoc(), [{ op: 'set-row', id: 'b', fields: { text: ['See [[more|page:on-the-bridge]], [[this|page:kept-back]] and [[page:more-on-b]].'] } }]);
  const { files } = renderSite(doc, lists);
  const want = '<p>See <a href="pages/on-the-bridge.html">more</a>, this and <a href="pages/more-on-b.html">More on b</a>.</p>';
  assert.ok(articleOf(body(files, 'index.html'), 'b').includes(want), articleOf(body(files, 'index.html'), 'b'));
  assert.ok(body(files, 'map.html').includes(want), 'in the map\'s panel');
  for (const [path, { body: html }] of files) assert.ok(!html.includes('kept-back'), path);
  const edit = articleOf(renderEditPage(doc, { version: 1, published: null, lists }), 'b');
  assert.ok(edit.includes('<a href="../edit/pages/on-the-bridge">more</a>'), 'edit mode leads to the page in edit mode');
  assert.ok(edit.includes('<span class="dead-link" title="The page is hidden.">this</span>'));
});

// A Markdown table parts its rows into cells at every | (GFM); the | inside a link typed in a cell
// parts nothing (lib/markdown.mjs, shield).
test('a link in a Markdown table\'s cell, in a page or in About, is one link: to a hidden row its words alone, its code in no public file; to a shown row a link in its cell', () => {
  const table = '| what | where |\n|---|---|\n| [[the secret|@r7]] | here |';
  const doc = run({ ...sampleDoc({ c1: ['a', 'r7'], c2: ['d'] }), next: { row: 8, chapter: 3 } }, [
    { op: 'add-page', title: 'Table', row: null },
    { op: 'set-page', id: 'p1', text: table },
    { op: 'set-about', text: table },
  ]);
  const hidden = renderSite(run(doc, [{ op: 'hide-row', id: 'r7', hidden: true }]), lists).files;
  for (const path of ['pages/table.html', 'about.html']) {
    assert.match(body(hidden, path), /<tbody><tr>\n<td>the secret<\/td>\n<td>here<\/td>\n<\/tr>/, path);
  }
  for (const [path, { body: html }] of hidden) {
    for (const mark of ['@r7', '[[the', '#o=r7']) assert.ok(!html.includes(mark), `${mark} in ${path}`);
  }
  const shown = renderSite(doc, lists).files;
  assert.match(body(shown, 'pages/table.html'), /<tbody><tr>\n<td><a href="\.\.\/index\.html#o=r7">the secret<\/a><\/td>\n<td>here<\/td>\n<\/tr>/);
  assert.match(body(shown, 'about.html'), /<tbody><tr>\n<td><a href="index\.html#o=r7">the secret<\/a><\/td>\n<td>here<\/td>\n<\/tr>/);
  for (const [path, { body: html }] of shown) assert.ok(!html.includes('@r7') && !html.includes('[[the'), path);
});

test('a row page\'s words are found as its row\'s; a site page and a hidden page are not in the search', () => {
  const doc = run(pagesDoc(), [{ op: 'add-page', title: 'Hidden on b', row: 'b' }, { op: 'set-page', id: 'p6', text: 'HIDDEN-ON-B-z4' }, { op: 'hide-page', id: 'p6', hidden: true }]);
  const index = JSON.parse(body(renderSite(doc, lists).files, 'search.json'));
  const b = index.rows.find((row) => row.no === 'b');
  assert.deepEqual(b.read, ['More on b', 'A QUOKKA crossed the bridge.', 'one', 'two']);
  const all = JSON.stringify(index);
  for (const mark of ['On the bridge', 'Built', 'HIDDEN-ON-B-z4', 'SECRET-WORDS-x7']) assert.ok(!all.includes(mark), mark);
  const edit = editSearch(doc, lists).rows.find((row) => row.no === 'b');
  assert.deepEqual(edit.read, ['More on b', 'A QUOKKA crossed the bridge.', 'one', 'two', 'Hidden on b', 'HIDDEN-ON-B-z4'], 'edit mode finds what it shows');
});

test('in edit mode the tabs lead to the pages in edit mode, a hidden one dotted, and an open row has every page of it, a hidden one dotted', () => {
  const doc = run(pagesDoc(), [{ op: 'hide-page', id: 'p2', hidden: true }]);
  const html = renderEditPage(doc, { version: 3, published: null, lists });
  assert.deepEqual(tabsOf(html), ['Library ../edit/ aria-current="page"', 'Map ../map.html', 'On the bridge ../edit/pages/on-the-bridge',
    'Kept back ../edit/pages/kept-back class="dead-link" title="The page is hidden."', 'Second ../edit/pages/second', 'About ../about.html']);
  assert.ok(articleOf(html, 'b').includes('<ul class="reads"><li><a class="dead-link" href="../edit/pages/more-on-b" title="The page is hidden.">Read: More on b →</a></li></ul>'));
  assert.ok(articleOf(html, 'c').includes('<ul class="reads"><li><a href="../edit/pages/on-row-c">Read: On row c →</a></li></ul>'));
  assert.equal(renderEditRow(doc, 'b', lists), articleOf(html, 'b'), 'a row drawn alone has them too');
  // A page of a hidden row is not published either; its own Hide is not why, so it says the row.
  const shut = run(doc, [{ op: 'hide-row', id: 'c', hidden: true }, { op: 'set-row', id: 'a', fields: { text: ['See [[this|page:on-row-c]] and [[that|page:more-on-b]].'] } }]);
  const hiddenRow = renderEditPage(shut, { version: 3, published: null, lists });
  assert.ok(articleOf(hiddenRow, 'c').includes('<a class="dead-link" href="../edit/pages/on-row-c" title="Its row is hidden.">Read: On row c →</a>'), articleOf(hiddenRow, 'c'));
  assert.ok(articleOf(hiddenRow, 'a').includes('<span class="dead-link" title="Its row is hidden.">this</span> and <span class="dead-link" title="The page is hidden.">that</span>'), articleOf(hiddenRow, 'a'));
  const both = renderEditPage(run(shut, [{ op: 'hide-page', id: 'p5', hidden: true }]), { version: 3, published: null, lists });
  assert.ok(articleOf(both, 'c').includes('title="The page is hidden.">Read: On row c →</a>'), 'hidden itself, the page says so first');
});

test('a page in edit mode: drawn from the draft at /edit/pages/<address>, its script and the draft as data; a hidden one too; none for an unknown address', () => {
  const doc = pagesDoc();
  const html = renderPageEdit(doc, 'more-on-b', { version: 7, published: null, lists, originals: null });
  assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/web\/base\.css">/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/web\/edit\.css">/);
  assert.match(html, /<script type="module" src="\.\.\/\.\.\/web\/edit\/pages\.js"><\/script>/);
  assert.match(html, /<a class="back" href="\.\.\/\.\.\/edit\/#o=b">← Back to the row<\/a>/);
  assert.match(html, /<h1>More on b<\/h1>\n<article class="read page" data-page="p2">\n<p>A QUOKKA crossed <a href="\.\.\/\.\.\/edit\/#o=b">the bridge<\/a>\.<\/p>/);
  assert.deepEqual(tabsOf(html)[0], 'Library ../../edit/');
  const data = editData(html);
  assert.equal(data.version, 7);
  assert.equal(data.page, 'p2');
  // The draft, its pages without their text but for this page's own (render.mjs, pagesHeld).
  assert.deepEqual(data.doc, { ...doc, pages: doc.pages.map(({ text, ...page }) => (page.id === 'p2' ? { ...page, text } : page)) });
  assert.deepEqual(Object.keys(data.doc.pages[1]), ['id', 'address', 'title', 'text', 'row', 'hidden']);
  assert.deepEqual(data.numbers, { a: '1.01', b: '1.02', c: '1.03', d: '2.01' });
  assert.equal(data.summary, 'Nothing published yet: 4 rows in 2 chapters');
  const kept = renderPageEdit(doc, 'kept-back', { version: 7, published: null, lists });
  assert.match(kept, /<h1>Kept back<\/h1>\n<article class="read page" data-page="p3">\n<p>SECRET-WORDS-x7<\/p>/);
  assert.match(tabsOf(kept).find((t) => t.startsWith('Kept back')), /aria-current="page" class="dead-link"/);
  assert.equal(renderPageEdit(doc, 'nowhere', { version: 7, published: null, lists }), null);
  assert.equal(renderPageEdit(doc, 'constructor', { version: 7, published: null, lists }), null);
});

test('after an edit of a page, its tabs and its text exactly as the page in edit mode draws them', () => {
  const doc = run(pagesDoc(), [{ op: 'move-page', id: 'p4', step: -1 }, { op: 'hide-page', id: 'p1', hidden: true }]);
  const html = renderPageEdit(doc, 'on-the-bridge', { version: 1, published: null, lists });
  const parts = renderPageParts(doc, 'p1', lists);
  assert.equal(parts.nav, /<nav class="tabs"[\s\S]*?<\/nav>/.exec(html)[0]);
  assert.equal(parts.article, /<article class="read page"[\s\S]*?<\/article>/.exec(html)[0]);
  assert.deepEqual(tabsOf(parts.nav).map((t) => t.split(' ')[0]), ['Library', 'Map', 'On', 'Second', 'Kept', 'About']);
  assert.equal(renderPageParts(doc, 'p9', lists), null);
});

test('markup typed into a page\'s title and text stays words, in the tab, the title, the text and the Read: line', () => {
  const typed = 'Alpenzeitung & <b>"Dolomiten"</b> </script>';
  const shown = 'Alpenzeitung &amp; &lt;b&gt;&quot;Dolomiten&quot;&lt;/b&gt; &lt;/script&gt;';
  const doc = run(sampleDoc(), [
    { op: 'add-page', title: typed, row: null },
    { op: 'add-page', title: typed, row: 'a' },
    { op: 'set-page', id: 'p1', text: `<script>alert(1)</script>\n\n${typed}` },
  ]);
  const { files } = renderSite(doc, lists);
  assert.deepEqual([...files.keys()].slice(4), ['pages/alpenzeitung-b-dolomiten-b-script.html', 'pages/alpenzeitung-b-dolomiten-b-script-2.html']);
  const site = body(files, 'pages/alpenzeitung-b-dolomiten-b-script.html');
  assert.ok(site.includes(`<title>${shown}</title>`) && site.includes(`<h1>${shown}</h1>`));
  assert.ok(site.includes(`aria-current="page">${shown}</a>`), 'its tab');
  assert.ok(site.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(articleOf(body(files, 'index.html'), 'a').includes(`>Read: ${shown} →</a>`));
  for (const [path, { body: html }] of files) assert.ok(!html.includes('<b>"Dolomiten"</b>') && !html.includes('<script>alert'), path);
  const edit = renderPageEdit(doc, 'alpenzeitung-b-dolomiten-b-script', { version: 1, published: null, lists });
  assert.ok(edit.includes(`<h1>${shown}</h1>`) && !edit.includes('<script>alert'));
  assert.equal(editData(edit).doc.pages[0].text, `<script>alert(1)</script>\n\n${typed}`, 'the draft as data, its </script> unable to close the tag');
});
