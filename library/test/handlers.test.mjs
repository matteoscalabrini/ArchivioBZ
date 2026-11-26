import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore, ConflictError } from '../cloud/store.mjs';
import { loadLists, renderSite, renderEditPage } from '../cloud/render.mjs';
import { hashPassword, makeSession, SESSION_MS } from '../cloud/auth.mjs';
import { makeHandlers } from '../cloud/handlers.mjs';
import { sampleDoc } from './docs.mjs';
import { cleanRoot, tempDir } from './helpers.mjs';
import { cloudStores, localStores } from '../cloud/pictures.mjs';
import { stripJpeg } from '../lib/metadata.mjs';

// A draft from sample() published once, on PGlite; a session cookie from makeSession. The wait is
// a stub that records what it was asked to wait, so the tests do not sleep.
const SECRET = 'a-test-secret';
const PASSWORD = 'correct horse battery';
const HASH = await hashPassword(PASSWORD);
const lists = await loadLists(await cleanRoot());
const sample = () => sampleDoc();
const session = `archivio_edit=${makeSession(SECRET)}`;
const CONFLICT = 'Changed in another window. Reload to see it.';

let pg;
let store;
let waits;
let h;
const make = (extra = {}) => makeHandlers({
  store, env: { EDIT_PASSWORD_HASH: HASH, SESSION_SECRET: SECRET }, lists, wait: async (ms) => { waits.push(ms); }, ...extra,
});
beforeEach(async () => {
  pg = new PGlite();
  store = makeStore(pgliteDb(pg));
  await store.init();
  await store.createDraft(sample());
  await store.publish(1, renderSite(sample(), lists).files, 'first');
  waits = [];
  h = make();
});
afterEach(async () => { await pg.close(); });

const headersOf = ({ cookie = session, origin = 'https://a.test', host = 'a.test', type } = {}) => {
  const headers = { host };
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  if (type) headers['content-type'] = type;
  return headers;
};
const post = (route, body, options) => new Request(`https://a.test/api/edit?route=${route}`, {
  method: 'POST', headers: headersOf({ type: 'application/json', ...options }), body: typeof body === 'string' ? body : JSON.stringify(body),
});
const get = (route, options) => new Request(`https://a.test/api/edit?route=${route}`, { headers: headersOf(options) });
const login = (password, options) => new Request('https://a.test/api/edit?route=login', {
  method: 'POST', headers: headersOf({ cookie: '', type: 'application/x-www-form-urlencoded', ...options }), body: new URLSearchParams({ password }).toString(),
});
const site = (path) => h.site(new Request(`https://a.test/api/site?path=${path}`));
const hide = (id, version = 1) => post('op', { version, op: { op: 'hide-row', id, hidden: true } });

test('the public page carries the cache tag and the published body', async () => {
  const res = await site('index.html');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-tag'), 'site');
  assert.equal(res.headers.get('vercel-cache-tag'), 'site', 'the name Vercel documents for a tag');
  assert.equal(res.headers.get('vercel-cdn-cache-control'), 'max-age=31536000');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.match(await res.text(), /<article class="row"/);
  const index = await site('search.json');
  assert.match(index.headers.get('content-type'), /^application\/json/);
  assert.equal(index.headers.get('cache-tag'), 'site');
  assert.equal(await index.text(), renderSite(sample(), lists).files.get('search.json').body);
});

