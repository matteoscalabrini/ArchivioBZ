import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from '../serve.mjs';
import { sourceUrl } from '../lib/records.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PHOTO = path.join(ROOT, "research_notes/Inv A/files/05_x/Teßmann '60.jpg");
const INDEX = '<!doctype html><title>fixture index</title>';

let server;
let port;
let out;

before(async () => {
  out = await mkdtemp(path.join(os.tmpdir(), 'library-serve-'));
  await writeFile(path.join(out, 'index.html'), INDEX);
  server = createServer({ root: ROOT, out });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(out, { recursive: true, force: true });
});

// Raw request: the path goes out exactly as written, dot segments included.
function get(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves a source file whose name has spaces, ß and an apostrophe', async () => {
  const res = await get(sourceUrl(ROOT, PHOTO));
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/jpeg');
  assert.deepEqual(res.body, await readFile(PHOTO));
});

test('refuses /source/library/build.mjs', async () => {
  assert.equal((await get('/source/library/build.mjs')).status, 403);
  assert.equal((await get('/source/library/content/keywords.json')).status, 403);
});

test('refuses /source/research_notes/../package.json', async () => {
  assert.ok([403, 404].includes((await get('/source/research_notes/../package.json')).status));
});

test('refuses an encoded way out of research_notes', async () => {
  for (const sneaky of [
    '/source/research_notes/%2E%2E/library/content/keywords.json',
    '/source/research_notes%2F..%2Flibrary/content/keywords.json',
    '/source/research_notes/..%2Flibrary%2Fcontent%2Fkeywords.json',
  ]) {
    const { status } = await get(sneaky);
    assert.ok(status >= 400 && status < 500, `${sneaky} answered ${status}`);
  }
});

test('answers Range: bytes=0-9 with 206 and 10 bytes', async () => {
  const whole = await readFile(PHOTO);
  const res = await get(sourceUrl(ROOT, PHOTO), { Range: 'bytes=0-9' });
  assert.equal(res.status, 206);
  assert.equal(res.headers['content-range'], `bytes 0-9/${whole.length}`);
  assert.equal(res.body.length, 10);
  assert.deepEqual(res.body, whole.subarray(0, 10));
});

test('answers a range that starts past the end with 416', async () => {
  const size = (await readFile(PHOTO)).length;
  const res = await get(sourceUrl(ROOT, PHOTO), { Range: `bytes=${size + 10}-` });
  assert.equal(res.status, 416);
  assert.equal(res.headers['content-range'], `bytes */${size}`);
});

test('/ returns index.html from out', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^text\/html/);
  assert.equal(res.body.toString(), INDEX);
});
