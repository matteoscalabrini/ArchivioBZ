import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, page } from '../lib/shell.mjs';

test('esc escapes markup and quotes', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(undefined), '');
});

test('page marks the named tab, and only that one', () => {
  const html = page({ title: 'Map', tab: 'map', body: '<p>body</p>' });
  assert.match(html, /<a class="wordmark" href="index.html">Translocalities in Bolzano<\/a>/);
  assert.match(html, /<a href="map.html" aria-current="page">Map<\/a>/);
  assert.equal(html.match(/aria-current/g).length, 1);
  assert.match(html, /<a href="index.html">Library<\/a><a href="map.html"[^>]*>Map<\/a><a href="about.html">About<\/a>/);
  assert.ok(html.includes('<p>body</p>'));
  assert.doesNotMatch(page({ title: 'x', tab: null, body: '' }), /aria-current/);
});

test('depth prefixes links and assets, base.css first, scripts as modules', () => {
  const html = page({ title: '<T>', tab: 'library', body: '', css: ['web/read.css'], js: ['web/table.js'], depth: 1, head: '<meta name="x">' });
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(sheets, ['../web/base.css', '../web/read.css']);
  assert.match(html, /<script type="module" src="..\/web\/table.js"><\/script>/);
  assert.match(html, /<a href="..\/index.html" aria-current="page">Library<\/a>/);
  assert.match(html, /<a class="wordmark" href="..\/index.html">/);
  assert.match(html, /<title>&lt;T&gt;<\/title>/);
  assert.ok(html.includes('<meta name="x">'));
});

test('the frame carries the search field after the tabs, and its script, at any depth', () => {
  const html = page({ title: 'x', tab: 'map', body: '', js: ['web/table.js'], depth: 1 });
  assert.match(html, /About<\/a><form class="find" role="search" action="..\/index.html"><input type="text" name="q" placeholder="Search" aria-label="Search the library" autocomplete="off" spellcheck="false"><\/form><\/nav>/);
  const scripts = [...html.matchAll(/<script type="module" src="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['../web/find.js', '../web/table.js']);
  assert.match(page({ title: 'x', tab: 'library', body: '' }), /<form class="find" role="search" action="index.html">/);
});

// Pages (design §14): a site page's tab stands between Map and About, About staying last. In edit
// mode the Library is /edit/ and a page's tab leads to the page in edit mode, a hidden one dotted;
// on the public site a hidden one is never drawn.
test('the site pages\' tabs stand between Map and About, in their order; in edit mode they lead to edit mode, a hidden one dotted', () => {
  const pages = [{ address: 'on-the-bridge', title: 'On <the> bridge' }, { address: 'second', title: 'Second', hidden: false }, { address: 'kept', title: 'Kept', hidden: true }];
  const html = page({ title: 'x', tab: 'page:second', body: '', depth: 1, pages });
  assert.match(html, /<nav class="tabs" aria-label="Sections"><a href="\.\.\/index\.html">Library<\/a><a href="\.\.\/map\.html">Map<\/a><a href="\.\.\/pages\/on-the-bridge\.html">On &lt;the&gt; bridge<\/a><a href="\.\.\/pages\/second\.html" aria-current="page">Second<\/a><a href="\.\.\/about\.html">About<\/a><form/);
  assert.ok(!html.includes('kept'), 'a hidden page has no tab on the public site');
  const edit = page({ title: 'x', tab: 'library', body: '', depth: 1, pages, edit: true });
  assert.match(edit, /<nav class="tabs" aria-label="Sections"><a href="\.\.\/edit\/" aria-current="page">Library<\/a><a href="\.\.\/map\.html">Map<\/a><a href="\.\.\/edit\/pages\/on-the-bridge">On &lt;the&gt; bridge<\/a><a href="\.\.\/edit\/pages\/second">Second<\/a><a href="\.\.\/edit\/pages\/kept" class="dead-link" title="The page is hidden\.">Kept<\/a><a href="\.\.\/about\.html">About<\/a><form/);
});