// Minor 2 (clean review): a returning visitor's browser asks again every time (max-age=0,
// must-revalidate); with an ETag the answer is 304 and no body while the file is the one it holds.
// The tag names the publish and the drawing: a publish, or the same publish drawn again after a
// deploy of new page code (rerender), gives another.
test('a public file carries an ETag, and a request that holds it is answered 304 without a body', async () => {
  const first = await site('index.html');
  const tag = first.headers.get('etag');
  assert.match(tag, /^"1-[A-Za-z0-9_-]{16}"$/, 'the publish id and a digest of the file');
  assert.notEqual((await site('map.html')).headers.get('etag'), tag, 'each file its own');
  const ask = (path, held) => h.site(new Request(`https://a.test/api/site?path=${path}`, { headers: { 'if-none-match': held } }));
  for (const held of [tag, `W/${tag}`, `"0-x", ${tag}`, '*']) {
    const again = await ask('index.html', held);
    assert.equal(again.status, 304, held);
    assert.equal(await again.text(), '');
    assert.equal(again.headers.get('etag'), tag);
    assert.equal(again.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    assert.equal(again.headers.get('cache-tag'), null, '304: no cache tag');
    assert.equal(again.headers.get('vercel-cache-tag'), null, '304: no cache tag');
    assert.equal(again.headers.get('vercel-cdn-cache-control'), null, '304: nothing for the edge to keep');
  }
  const whole = await site('index.html');
  assert.equal(whole.headers.get('cache-tag'), 'site');
  assert.equal(whole.headers.get('vercel-cache-tag'), 'site');
  assert.equal(whole.headers.get('vercel-cdn-cache-control'), 'max-age=31536000');
  assert.equal(whole.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.equal((await ask('index.html', '"1-other"')).status, 200);
  const changed = sample();
  changed.rows.a.record.title = 'Published again';
  await store.saveDraft(changed, 1);
  await store.publish(2, renderSite(changed, lists).files, 'second');
  const after = await ask('index.html', tag);
  assert.equal(after.status, 200, 'a publish gives a new tag');
  assert.match(after.headers.get('etag'), /^"2-/);
  const { id } = await store.latestPublish();
  await store.rewriteSite(id, renderSite(sample(), lists).files);
  const redrawn = await ask('index.html', after.headers.get('etag'));
  assert.equal(redrawn.status, 200, 'the same publish drawn anew gives a new tag');
  assert.match(redrawn.headers.get('etag'), /^"2-/);
});

// Minor 3 (clean review): the public function makes no tables (the move-in and edit mode do); a
// database without them is a site not published yet.
test('the public site makes no tables, and a database without them is not published yet', async () => {
  const empty = new PGlite();
  const bare = makeStore(pgliteDb(empty));
  let inits = 0;
  const res = await makeHandlers({ store: { ...bare, init: async () => { inits++; } }, env: {}, lists }).site(new Request('https://a.test/api/site?path=index.html'));
  assert.equal(res.status, 503);
  assert.equal(await res.text(), 'Not published yet');
  assert.equal(inits, 0);
  assert.equal((await empty.query("select count(*)::int as n from pg_tables where tablename = 'site_files'")).rows[0].n, 0);
  await empty.close();
});

test('before any publish the site says so and is not cached', async () => {
  const empty = new PGlite();
  const fresh = makeStore(pgliteDb(empty));
  await fresh.init();
  await fresh.createDraft(sample());
  const res = await makeHandlers({ store: fresh, env: {}, lists }).site(new Request('https://a.test/api/site?path=index.html'));
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('cache-tag'), null);
  assert.equal(await res.text(), 'Not published yet');
  await empty.close();
});

test('the site answers only its four files', async () => {
  for (const path of ['map.html', 'about.html', 'search.json']) assert.equal((await site(path)).status, 200, path);
  for (const path of ['', 'edit.html', '../package.json', 'index.html%00']) {
    const res = await site(path);
    assert.equal(res.status, 404, path);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
});

// vercel.json rewrites to ?path= and ?route=; should a request come with its own path and no query,
// the path names the same file or route.
test('without the rewrite\'s query, the path names the file or the route', async () => {
  const at = (url) => new Request(url, { headers: headersOf() });
  const index = await h.site(at('https://a.test/'));
  assert.equal(index.status, 200);
  assert.equal(await index.text(), renderSite(sample(), lists).files.get('index.html').body);
  assert.equal((await h.site(at('https://a.test/map.html'))).status, 200);
  assert.equal((await h.site(at('https://a.test/secret.txt'))).status, 404);
  const search = await h.edit(at('https://a.test/edit/search.json'));
  assert.equal(search.status, 200);
  assert.ok(Array.isArray((await search.json()).rows));
  const op = await h.edit(new Request('https://a.test/edit/op', { method: 'POST', headers: headersOf({ type: 'application/json' }), body: JSON.stringify({ version: 1, op: { op: 'hide-row', id: 'a', hidden: true } }) }));
  assert.equal(op.status, 200);
  assert.match(await (await h.edit(at('https://a.test/edit/'))).text(), /id="edit-data"/);
});

// A second layer under SameSite=Strict: edit mode's answers are not sniffed, framed or named in a
// Referer sent to another site.
test('edit answers say nosniff, no framing and a same-origin referrer', async () => {
  const answers = [
    await h.edit(get('')),
    await h.edit(get('', { cookie: '' })),
    await h.edit(hide('a')),
    await h.edit(login('wrong', {})),
    await h.edit(post('logout', {})),
  ];
  for (const res of answers) {
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', res.status);
    assert.equal(res.headers.get('x-frame-options'), 'DENY', res.status);
    assert.equal(res.headers.get('content-security-policy'), "frame-ancestors 'none'", res.status);
    assert.equal(res.headers.get('referrer-policy'), 'same-origin', res.status);
  }
});

test('an op without a session answers logged-out', async () => {
  const res = await h.edit(post('op', { version: 1, op: { op: 'hide-row', id: 'a', hidden: true } }, { cookie: '' }));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'logged-out' });
});

test('a session that ended while a field was open answers logged-out, and after a new login the same save works', async () => {
  const ended = `archivio_edit=${makeSession(SECRET, Date.now() - SESSION_MS - 1)}`;
  const forged = `archivio_edit=${makeSession('another secret')}`;
  for (const cookie of [ended, forged, 'archivio_edit=garbage']) {
    const res = await h.edit(post('op', { version: 1, op: { op: 'set-row', id: 'a', fields: { title: 'Typed' } } }, { cookie }));
    assert.equal(res.status, 401, cookie);
    assert.deepEqual(await res.json(), { error: 'logged-out' });
  }
  assert.equal((await store.getDraft()).version, 1, 'nothing was saved');
  const fresh = (await h.edit(login(PASSWORD))).headers.get('set-cookie').split(';')[0];
  const res = await h.edit(post('op', { version: 1, op: { op: 'set-row', id: 'a', fields: { title: 'Typed' } } }, { cookie: fresh }));
  assert.equal(res.status, 200);
  assert.equal((await store.getDraft()).doc.rows.a.record.title, 'Typed');
});

test('every edit route but the page and the login needs a session', async () => {
  for (const req of [get('search.json', { cookie: '' }), post('publish', { version: 1 }, { cookie: '' }), post('discard', { version: 1 }, { cookie: '' }), post('logout', {}, { cookie: '' })]) {
    const res = await h.edit(req);
    assert.equal(res.status, 401, req.url);
    assert.deepEqual(await res.json(), { error: 'logged-out' });
  }
});

test('an op from another origin is refused', async () => {
  const res = await h.edit(post('op', { version: 1, op: { op: 'hide-row', id: 'a', hidden: true } }, { origin: 'https://evil.test', host: 'a.test' }));
  assert.equal(res.status, 403);
  for (const origin of ['', 'null', 'https://a.test.evil.test', 'http://evil.test/a.test']) {
    assert.equal((await h.edit(post('op', { version: 1, op: { op: 'hide-row', id: 'a', hidden: true } }, { origin }))).status, 403, `origin "${origin}"`);
  }
  assert.equal((await h.edit(login(PASSWORD, { origin: 'https://evil.test' }))).status, 403, 'the login too');
  assert.equal((await store.getDraft()).version, 1, 'nothing was saved');
  assert.equal((await h.edit(post('op', { version: 1, op: { op: 'hide-row', id: 'a', hidden: true } }, { origin: 'https://A.test', host: 'a.TEST' }))).status, 200, 'hosts compare without case');
});

test('an op saves, renumbers and gives back the row', async () => {
  const res = await h.edit(post('op', { version: 1, op: { op: 'hide-row', id: 'b', hidden: true } }));
  const body = await res.json();
  assert.deepEqual([res.status, body.version, body.numbers.b, body.numbers.c], [200, 2, '', '1.02']);
  assert.match(body.row, /data-hidden="true"/);
  assert.match(body.row, /^<article class="row" data-no="b"/);
  assert.deepEqual(body.numbers, { a: '1.01', b: '', c: '1.02', d: '2.01' });
  assert.deepEqual(body.chapters, [
    { id: 'c1', no: '1', title: 'Chapter c1', rows: ['a', 'b', 'c'] },
    { id: 'c2', no: '2', title: 'Chapter c2', rows: ['d'] },
  ]);
  assert.equal(body.summary, '1 hidden');
  assert.deepEqual(body.stored, { ...sample().rows.b, hidden: true }, 'the row as stored, for the page to hold');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const draft = await store.getDraft();
  assert.equal(draft.version, 2);
  assert.equal(draft.doc.rows.b.hidden, true);
});

// The page shows every link as it now stands after an edit, without a reload: the answer carries
// the other rows and the idea whose links the edit changed (render.mjs, renderRelinked).
test('an op answers with the other rows and the idea whose links it changed', async () => {
  const linked = await (await h.edit(post('op', { version: 1, op: { op: 'set-row', id: 'a', fields: { text: ['See [[the next|@b]].'] } } }))).json();
  assert.equal(linked.relinked, undefined, 'a link written changes no other part');
  await h.edit(post('op', { version: 2, op: { op: 'set-idea', text: 'The [[row b|@b]].' } }));
  const hidden = await (await h.edit(hide('b', 3))).json();
  assert.match(hidden.row, /^<article class="row" data-no="b"/);
  assert.deepEqual(Object.keys(hidden.relinked.rows), ['a']);
  const page = await (await h.edit(get(''))).text();
  assert.ok(page.includes(hidden.relinked.rows.a), 'row a as the page draws it');
  assert.match(hidden.relinked.rows.a, /<span class="dead-link" title="The row is hidden\.">the next<\/span>/);
  assert.ok(page.includes(hidden.relinked.idea), 'the idea as the page draws it');
  assert.match(hidden.relinked.idea, /^<section class="idea">[\s\S]*<span class="dead-link" title="The row is hidden\.">row b<\/span>/);
  const shown = await (await h.edit(post('op', { version: 4, op: { op: 'hide-row', id: 'b', hidden: false } }))).json();
  assert.match(shown.relinked.rows.a, /<a href="#o=b" data-row="b">the next<\/a>/);
});

test('the row given back is marked changed only when it differs from the latest publish', async () => {
  const same = await (await h.edit(post('op', { version: 1, op: { op: 'set-row', id: 'a', fields: { title: 'Row a' } } }))).json();
  assert.doesNotMatch(same.row, /data-changed/);
  assert.equal(same.summary, 'No changes since the last publish');
  const other = await (await h.edit(post('op', { version: 2, op: { op: 'set-row', id: 'a', fields: { title: 'Row A, retitled' } } }))).json();
  assert.match(other.row, /data-changed="true"/);
  assert.equal(other.summary, '1 row changed');
});

test('an op that moves or adds gives back what the page needs', async () => {
  const moved = await (await h.edit(post('op', { version: 1, op: { op: 'set-number', id: 'd', number: '1.01' } }))).json();
  assert.equal(moved.row, undefined, 'a move swaps no row');
  assert.deepEqual(moved.chapters.map((c) => c.rows), [['d', 'a', 'b', 'c'], []]);
  assert.deepEqual(moved.chapters.map((c) => c.no), ['1', ''], 'a chapter with no row shown has no number');
  assert.equal(moved.numbers.d, '1.01');
  const added = await (await h.edit(post('op', { version: 2, op: { op: 'add-row', chapter: 'c2', title: 'New', type: 'Poster' } }))).json();
  assert.deepEqual(added.result, { id: 'r1' });
  assert.match(added.row, /^<article class="row" data-no="r1"/);
  const keyword = await (await h.edit(post('op', { version: 3, op: { op: 'add-keyword', label: 'Covered names' } }))).json();
  assert.deepEqual(keyword.result, { id: 'covered-names', existed: false });
  assert.equal(keyword.stored, undefined, 'an edit of no row gives back no row');
  const given = await (await h.edit(post('op', { version: 4, op: { op: 'give-keyword', id: 'r1', keyword: 'covered-names' } }))).json();
  assert.match(given.row, /^<article class="row" data-no="r1"[^>]* data-kw="covered-names"/);
  assert.deepEqual(given.stored.record.keywords, ['covered-names']);
});

// Design §7: "All keywords" follows the draft. Every op is answered with the strip as the edit page
// would now draw it: a keyword new from a row is its last button, with its count, at once; a
// keyword moved keeps its place in the draft, and on the public page after a publish.
test('every op answer carries the strip: a keyword new from a row is last, a keyword moved keeps its place, published too', async () => {
  let version = 1;
  const op = async (wanted) => {
    const res = await h.edit(post('op', { version, op: wanted }));
    assert.equal(res.status, 200, JSON.stringify(wanted));
    version++;
    return res.json();
  };
  const buttons = (strip) => [...strip.matchAll(/<button type="button" data-k="([^"]+)" aria-pressed="false">([^<]*)<sup>(\d+)<\/sup><\/button>/g)]
    .map(([, id, label, count]) => `${id} ${label} ${count}`);
  const stripOf = (html) => /<div class="keywords">[\s\S]*?<\/div>/.exec(html)[0];

  assert.deepEqual(buttons((await op({ op: 'give-keyword', id: 'a', keyword: 'wall' })).strip), ['wall Wall 1']);
  await op({ op: 'give-keyword', id: 'b', keyword: 'march' });
  const given = await op({ op: 'give-keyword', id: 'c', keyword: 'wall' });
  assert.match(given.strip, /^<div class="keywords"><span class="lab">All keywords<\/span><button [^]*<\/button><\/div>$/);
  assert.deepEqual(buttons(given.strip), ['wall Wall 2', 'march March 1'], 'in the vocabulary\'s order, each with its count');
  const added = await op({ op: 'add-keyword', label: 'Covered names' });
  assert.equal(added.strip, given.strip, 'a keyword on no row is not in the strip');
  const fresh = await op({ op: 'give-keyword', id: 'd', keyword: 'covered-names' });
  assert.deepEqual(buttons(fresh.strip), ['wall Wall 2', 'march March 1', 'covered-names Covered names 1'], 'the new keyword last, with count 1');
  assert.equal(stripOf(renderEditPage((await store.getDraft()).doc, { version, published: null, lists })), fresh.strip, 'as the edit page draws it');

  const moved = await op({ op: 'move-keyword', id: 'covered-names', before: 'wall' });
  assert.deepEqual(buttons(moved.strip), ['covered-names Covered names 1', 'wall Wall 2', 'march March 1']);
  assert.equal(moved.row, undefined, 'a keyword moved swaps no row');
  assert.deepEqual(Object.keys((await store.getDraft()).doc.keywords), ['covered-names', 'wall', 'poster', 'march']);
  assert.equal(moved.summary, '4 rows changed, keywords changed');
  const other = await op({ op: 'add-chapter', index: 2, title: 'Empty' });
  assert.equal(other.strip, moved.strip, 'an op that touches no keyword is answered with the strip too');

  assert.equal((await h.edit(post('publish', { version }))).status, 200);
  assert.equal(stripOf(await (await site('index.html')).text()), moved.strip, 'the public page in the same order');
});

test('an op the document refuses answers 422 with the sentence the author reads', async () => {
  const res = await h.edit(post('op', { version: 1, op: { op: 'set-number', id: 'a', number: 'abc' } }));
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: 'A number is a chapter and a place, as in 2.05.' });
  assert.equal((await store.getDraft()).version, 1);
});

