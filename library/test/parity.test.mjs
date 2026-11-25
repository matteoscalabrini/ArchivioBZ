// The public pages a publish draws are the pages the build draws from the same records. The
// fixtures go in as the real library does (moveIn, pictures and all), through the database
// (PGlite), and come back with getDraft; renderSite draws them. The build's own steps draw the
// same records in this process, the steps the cloud has an equal for: pictures, the idea, the map,
// the Library, About and the search (the reads and the tables were emptied from the library on 24
// Nov 2026, and the cloud draws neither). What may differ is only what the move means to change:
// the shown number, the chapter headings and each row's chapter, and the pictures' addresses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore } from '../cloud/store.mjs';
import { RECORD_FIELDS } from '../cloud/doc.mjs';
import { loadLists, renderSite } from '../cloud/render.mjs';
import { loadLibrary } from '../lib/records.mjs';
import { moveIn, devPictures } from '../tools/move-in.mjs';
import pictures from '../steps/10-pictures.mjs';
import idea from '../steps/20-idea.mjs';
import map from '../steps/50-map.mjs';
import library from '../steps/60-library.mjs';
import about from '../steps/70-about.mjs';
import search from '../steps/80-search.mjs';
import { cleanRoot, tempDir } from './helpers.mjs';

const TITLES = { 0: 'Zero', 5: 'Five', 12: 'Twelve' };

// The build's steps on the library at `root`, for the web (no link to a held file), into a folder.
async function build(root) {
  const out = await tempDir('parity-build-');
  const lib = await loadLibrary(root);
  const ctx = {
    root, out, lib,
    options: { check: false, present: false, web: true },
    problems: lib.problems,
    async write(rel, content) { await mkdir(path.dirname(path.join(out, rel)), { recursive: true }); await writeFile(path.join(out, rel), content); },
    async copyFile(abs, rel) { await mkdir(path.dirname(path.join(out, rel)), { recursive: true }); await copyFile(abs, path.join(out, rel)); },
    sourceUrl: () => null,
  };
  for (const step of [pictures, idea, map, library, about, search]) await step(ctx);
  const files = new Map();
  for (const name of ['index.html', 'map.html', 'about.html', 'search.json']) files.set(name, await readFile(path.join(out, name), 'utf8'));
  return { files, lib };
}

// What the move changes, made alike on both sides: the number a row shows, its chapter and the
// chapters' headings, where its pictures are.
const same = (html) => html
  .replace(/<h2 class="chapter" data-chapter="[^"]*">[\s\S]*?<\/h2>\n/g, '')
  .replace(/ data-chapter="[^"]*"/g, '')
  .replace(/<span class="c-no">[^<]*<\/span>/g, '<span class="c-no">N</span>')
  .replace(/<span class="no">[^<]*<\/span>/g, '<span class="no">N</span>')
  .replace(/aria-label="[^"·]* · /g, 'aria-label="N · ')
  .replace(/<p class="e-meta">[^<·]* · /g, '<p class="e-meta">N · ')
  .replace(/data-src="[^"]*"/g, 'data-src="P"');
const articles = (html) => [...html.matchAll(/<article class="row" data-no="([^"]+)"[\s\S]*?<\/article>/g)].map((m) => [m[1], m[0]]);

test('the pages of a moved-in draft, read back from the database, are the build\'s pages of the same records', async () => {
  const root = await cleanRoot();
  const pg = new PGlite();
  try {
    const store = makeStore(pgliteDb(pg));
    await store.init();
    await moveIn({ root, store, putPicture: devPictures(await tempDir('parity-pictures-')), chapterTitles: TITLES });
    const { doc } = await store.getDraft();
    const cloud = renderSite(doc, await loadLists(root)).files;
    const { files: built, lib } = await build(root);

    // The record holds the record's fields and nothing the build's steps added.
    for (const [id, row] of Object.entries(doc.rows)) {
      for (const field of Object.keys(row.record)) assert.ok(RECORD_FIELDS.includes(field), `${id}: ${field}`);
    }

    // The Library: every row, then the rest of the page (the idea, the keyword strip in the
    // vocabulary's order, the kinds, the lists the page script reads).
    const index = cloud.get('index.html').body;
    assert.deepEqual(articles(index).map(([id]) => id), lib.entries.map((entry) => entry.no));
    const builtRows = new Map(articles(built.get('index.html')));
    for (const [id, html] of articles(index)) assert.equal(same(html), same(builtRows.get(id)), `row ${id}`);
    const strip = (html) => /<div class="keywords">[\s\S]*?<\/div>/.exec(html)[0];
    assert.equal(strip(index), strip(built.get('index.html')), 'All keywords, in the vocabulary\'s order');
    assert.equal(same(index), same(built.get('index.html')));
    assert.match(index, /<h2 class="chapter" data-chapter="c2"><span class="ch-no">2<\/span> Five<\/h2>/);

    // The map, its places in the order of places.json; About; the search, but for the number
    // each row shows.
    const places = (html) => [...html.matchAll(/data-place="([^"]+)"|data-beyond="([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    assert.deepEqual(places(cloud.get('map.html').body), places(built.get('map.html')));
    assert.equal(same(cloud.get('map.html').body), same(built.get('map.html')));
    assert.equal(cloud.get('about.html').body, built.get('about.html'));
    const unnumbered = (json) => JSON.parse(json).rows.map(({ line: [, ...rest], ...row }) => ({ ...row, line: rest }));
    assert.deepEqual(unnumbered(cloud.get('search.json').body), unnumbered(built.get('search.json')));
  } finally {
    await pg.close();
  }
});
