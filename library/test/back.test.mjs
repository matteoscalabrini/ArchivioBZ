import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { cameFromLibrary } from '../web/back.js';
import { buildFixtures } from './helpers.mjs';

test('"← Library" goes back in history only when the reader came from this site\'s Library', () => {
  const here = 'http://127.0.0.1:5199/read/0.01.html';
  const href = '../index.html#o=0.01';
  assert.equal(cameFromLibrary('http://127.0.0.1:5199/index.html', href, here), true);
  assert.equal(cameFromLibrary('http://127.0.0.1:5199/', href, here), true, 'the Library served as /');
  assert.equal(cameFromLibrary('', href, here), false, 'no referrer: the link as it is');
  assert.equal(cameFromLibrary('http://127.0.0.1:5199/map.html', href, here), false);
  assert.equal(cameFromLibrary('http://127.0.0.1:5199/read/5.00.html', href, here), false);
  assert.equal(cameFromLibrary('http://127.0.0.1:5180/index.html', href, here), false, 'another origin');
  assert.equal(cameFromLibrary('https://example.org/index.html', href, here), false);
  assert.equal(cameFromLibrary('not an address', href, here), false);
});

test('read and table pages carry the back-link script and keep the link\'s own address', async () => {
  const { out, run } = await buildFixtures();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.ok(existsSync(path.join(out, 'web', 'back.js')));
  for (const [page, no] of [['read/0.01.html', '0.01'], ['read/5.00.html', '5.00'], ['table/5.03.html', '5.03']]) {
    const html = await readFile(path.join(out, page), 'utf8');
    assert.match(html, /<script type="module" src="\.\.\/web\/back\.js"><\/script>/, page);
    assert.ok(html.includes(`<a class="back" href="../index.html#o=${no}">← Library</a>`), page);
  }
});
