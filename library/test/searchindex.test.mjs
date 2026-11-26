import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { stripTags, paragraphs, searchIndex } from '../lib/searchindex.mjs';
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

test('a row with an id is indexed under its id, and its number is the first word of its line', () => {
  const lib = { entries: [{ id: '18.04', no: '3.07', title: 'A title', type: 'Poster', date: '1930', keywords: [], text: [] }], keywords: {} };
  const [row] = searchIndex(lib).rows;
  assert.equal(row.no, '18.04');
  assert.deepEqual(row.line.slice(0, 2), ['3.07', 'A title']);
});

// A link in a text (lib/links.mjs) is found by its words, as the reader reads them, never by its code.
test('a link in a row\'s text or a read is indexed as its words', () => {
  const lib = {
    entries: [
      { id: '1.01', no: '1.01', title: 'The bridge in 1928', type: 'Photograph', date: '', keywords: ['ponte-druso'], text: ['See [[the bridge|@1.01]].', 'At [[ponte druso]], [[@1.01]] and [[more|page:on-it]].'] },
      { id: 'r2', no: '1.02', title: 'A note', type: 'Notes', date: '', keywords: [], text: [], pages: [{ title: 'Notes', html: '<p>Read [[it|@1.01]].</p>' }] },
    ],
    keywords: { 'ponte-druso': { label: 'Ponte Druso' } },
    aliases: {},
  };
  const [first, second] = searchIndex(lib).rows;
  assert.deepEqual(first.text, ['See the bridge.', 'At Ponte Druso, The bridge in 1928 and more.']);
  assert.deepEqual(second.read, ['Notes', 'Read it.']);
  assert.ok(!JSON.stringify(searchIndex(lib)).includes('[['));
});

// The edit search finds a row by what the edit page shows; the public one by what the public page
// shows. A link with no words to a hidden row shows that row's title in edit mode and nothing on
// the public site; to a keyword only hidden rows carry, its label in edit mode and its name as
// typed on the public site.
test('the edit search reads a link as the edit page shows it, the public search as the public page', () => {
  const hidden = { id: '5.01', no: '', hidden: true, title: 'Two photographs of a bridge', type: 'Photograph', date: '', keywords: ['ponte-druso'], text: [] };
  const linking = { id: '5.02', no: '2.01', hidden: false, title: 'A page', type: 'Press', date: '', keywords: [], text: ['See [[@5.01]] and [[ponte druso]].'] };
  const vocabulary = { keywords: { 'ponte-druso': { label: 'Ponte Druso' } }, aliases: {} };
  assert.deepEqual(searchIndex({ ...vocabulary, entries: [hidden, linking] }, { edit: true }).rows[1].text, ['See Two photographs of a bridge and Ponte Druso.']);
  assert.deepEqual(searchIndex({ ...vocabulary, entries: [linking] }).rows[0].text, ['See and ponte druso.']);
});
