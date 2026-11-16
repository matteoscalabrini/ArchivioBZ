// Pictures for the Library page. Every held image becomes a JPEG at most 1600 px on its longer
// side, never enlarged, transparency on white; a row with no image whose file is a PDF gets its
// first page. entry.pictures = [{src, w, h, caption, original}], src relative to `out`.
// A row that has a place also gets entry.thumb = {src, w, h}: its first picture at most 220 px on
// its longer side, the small picture it has on the map.
//
// Conversions are kept in library/.cache/img/ under a key made of the source's path, size and
// modification time, so a rebuild converts only what is new or changed (the small pictures the
// same way, in library/.cache/thumb/). A file that cannot be
// converted is a warning naming its row; the build goes on.
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { jpegOrientation } from '../lib/metadata.mjs';

const run = promisify(execFile);
const MAX = 1600;
const THUMB = 220;
const CACHE_VERSION = 1; // raise when the conversion changes, so old results are not reused
const TIMEOUT = 120_000;
const AT_ONCE = Math.max(1, Math.min(8, os.availableParallelism()));
const NEEDS_NO_PICTURE = new Set(['Table', 'Notes', 'Law text']);
const PDF = /\.pdf$/i;

export default async function pictures(ctx) {
  const cache = path.join(ctx.root, 'library', '.cache', 'img');
  await mkdir(cache, { recursive: true });
  const where = (entry) => path.relative(ctx.root, path.join(entry.dir, 'entries.json')).split(path.sep).join('/');
  const warn = (entry, message) => ctx.problems.push({ level: 'warn', where: where(entry), message: `row ${entry.no}: ${message}` });

  const jobs = [];
  for (const entry of ctx.lib.entries) {
    const sources = entry.images.length
      ? entry.images.map((image) => ({ abs: image.abs, name: image.file, caption: image.caption ?? '' }))
      : entry.abs && PDF.test(entry.abs) ? [{ abs: entry.abs, name: entry.file, caption: 'First page' }] : [];
    if (!sources.length && !NEEDS_NO_PICTURE.has(entry.type)) warn(entry, 'no picture');
    sources.forEach((source, n) => jobs.push({ entry, src: `img/${entry.no}-${n + 1}.jpg`, ...source }));
  }

  const converting = new Map(); // source path -> promise of its cached conversion
  const converted = new Map(); // a picture's src -> its file in the cache
  const made = await inTurn(jobs, AT_ONCE, async (job) => {
    try {
      if (!converting.has(job.abs)) converting.set(job.abs, cached(job.abs, cache));
      const { file, w, h } = await converting.get(job.abs);
      await ctx.copyFile(file, job.src);
      converted.set(job.src, file);
      return { src: job.src, w, h, caption: job.caption, original: ctx.sourceUrl(job.abs) };
    } catch (err) {
      warn(job.entry, `no picture from "${job.name}": ${reason(err)}`);
      return null;
    }
  });

  for (const entry of ctx.lib.entries) entry.pictures = [];
  jobs.forEach((job, n) => made[n] && job.entry.pictures.push(made[n]));

  const small = path.join(ctx.root, 'library', '.cache', 'thumb');
  await mkdir(small, { recursive: true });
  const placed = ctx.lib.entries.filter((entry) => entry.place && Object.hasOwn(ctx.lib.places ?? {}, entry.place) && entry.pictures.length);
  await inTurn(placed, AT_ONCE, async (entry) => {
    try {
      const [first] = entry.pictures;
      const { file, w, h } = await thumb(converted.get(first.src), first, small);
      const src = `img/t/${entry.no}.jpg`;
      await ctx.copyFile(file, src);
      entry.thumb = { src, w, h };
    } catch (err) {
      warn(entry, `no small picture for the map: ${reason(err)}`);
    }
  });
}

