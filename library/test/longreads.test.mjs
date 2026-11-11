import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import { renderMarkdown, renderDocx, sheets, tidyWord } from '../lib/longread.mjs';
import longreads from '../steps/40-longreads.mjs';
import { buildFixtures, cleanRoot, tempDir } from './helpers.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORTS = path.join(REPO, 'reports');
const FIRST = path.join(REPORTS, 'Fascist Bolzano media and migration.docx');
const SECOND = path.join(REPORTS, 'Semirurali versus Libyan villages.docx');

// The long-reads step on the fixtures; `edit` may change the loaded library first.
async function runStep({ edit = () => {}, setup = async () => {} } = {}) {
  const root = await cleanRoot();
  await setup(root);
  const lib = await loadLibrary(root);
  edit(lib);
  const written = new Map();
  const ctx = {
    root,
    out: path.join(root, 'dist'),
    lib,
    options: {},
    problems: lib.problems,
    write: async (relPath, content) => void written.set(relPath, String(content)),
    copyFile: async () => {},
    sourceUrl: (abs) => sourceUrl(root, abs),
  };
  const before = lib.problems.length;
  await longreads(ctx);
  return { written, problems: lib.problems.slice(before), lib, root };
}

test('markdown headings and paragraphs render', () => {
  const html = renderMarkdown('# Title\n\nFirst *paragraph*.\n\n## A section\n\nSecond.\n', { linkBase: REPO });
  assert.match(html, /<h2[^>]*>A section<\/h2>/);
  assert.match(html, /<p>First <em>paragraph<\/em>\.<\/p>/);
  assert.doesNotMatch(html, /<h1/, 'the leading h1 repeats the title and is dropped');
  assert.match(renderMarkdown('Intro\n\n# Later\n', { linkBase: REPO }), /<h2>Later<\/h2>/, 'only a leading h1 goes; a later one becomes h2');
});

test('a relative link to a file with spaces becomes an encoded /source/ address', () => {
  const linkBase = path.join(REPO, 'research_notes', 'Inv A', 'files', '05_x');
  const html = renderMarkdown("[a photo](Teßmann%20'60.jpg) and [page](../other%20dir/page.pdf#p2) and [![alt](small.png)](small.png)", { linkBase });
  assert.ok(html.includes(`href="/source/research_notes/Inv%20A/files/05_x/Te%C3%9Fmann%20&#39;60.jpg"`), html);
  assert.ok(html.includes('href="/source/research_notes/Inv%20A/files/other%20dir/page.pdf#p2"'), html);
  assert.ok(html.includes('src="/source/research_notes/Inv%20A/files/05_x/small.png"'), html);
});

test('an external link is left alone and opens in a new tab', () => {
  const html = renderMarkdown('[out](https://example.org/a?b=1&c=2) [in page](#top)', { linkBase: REPO });
  assert.ok(html.includes('<a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noopener">out</a>'), html);
  assert.ok(html.includes('<a href="#top">in page</a>'), html);
});

