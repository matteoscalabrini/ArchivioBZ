// npm run db:sync [-- --dry-run]
//
// Copies the archive's media to the private Blob store (archiviobz-media) and rebuilds the
// database (archiviobz-db, Neon Postgres) from the records in git. Only files Blob lacks or
// holds in an older copy are uploaded; nothing is ever deleted from Blob (db/media.mjs). The
// database is emptied and written again in one transaction, so it always matches the records.
//
// Credentials come from library/.deploy/.env.local (vercel env pull --cwd library/.deploy):
// BLOB_READ_WRITE_TOKEN for the store, DATABASE_URL for the database. Without DATABASE_URL only
// the media are copied. --dry-run says what would be uploaded and stops.
import { createHash } from 'node:crypto';
import { createReadStream, openAsBlob } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { list, put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';
import { loadLibrary } from '../lib/records.mjs';
import { localMedia, plan } from './media.mjs';
import { tables } from './tables.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const AT_ONCE = 4;
const MULTIPART = 50 * 1024 * 1024;
const TYPES = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.heic': 'image/heic', '.djvu': 'image/vnd.djvu',
  '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const typeOf = (p) => TYPES[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

const dryRun = process.argv.includes('--dry-run');
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('no BLOB_READ_WRITE_TOKEN: run vercel env pull --cwd library/.deploy, then npm run db:sync');
  process.exit(1);
}

const local = await localMedia(ROOT);
const remote = await blobs();
const { upload, same, orphaned } = plan(local, remote);
const total = upload.reduce((sum, file) => sum + file.size, 0);
console.log(`${local.length} media on disk: ${same.length} already in Blob, ${upload.length} to upload (${mb(total)})`);
if (orphaned.length) console.log(`${orphaned.length} in Blob and no longer on disk, kept:\n  ${orphaned.join('\n  ')}`);
if (dryRun) process.exit(0);

let done = 0;
let sent = 0;
await inTurn(upload, AT_ONCE, async (file) => {
  await attempt(async () => put(file.path, await openAsBlob(path.join(ROOT, file.path)), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: typeOf(file.path),
    multipart: file.size > MULTIPART,
  }));
  done += 1;
  sent += file.size;
  if (done % 25 === 0 || done === upload.length) console.log(`uploaded ${done}/${upload.length}, ${mb(sent)} of ${mb(total)}`);
});

// What Blob holds now, checked against the disk: a copy of another size is an error, and the
// database is not written (it records what Blob holds, not what was meant to be sent).
const held = await blobs();
const wrong = local.filter((file) => held.get(file.path)?.size !== file.size);
if (wrong.length) {
  for (const file of wrong.slice(0, 20)) console.error(`ERROR ${file.path}: ${file.size} bytes on disk, ${held.get(file.path)?.size ?? 'nothing'} in Blob`);
  console.error(`${wrong.length} media are not in Blob as they are on disk: the database is not written`);
  process.exit(1);
}
console.log(`checked: all ${local.length} media are in Blob at their size on disk`);

if (!process.env.DATABASE_URL) {
  console.log('no DATABASE_URL: the media are in Blob, the database is not written');
  process.exit(0);
}

const lib = await loadLibrary(ROOT);
const errors = lib.problems.filter((p) => p.level === 'error');
if (errors.length) {
  for (const { where, message } of errors) console.error(`ERROR ${where}: ${message}`);
  console.error('the records have errors: the database is not written');
  process.exit(1);
}
const onDisk = new Map(local.map((file) => [file.path, file]));
const hashes = new Map();
await inTurn(local, AT_ONCE, async (file) => hashes.set(file.path, await sha256(path.join(ROOT, file.path))));
const media = [...held.values()].map((blob) => ({
  path: blob.pathname,
  size: blob.size,
  sha256: hashes.get(blob.pathname) ?? null,
  content_type: typeOf(blob.pathname),
  blob_url: blob.url,
  uploaded_at: blob.uploadedAt.toISOString(),
  on_disk: onDisk.has(blob.pathname),
}));
const kinds = JSON.parse(await readFile(path.join(ROOT, 'library', 'content', 'kinds.json'), 'utf8'));
const t = tables(lib, ROOT, media, { kinds });

const sql = neon(process.env.DATABASE_URL);
const schema = (await readFile(path.join(HERE, 'schema.sql'), 'utf8'))
  .replace(/--.*$/gm, '')
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);
const rows = (table, columns, data) => sql.query(
  `insert into ${table} (${Object.keys(columns).join(', ')}) select ${Object.keys(columns).join(', ')} from jsonb_to_recordset($1::jsonb) as x(${Object.entries(columns).map(([name, type]) => `${name} ${type}`).join(', ')})`,
  [JSON.stringify(data)],
);
await sql.transaction([
  ...schema.map((statement) => sql.query(statement)),
  sql.query('delete from entry_media'),
  sql.query('delete from entries'),
  sql.query('delete from media'),
  sql.query('delete from keywords'),
  sql.query('delete from places'),
  sql.query('delete from kinds'),
  rows('media', { path: 'text', size: 'bigint', sha256: 'text', content_type: 'text', blob_url: 'text', uploaded_at: 'timestamptz', on_disk: 'boolean' }, media),
  rows('entries', {
    no: 'text', section: 'integer', title: 'text', type: 'text', date: 'text', year: 'integer', keywords: 'text[]', place: 'text',
    confidence: 'text', rights: 'text', holder: 'text', creator: 'text', source_url: 'text', file: 'text', folder: 'text', record: 'jsonb',
  }, t.entries),
  rows('entry_media', { no: 'text', path: 'text', role: 'text', position: 'integer', caption: 'text' }, t.entryMedia),
  rows('keywords', { id: 'text', label: 'text', data: 'jsonb' }, t.keywords),
  rows('places', { id: 'text', name: 'text', lat: 'double precision', lon: 'double precision', data: 'jsonb' }, t.places),
  rows('kinds', { id: 'text', label: 'text', types: 'text[]' }, t.kinds),
]);
const [counts] = await sql.query(`select (select count(*) from entries) as entries, (select count(*) from media) as media,
  (select count(*) from entry_media) as links, (select count(*) from keywords) as keywords, (select count(*) from places) as places,
  (select count(*) from kinds) as kinds, (select coalesce(sum(size), 0) from media) as bytes`);
console.log(`database: ${counts.entries} rows, ${counts.media} media (${mb(Number(counts.bytes))}), ${counts.links} links from rows to media, ${counts.keywords} keywords, ${counts.places} places, ${counts.kinds} kinds`);

// Every blob in the store: pathname -> {pathname, size, url, uploadedAt}.
async function blobs() {
  const all = new Map();
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    for (const blob of page.blobs) all.set(blob.pathname, blob);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return all;
}

async function attempt(job, tries = 3) {
  for (let n = 1; ; n++) {
    try {
      return await job();
    } catch (err) {
      if (n >= tries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000 * n));
    }
  }
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

async function inTurn(items, width, job) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) await job(items[next++]);
  }));
}
