// Moves today's library into the draft, once: every row of the record files and every picture
// the build makes for them. The pictures are made by the build's own picture step into a
// temporary folder, stripped of metadata, and put where the cloud reads them (the public Blob
// store, or a local folder with --dev); the document that names them goes into the draft.
//   npm run move-in [-- --dev] [--replace] [--dry-run]
// Anything wrong stops it before the first write: no row at all, an error in the records, a section
// with no chapter title, a JPEG that stripping would still change, an upload whose size is not the
// file's.
import { realpathSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkDoc, docFromLibrary, numbering } from '../cloud/doc.mjs';
import { loadLibrary } from '../lib/records.mjs';
import { stripJpeg } from '../lib/metadata.mjs';
import { publicPut } from '../cloud/pictures.mjs';
import { locatePlaces } from '../lib/places.mjs';
import pictureStep from '../steps/10-pictures.mjs';

const LIBRARY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT_ONCE = 4;

// Section number -> chapter title. Section 9 is named for what it now holds.
export const CHAPTER_TITLES = { 0: 'Bolzano in dots', 1: 'Posters, graphics, postcards', 2: 'Newsreels and radio', 3: 'Press',
  4: 'Migration and the Option', 5: 'Landmarks', 6: 'Brand and tourism', 7: 'Browser checks', 8: 'The Semirurali',
  9: 'Emigration from Trentino', 10: 'Internal colonization', 12: 'Defusing by form: references', 13: 'The Cinema Corso',
  14: 'City architecture', 15: 'Film and radio', 16: 'Print', 17: 'The Monument visit', 18: 'Covered names' };