test('a script tag in the markdown is not executed markup', () => {
  const html = renderMarkdown(
    'Hi <script>alert(1)</script> <img src=x onerror="alert(2)"> <a href="javascript:alert(3)" onclick="x()">raw</a>\n\n'
    + '[bad](javascript:alert(4)) [worse](JaVaScRiPt:alert(5)) [data](data:text/html,x)\n\n<div onmouseover="x()">block</div>\n',
    { linkBase: REPO },
  );
  assert.doesNotMatch(html, /<script|<img|<div|<a [^>]*onclick/i);
  assert.doesNotMatch(html, /href="\s*(javascript|data):/i);
  assert.doesNotMatch(html, /<[^>]*\son\w+=/i, 'no event-handler attribute survives inside a tag');
});

test('a table renders as a table', () => {
  const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n', { linkBase: REPO });
  assert.match(html, /<table>[\s\S]*<th>a<\/th>[\s\S]*<td>2<\/td>/);
});

test('a table stands in a strip of its own, from Markdown and from Word', () => {
  const html = renderMarkdown('Before.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter.\n', { linkBase: REPO });
  assert.match(html, /<p>Before\.<\/p>\s*<div class="sheet"><table>[\s\S]*<\/table><\/div>\s*<p>After\.<\/p>/);
  assert.equal(html.match(/class="sheet"/g).length, 1);
  assert.equal(
    tidyWord('<p>a</p><table><tr><td><p>1</p></td></tr></table><p>b</p>'),
    '<p>a</p><div class="sheet"><table><tr><td><p>1</p></td></tr></table></div><p>b</p>',
  );
  const grid = '<table><tr><td><p><img src="x.png" alt="" /></p></td></tr></table>';
  assert.doesNotMatch(tidyWord(grid), /sheet|<table/, 'a grid of figures is no table, and gets no strip');
});

test('a table inside a table shares the outer strip', () => {
  const inner = '<table><tr><td>in</td></tr></table>';
  assert.equal(
    sheets(`<p>x</p><table class="t"><tr><td>${inner}</td></tr></table><table></table>`),
    `<p>x</p><div class="sheet"><table class="t"><tr><td>${inner}</td></tr></table></div><div class="sheet"><table></table></div>`,
  );
  assert.equal(sheets('<p>no table</p></table>'), '<p>no table</p></table>', 'a stray closing tag opens nothing');
});

test('the step writes a page per read row: title, way back, body, no repeated heading', async () => {
  const { written, problems } = await runStep();
  assert.deepEqual(problems, []);
  assert.deepEqual([...written.keys()].sort(), ['read/0.01.html', 'read/5.00.html']);
  const html = written.get('read/0.01.html');
  assert.match(html, /<title>First study<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/web\/read\.css">/);
  assert.match(html, /<a class="back" href="\.\.\/index\.html#o=0\.01">← Library<\/a>/);
  assert.match(html, /<h1>First study<\/h1>/);
  assert.equal(html.match(/<h1/g).length, 1);
  assert.match(html, /<h2[^>]*>A section<\/h2>/);
  assert.doesNotMatch(html, /Sources/);
  const notes = written.get('read/5.00.html');
  assert.ok(notes.includes(`href="/source/research_notes/Inv%20A/files/05_x/Te%C3%9Fmann%20&#39;60.jpg"`), notes);
  assert.ok(notes.includes('target="_blank" rel="noopener">An outside page</a>'));
});

test('a story closes with its Sources, each linking its row', async () => {
  const { written } = await runStep({
    edit: ({ entries }) => {
      const row = entries.find((e) => e.no === '0.01');
      row.type = 'Story';
      row.sources = ['5.02', '12.01'];
    },
  });
  const html = written.get('read/0.01.html');
  const list = /<h2[^>]*>Sources<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/.exec(html);
  assert.ok(list, html);
  const items = [...list[1].matchAll(/<li><a href="([^"]+)">([^<]*)<\/a><\/li>/g)].map((m) => [m[1], m[2]]);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(([href]) => href), ['../index.html#o=5.02', '../index.html#o=12.01']);
  assert.match(items[0][1], /^5\.02 /);
});

test('a file that cannot be rendered is a warning and writes no page', async () => {
  const { written, problems, lib } = await runStep({
    setup: (root) => rm(path.join(root, 'reports', 'first study.md')),
    edit: ({ entries }) => (entries.find((e) => e.no === '5.00').more.target = 'gone.docx'),
  });
  assert.deepEqual([...written.keys()], []);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => p.level === 'warn'));
  assert.match(problems[0].message, /row 0\.01.*first study\.md/);
  assert.match(problems[1].message, /row 5\.00.*gone\.docx/);
  for (const entry of lib.entries) assert.equal(entry.page, undefined, `${entry.no} has no page`);
});

test('the step records the page it wrote on the entry', async () => {
  const { written, lib } = await runStep();
  const pages = Object.fromEntries(lib.entries.filter((e) => e.page).map((e) => [e.no, e.page]));
  assert.deepEqual(pages, { '0.01': 'read/0.01.html', '5.00': 'read/5.00.html' });
  for (const page of Object.values(pages)) assert.ok(written.has(page));
});

test('a read row whose target is not Markdown or Word is a warning naming row and file, and has no page', async () => {
  const { written, problems, lib } = await runStep({ edit: ({ entries }) => (entries.find((e) => e.no === '5.00').more.target = 'page.pdf') });
  assert.deepEqual(problems, [{
    level: 'warn',
    where: 'research_notes/Inv A/files/05_x/entries.json',
    message: 'row 5.00: research_notes/Inv A/files/05_x/page.pdf is not Markdown or Word, so it has no page',
  }]);
  assert.deepEqual([...written.keys()], ['read/0.01.html']);
  assert.equal(lib.entries.find((e) => e.no === '5.00').page, undefined);
});

test('the build writes the read pages', async () => {
  const { out, run } = await buildFixtures();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(await readFile(path.join(out, 'read', '5.00.html'), 'utf8'), /<h1>Thread five: fixture notes<\/h1>/);
});

async function docx(file, name) {
  const imageDir = await tempDir('library-img-');
  const cacheDir = await tempDir('library-cache-');
  const html = await renderDocx(file, { imageDir, imageUrl: `img/${name}/`, cacheDir });
  return { html, imageDir, cacheDir };
}

