import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore, ConflictError } from '../cloud/store.mjs';
import { loadLists, renderSite } from '../cloud/render.mjs';
import { hashPassword, makeSession, SESSION_MS } from '../cloud/auth.mjs';
import { makeHandlers } from '../cloud/handlers.mjs';
import { sampleDoc } from './docs.mjs';
import { cleanRoot } from './helpers.mjs';

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
  await once.edit(get(''));
  await once.edit(hide('b', 1));
  assert.equal(inits, 1);
});
