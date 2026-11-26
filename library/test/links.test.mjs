// Links. The links typed in a text, [[words|target]] (lib/links.mjs): what each names and how it
// is drawn, on the Library and elsewhere, live and dead. And every page the build writes links
// only to what is there: a /source/ address to a file the server hands out, any other address to a
// file in the output folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from '../serve.mjs';
import { linksIn, linkHtml, withLinks, wordsOf, linksOf } from '../lib/links.mjs';
import { buildFixtures } from './helpers.mjs';

// What a text's links know of the document, as render.mjs gives it: rows by id with their numbers
// and whether a publish shows them, pages by address, the keywords and their folded ids, and the
// keywords some shown row carries.
const CTX = {
  keywords: { 'ponte-druso': { label: 'Ponte Druso' }, typeface: { label: 'Typeface' }, unused: { label: 'Not carried' } },
  aliases: { fraktur: 'typeface' },
  rows: new Map([
    ['1.09', { no: '2.08', title: 'Oltrisarco, postcard with its German caption', shown: true }],
    ['r7', { no: '', title: 'A <hidden> & "draft" row', shown: false }],
  ]),
  pages: new Map([['on-the-bridge', { title: 'On the bridge', shown: true }], ['not-out', { title: 'A page kept back', shown: false }]]),
  carried: new Set(['ponte-druso', 'typeface']),
  edit: false,
};
const LIBRARY = { ...CTX, here: 'library', up: '' };
const OTHER = { ...CTX, here: 'other', up: '../' };
const EDIT = { ...LIBRARY, edit: true };
const draw = (text, ctx) => linkHtml(linksIn(text)[0], ctx);

test('linksIn reads [[words|target]] and [[target]], and leaves what is not a link as typed', () => {
  assert.deepEqual(linksIn('See [[the bridge|@1.09]] and [[Ponte Druso]].'), [
    { start: 4, end: 24, words: 'the bridge', target: '@1.09' },
    { start: 29, end: 44, words: null, target: 'Ponte Druso' },
  ]);
  assert.deepEqual(linksIn('[[ more  words | page:on-the-bridge ]]'), [{ start: 0, end: 38, words: 'more words', target: 'page:on-the-bridge' }]);
  for (const typed of ['[[ without an end', 'an end alone]]', '[[|x]]', '[[ |x]]', '[[x|]]', '[[]]', '[[ ]]', '[single|@1.09]']) {
    assert.deepEqual(linksIn(typed), [], typed);
  }
  assert.deepEqual(linksIn('[[a [[b|c]]'), [{ start: 4, end: 11, words: 'b', target: 'c' }], 'an opening without its end stays text');
});

test('a keyword: a button on the Library, a link to the Library elsewhere', () => {
  assert.equal(draw('[[the bridge|Ponte Druso]]', LIBRARY), '<button type="button" data-k="ponte-druso">the bridge</button>');
  assert.equal(draw('[[the bridge|Ponte Druso]]', OTHER), '<a href="../index.html#k=ponte-druso">the bridge</a>');
  assert.equal(draw('[[the bridge|Ponte Druso]]', { ...OTHER, up: '' }), '<a href="index.html#k=ponte-druso">the bridge</a>');
  // By its label in any case, or by its id; with no words, its label.
  assert.equal(draw('[[Ponte Druso]]', LIBRARY), '<button type="button" data-k="ponte-druso">Ponte Druso</button>');
  assert.equal(draw('[[ponte druso|PONTE DRUSO]]', LIBRARY), '<button type="button" data-k="ponte-druso">ponte druso</button>');
  assert.equal(draw('[[PONTE-DRUSO]]', OTHER), '<a href="../index.html#k=ponte-druso">Ponte Druso</a>');
  // A folded id stands for its target.
  assert.equal(draw('[[broken letters|Fraktur]]', LIBRARY), '<button type="button" data-k="typeface">broken letters</button>');
  assert.equal(draw('[[fraktur]]', OTHER), '<a href="../index.html#k=typeface">Typeface</a>');
});

test('a row: opened in place on the Library, in the Library from elsewhere; with no words, its title', () => {
  assert.equal(draw('[[the postcard|@1.09]]', LIBRARY), '<a href="#o=1.09" data-row="1.09">the postcard</a>');
  assert.equal(draw('[[the postcard|@1.09]]', OTHER), '<a href="../index.html#o=1.09">the postcard</a>');
  assert.equal(draw('[[@1.09]]', LIBRARY), '<a href="#o=1.09" data-row="1.09">Oltrisarco, postcard with its German caption</a>');
  assert.equal(draw('[[@1.09]]', { ...OTHER, up: '' }), '<a href="index.html#o=1.09">Oltrisarco, postcard with its German caption</a>');
});

