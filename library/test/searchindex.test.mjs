import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { stripTags, paragraphs } from '../lib/searchindex.mjs';
import { prepare, search } from '../web/search.js';
import { buildFixtures } from './helpers.mjs';

let built;
function builtIndex() {
  built ??= buildFixtures().then(async ({ out, run }) => {
    assert.equal(run.status, 0, run.stdout + run.stderr);
    return JSON.parse(await readFile(path.join(out, 'search.json'), 'utf8'));
  });
  return built;
}

test('stripTags takes the source tags off a fact and nothing else', () => {
  assert.equal(stripTags("Poster 'Lana–Meran' by Reckziegel, 1906 (manifest)"), "Poster 'Lana–Meran' by Reckziegel, 1906");
  assert.equal(stripTags('Calls Bolzano the queen (notes 01, Q4, [IMG✓])'), 'Calls Bolzano the queen');
  assert.equal(stripTags('Seen [V] in the scan (file, p. 3).'), 'Seen in the scan');
  assert.equal(stripTags('Dated [1924] on the back (not signed)'), 'Dated [1924] on the back (not signed)');
});

test('paragraphs gives the text of the blocks', () => {
  assert.deepEqual(paragraphs('<h2>One</h2>\n<p>A <a href="x">link</a> &amp; more.</p><ul><li>item</li></ul><p> </p>'), ['One', 'A link & more.', 'item']);
});

test('the build writes search.json with every row and its sources', async () => {
  const index = await builtIndex();
  assert.equal(index.v, 1);
  assert.deepEqual(index.rows.map((r) => r.no), ['0.01', '5.00', '5.01', '5.02', '5.03', '12.01']);
  const row = (no) => index.rows.find((r) => r.no === no);
  assert.deepEqual(row('5.01').line.slice(0, 3), ['5.01', 'Two photographs of a bridge', 'Photograph']);
  assert.ok(row('5.01').line.includes('Ponte Druso'), 'the keyword\'s label');
  assert.deepEqual(row('5.01').on, ['PONTE DRUSO']);
  assert.deepEqual(row('5.01').place, ['Ponte Druso'], 'the place, the maker and the holder apart from the line the row shows');
  assert.deepEqual(row('5.01').maker, ['Fixture maker']);
  assert.deepEqual(row('5.02').holder, ['Example library']);
  assert.equal(row('5.01').line.includes('Fixture maker'), false);
  assert.deepEqual(row('5.01').colours, ['monochrome']);
  assert.equal(row('5.03').table.length, 7);
  assert.ok(row('5.00').read.length > 0 && row('0.01').read.length > 0);
  assert.equal('on' in row('5.02'), false, 'empty lists are left out');
  assert.deepEqual(index.colours.red, ['red', 'rosso', 'rot']);
  assert.deepEqual(index.names[0], ['Bolzano', 'Bozen']);
  assert.deepEqual(index.glossary[0], ['eagle', 'aquila', 'Adler']);
});

test('the index answers a search', async () => {
  const engine = prepare(await builtIndex());
  assert.equal(search(engine, 'Drususbrücke').precise[0].no, '5.01');
  assert.equal(search(engine, '5.03').precise[0].no, '5.03');
});
