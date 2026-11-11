import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import about from '../steps/70-about.mjs';
import { cleanRoot } from './helpers.mjs';

async function runStep({ withText = true, edit = () => {} } = {}) {
  const root = await cleanRoot();
  if (!withText) await rm(path.join(root, 'library', 'content', 'about.md'), { force: true });
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
  await about(ctx);
  return { html: written.get('about.html'), lib };
}

const rows = (html) => [.../<tbody>([\s\S]*?)<\/tbody>/.exec(html)[1].matchAll(/<tr><td>([^<]*)<\/td><td>(\d+)<\/td><\/tr>/g)].map((m) => [m[1], Number(m[2])]);

test('counts by type match the fixtures', async () => {
  const { html, lib } = await runStep();
  assert.match(html, /<a href="about\.html" aria-current="page">About<\/a>/);
  assert.match(html, /<h2>Entries by type<\/h2>/);
  assert.match(html, /<thead><tr><th scope="col">Type<\/th><th scope="col">Entries<\/th><\/tr><\/thead>/);
  assert.match(html, /<div class="sheet"><table>[\s\S]*<\/table><\/div>\n<p class="totals">/, 'the table stands in a strip, as on the read pages');
  const counted = rows(html);
  const expected = new Map();
  for (const e of lib.entries) expected.set(e.type, (expected.get(e.type) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(counted), Object.fromEntries(expected));
  assert.deepEqual(counted.map(([, n]) => n), [...counted.map(([, n]) => n)].sort((a, b) => b - a), 'most frequent first');
  const places = new Set(lib.entries.map((e) => e.place).filter(Boolean)).size;
  const keywords = new Set(lib.entries.flatMap((e) => e.keywords)).size;
  assert.ok(html.includes(`<p class="totals">${lib.entries.length} entries · ${places} places · ${keywords} keywords</p>`), html);
  assert.match(html, /<h2[^>]*>What this is<\/h2>/, 'the text of about.md comes first');
  assert.ok(html.indexOf('What this is') < html.indexOf('Entries by type'));
});

test('the page starts with its title, About, as the only h1', async () => {
  for (const withText of [true, false]) {
    const { html } = await runStep({ withText });
    assert.match(html, /<main>\n<h1>About<\/h1>\n<article class="read about">/);
    assert.equal(html.match(/<h1/g).length, 1);
    assert.match(html, /<link rel="stylesheet" href="web\/read\.css">/, 'read.css sets main > h1 as on the read pages');
  }
});

test('the page builds without about.md', async () => {
  const { html, lib } = await runStep({ withText: false });
  assert.doesNotMatch(html, /What this is/);
  assert.equal(rows(html).reduce((sum, [, n]) => sum + n, 0), lib.entries.length);
  assert.match(html, /class="totals"/);
});

test('totals leave out places and keywords that no row uses', async () => {
  const { html, lib } = await runStep({ edit: ({ entries }) => entries.forEach((e) => { delete e.place; delete e.keywords; }) });
  assert.ok(html.includes(`<p class="totals">${lib.entries.length} entries</p>`), html);
});