test('the first report keeps its 50 figures', { skip: !existsSync(FIRST) && 'the report is not here', timeout: 300000 }, async () => {
  const { html, imageDir, cacheDir } = await docx(FIRST, 'a');
  assert.equal((html.match(/<img/g) ?? []).length, 50);
  assert.doesNotMatch(html, /data:image/);
  assert.equal((await readdir(imageDir)).filter((n) => /^fig-\d+\./.test(n)).length, 50);
  assert.match(html, /<img[^>]*src="img\/a\/fig-1\.\w+"/);
  assert.doesNotMatch(html, /<h1|Fascism Showed Italians Two Different Bolzanos/, 'the first h1 repeats the title and is dropped');
  assert.match(html, /<figcaption>Figure 1\b/);
  assert.equal((html.match(/<figcaption>Figure \d+\b/g) ?? []).length, 49, 'every "Figure N" caption sits under its figure, also where the file puts it first');
  assert.doesNotMatch(html, /<p>(<em>)?Figure \d/);
  assert.doesNotMatch(html, />Contents</, 'the contents block is left out');
  // second time: from the cache, same result
  const again = await renderDocx(FIRST, { imageDir: await tempDir('library-img-'), imageUrl: 'img/a/', cacheDir });
  assert.equal(again, html);
});

test('the second report keeps at least 25', { skip: !existsSync(SECOND) && 'the report is not here', timeout: 300000 }, async () => {
  const { html } = await docx(SECOND, 'b');
  assert.ok((html.match(/<img/g) ?? []).length >= 25);
});

test('a cached conversion missing a figure or its html is converted again', { skip: !existsSync(SECOND) && 'the report is not here', timeout: 300000 }, async () => {
  const { html, cacheDir } = await docx(SECOND, 'b');
  const [folder] = (await readdir(cacheDir)).filter((name) => name.startsWith('docx-')).map((name) => path.join(cacheDir, name));
  const names = JSON.parse(await readFile(path.join(folder, 'images.json'), 'utf8'));
  assert.ok(names.length >= 25);

  for (const damage of [names[0], names.at(-1), 'body.html']) {
    await rm(path.join(folder, damage));
    const imageDir = await tempDir('library-img-');
    const again = await renderDocx(SECOND, { imageDir, imageUrl: 'img/b/', cacheDir });
    assert.equal(again, html, `without ${damage}`);
    assert.ok(existsSync(path.join(folder, damage)), `${damage} is back in the cache`);
    assert.deepEqual((await readdir(imageDir)).sort(), [...names].sort());
  }
});

test('a heading left empty by the Word tidy is dropped', () => {
  assert.equal(tidyWord('<p>a</p><h2><a id="_Toc1"></a></h2><h2>Next</h2><p>b</p>'), '<p>a</p><h2>Next</h2><p>b</p>');
  assert.equal(tidyWord('<p>a</p><h2> </h2><h3>&nbsp;</h3><h2><strong></strong></h2><p>b</p>'), '<p>a</p><p>b</p>');
  assert.equal(tidyWord('<h1></h1><h1>The title</h1><p>a</p>'), '<p>a</p>', 'an empty heading before the title does not hide it');
  const picture = '<p>a</p><h2><img src="x.png" alt="" /></h2>';
  assert.equal(tidyWord(picture), picture, 'a heading holding only a picture stays');
});

test('an image from the network is its alt text, not an img', () => {
  const html = renderMarkdown('![a poster](https://example.org/p.jpg) and ![local](small.png)', { linkBase: path.join(REPO, 'reports') });
  assert.ok(html.includes('a poster'));
  assert.doesNotMatch(html, /example\.org/);
  assert.equal((html.match(/<img/g) ?? []).length, 1, 'only the local image stays');
});

test('tidying Word html leaves nested lists, quotes, pre, br and bare images alone', () => {
  const keep = '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul><blockquote><p>q</p></blockquote><pre>x\n y</pre><p>one<br />two</p><ol><li>n</li></ol><img src="y.png" alt="" />';
  assert.equal(tidyWord(keep), keep);
  const around = '<p>Intro</p><h3>Contents</h3><p><a href="#_Toc1">One\t3</a></p><p><a href="#_Toc2">Two\t4</a></p>';
  assert.equal(tidyWord(`${keep}${around}${keep}`), `${keep}<p>Intro</p>${keep}`, 'only the contents block goes');
  assert.equal(tidyWord('<p>before</p><p><img src="x.png" alt="" /></p><p>after</p>'), '<p>before</p><figure><img src="x.png" alt="" /></figure><p>after</p>');
});