// A picture's place in the store: 'img/18.04-1.jpg' -> '18.04-1.jpg', 'img/t/18.04.jpg' -> 't-18.04.jpg'.
const nameOf = (src) => src.replace(/^img\//, '').replace(/^t\//, 't-');

// The local stand-in for the public store: copies into `dir`, answers /dev-img/<name>.
export function devPictures(dir) {
  return async (file, name) => {
    await mkdir(dir, { recursive: true });
    await copyFile(file, path.join(dir, name));
    return `/dev-img/${name}`;
  };
}

// The public Blob store, as pictures/<name> with a random suffix, so that the address cannot be
// guessed; each upload checked as every public picture is (publicPut in cloud/pictures.mjs: no
// metadata left to strip, and its size asked for again with HEAD).
export function blobPictures(token) {
  const put = publicPut(token);
  return async (file, name) => put(await readFile(file), `pictures/${name}`);
}

// -> { doc, rows, pictures, problems }; `pictures` is how many files were (or, in a dry run,
// would be) put. A dry run touches neither the store nor putPicture.
export async function moveIn({ root, store, putPicture, chapterTitles = CHAPTER_TITLES, replace = false, dryRun = false }) {
  root = path.resolve(root);
  const lib = await loadLibrary(root);
  const errors = lib.problems.filter((p) => p.level === 'error');
  if (errors.length) throw new Error(`${errors.length} error${errors.length === 1 ? '' : 's'} in the records, nothing moved: ${errors.map((p) => `${p.where}: ${p.message}`).join('; ')}`);
  // Once the record files have left the repository there is nothing to move, and --replace would
  // set the author's draft aside for an empty one.
  if (!lib.entries.length) throw new Error('There is no row in the record files, so nothing was moved in: the draft in the database is the archive now.');
  for (const section of [...new Set(lib.entries.map((e) => e.section))].sort((a, b) => a - b)) {
    if (!chapterTitles[section]) throw new Error(`section ${section} has no chapter title`);
  }
  // The document once without its pictures, so that a field it does not keep, or a fault, stops
  // the move-in before a picture is sent.
  const early = checkDoc(docFromLibrary(lib, { root, chapterTitles }));
  if (early.length) throw new Error(`the document is not sound, nothing moved: ${early.join('; ')}`);
  // Refused before a single picture is sent, so a refusal leaves nothing behind in the store.
  if (!dryRun) {
    await store.init();
    if ((await store.getDraft()) && !replace) throw new Error('There is a draft already; --replace to overwrite it');
  }
  await locatePlaces(lib);

  const out = await mkdtemp(path.join(os.tmpdir(), 'move-in-'));
  try {
    const ctx = {
      root, out, lib,
      options: { check: false, present: false, web: true },
      problems: lib.problems,
      async write(rel, content) { await mkdir(path.dirname(path.join(out, rel)), { recursive: true }); await writeFile(path.join(out, rel), content); },
      async copyFile(abs, rel) { await mkdir(path.dirname(path.join(out, rel)), { recursive: true }); await copyFile(abs, path.join(out, rel)); },
      sourceUrl: () => null,
    };
    await pictureStep(ctx);

    // Strip, then prove it: what is sent must be what stripping leaves unchanged.
    const srcs = [];
    for (const entry of lib.entries) srcs.push(...entry.pictures.map((p) => p.src), ...(entry.thumb ? [entry.thumb.src] : []));
    for (const src of srcs) {
      const file = path.join(out, src);
      const bare = stripJpeg(await readFile(file));
      if (!bare) throw new Error(`${src}: a JPEG whose metadata cannot be read, nothing moved`);
      if (!stripJpeg(bare)?.equals(bare)) throw new Error(`${src}: stripping its metadata does not settle, nothing moved`);
      await writeFile(file, bare);
    }

    const address = new Map();
    if (!dryRun) {
      let next = 0;
      const worker = async () => {
        while (next < srcs.length) {
          const src = srcs[next++];
          address.set(src, await putPicture(path.join(out, src), nameOf(src)));
        }
      };
      await Promise.all(Array.from({ length: Math.min(AT_ONCE, srcs.length) }, worker));
    }
    const where = (src) => address.get(src) ?? src;

    const held = new Map();
    for (const entry of lib.entries) {
      held.set(entry.no, {
        pictures: entry.pictures.map(({ src, w, h, caption }) => ({ src: where(src), w, h, caption })),
        thumb: entry.thumb ? { src: where(entry.thumb.src), w: entry.thumb.w, h: entry.thumb.h } : null,
      });
    }
    const text = (name) => readFile(path.join(root, 'library', 'content', name), 'utf8').catch((err) => (err.code === 'ENOENT' ? '' : Promise.reject(err)));
    const doc = docFromLibrary(lib, { root, chapterTitles, pictures: held, idea: await text('idea.md'), about: await text('about.md') });
    const faults = checkDoc(doc);
    if (faults.length) throw new Error(`the document is not sound, nothing moved: ${faults.join('; ')}`);
    if (!dryRun) await store.createDraft(doc, { replace });
    return { doc, rows: lib.entries.length, pictures: srcs.length, problems: lib.problems };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

function startedAsScript() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: { dev: { type: 'boolean' }, replace: { type: 'boolean' }, 'dry-run': { type: 'boolean' } } }));
  } catch (err) {
    console.error(`${err.message}\nusage: npm run move-in [-- --dev] [--replace] [--dry-run]`);
    return 1;
  }
  const root = path.dirname(LIBRARY);
  const dryRun = Boolean(values['dry-run']);
  let store = null;
  let putPicture;
  let db;
  if (values.dev) {
    putPicture = devPictures(path.join(LIBRARY, '.cache', 'dev-img'));
    if (!dryRun) {
      const { PGlite } = await import('@electric-sql/pglite');
      const { pgliteDb } = await import('../cloud/db.mjs');
      const { makeStore } = await import('../cloud/store.mjs');
      db = pgliteDb(new PGlite(path.join(LIBRARY, '.cache', 'dev-db')));
      store = makeStore(db);
    }
  } else {
    for (const name of ['PICTURES_READ_WRITE_TOKEN', 'DATABASE_URL']) {
      if (!process.env[name]) { console.error(`${name} is not set (library/.deploy/.env.local); nothing done`); return 1; }
    }
    putPicture = blobPictures(process.env.PICTURES_READ_WRITE_TOKEN);
    if (!dryRun) {
      const { neonDb } = await import('../cloud/db.mjs');
      const { makeStore } = await import('../cloud/store.mjs');
      db = neonDb(process.env.DATABASE_URL);
      store = makeStore(db);
    }
  }
  try {
    const { doc, rows, pictures, problems } = await moveIn({ root, store, putPicture, replace: Boolean(values.replace), dryRun });
    for (const { level, where, message } of problems) console.log(`${level.toUpperCase()} ${where}: ${message}`);
    const numbers = numbering(doc);
    console.log(`${rows} rows, ${doc.chapters.length} chapters, ${pictures} pictures ${dryRun ? 'would be uploaded (dry run, nothing written)' : 'uploaded'}`);
    for (const id of doc.chapters.flatMap((c) => c.rows).slice(0, 5)) console.log(`${numbers.get(id)} · ${id} · ${doc.rows[id].record.title}`);
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  } finally {
    await db?.end();
  }
}

if (startedAsScript()) process.exitCode = await main();
