import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { cp, readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore } from '../cloud/store.mjs';
import { loadLibrary } from '../lib/records.mjs';
import { stripJpeg } from '../lib/metadata.mjs';
import { moveIn, devPictures, CHAPTER_TITLES } from '../tools/move-in.mjs';
import { cleanRoot, tempDir } from './helpers.mjs';

const TITLES = { 0: 'Zero', 5: 'Five', 12: 'Twelve' };

let root, lib, pg, store, dir, putPicture;
before(async () => {
  root = await cleanRoot();
  lib = await loadLibrary(root);
  pg = new PGlite();
  store = makeStore(pgliteDb(pg));
  await store.init();
  dir = await tempDir('move-in-pictures-');
  putPicture = devPictures(dir);
});
after(() => pg.close());

test('every fixture row moves in, in order, with its pictures as addresses', async () => {
  const { doc, rows, pictures } = await moveIn({ root, store, putPicture, chapterTitles: TITLES });
  assert.equal(rows, lib.entries.length);
  assert.deepEqual(doc.chapters.flatMap((c) => c.rows), lib.entries.map((e) => e.no));
  assert.deepEqual(doc.chapters.map((c) => c.title), ['Zero', 'Five', 'Twelve']);
  let seen = 0;
  for (const row of Object.values(doc.rows)) {
    for (const p of row.pictures) { assert.match(p.src, /^\/dev-img\//); seen++; }
    if (row.thumb) assert.match(row.thumb.src, /^\/dev-img\//);
  }
  assert.ok(seen > 0);
  assert.ok(pictures >= seen);
  assert.equal((await store.getDraft()).version, 1);
});

test('a second move-in refuses unless asked to replace', async () => {
  await assert.rejects(moveIn({ root, store, putPicture, chapterTitles: TITLES }), /There is a draft already; --replace to overwrite it/);
  await moveIn({ root, store, putPicture, chapterTitles: TITLES, replace: true });
  assert.equal((await store.getDraft()).version, 2);
});

test('a section without a chapter title stops everything', async () => {
  const fresh = makeStore(pgliteDb(new PGlite()));
  await fresh.init();
  const empty = await tempDir('move-in-empty-');
  await assert.rejects(moveIn({ root, store: fresh, putPicture: devPictures(empty), chapterTitles: { 0: 'Zero', 5: 'Five' } }), /section 12/);
  assert.equal(await fresh.getDraft(), null);
  assert.deepEqual(await readdir(empty), []);
});

// After the record files leave the repository (Task 13, step 7) the files hold no row: a move-in
// then, with --replace, would have set the author's draft aside for an empty one.
test('a library with no rows moves nothing in, and a draft there stays as it is', async () => {
  const bare = await tempDir('move-in-bare-');
  await cp(root, bare, { recursive: true, filter: (src) => !/^(entries.*|find)\.json$/.test(path.basename(src)) });
  const before = await store.getDraft();
  const empty = await tempDir('move-in-none-');
  await assert.rejects(moveIn({ root: bare, store, putPicture: devPictures(empty), chapterTitles: TITLES, replace: true }),
    /There is no row in the record files, so nothing was moved in: the draft in the database is the archive now\./);
  assert.equal((await store.getDraft()).version, before.version);
  assert.deepEqual(await readdir(empty), []);
});

test('a dry run writes no draft and no picture', async () => {
  const fresh = makeStore(pgliteDb(new PGlite()));
  await fresh.init();
  const empty = await tempDir('move-in-dry-');
  const { rows, pictures } = await moveIn({ root, store: fresh, putPicture: devPictures(empty), chapterTitles: TITLES, dryRun: true });
  assert.equal(rows, lib.entries.length);
  assert.ok(pictures > 0);
  assert.equal(await fresh.getDraft(), null);
  assert.deepEqual(await readdir(empty), []);
});

test('every picture written is free of metadata', async () => {
  const names = (await readdir(dir, { recursive: true })).filter((n) => /\.jpe?g$/i.test(n));
  assert.ok(names.length > 0);
  for (const name of names) {
    const buf = await readFile(path.join(dir, name));
    assert.ok(stripJpeg(buf)?.equals(buf), name);
  }
});

test('the chapter titles name every section the library has', () => {
  assert.equal(Object.keys(CHAPTER_TITLES).length, 18);
});
