// node library/serve.mjs [--root DIR] [--out DIR]   (port from PORT, default 5180; 127.0.0.1 only)
//
// Serves the built site from `out`, and under /source/ the original files where they already are:
// root/research_notes/ and root/reports/, nothing else. Supports single byte ranges.
import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const LIBRARY = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIRS = ['research_notes', 'reports'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.djvu': 'image/vnd.djvu',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.gz': 'application/gzip',
  '.bin': 'application/octet-stream',
};

export function createServer({ root, out }) {
  root = path.resolve(root);
  out = path.resolve(out);
  return http.createServer((req, res) => {
    handle(req, res, root, out).catch((err) => {
      if (res.headersSent) res.destroy(err);
      else send(res, 500, 'Server error');
    });
  });
}

async function handle(req, res, root, out) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  const request = parse(req.url);
  if (!request) return send(res, 400, 'Bad request');

  let file;
  if (request.segments[0] === 'source') {
    file = await sourceFile(root, request.segments.slice(1));
    if (!file) return send(res, 403, 'Forbidden');
  } else {
    file = path.join(out, ...request.segments);
  }

  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = path.join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) return send(res, 404, 'Not found');

  const headers = {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Last-Modified': info.mtime.toUTCString(),
    'Cache-Control': 'no-cache',
  };
  const range = parseRange(req.headers.range, info.size);
  if (range === 'unsatisfiable') return send(res, 416, 'Range not satisfiable', { 'Content-Range': `bytes */${info.size}` });
  let [start, end] = [0, info.size - 1];
  let status = 200;
  if (range) {
    [start, end] = range;
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = info.size ? end - start + 1 : 0;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || !info.size) return res.end();
  await pipeline(createReadStream(file, { start, end }), res);
}

// Path segments, decoded one by one. URL parsing has already removed `.` and `..` segments;
// a decoded segment that still holds a separator or a dot segment is refused.
function parse(rawUrl) {
  if (!rawUrl?.startsWith('/')) return null;
  let pathname;
  try {
    pathname = new URL(`http://localhost${rawUrl}`).pathname;
  } catch {
    return null;
  }
  const segments = [];
  for (const part of pathname.split('/')) {
    if (!part) continue;
    let name;
    try {
      name = decodeURIComponent(part);
    } catch {
      return null;
    }
    if (name === '.' || name === '..' || /[/\\\0]/.test(name)) return null;
    segments.push(name);
  }
  return { segments };
}

// The file a /source/ path names, or null when it lies outside research_notes/ and reports/,
// links included. A file that does not exist comes back as its path, to be answered with 404.
async function sourceFile(root, segments) {
  if (segments.length < 2 || !SOURCE_DIRS.includes(segments[0])) return null;
  const base = path.join(root, segments[0]);
  const file = path.join(base, ...segments.slice(1));
  try {
    const [realBase, realFile] = await Promise.all([realpath(base), realpath(file)]);
    return realFile.startsWith(realBase + path.sep) ? realFile : null;
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return file;
    throw err;
  }
}

// One range of `bytes=start-end`, `bytes=start-` or `bytes=-suffix`. Anything else, including
// several ranges, is ignored and the whole file is sent.
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!suffix) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    if (match[2] !== '' && Number(match[2]) < start) return null;
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start < size ? [start, end] : 'unsatisfiable';
}

function send(res, status, text, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(text), ...headers });
  res.end(text);
}

if (import.meta.main) {
  let values;
  try {
    ({ values } = parseArgs({ options: { root: { type: 'string' }, out: { type: 'string' } } }));
  } catch (err) {
    console.error(`${err.message}\nusage: node library/serve.mjs [--root DIR] [--out DIR]`);
    process.exit(1);
  }
  const root = path.resolve(values.root ?? path.dirname(LIBRARY));
  const out = path.resolve(values.out ?? path.join(root, 'library', 'dist'));
  const port = Number(process.env.PORT ?? 5180);
  createServer({ root, out }).listen(port, '127.0.0.1', () => {
    console.log(`Serving ${out}\nand originals from ${root} under /source/\nhttp://127.0.0.1:${port}/`);
  });
}
