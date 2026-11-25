import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore } from '../cloud/store.mjs';
import { runDraft } from '../tools/draft.mjs';
import { sampleDoc } from './docs.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
let pg, store, dir, lines, out;
beforeEach(async () => {
  pg = new PGlite();
  store = makeStore(pgliteDb(pg));
  await store.init();
  await store.createDraft(sampleDoc());
  dir = await mkdtemp(path.join(os.tmpdir(), 'draftcli-'));
  lines = [];
  out = { log: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) };
});
afterEach(async () => { await pg.close(); await rm(dir, { recursive: true, force: true }); });
const run = (args, extra = {}) => runDraft(args, { store, root: ROOT, purge: async () => {}, out, ...extra });

test('pull, change, push: the draft has the change and a new version', async () => {
  const file = path.join(dir, 'd.json');
  assert.equal(await run(['pull', file]), 0);
  const pulled = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(pulled.version, 1);
  pulled.doc.rows.a.record.title = 'Changed';
  await writeFile(file, JSON.stringify(pulled));
  assert.equal(await run(['push', file]), 0);
  const draft = await store.getDraft();
  assert.equal(draft.version, 2);
  assert.equal(draft.doc.rows.a.record.title, 'Changed');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 2);
});

test('a push from an old pull is refused with the line', async () => {
  const file = path.join(dir, 'd.json');
  await run(['pull', file]);
  await store.saveDraft(sampleDoc(), 1);
  assert.equal(await run(['push', file]), 1);
  assert.ok(lines.includes('The draft changed since it was pulled (now version 2). Pull again.'), lines.join('\n'));
});

test('a push of a broken document is refused and nothing changes', async () => {
  const file = path.join(dir, 'd.json');
  await run(['pull', file]);
  const pulled = JSON.parse(await readFile(file, 'utf8'));
  pulled.doc.chapters[1].rows.push('a');
  await writeFile(file, JSON.stringify(pulled));
  assert.equal(await run(['push', file]), 1);
  assert.equal((await store.getDraft()).version, 1);
});

test('publish from the command line purges', async () => {
  let purged = 0;
  assert.equal(await run(['publish'], { purge: async () => { purged++; } }), 0);
  assert.equal(purged, 1);
  assert.ok(await store.siteFile('index.html'));
  assert.equal((await store.listPublishes()).length, 1);
});
