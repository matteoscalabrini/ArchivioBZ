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