test('a page: its address under pages/, from the Library and elsewhere; with no words, its title', () => {
  assert.equal(draw('[[more|page:on-the-bridge]]', LIBRARY), '<a href="pages/on-the-bridge.html">more</a>');
  assert.equal(draw('[[more|page:on-the-bridge]]', OTHER), '<a href="../pages/on-the-bridge.html">more</a>');
  assert.equal(draw('[[page:on-the-bridge]]', OTHER), '<a href="../pages/on-the-bridge.html">On the bridge</a>');
});

// Edit mode has its own Library (/edit/) and its own address for a page (/edit/pages/<address>), so a
// link followed there stays in edit mode, where a page not yet published is.
test('in edit mode a page links to the page in edit mode, and from elsewhere than the Library a row or a keyword to the Library in edit mode', () => {
  const away = { ...CTX, here: 'other', up: '../../', edit: true };
  assert.equal(draw('[[more|page:on-the-bridge]]', { ...EDIT, up: '../' }), '<a href="../edit/pages/on-the-bridge">more</a>');
  assert.equal(draw('[[page:on-the-bridge]]', away), '<a href="../../edit/pages/on-the-bridge">On the bridge</a>');
  assert.equal(draw('[[the postcard|@1.09]]', away), '<a href="../../edit/#o=1.09">the postcard</a>');
  assert.equal(draw('[[a bridge|Ponte Druso]]', away), '<a href="../../edit/#k=ponte-druso">a bridge</a>');
  assert.equal(draw('[[the postcard|@1.09]]', { ...EDIT, up: '../' }), '<a href="#o=1.09" data-row="1.09">the postcard</a>', 'on the Library, as ever');
  assert.equal(draw('[[a bridge|Ponte Druso]]', { ...EDIT, up: '../' }), '<button type="button" data-k="ponte-druso">a bridge</button>');
});

// The pages a lib holds (cloud/doc.mjs, libFromDoc): on the public site those a publish shows, in
// edit mode every one, `shown` saying whether a publish shows it.
test('linksOf knows the lib\'s pages by their addresses, and none when it has none', () => {
  const lib = { entries: [], keywords: {}, aliases: {}, pages: [{ address: 'on-the-bridge', title: 'On the bridge', row: null, shown: true }, { address: 'kept', title: 'Kept', row: 'x', shown: false }] };
  assert.deepEqual([...linksOf(lib).pages], [['on-the-bridge', { title: 'On the bridge', shown: true }], ['kept', { title: 'Kept', shown: false }]]);
  assert.deepEqual([...linksOf({ entries: [] }).pages], []);
});

test('the words are escaped in every kind, live or dead, and so is a title drawn as the words', () => {
  const words = '<b>bold</b> & "quoted"';
  const shown = '&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;';
  for (const target of ['Ponte Druso', '@1.09', 'page:on-the-bridge', '@r7', 'Posterz']) {
    for (const ctx of [LIBRARY, OTHER, EDIT]) {
      const html = draw(`[[${words}|${target}]]`, ctx);
      assert.ok(html.includes(`>${shown}<`) || html === shown, `${target}: ${html}`);
      assert.ok(!html.includes('<b>'), `${target}: ${html}`);
    }
  }
  assert.equal(draw('[[@r7]]', EDIT), '<span class="dead-link" title="The row is hidden.">A &lt;hidden&gt; &amp; &quot;draft&quot; row</span>');
});

test('on the public site a target the public may not see is its words alone, and nothing of it', () => {
  const hidden = { ...LIBRARY, rows: new Map([['1.09', { no: '', title: 'Oltrisarco, postcard with its German caption', shown: false }]]) };
  for (const ctx of [hidden, { ...hidden, here: 'other', up: '../' }]) {
    assert.equal(draw('[[the postcard|@1.09]]', ctx), 'the postcard');
    assert.equal(draw('[[@1.09]]', ctx), '', 'no words: nothing, not the hidden row\'s title');
    assert.ok(!withLinks('See [[the postcard|@1.09]] and [[@1.09]].', ctx).includes('1.09'));
    assert.ok(!withLinks('See [[@1.09]].', ctx).includes('Oltrisarco'));
  }
  assert.equal(draw('[[the postcard|@r404]]', LIBRARY), 'the postcard', 'a row there is no such');
  assert.equal(draw('[[@r404]]', OTHER), '');
  assert.equal(draw('[[more|page:not-out]]', OTHER), 'more', 'a hidden page');
  assert.equal(draw('[[page:not-out]]', OTHER), '');
  assert.equal(draw('[[more|page:nowhere]]', LIBRARY), 'more', 'a page there is no such');
  assert.equal(draw('[[old posters|Posterz]]', LIBRARY), 'old posters', 'a keyword there is no such');
  assert.equal(draw('[[Posterz]]', OTHER), 'Posterz', 'its name as typed');
  assert.equal(draw('[[these|unused]]', LIBRARY), 'these', 'a keyword no shown row carries');
  assert.equal(draw('[[Unused]]', LIBRARY), 'Unused', 'its name as typed, not the label');
});

