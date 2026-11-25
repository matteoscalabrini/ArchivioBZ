import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore } from '../cloud/store.mjs';
import { runDraft } from '../tools/draft.mjs';
import { loadLists, renderSite } from '../cloud/render.mjs';
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

// I6 (clean review), design §10: before the first Publish, the draft drawn as the public site is
// compared with the site online, row by row, on what a reader sees of a row apart from its number
// and chapter: its id, title, text, number of pictures, keywords and place.
test('compare lists the rows that differ from a static site, by what differs, and counts them', async () => {
  const live = path.join(dir, 'static');
  await mkdir(live);
  const before = sampleDoc();
  before.rows.a.pictures = [{ src: '/x/a-1.jpg', w: 4, h: 3, caption: '' }, { src: '/x/a-2.jpg', w: 4, h: 3, caption: '' }];
  before.rows.c.record.text = ['One paragraph & "quotes".', 'A second.'];
  before.rows.d.record.place = 'piazza';
  before.rows.d.record.keywords = ['march'];
  await writeFile(path.join(live, 'index.html'), renderSite(before, await loadLists(ROOT)).files.get('index.html').body);
  // The site online was built with other picture addresses, and the draft numbers by chapters.
  const draft = structuredClone(before);
  draft.rows.a.pictures = draft.rows.a.pictures.map((p) => ({ ...p, src: `https://blob.example/${p.src.slice(3)}` }));
  draft.chapters = [{ id: 'c1', title: 'One', rows: ['a', 'b'] }, { id: 'c2', title: 'Two', rows: ['c', 'd'] }];
  await store.saveDraft(draft, 1);
  assert.equal(await run(['compare', live]), 0);
  assert.deepEqual(lines, [
    `Compared with ${path.join(live, 'index.html')}: 4 rows there, 4 in the draft drawn as the public site, in the same order.`,
    'No row differs.',
  ]);

  const changed = structuredClone(draft);
  changed.rows.a.record.title = 'Changed';
  changed.rows.a.pictures.pop();
  changed.rows.b.hidden = true;
  changed.rows.c.record.text = ['One paragraph & "quotes".', 'Another second.'];
  changed.rows.d.record.keywords = ['march', 'wall'];
  delete changed.rows.d.record.place;
  changed.rows.r1 = structuredClone(changed.rows.b);
  changed.rows.r1.hidden = false;
  changed.chapters[1].rows = ['d', 'c', 'r1'];
  changed.next.row = 2;
  await store.saveDraft(changed, 2);
  lines.length = 0;
  assert.equal(await run(['compare', live]), 1);
  assert.deepEqual(lines, [
    `Compared with ${path.join(live, 'index.html')}: 4 rows there, 4 in the draft drawn as the public site, in another order.`,
    '  a  title: "Row a" there, "Changed" in the draft; pictures: 2 there, 1 in the draft',
    '  b  only there: hidden or removed in the draft',
    '  c  text, paragraph 2: "A second." there, "Another second." in the draft',
    '  d  keywords: "march" there, "march wall" in the draft; place: "piazza" there, none in the draft',
    '  r1  only in the draft',
    '5 rows differ.',
  ]);
  lines.length = 0;
  assert.equal(await run(['compare', path.join(dir, 'nowhere')]), 1);
  assert.deepEqual(lines, [`There is no index.html in ${path.join(dir, 'nowhere')}.`]);
  lines.length = 0;
  assert.equal(await run(['compare']), 1);
  assert.match(lines[0], /^usage: npm run draft -- /);
});
