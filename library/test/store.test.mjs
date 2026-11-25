import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore, ConflictError } from '../cloud/store.mjs';
import { applyOp } from '../cloud/ops.mjs';
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
  assert.equal(await store.createDraft(other, { replace: true }), 2);
  assert.deepEqual((await store.getDraft()).doc, { ...other, next: { row: 1, chapter: 3 } }, 'with the old draft\'s counter, which is higher');
  // The old draft is kept, and a window that held version 1 is refused.
  const [{ doc }] = (await pg.query("select doc from publishes where kind = 'set-aside'")).rows;
  assert.deepEqual(doc, sample());
  await assert.rejects(store.saveDraft(sample(), 1), (e) => e instanceof ConflictError && e.version === 2);
  const empty = new PGlite();
  const fresh = makeStore(pgliteDb(empty));
  await fresh.init();
  assert.equal(await fresh.createDraft(other, { replace: true }), 1);
  await empty.close();
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

test('discard sets the draft aside first, so a confirmed click loses nothing', async () => {
  await store.createDraft(sample());
  await store.publish(1, files(), 's');
  const changed = sample();
  changed.rows.a.record.title = 'Hours of work';
  await store.saveDraft(changed, 1);
  assert.equal(await store.discard(2), 3);
  const [aside] = (await pg.query("select kind, doc, summary from publishes where kind = 'set-aside'")).rows;
  assert.deepEqual(aside, { kind: 'set-aside', doc: changed, summary: 'Set aside before a discard' });
  await assert.rejects(store.discard(2), ConflictError);
  assert.equal((await pg.query("select count(*)::int as n from publishes where kind = 'set-aside'")).rows[0].n, 1, 'a refused discard sets nothing aside');
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
  const [{ doc }] = (await pg.query("select doc from publishes where kind = 'set-aside'")).rows;
  assert.deepEqual(doc, changed);
  assert.equal((await store.latestPublish()).id, id); // a set-aside is not a publish
  await assert.rejects(store.restore(id, 2), (e) => e instanceof ConflictError && e.version === 3);
});

// I4 (clean review): the counters that name a new row or chapter never go back, so an id given once,
// in the draft or in any publish, is never given to another: a link #o=r1 shared after a publish
// keeps naming that row whatever is restored or discarded later, and a removed row stays its own.
test('restore, discard and a draft that replaces another never give an id again', async () => {
  const edit = async (version, op) => {
    const { doc, result } = applyOp((await store.getDraft()).doc, op);
    await store.saveDraft(doc, version);
    return result.id;
  };
  const addRow = (version) => edit(version, { op: 'add-row', chapter: 'c1', index: 0, title: 'Foo', type: 'Poster' });
  const addChapter = (version) => edit(version, { op: 'add-chapter', index: 0, title: 'New' });
  await store.createDraft(sample());
  const { id: first } = await store.publish(1, files(), 's');
  assert.equal(await addRow(1), 'r1');
  assert.equal(await addChapter(2), 'c3');
  await store.publish(3, files(), 's'); // publish 2 holds r1 and c3

  assert.equal(await store.restore(first, 3), 4);
  let { doc } = await store.getDraft();
  assert.ok(!doc.rows.r1, 'the publish restored has no r1');
  assert.deepEqual(doc.next, { row: 2, chapter: 4 });
  assert.deepEqual(Object.keys(doc), Object.keys(sample()), 'the document keeps its shape and order');
  assert.equal(await addRow(4), 'r2');
  assert.equal(await addChapter(5), 'c4');

  assert.equal(await store.discard(6), 7); // back to publish 2, whose counters lie below the draft's
  ({ doc } = await store.getDraft());
  assert.ok(doc.rows.r1 && !doc.rows.r2);
  assert.deepEqual(doc.next, { row: 3, chapter: 5 });
  assert.equal(await addRow(7), 'r3');

  assert.equal(await store.createDraft(sample(), { replace: true }), 9);
  assert.deepEqual((await store.getDraft()).doc.next, { row: 4, chapter: 5 }, 'a draft moved in afresh likewise');
  const [aside] = (await pg.query("select doc from publishes where kind = 'set-aside' order by id desc limit 1")).rows;
  assert.deepEqual(aside.doc.next, { row: 4, chapter: 5 }, 'the draft set aside is kept as it was');
});

test('a publish against an older version changes nothing', async () => {
  await store.createDraft(sample());
  await store.publish(1, files('one'), 's');
  await store.saveDraft(sample(), 1);
  await assert.rejects(store.publish(1, files('two'), 's'), (e) => e instanceof ConflictError && e.version === 2);
  assert.equal((await store.siteFile('index.html')).body, 'one');
  assert.equal((await store.listPublishes()).length, 1);
});

// The pages read the vocabulary's order from the document's objects ("All keywords", the map's
// places), so the database must give every object back with its keys as they were written: a
// jsonb column would sort them by length, then by bytes.
test('the draft and every publish come back with their keys in the order they were written', async () => {
  const doc = sample();
  doc.keywords = { 'ponte-druso': { label: 'Ponte Druso' }, monumento: { label: 'Monumento alla Vittoria' }, law: { label: 'Law' }, a: { label: 'A' }, poster: { label: 'Poster' } };
  doc.places = { zeta: { name: 'Zeta', lat: 46, lon: 11, inside: true, x: 1, y: 2, z: 0 }, piazza: doc.places.piazza, ab: { name: 'Ab', lat: 46, lon: 11, inside: false, x: 0, y: 0, z: 0 } };
  doc.rows.a.record = { title: 'Row a', type: 'Poster', date: '', year: null, keywords: ['poster', 'law'], text: [], confidence: { level: 'read' }, more: 'x' };
  const order = (d) => [Object.keys(d.keywords), Object.keys(d.places), Object.keys(d.rows.a.record), Object.keys(d.places.zeta)];
  await store.createDraft(doc);
  assert.deepEqual(order((await store.getDraft()).doc), order(doc));
  await store.saveDraft(doc, 1);
  assert.deepEqual(order((await store.getDraft()).doc), order(doc));
  await store.publish(2, files(), 's');
  assert.deepEqual(order((await store.latestPublish()).doc), order(doc));
});

// Minor 6 (clean review): the failures that have left the window are deleted as the tries are
// counted, so the table holds no more than one window's worth.
test('login failures are counted in their window, and those that left it are deleted', async () => {
  assert.equal(await store.recentLoginFailures(15), 0);
  for (let i = 0; i < 3; i++) await store.recordLoginFailure();
  assert.equal(await store.recentLoginFailures(15), 3);
  await pg.query("update login_failures set at = now() - interval '20 minutes' where id = (select min(id) from login_failures)");
  assert.equal(await store.recentLoginFailures(15), 2);
  await pg.query("update login_failures set at = now() - interval '20 minutes'");
  assert.equal(await store.recentLoginFailures(15), 0);
  assert.equal((await pg.query('select count(*)::int as n from login_failures')).rows[0].n, 0);
});

test('a login try is counted from the moment it is recorded, and one forgotten no longer counts', async () => {
  const first = await store.recordLoginFailure();
  const second = await store.recordLoginFailure();
  assert.notEqual(first, second);
  assert.equal(await store.recentLoginFailures(15), 2);
  await store.forgetLoginFailure(first);
  assert.equal(await store.recentLoginFailures(15), 1);
  await store.forgetLoginFailure(first);
  assert.equal(await store.recentLoginFailures(15), 1, 'forgetting twice is forgetting once');
  await store.forgetLoginFailure(second);
  assert.equal(await store.recentLoginFailures(15), 0);
});