test('a stale version is a conflict with the exact line', async () => {
  assert.equal((await h.edit(hide('b', 1))).status, 200);
  for (const req of [hide('c', 1), post('publish', { version: 1 }), post('discard', { version: 1 })]) {
    const res = await h.edit(req);
    assert.equal(res.status, 409, req.url);
    assert.deepEqual(await res.json(), { error: CONFLICT, version: 2 });
  }
  assert.equal((await store.getDraft()).doc.rows.c.hidden, false);
});

test('a save refused by the store, after the version was read, is the same conflict', async () => {
  const racing = { ...store, saveDraft: async () => { throw new ConflictError(5); } };
  const res = await make({ store: racing }).edit(hide('b', 1));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: CONFLICT, version: 5 });
});

test('a request that is not JSON, or has no version, is refused', async () => {
  assert.equal((await h.edit(post('op', '{not json'))).status, 400);
  assert.equal((await h.edit(post('op', { op: { op: 'hide-row', id: 'b', hidden: true } }))).status, 400);
  assert.equal((await h.edit(post('op', { version: '1', op: { op: 'hide-row', id: 'b', hidden: true } }))).status, 400);
  assert.equal((await h.edit(post('op', [1]))).status, 400);
  assert.equal((await store.getDraft()).version, 1);
});

