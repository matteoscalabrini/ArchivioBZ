// Every page the build writes links only to what is there: a /source/ address to a file the server
// hands out, any other address to a file in the output folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from '../serve.mjs';
import { buildFixtures } from './helpers.mjs';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unesc = (s) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]);
const SCHEME = /^[a-z][a-z\d+.-]*:/i;

function status(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'HEAD', agent: false }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

test('every local href, src, data-src and data-original in every built page leads to a file', async () => {
  const { root, out, run } = await buildFixtures();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const server = createServer({ root, out });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const pages = (await readdir(out, { recursive: true }))
      .filter((name) => name.endsWith('.html'))
      .map((name) => name.split(path.sep).join('/'))
      .sort();
    assert.deepEqual(pages, ['about.html', 'index.html', 'map.html', 'read/0.01.html', 'read/5.00.html', 'table/5.03.html']);

    const broken = [];
    const checked = [];
    for (const page of pages) {
      const html = await readFile(path.join(out, page), 'utf8');
      const base = new URL(page.split('/').map(encodeURIComponent).join('/'), 'http://library.test/');
      for (const [, attr, raw] of html.matchAll(/\s(href|src|data-src|data-original)="([^"]*)"/g)) {
        const value = unesc(raw).trim();
        if (!value || value.startsWith('#') || /^https?:\/\//i.test(value)) continue;
        const name = `${page}: ${attr}="${value}"`;
        const url = new URL(value, base);
        if (SCHEME.test(value) || url.origin !== base.origin) {
          broken.push(`${name}: not an address on this site`);
        } else if (url.pathname.startsWith('/source/')) {
          const answer = await status(port, url.pathname);
          if (answer !== 200) broken.push(`${name}: the server answers ${answer}`);
        } else {
          const file = path.join(out, ...url.pathname.split('/').filter(Boolean).map(decodeURIComponent));
          if (!(await stat(file).catch(() => null))?.isFile()) broken.push(`${name}: not in the output folder`);
        }
        checked.push(url.pathname);
      }
    }
    assert.deepEqual(broken, []);

    // The check has something to bite on: pictures, files and pages of every kind.
    for (const expected of ['/source/library/content/cover.png', '/source/research_notes/Inv%20A/files/05_x/page.pdf',
      '/img/5.01-1.jpg', '/read/0.01.html', '/table/5.03.html', '/map.html', '/web/back.js', '/index.html']) {
      assert.ok(checked.includes(expected), `nothing links ${expected}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
