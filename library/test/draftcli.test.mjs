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

test('a push that edit mode could not draw is refused and nothing changes: a text that is not a list, an idea naming no keyword', async () => {
  const file = path.join(dir, 'd.json');
  await run(['pull', file]);
  const pulled = JSON.parse(await readFile(file, 'utf8'));
  pulled.doc.rows.a.record.text = 'one paragraph';
  await writeFile(file, JSON.stringify(pulled));
  assert.equal(await run(['push', file]), 1);
  assert.ok(lines.includes('  row a: text is not a list of text'), lines.join('\n'));
  pulled.doc.rows.a.record.text = ['one paragraph'];
  pulled.doc.idea = 'The [[nothing]] here.';
  await writeFile(file, JSON.stringify(pulled));
  lines.length = 0;
  assert.equal(await run(['push', file]), 1);
  assert.ok(lines.includes('Not pushed: the idea: unknown keyword "nothing".'), lines.join('\n'));
  assert.equal((await store.getDraft()).version, 1);
});

// I4: a pushed document cannot set the counters back either, so no id the draft gave is given again.
test('a push keeps the draft\'s counters where they are higher', async () => {
  await store.saveDraft({ ...sampleDoc(), next: { row: 5, chapter: 7 } }, 1);
  const file = path.join(dir, 'd.json');
  await run(['pull', file]);
  const pulled = JSON.parse(await readFile(file, 'utf8'));
  pulled.doc.next = { row: 1, chapter: 3 };
  pulled.doc.rows.a.record.title = 'Changed';
  await writeFile(file, JSON.stringify(pulled));
  assert.equal(await run(['push', file]), 0);
  const draft = await store.getDraft();
  assert.equal(draft.doc.rows.a.record.title, 'Changed');
  assert.deepEqual(draft.doc.next, { row: 5, chapter: 7 });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).doc.next, { row: 5, chapter: 7 }, 'the file holds what was saved');
});

test('publish from the command line purges', async () => {
  let purged = 0;
  assert.equal(await run(['publish'], { purge: async () => { purged++; } }), 0);
  assert.equal(purged, 1);
  assert.ok(await store.siteFile('index.html'));
  assert.equal((await store.listPublishes()).length, 1);
});

// More than ten wrong passwords in fifteen minutes refuse every login, the author's too: one line
// clears them.
test('unlock clears the failed logins, with no draft needed', async () => {
  for (let i = 0; i < 11; i++) await store.recordLoginFailure();
  const empty = new PGlite();
  const bare = makeStore(pgliteDb(empty));
  await bare.init();
  await bare.recordLoginFailure();
  assert.equal(await runDraft(['unlock'], { store: bare, root: ROOT, purge: async () => {}, out }), 0);
  assert.equal(await bare.recentLoginFailures(15), 0);
  await empty.close();
  assert.equal(await run(['unlock']), 0);
  assert.equal(await store.recentLoginFailures(15), 0);
  assert.ok(lines.includes('Logins unlocked: 11 failed tries cleared.'), lines.join('\n'));
});

// After a code deploy the stored pages are the old code's drawing: rerender draws them again from
// the latest publish, leaving the draft as it is, and purges.
test('rerender draws the public files again from the latest publish, the draft untouched, and purges', async () => {
  let purged = 0;
  assert.equal(await run(['rerender']), 1);
  assert.ok(lines.includes('Nothing has been published yet.'), lines.join('\n'));
  await run(['publish']);
  const changed = sampleDoc();
  changed.rows.a.record.title = 'Draft only';
  await store.saveDraft(changed, 1);
  await pg.query("update site_files set body = 'drawn by old code'");
  const publishes = (await store.listPublishes()).length;
  assert.equal(await run(['rerender'], { purge: async () => { purged++; } }), 0);
  assert.equal(purged, 1);
  const index = (await store.siteFile('index.html')).body;
  assert.match(index, /Row a/);
  assert.doesNotMatch(index, /Draft only/);
  const draft = await store.getDraft();
  assert.deepEqual([draft.version, draft.doc.rows.a.record.title], [2, 'Draft only']);
  assert.equal((await store.listPublishes()).length, publishes, 'no publish is added');
  const { id } = await store.latestPublish();
  assert.deepEqual((await pg.query('select distinct publish_id from site_files')).rows, [{ publish_id: id }]);
  assert.equal(await run(['rerender'], { purge: async () => { throw new Error('no'); } }), 1);
  assert.ok(lines.some((line) => line.startsWith('Drawn again, but the edge\'s copies were not deleted')), lines.join('\n'));
});
