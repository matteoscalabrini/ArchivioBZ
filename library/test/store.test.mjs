import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore, ConflictError } from '../cloud/store.mjs';
import { sampleDoc } from './docs.mjs';

const sample = () => sampleDoc();
const files = (body = 'one') => new Map([['index.html', { body, type: 'text/html' }]]);
let pg;
let store;
beforeEach(async () => {
  pg = new PGlite();
  store = makeStore(pgliteDb(pg));
  await store.init();
});
afterEach(async () => { await pg.close(); });

test('a save against an older version is refused and says the current one', async () => {
  await store.createDraft(sample());
  assert.equal(await store.saveDraft(sample(), 1), 2);
  await assert.rejects(store.saveDraft(sample(), 1), (e) => e instanceof ConflictError && e.version === 2);
});

test('a second draft is refused unless it replaces the first', async () => {
  assert.equal(await store.getDraft(), null);
  await store.createDraft(sample());
  await assert.rejects(store.createDraft(sample()), /There is a draft already; --replace to overwrite it/);
  const other = sampleDoc({ c1: ['z'] });
  assert.equal(await store.createDraft(other, { replace: true }), 1);
  assert.deepEqual((await store.getDraft()).doc, other);
});

test('publish stores the document and replaces the site files', async () => {
  await store.createDraft(sample());
  await store.publish(1, new Map([['index.html', { body: 'one', type: 'text/html' }], ['old.json', { body: 'x', type: 'application/json' }]]), 's');
  await store.publish(1, new Map([['index.html', { body: 'two', type: 'text/html' }]]), 's');
  assert.equal((await store.siteFile('index.html')).body, 'two');
  assert.equal((await store.siteFile('old.json')), null);
  assert.equal((await store.listPublishes()).length, 2);
  assert.deepEqual((await store.latestPublish()).doc, sample());
});

test('discard goes back to the latest publish', async () => {
  await assert.rejects(store.discard(1), /./);
  await store.createDraft(sample());
  await assert.rejects(store.discard(1), /Nothing has been published yet/);
  await store.publish(1, files(), 's');
  const changed = sample();
  changed.rows.a.record.title = 'Changed';
  await store.saveDraft(changed, 1);
  assert.equal(await store.discard(2), 3);
  const draft = await store.getDraft();
  assert.deepEqual(draft.doc, sample());
  assert.equal(draft.version, 3);
  await assert.rejects(store.discard(2), (e) => e instanceof ConflictError && e.version === 3);
});

test('restore sets the draft aside first', async () => {
  await store.createDraft(sample());
  const { id } = await store.publish(1, files(), 's');
  const changed = sample();
  changed.rows.a.record.title = 'Changed';
  await store.saveDraft(changed, 1);
  assert.equal(await store.restore(id, 2), 3);
  assert.deepEqual((await store.getDraft()).doc, sample());
  const aside = (await store.listPublishes()).find((p) => p.kind === 'set-aside');
  assert.ok(aside);
  assert.equal((await store.latestPublish()).id, id); // a set-aside is not a publish
  await assert.rejects(store.restore(id, 2), (e) => e instanceof ConflictError && e.version === 3);
});

test('a publish against an older version changes nothing', async () => {
  await store.createDraft(sample());
  await store.publish(1, files('one'), 's');
  await store.saveDraft(sample(), 1);
  await assert.rejects(store.publish(1, files('two'), 's'), (e) => e instanceof ConflictError && e.version === 2);
  assert.equal((await store.siteFile('index.html')).body, 'one');
  assert.equal((await store.listPublishes()).length, 1);
});

test('login failures are counted in their window', async () => {
  assert.equal(await store.recentLoginFailures(15), 0);
  for (let i = 0; i < 3; i++) await store.recordLoginFailure();
  assert.equal(await store.recentLoginFailures(15), 3);
  await pg.query("update login_failures set at = now() - interval '20 minutes'");
  assert.equal(await store.recentLoginFailures(15), 0);
});