test('in edit mode such a link is dotted, its title saying why', () => {
  const dead = (words, why) => `<span class="dead-link" title="${why}">${words}</span>`;
  assert.equal(draw('[[the draft row|@r7]]', EDIT), dead('the draft row', 'The row is hidden.'));
  assert.equal(draw('[[the postcard|@r404]]', EDIT), dead('the postcard', 'There is no such row.'));
  assert.equal(draw('[[@r404]]', EDIT), dead('@r404', 'There is no such row.'), 'no words: the code, for the author to mend');
  assert.equal(draw('[[more|page:not-out]]', EDIT), dead('more', 'The page is hidden.'));
  assert.equal(draw('[[page:not-out]]', { ...EDIT, here: 'other' }), dead('A page kept back', 'The page is hidden.'));
  assert.equal(draw('[[more|page:nowhere]]', EDIT), dead('more', 'There is no such page.'));
  assert.equal(draw('[[these|unused]]', EDIT), dead('these', 'No row shown carries this keyword.'));
  assert.equal(draw('[[unused]]', EDIT), dead('Not carried', 'No row shown carries this keyword.'));
  assert.equal(draw('[[old posters|Posterz]]', EDIT), dead('old posters', 'There is no such keyword.'));
  assert.equal(draw('[[the postcard|@1.09]]', EDIT), '<a href="#o=1.09" data-row="1.09">the postcard</a>', 'a live link as on the public site');
});

test('withLinks escapes the text around the links; wordsOf gives what a reader reads', () => {
  const text = 'A <i>tag</i> & [[the postcard|@1.09]], [[ left open, [[|x]] and [[@r404]].';
  assert.equal(withLinks(text, LIBRARY),
    'A &lt;i&gt;tag&lt;/i&gt; &amp; <a href="#o=1.09" data-row="1.09">the postcard</a>, [[ left open, [[|x]] and .');
  assert.equal(wordsOf(text, LIBRARY), 'A <i>tag</i> & the postcard, [[ left open, [[|x]] and .');
  assert.equal(wordsOf('See [[@1.09]] at [[ponte druso]].', OTHER), 'See Oltrisarco, postcard with its German caption at Ponte Druso.');
  assert.equal(withLinks('', LIBRARY), '');
});

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unesc = (s) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]);
const SCHEME = /^[a-z][a-z\d+.-]*:/i;

function status(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'HEAD', agent: false }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

test('every local href, src, data-src and data-original in every built page leads to a file', async () => {
  const { root, out, run } = await buildFixtures();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const server = createServer({ root, out });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const pages = (await readdir(out, { recursive: true }))
      .filter((name) => name.endsWith('.html'))
      .map((name) => name.split(path.sep).join('/'))
      .sort();
    assert.deepEqual(pages, ['about.html', 'index.html', 'map.html', 'read/0.01.html', 'read/5.00.html', 'table/5.03.html']);

    const broken = [];
    const checked = [];
    for (const page of pages) {
      const html = await readFile(path.join(out, page), 'utf8');
      const base = new URL(page.split('/').map(encodeURIComponent).join('/'), 'http://library.test/');
      for (const [, attr, raw] of html.matchAll(/\s(href|src|data-src|data-original)="([^"]*)"/g)) {
        const value = unesc(raw).trim();
        if (!value || value.startsWith('#') || /^https?:\/\//i.test(value)) continue;
        const name = `${page}: ${attr}="${value}"`;
        const url = new URL(value, base);
        if (SCHEME.test(value) || url.origin !== base.origin) {
          broken.push(`${name}: not an address on this site`);
        } else if (url.pathname.startsWith('/source/')) {
          const answer = await status(port, url.pathname);
          if (answer !== 200) broken.push(`${name}: the server answers ${answer}`);
        } else {
          const file = path.join(out, ...url.pathname.split('/').filter(Boolean).map(decodeURIComponent));
          if (!(await stat(file).catch(() => null))?.isFile()) broken.push(`${name}: not in the output folder`);
        }
        checked.push(url.pathname);
      }
    }
    assert.deepEqual(broken, []);

    // The check has something to bite on: pictures, files and pages of every kind.
    for (const expected of ['/source/library/content/cover.png', '/source/research_notes/Inv%20A/files/05_x/page.pdf',
      '/img/5.01-1.jpg', '/read/0.01.html', '/table/5.03.html', '/map.html', '/web/back.js', '/index.html']) {
      assert.ok(checked.includes(expected), `nothing links ${expected}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