test('a body over 2 MB is refused before it is read whole', async () => {
  const long = 'x'.repeat(2 * 1024 * 1024);
  const res = await h.edit(post('op', { version: 1, op: { op: 'set-row', id: 'a', fields: { text: [long] } } }));
  assert.equal(res.status, 413);
  const declared = await h.edit(new Request('https://a.test/api/edit?route=login', {
    method: 'POST', headers: { ...headersOf({ cookie: '' }), 'content-length': String(3 * 1024 * 1024) }, body: 'password=x',
  }));
  assert.equal(declared.status, 413, 'a declared length over the bound is refused at once');
  assert.equal(await store.recentLoginFailures(15), 0);
  const fine = await h.edit(post('op', { version: 1, op: { op: 'set-row', id: 'a', fields: { text: ['y'.repeat(1024 * 1024)] } } }));
  assert.equal(fine.status, 200, 'a long text under the bound is saved');
});

test('publish writes the site and purges the cache', async () => {
  let purged = 0;
  h = make({ purge: async () => { purged++; } });
  assert.equal((await h.edit(post('op', { version: 1, op: { op: 'set-row', id: 'a', fields: { title: 'A title from edit mode' } } }))).status, 200);
  assert.doesNotMatch(await (await site('index.html')).text(), /A title from edit mode/);
  const res = await h.edit(post('publish', { version: 2 }));
  assert.equal(res.status, 200);
  const { id } = await res.json();
  assert.equal(id, (await store.latestPublish()).id);
  assert.match(await (await site('index.html')).text(), /A title from edit mode/);
  assert.equal(purged, 2, 'once at once, once more later');
  assert.equal((await store.listPublishes())[0].summary, '1 row changed');
  const after = await (await h.edit(post('op', { version: 2, op: { op: 'set-row', id: 'a', fields: { title: 'A title from edit mode' } } }))).json();
  assert.equal(after.summary, 'No changes since the last publish');
});

