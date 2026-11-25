// npm run db:sync [-- --dry-run]
//
// Copies the archive's media to the private Blob store (archiviobz-media). Only files Blob lacks
// or holds in an older copy are uploaded; nothing is ever deleted from Blob (db/media.mjs).
// The old half of this script, which rebuilt the mirror tables of the records in the database,
// is gone: the rows live in the draft now (npm run draft), and it would have emptied those tables.
//
// The credential comes from library/.deploy/.env.local (vercel env pull --cwd library/.deploy):
// BLOB_READ_WRITE_TOKEN. --dry-run says what would be uploaded and stops.
import { openAsBlob } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { list, put } from '@vercel/blob';
import { localMedia, plan } from './media.mjs';

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

// What Blob holds now, checked against the disk: a copy of another size is an error.
const held = await blobs();
const wrong = local.filter((file) => held.get(file.path)?.size !== file.size);
if (wrong.length) {
  for (const file of wrong.slice(0, 20)) console.error(`ERROR ${file.path}: ${file.size} bytes on disk, ${held.get(file.path)?.size ?? 'nothing'} in Blob`);
  console.error(`${wrong.length} media are not in Blob as they are on disk`);
  process.exit(1);
}
console.log(`checked: all ${local.length} media are in Blob at their size on disk`);

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

async function inTurn(items, width, job) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) await job(items[next++]);
  }));
}
