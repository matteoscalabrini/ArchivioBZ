import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore } from '../cloud/store.mjs';
import { moveIn, devPictures } from '../tools/move-in.mjs';
import { startDev } from '../tools/dev.mjs';
import { cleanRoot, tempDir } from './helpers.mjs';

let dev, base, dataDir, imgDir;
before(async () => {
  const root = await cleanRoot();
  dataDir = await tempDir('dev-db-');
  imgDir = await tempDir('dev-img-');
  const pg = new PGlite(dataDir);
  const store = makeStore(pgliteDb(pg));
  await store.init();
  await moveIn({ root, store, putPicture: devPictures(imgDir), chapterTitles: { 0: 'Zero', 5: 'Five', 12: 'Twelve' } });
  await pg.close();
  dev = await startDev({ port: 0, dataDir, imgDir });
  base = dev.url.replace(/\/edit\/$/, '');
});
after(() => dev.close());

test('the edit address shows the login form without a cookie', async () => {
  const res = await fetch(`${base}/edit/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /type="password"/);
});

test('/edit goes to /edit/', async () => {
  const res = await fetch(`${base}/edit`, { redirect: 'manual' });
  assert.equal(res.status, 307);
  assert.equal(res.headers.get('location'), '/edit/');
});

test('the password dev logs in with a cookie that is not Secure, and the edit page follows', async () => {
  const res = await fetch(`${base}/edit/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'password=dev',
  });
  assert.equal(res.status, 303);
  const set = res.headers.getSetCookie()[0];
  assert.match(set, /^archivio_edit=/);
  assert.doesNotMatch(set, /Secure/);
  assert.match(set, /HttpOnly/);
  const page = await fetch(`${base}/edit/`, { headers: { cookie: set.split(';')[0] } });
  assert.match(await page.text(), /id="edit-data"/);
});

test('before a publish the public site answers 503', async () => {
  assert.equal((await fetch(`${base}/`)).status, 503);
  assert.equal((await fetch(`${base}/search.json`)).status, 503);
});

test('static files carry their content types', async () => {
  const js = await fetch(`${base}/web/library.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /^text\/javascript/);
  const map = await fetch(`${base}/map-data/dots.json`);
  assert.match(map.headers.get('content-type'), /^application\/json/);
});

test('pictures come from the picture folder, and nothing outside a folder is served', async () => {
  const names = (await (await import('node:fs/promises')).readdir(imgDir));
  assert.ok(names.length > 0);
  const img = await fetch(`${base}/dev-img/${names[0]}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(`${base}/web/..%2Fserve.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/dev-img/%2e%2e/dev-db/PG_VERSION`)).status, 404);
  assert.equal((await fetch(`${base}/web/nope.js`)).status, 404);
  assert.equal((await fetch(`${base}/elsewhere`)).status, 404);
});

// vercel.json's two rewrites for the pages (design §14), as this server reads them.
test('a page\'s two addresses reach their functions: /pages/<file> the public one, /edit/pages/<address> edit mode\'s', async () => {
  const site = await fetch(`${base}/pages/on-the-bridge.html`);
  assert.equal(site.status, 404, 'no page is published');
  assert.equal(await site.text(), 'Not found');
  const edit = await fetch(`${base}/edit/pages/on-the-bridge`);
  assert.equal(edit.status, 401);
  assert.match(await edit.text(), /<form class="login" method="post" action="\.\.\/login">/);
});