test('a hidden row leaves the public site at publish', async () => {
  assert.match(await (await site('index.html')).text(), /data-no="b"/);
  await h.edit(hide('b', 1));
  assert.equal((await h.edit(post('publish', { version: 2 }))).status, 200);
  for (const path of ['index.html', 'map.html', 'about.html', 'search.json']) {
    assert.doesNotMatch(await (await site(path)).text(), /Row b\b|"b"/, path);
  }
});

test('publish purges once more later, for a page drawn from the old files just before it, and a failure then is only logged', async () => {
  const pending = [];
  let calls = 0;
  const res = await make({ purge: async () => { calls++; }, later: (task) => { pending.push(task); } }).edit(post('publish', { version: 1 }));
  assert.equal(res.status, 200);
  assert.deepEqual([calls, pending.length], [1, 1], 'the second purge is left for after the answer');
  await pending[0]();
  assert.equal(calls, 2);
  const failing = [];
  const fine = await make({ purge: async () => { if (failing.length) throw new Error('down'); }, later: (task) => { failing.push(task); } }).edit(post('publish', { version: 1 }));
  assert.equal(fine.status, 200);
  await assert.doesNotReject(failing[0](), 'the answer has gone; the failure is logged');
});

test('a purge that fails is tried once more, and a second failure is said', async () => {
  let calls = 0;
  const later = () => {};
  const flaky = await make({ purge: async () => { if (++calls === 1) throw new Error('429'); }, later }).edit(post('publish', { version: 1 }));
  assert.equal(flaky.status, 200);
  assert.deepEqual([calls, waits], [2, [1000]]);
  const down = await make({ purge: async () => { throw new Error('down'); }, later }).edit(post('publish', { version: 1 }));
  assert.equal(down.status, 500);
  const body = await down.json();
  assert.equal(body.error, 'Published, but the public site may still show the old version. Publish again to refresh it.');
  assert.equal(body.id, (await store.latestPublish()).id, 'the publish itself is stored');
});

test('a draft whose rendering has an error is not published', async () => {
  let purged = 0;
  h = make({ purge: async () => { purged++; } });
  const doc = sample();
  doc.idea = 'The [[nowhere]] at the end.';
  await store.saveDraft(doc, 1);
  const before = (await store.latestPublish()).id;
  const res = await h.edit(post('publish', { version: 2 }));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /^Not published: the idea: unknown keyword "nowhere"/);
  assert.equal((await store.latestPublish()).id, before);
  assert.equal(purged, 0);
});

test('discard goes back to the latest publish', async () => {
  await h.edit(hide('b', 1));
  const res = await h.edit(post('discard', { version: 2 }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { version: 3 });
  assert.deepEqual((await store.getDraft()).doc, sample());
});

test('the page: the login form without a session, the draft in edit mode with one', async () => {
  const form = await h.edit(get('', { cookie: '' }));
  assert.equal(form.status, 200);
  assert.equal(form.headers.get('cache-control'), 'no-store');
  const html = await form.text();
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<header class="site">/, 'in the site\'s frame');
  assert.match(html, /<link rel="stylesheet" href="\.\.\/web\/base\.css">/);
  assert.match(html, /<form class="login" method="post" action="login">/);
  assert.equal(html.match(/<input /g).length, 2, 'the search field and the password');
  assert.match(html, /<input type="password" id="password" name="password"/);
  assert.match(html, /<button type="submit">Log in<\/button>/);
  assert.doesNotMatch(html, /edit-data|Wrong password/);
  const page = await h.edit(get(''));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const edit = await page.text();
  const data = JSON.parse(/<script type="application\/json" id="edit-data">([\s\S]*?)<\/script>/.exec(edit)[1]);
  assert.equal(data.version, 1);
  assert.equal(data.summary, 'No changes since the last publish', 'drawn against the latest publish');
});

