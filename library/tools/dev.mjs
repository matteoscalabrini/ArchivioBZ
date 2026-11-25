// node library/tools/dev.mjs   (npm run dev; 127.0.0.1:5180, password `dev`)
//
// The edit mode on this computer: the same handlers the two functions in api/ run, answering the
// same addresses, against a PGlite database in library/.cache/dev-db/ instead of Neon. It never
// reads DATABASE_URL, so work on the code cannot touch the author's real draft. Fill the database
// first with `npm run move-in -- --dev --replace`. The cookie is not Secure (the page is http),
// the secret is new at each start, and nothing is purged.
import http from 'node:http';
import path from 'node:path';
import { createReadStream, readFileSync, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../cloud/db.mjs';
import { makeStore } from '../cloud/store.mjs';
import { loadLists } from '../cloud/render.mjs';
import { makeHandlers } from '../cloud/handlers.mjs';
import { hashPassword } from '../cloud/auth.mjs';

const LIBRARY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = path.dirname(LIBRARY);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const MAX_BODY = 4 * 1024 * 1024;

// vercel.json's redirects and rewrites as functions of the path: a literal source, a regex with
// groups (`$1` in the destination) or a `:name` segment. Read from the file, so the two cannot drift.
function readRoutes() {
  const config = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const compile = (source) => {
    const names = [];
    const pattern = source.replace(/:([A-Za-z_]\w*)/g, (_, name) => { names.push(name); return '([^/]+)'; });
    return { re: new RegExp(`^${pattern}$`), names };
  };
  const redirects = (config.redirects ?? []).map((r) => ({ ...compile(r.source), destination: r.destination, status: r.permanent ? 308 : 307 }));
  const rewrites = (config.rewrites ?? []).map((r) => ({ ...compile(r.source), destination: r.destination }));
  return { redirects, rewrites };
}

function fill(destination, match, names) {
  let out = destination.replace(/\$(\d+)/g, (_, n) => match[Number(n)] ?? '');
  names.forEach((name, i) => { out = out.replaceAll(`:${name}`, match[i + 1] ?? ''); });
  return out;
}

// The file under `dir` that `rest` names, or null: nothing outside `dir`, and only a file.
async function fileIn(dir, rest) {
  let decoded;
  try { decoded = decodeURIComponent(rest); } catch { return null; }
  if (!decoded || decoded.includes('\0')) return null;
  const file = path.resolve(dir, decoded);
  if (file !== dir && !file.startsWith(dir + path.sep)) return null;
  try {
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}

const body = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); } else chunks.push(chunk);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

export async function startDev({ port = 5180, dataDir = path.join(LIBRARY, '.cache', 'dev-db'), password = 'dev', imgDir = path.join(LIBRARY, '.cache', 'dev-img') } = {}) {
  const pg = new PGlite(path.resolve(dataDir));
  const lists = await loadLists(ROOT);
  for (const { level, where, message } of lists.problems) console.warn(`${level}: ${where}: ${message}`);
  const handlers = makeHandlers({
    store: makeStore(pgliteDb(pg)),
    env: { EDIT_PASSWORD_HASH: await hashPassword(password), SESSION_SECRET: randomBytes(32).toString('base64') },
    lists,
    secure: false,
  });
  const { redirects, rewrites } = readRoutes();
  const statics = [['/web/', path.join(LIBRARY, 'web')], ['/map-data/', path.join(LIBRARY, 'map-data')], ['/dev-img/', path.resolve(imgDir)]];

  async function serve(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, text, headers = {}) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers }); res.end(text); };

    for (const r of redirects) {
      if (r.re.test(url.pathname)) return send(r.status, '', { Location: r.destination });
    }
    for (const [prefix, dir] of statics) {
      if (!url.pathname.startsWith(prefix)) continue;
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed', { Allow: 'GET, HEAD' });
      const file = await fileIn(dir, url.pathname.slice(prefix.length));
      if (!file) return send(404, 'Not found');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      return pipeline(createReadStream(file), res);
    }
    for (const r of rewrites) {
      const match = r.re.exec(url.pathname);
      if (!match) continue;
      const target = new URL(fill(r.destination, match, r.names), url);
      const handler = { '/api/site': handlers.site, '/api/edit': handlers.edit }[target.pathname];
      if (!handler) return send(404, 'Not found');
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        for (const v of [].concat(value)) headers.append(name, v);
      }
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const request = new Request(new URL(target.pathname + target.search, `http://${req.headers.host ?? '127.0.0.1'}`), {
        method: req.method,
        headers,
        body: hasBody ? await body(req) : undefined,
      });
      const response = await handler(request);
      const out = new Headers(response.headers);
      const cookies = response.headers.getSetCookie();
      out.delete('set-cookie');
      const head = Object.fromEntries(out);
      if (cookies.length) head['set-cookie'] = cookies;
      res.writeHead(response.status, head);
      if (req.method === 'HEAD') return res.end();
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    return send(404, 'Not found');
  }

  const server = http.createServer((req, res) => {
    serve(req, res).catch((err) => {
      console.error(err);
      if (res.headersSent) res.destroy(err);
      else { res.writeHead(err.message === 'body too large' ? 413 : 500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Server error'); }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/edit/`;

  let closing = null;
  // PGlite holds its folder with a lock, so it is closed with the server.
  const close = () => (closing ??= (async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await pg.close();
  })());
  return { url, close };
}

// A link to this file counts as running it; so does a path through a symlink.
function startedAsScript() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (startedAsScript()) {
  const dev = await startDev({});
  console.log(`${dev.url} (password: dev)`);
  process.once('SIGINT', () => dev.close().then(() => process.exit(0)));
  process.once('SIGTERM', () => dev.close().then(() => process.exit(0)));
}