// The small copy of the converted picture `file` ({w, h} its size) in `cache`, made only once.
async function thumb(file, { w, h }, cache) {
  const { size, mtimeMs } = await stat(file);
  const key = createHash('sha256').update(`${CACHE_VERSION}\0${THUMB}\0${file}\0${size}\0${mtimeMs}`).digest('hex').slice(0, 32);
  const dest = path.join(cache, `${key}.jpg`);
  const known = await readFile(dest).then(jpegSize, () => null);
  if (known) return { file: dest, ...known };
  const part = path.join(cache, `${key}.${randomUUID()}.part.jpg`);
  try {
    const scale = Math.max(w, h) > THUMB ? ['-Z', String(THUMB)] : []; // sips -Z alone would also enlarge
    await run('sips', [...scale, '-s', 'format', 'jpeg', '-s', 'formatOptions', '75', file, '--out', part], { timeout: TIMEOUT });
    const made = jpegSize(await readFile(part));
    if (!made) throw new Error('the small picture is not a JPEG');
    await rename(part, dest);
    return { file: dest, ...made };
  } finally {
    await rm(part, { force: true });
  }
}

// The converted file for `abs` in `cache`, converting only when the cache does not hold it.
// Also used by steps/40-longreads.mjs for the pictures of the reads on the web.
export async function cached(abs, cache) {
  const { size, mtimeMs } = await stat(abs);
  const key = createHash('sha256').update(`${CACHE_VERSION}\0${abs}\0${size}\0${mtimeMs}`).digest('hex').slice(0, 32);
  const file = path.join(cache, `${key}.jpg`);
  const known = await readFile(file).then(jpegSize, () => null);
  if (known) return { file, ...known };
  const part = path.join(cache, `${key}.${randomUUID()}.part.jpg`);
  try {
    const made = await convert(abs, part);
    await rename(part, file);
    return { file, ...made };
  } finally {
    await rm(part, { force: true });
  }
}

// Converts one file into a JPEG at `dest` and returns its {w, h}: an image scaled down to 1600 px
// on its longer side when larger, a PDF's first page rendered 1600 px on its longer side.
export async function convert(src, dest) {
  if (PDF.test(src)) {
    const prefix = dest.endsWith('.jpg') ? dest.slice(0, -4) : dest; // pdftoppm adds ".jpg"
    await run('pdftoppm', ['-f', '1', '-l', '1', '-scale-to', String(MAX), '-jpeg', '-singlefile', src, prefix], { timeout: TIMEOUT });
    if (`${prefix}.jpg` !== dest) await rename(`${prefix}.jpg`, dest);
  } else {
    const { stdout } = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', src], { timeout: TIMEOUT });
    const side = (key) => Number(new RegExp(`${key}: (\\d+)`).exec(stdout)?.[1]);
    const [w, h] = [side('pixelWidth'), side('pixelHeight')];
    if (!w || !h) throw new Error('not an image sips can read');
    const scale = Math.max(w, h) > MAX ? ['-Z', String(MAX)] : []; // sips -Z alone would also enlarge
    await run('sips', [...scale, '-s', 'format', 'jpeg', src, '--out', dest], { timeout: TIMEOUT });
  }
  const size = jpegSize(await readFile(dest));
  if (!size) throw new Error('the converted file is not a JPEG');
  return size;
}

// {w, h} of a JPEG as it shows, or null when `buf` is not a JPEG: from the frame header, with
// width and height exchanged when the Exif orientation turns it a quarter (a phone's portrait
// photograph is stored on its side and shows upright).
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < buf.length && buf[at] === 0xff) {
    const marker = buf[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const [w, h] = [buf.readUInt16BE(at + 7), buf.readUInt16BE(at + 5)];
      return jpegOrientation(buf) >= 5 ? { w: h, h: w } : { w, h };
    } else {
      at += 2 + buf.readUInt16BE(at + 2);
    }
  }
  return null;
}

// fn over every item, at most `limit` at a time; the results in the items' order.
async function inTurn(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const n = next++;
      results[n] = await fn(items[n], n);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// The tool's last word on stderr (pdftoppm warns before it fails), or what Node says.
function reason(err) {
  const said = String(err.stderr ?? '').trim() || (err.killed ? `stopped after ${TIMEOUT / 1000} s` : err.message);
  return said.split('\n').at(-1).trim();
}