test('the edit search holds the draft, hidden rows too', async () => {
  await h.edit(hide('b', 1));
  const res = await h.edit(get('search.json'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.match(await res.text(), /Row b/);
});

test('a wrong password waits, counts and refuses after ten', async () => {
  for (let n = 0; n < 10; n++) {
    const res = await h.edit(login('wrong horse battery'));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.match(await res.text(), /<p class="login-line" role="alert">Wrong password\.<\/p>/);
  }
  assert.deepEqual(waits, Array(10).fill(1000));
  assert.equal(await store.recentLoginFailures(15), 10);
  const refused = await h.edit(login('wrong horse battery'));
  assert.equal(refused.status, 429);
  const right = await h.edit(login(PASSWORD));
  assert.equal(right.status, 429, 'even the right password, for the rest of the window');
  assert.equal(right.headers.get('set-cookie'), null);
  assert.equal(await store.recentLoginFailures(15), 10, 'a refused try is not counted, so the window does not stretch');
});

test('the typed password is checked as typed, and the right one is not counted', async () => {
  assert.equal((await h.edit(login(` ${PASSWORD}`))).status, 401);
  assert.equal((await h.edit(login(PASSWORD.toUpperCase()))).status, 401);
  assert.equal((await h.edit(login(PASSWORD))).status, 303);
  assert.equal(await store.recentLoginFailures(15), 2);
});

// How many tries sent at once are checked depends on how their statements interleave (PGlite runs
// every try's insert before the first count, so none is); what holds in any order is the cap.
const burst = async (n) => {
  const tally = { 401: 0, 429: 0 };
  for (const res of await Promise.all(Array.from({ length: n }, (_, i) => h.edit(login(`guess ${i}`))))) tally[res.status]++;
  return tally;
};

test('tries sent at once cannot pass the cap: with nine failures recorded, at most one of thirty is checked', async () => {
  for (let i = 0; i < 9; i++) await store.recordLoginFailure();
  const tally = await burst(30);
  assert.ok(tally[401] <= 1, `${tally[401]} checked`);
  assert.equal(tally[401] + tally[429], 30);
  assert.equal(await store.recentLoginFailures(15), 9 + tally[401], 'the refused tries are forgotten');
});

test('under the cap, tries sent at once are all checked', async () => {
  assert.deepEqual(await burst(4), { 401: 4, 429: 0 });
  assert.equal(await store.recentLoginFailures(15), 4);
});

test('logging in sets the locked cookie and sends to /edit/', async () => {
  const res = await h.edit(login(PASSWORD));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/edit/');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie.startsWith('archivio_edit='));
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.deepEqual(waits, []);
  const local = await make({ secure: false }).edit(login(PASSWORD));
  assert.doesNotMatch(local.headers.get('set-cookie'), /Secure/);
});

test('logging out clears the cookie and sends to /edit/', async () => {
  const res = await h.edit(post('logout', {}));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/edit/');
  assert.equal(res.headers.get('set-cookie'), 'archivio_edit=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
});

test('a login without the environment says so instead of refusing every password', async () => {
  const res = await make({ env: {} }).edit(login(PASSWORD));
  assert.equal(res.status, 500);
  assert.match(await res.text(), /EDIT_PASSWORD_HASH/);
  assert.equal(await store.recentLoginFailures(15), 0);
});

test('an unknown route is 404, a known one asked the wrong way 405, and a GET of the login goes to the form', async () => {
  assert.equal((await h.edit(get('nothing'))).status, 404);
  assert.equal((await h.edit(get('constructor'))).status, 404);
  const wrong = await h.edit(get('op'));
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('allow'), 'POST');
  const back = await h.edit(get('login', { cookie: '' }));
  assert.equal(back.status, 303);
  assert.equal(back.headers.get('location'), '/edit/');
});

test('the store is set up once per instance, not on every request', async () => {
  let inits = 0;
  const counted = { ...store, init: async () => { inits++; return store.init(); } };
  const once = make({ store: counted });
  await once.site(new Request('https://a.test/api/site?path=index.html'));
  assert.equal(inits, 0, 'the public files need no tables made');
  await once.edit(get(''));
  await once.edit(hide('b', 1));
  assert.equal(inits, 1);
});

// ＋ picture (design §6). The cloud's stores are stood in for by the production adapter's token
// checks (the handshake makes its token here, with no request to Vercel); the rest runs on the
// local server's adapter, on a temporary folder: an original sent to /edit/original, made into the
// site's two JPEGs by /edit/picture, and added to the row by the op add-picture.
const ORIGINALS_TOKEN = 'vercel_blob_rw_privatestore_secretone';
const PICTURES_TOKEN = 'vercel_blob_rw_publicstore_secrettwo';
const cloudPictures = () => cloudStores({ originals: ORIGINALS_TOKEN, pictures: PICTURES_TOKEN });
async function localStore() {
  const dir = await tempDir('edit-pictures-');
  const originals = path.join(dir, 'originals');
  const served = path.join(dir, 'img');
  return { originals, served, pictures: localStores({ originals, pictures: served }) };
}
const sendOriginal = (bytes, { pathname = 'originals/a-mf3k2a.jpg', type = 'image/jpeg', ...options } = {}) => new Request('https://a.test/api/edit?route=original', {
  method: 'POST', headers: { ...headersOf({ type, ...options }), 'x-pathname': pathname }, body: bytes,
});
const handshake = (pathname, options) => post('upload', { type: 'blob.generate-client-token', payload: { pathname, clientPayload: null, multipart: false } }, options);

test('upload, picture and original answer 401 without the cookie and 403 from another origin, and keep nothing', async () => {
  const local = await localStore();
  const dev = make({ pictures: local.pictures });
  const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#000' } }).jpeg().toBuffer();
  for (const options of [{ cookie: '' }, { origin: 'https://evil.test' }]) {
    const status = options.cookie === '' ? 401 : 403;
    for (const req of [handshake('originals/a-1.jpg', options), post('picture', { id: 'a', pathname: 'originals/a-1.jpg' }, options), sendOriginal(photo, options)]) {
      const res = await dev.edit(req);
      assert.equal(res.status, status, `${new URL(req.url).searchParams.get('route')} ${JSON.stringify(options)}`);
    }
    assert.equal((await make({ pictures: cloudPictures() }).edit(handshake('originals/a-1.jpg', options))).status, status, 'the cloud\'s handshake too');
  }
  await assert.rejects(readdir(local.originals), { code: 'ENOENT' }, 'no original kept');
  assert.equal((await store.getDraft()).version, 1);
});

test('the handshake answers a token for a name under originals/ and refuses any other; original is not found in the cloud', async () => {
  const cloud = make({ pictures: cloudPictures() });
  const res = await cloud.edit(handshake('originals/a-mf3k2a.jpg'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.equal(body.type, 'blob.generate-client-token');
  assert.match(body.clientToken, /^vercel_blob_client_privatestore_/);
  for (const pathname of ['pictures/x.jpg', '../x', 'originals/a/b.jpg', 'originals/%2e%2e', 'originals/a#b.jpg']) {
    const refused = await cloud.edit(handshake(pathname));
    assert.equal(refused.status, 422, pathname);
    assert.equal(typeof (await refused.json()).error, 'string');
  }
  const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#000' } }).jpeg().toBuffer();
  assert.equal((await cloud.edit(sendOriginal(photo))).status, 404, 'original is the local server\'s alone');
  const local = await localStore();
  assert.equal((await make({ pictures: local.pictures }).edit(handshake('originals/a-1.jpg'))).status, 404, 'the local server has no handshake');
  const none = await h.edit(post('picture', { id: 'a', pathname: 'originals/a-1.jpg' }));
  assert.equal(none.status, 500, 'without stores, pictures cannot be added');
  assert.match((await none.json()).error, /BLOB_READ_WRITE_TOKEN and PICTURES_READ_WRITE_TOKEN/);
});

test('picture refuses a name outside originals/, a row that does not exist, and a file that is not a picture, and leaves the draft as it was', async () => {
  const local = await localStore();
  const dev = make({ pictures: local.pictures });
  for (const pathname of ['../x', 'pictures/x.jpg', 'originals/a/b.jpg', 'originals/..', 'originals/%2e%2e', 'originals/.%2E', 'originals/a?b.jpg', 7]) {
    const res = await dev.edit(post('picture', { id: 'a', pathname }));
    assert.equal(res.status, 422, JSON.stringify(pathname));
  }
  const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#000' } }).jpeg().toBuffer();
  const { pathname } = await (await dev.edit(sendOriginal(photo))).json();
  const nowhere = await dev.edit(post('picture', { id: 'z', pathname }));
  assert.deepEqual([nowhere.status, await nowhere.json()], [422, { error: 'There is no row z.' }]);
  const text = await (await dev.edit(sendOriginal(Buffer.from('Notes, not a picture.\n'), { pathname: 'originals/a-mf3k2b.jpg' }))).json();
  const notPicture = await dev.edit(post('picture', { id: 'a', pathname: text.pathname }));
  assert.deepEqual([notPicture.status, await notPicture.json()], [422, { error: 'That file is not a picture the site can take: JPEG, PNG or WebP.' }]);
  await assert.rejects(readdir(local.served), { code: 'ENOENT' }, 'nothing made, nothing served');
  assert.equal((await store.getDraft()).version, 1, 'the draft is untouched');
  for (const [bytes, options] of [[photo, { type: 'text/plain' }], [photo, { type: 'image/heic' }], [photo, { pathname: 'pictures/a.jpg' }]]) {
    assert.equal((await dev.edit(sendOriginal(bytes, options))).status, 422, JSON.stringify(options));
  }
  const declared = await dev.edit(new Request('https://a.test/api/edit?route=original', {
    method: 'POST', headers: { ...headersOf({ type: 'image/jpeg' }), 'x-pathname': 'originals/a-big.jpg', 'content-length': String(100 * 1024 * 1024 + 1) }, body: photo,
  }));
  assert.equal(declared.status, 413, 'an original over 100 MB is refused before it is read');
});

test('end to end on this computer: original, picture, add-picture; the row holds the picture, its thumb is the small one, and the row as drawn shows it', async () => {
  const local = await localStore();
  const dev = make({ pictures: local.pictures });
  const page = await (await dev.edit(get(''))).text();
  assert.equal(JSON.parse(/<script type="application\/json" id="edit-data">([\s\S]*?)<\/script>/.exec(page)[1]).originals, 'original', 'the page sends its originals to /edit/original');
  const cloudPage = await (await make({ pictures: cloudPictures() }).edit(get(''))).text();
  assert.equal(JSON.parse(/<script type="application\/json" id="edit-data">([\s\S]*?)<\/script>/.exec(cloudPage)[1]).originals, 'upload', 'in the cloud, by the handshake');

  const photo = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#a07040' } }).withExif({ IFD0: { Make: 'Phone' } }).jpeg().toBuffer();
  const sent = await dev.edit(sendOriginal(photo));
  assert.equal(sent.status, 200);
  const { pathname } = await sent.json();
  assert.match(pathname, /^originals\/a-mf3k2a-[0-9a-f]+\.jpg$/);
  assert.ok((await readFile(path.join(local.originals, pathname.slice('originals/'.length)))).equals(photo), 'the original kept as sent');

  const made = await dev.edit(post('picture', { id: 'a', pathname }));
  assert.equal(made.status, 200);
  const { picture } = await made.json();
  assert.deepEqual([picture.w, picture.h, picture.small.w, picture.small.h], [1600, 1200, 220, 165]);
  assert.match(picture.src, /^\/dev-img\/a-[0-9a-z]+-[0-9a-f]+\.jpg$/);
  for (const src of [picture.src, picture.small.src]) {
    const file = await readFile(path.join(local.served, src.slice('/dev-img/'.length)));
    assert.ok(stripJpeg(file).equals(file), `${src} carries no metadata`);
  }
  assert.equal((await store.getDraft()).version, 1, 'making the pictures leaves the draft as it was');

  const added = await dev.edit(post('op', { version: 1, op: { op: 'add-picture', id: 'a', picture } }));
  assert.equal(added.status, 200);
  const body = await added.json();
  assert.deepEqual(body.stored.pictures, [picture]);
  assert.deepEqual(body.stored.thumb, picture.small);
  assert.match(body.row, new RegExp(`<img data-src="${picture.src.replace(/[.]/g, '\\.')}" alt="" width="1600" height="1200">`), 'the row as drawn shows it');
  assert.ok(!body.row.includes(picture.small.src), 'the small one is not drawn in the row');
  const draft = await store.getDraft();
  assert.deepEqual([draft.version, draft.doc.rows.a.pictures, draft.doc.rows.a.thumb], [2, [picture], picture.small]);
  assert.equal(body.summary, '1 row changed');
});

// Pages (design §14): each page a publish shows is a public file at pages/<address>.html, served as
// the other four are; nothing else under pages/ is. In edit mode a page is at
// /edit/pages/<address>, for a session only.
const PAGE_OPS = [
  { op: 'add-page', title: 'On the bridge', row: null },
  { op: 'set-page', id: 'p1', text: 'Words on the [[bridge|@b]].' },
  { op: 'add-page', title: 'More on b', row: 'b' },
];
async function withPages() {
  let version = 1;
  for (const op of PAGE_OPS) {
    const res = await h.edit(post('op', { version, op }));
    assert.equal(res.status, 200, JSON.stringify(op));
    version++;
  }
  return version;
}

test('a page published is served at pages/<address>.html with the public headers; nothing else under pages/ is', async () => {
  const version = await withPages();
  assert.equal((await site('pages/on-the-bridge.html')).status, 404, 'not before it is published');
  assert.equal((await h.edit(post('publish', { version }))).status, 200);
  const res = await site('pages/on-the-bridge.html');
  assert.equal(res.status, 200);
  for (const [name, value] of Object.entries({ 'cache-control': 'public, max-age=0, must-revalidate', 'vercel-cdn-cache-control': 'max-age=31536000', 'cache-tag': 'site', 'vercel-cache-tag': 'site' })) {
    assert.equal(res.headers.get(name), value, name);
  }
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.match(res.headers.get('etag'), /^"2-/);
  assert.match(await res.text(), /<h1>On the bridge<\/h1>\n<article class="read page">\n<p>Words on the <a href="\.\.\/index\.html#o=b">bridge<\/a>\.<\/p>/);
  assert.equal((await site('pages/more-on-b.html')).status, 200);
  const at = (url) => h.site(new Request(url));
  assert.equal((await at('https://a.test/pages/more-on-b.html')).status, 200, 'by its own path, without the rewrite\'s query');
  for (const path of ['pages/../x.html', 'pages/../index.html', 'pages/X.html', 'pages/On-the-bridge.html', 'pages/nothing.html', 'pages/on-the-bridge.htm', 'pages/.html', 'pages/a/b.html', 'pages/on-the-bridge.html%00', 'pages/', 'pages']) {
    const missing = await site(path);
    assert.equal(missing.status, 404, path);
    assert.equal(missing.headers.get('cache-control'), 'no-store', path);
    assert.equal(missing.headers.get('cache-tag'), null, path);
  }
});

test('a page hidden or removed since the last publish answers 404 after the next one', async () => {
  let version = await withPages();
  assert.equal((await h.edit(post('publish', { version }))).status, 200);
  assert.equal((await h.edit(post('op', { version: version++, op: { op: 'hide-page', id: 'p1', hidden: true } }))).status, 200);
  assert.equal((await h.edit(post('op', { version: version++, op: { op: 'remove-page', id: 'p2' } }))).status, 200);
  assert.equal((await site('pages/on-the-bridge.html')).status, 200, 'still public until the next publish');
  assert.equal((await h.edit(post('publish', { version }))).status, 200);
  assert.equal((await site('pages/on-the-bridge.html')).status, 404);
  assert.equal((await site('pages/more-on-b.html')).status, 404);
  assert.doesNotMatch(await (await site('index.html')).text(), /On the bridge|more-on-b/);
  assert.equal((await store.listPublishes())[0].summary, 'pages changed');
});

test('/edit/pages/<address>: 401 without the cookie, the page in edit mode with it, 404 for a page the draft does not have', async () => {
  await withPages();
  const out = await h.edit(get('pages/on-the-bridge', { cookie: '' }));
  assert.equal(out.status, 401);
  assert.equal(out.headers.get('cache-control'), 'no-store');
  const login = await out.text();
  assert.match(login, /<form class="login" method="post" action="\.\.\/login">/, 'the login, sent to /edit/login');
  assert.match(login, /<link rel="stylesheet" href="\.\.\/\.\.\/web\/base\.css">/);
  assert.doesNotMatch(login, /edit-data|Words on the/);
  const res = await h.edit(get('pages/on-the-bridge'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  const html = await res.text();
  assert.match(html, /<article class="read page" data-page="p1">/);
  const data = JSON.parse(/<script type="application\/json" id="edit-data">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.deepEqual([data.version, data.page, data.summary], [4, 'p1', 'pages changed']);
  const byPath = await h.edit(new Request('https://a.test/edit/pages/more-on-b', { headers: headersOf() }));
  assert.equal(byPath.status, 200, 'by its own path, without the rewrite\'s query');
  for (const route of ['pages/nothing', 'pages/constructor', 'pages/On-the-bridge', 'pages/on-the-bridge.html', 'pages/', 'pages/a/b']) {
    const missing = await h.edit(get(route));
    assert.equal(missing.status, 404, route);
  }
  assert.match(await (await h.edit(get('pages/nothing'))).text(), /There is no page nothing in the draft\./);
  assert.equal((await h.edit(post('pages/on-the-bridge', {}))).status, 405);
});

test('an op answers with the draft\'s pages, and an edit of a page with its tabs and its text as the page in edit mode draws them', async () => {
  const added = await (await h.edit(post('op', { version: 1, op: { op: 'add-page', title: 'On the bridge', row: null } }))).json();
  assert.deepEqual(added.result, { id: 'p1', address: 'on-the-bridge' });
  assert.deepEqual(added.pages, [{ id: 'p1', address: 'on-the-bridge', title: 'On the bridge', text: '', row: null, hidden: false }]);
  assert.equal(added.summary, 'pages changed');
  const written = await (await h.edit(post('op', { version: 2, op: { op: 'set-page', id: 'p1', text: 'Words on the [[bridge|@b]].' } }))).json();
  const html = await (await h.edit(get('pages/on-the-bridge'))).text();
  assert.ok(html.includes(written.page.article), 'the text as the page draws it');
  assert.ok(html.includes(written.page.nav), 'the tabs as the page draws them');
  assert.match(written.page.article, /<a href="\.\.\/\.\.\/edit\/#o=b">bridge<\/a>/);
  const hidden = await (await h.edit(post('op', { version: 3, op: { op: 'hide-page', id: 'p1', hidden: true } }))).json();
  assert.match(hidden.page.nav, /<a href="\.\.\/\.\.\/edit\/pages\/on-the-bridge" aria-current="page" class="dead-link" title="The page is hidden\.">On the bridge<\/a>/);
  const plain = await (await h.edit(hide('a', 4))).json();
  assert.equal(plain.page, undefined, 'an edit of a row draws no page');
  assert.equal(plain.pages[0].hidden, true);
  const removed = await (await h.edit(post('op', { version: 5, op: { op: 'remove-page', id: 'p1' } }))).json();
  assert.deepEqual([removed.pages, removed.page], [[], undefined]);
});
