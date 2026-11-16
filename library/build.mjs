// node library/build.mjs [--check] [--present] [--web] [--root DIR] [--out DIR]
//
// Loads and checks every record and prints each problem. Any error stops the build. Otherwise,
// unless --check, empties `out` (only a folder this build made, marked by .library-dist), copies
// library/web/ into it, runs each library/steps/*.mjs in name order and prints the counts.
// A step is `export default async function (ctx)`; see `ctx` below.
//
// --web builds the site that goes online (npm run deploy): the originals under /source/ are not
// there, so ctx.sourceUrl gives null and nothing links to them; the reads' pictures are copied in.
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { cp, copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadLibrary, sourceUrl } from './lib/records.mjs';

const LIBRARY = path.dirname(fileURLToPath(import.meta.url));
const MARKER = '.library-dist';

export async function build({ root = path.dirname(LIBRARY), out, check = false, present = false, web = false } = {}) {
  root = path.resolve(root);
  out = path.resolve(out ?? path.join(root, 'library', 'dist'));

  const lib = await loadLibrary(root);
  const { problems } = lib;
  print(problems);
  const errors = count(problems, 'error');
  if (errors) {
    console.error(`${plural(errors, 'error')}${check ? '' : ', nothing built'}`);
    return 1;
  }
  if (check) {
    console.log(`${plural(lib.entries.length, 'row')}, ${plural(count(problems, 'warn'), 'warning')}, no errors`);
    return 0;
  }

  if (!(await emptyOut(out))) return 1;
  await cp(path.join(LIBRARY, 'web'), path.join(out, 'web'), { recursive: true, filter: (src) => !path.basename(src).startsWith('.') });

  const ctx = {
    root,
    out,
    lib,
    options: { check, present, web },
    problems,
    async write(relPath, content) {
      const file = inside(out, relPath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    },
    async copyFile(absSrc, relPath) {
      const file = inside(out, relPath);
      await mkdir(path.dirname(file), { recursive: true });
      await copyFile(absSrc, file);
    },
    sourceUrl: (absPath) => (web ? null : sourceUrl(root, absPath)),
  };

  const before = problems.length;
  for (const step of await listSteps()) {
    const { default: run } = await import(pathToFileURL(step).href);
    await run(ctx);
  }
  const fromSteps = problems.slice(before);
  print(fromSteps);

  const rows = lib.entries;
  const withoutText = rows.filter((e) => !e.text.some((p) => String(p).trim())).length;
  const withoutPicture = rows.filter((e) => !e.pictures?.length).length;
  console.log(`${plural(rows.length, 'row')}, ${withoutText} without text, ${withoutPicture} without picture`);

  const stepErrors = count(fromSteps, 'error');
  if (stepErrors) {
    console.error(`${plural(stepErrors, 'error')} from the build steps`);
    return 1;
  }
  return 0;
}

// Empties `out` only when it is absent, empty, or carries the marker this build writes.
async function emptyOut(out) {
  let names = [];
  try {
    names = await readdir(out);
  } catch (err) {
    if (err.code === 'ENOTDIR') {
      console.error(`refusing to build into ${out}: it is a file`);
      return false;
    }
    if (err.code !== 'ENOENT') throw err;
  }
  if (names.length && !names.includes(MARKER)) {
    console.error(`refusing to empty ${out}: it is not empty and has no ${MARKER}, so this build did not make it`);
    return false;
  }
  await Promise.all(names.map((name) => rm(path.join(out, name), { recursive: true, force: true })));
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, MARKER), 'Made by library/build.mjs, which empties this folder on every build.\n');
  return true;
}

async function listSteps() {
  const dir = path.join(LIBRARY, 'steps');
  let names;
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return names.filter((name) => name.endsWith('.mjs')).sort().map((name) => path.join(dir, name));
}

function inside(out, relPath) {
  const file = path.resolve(out, relPath);
  if (!file.startsWith(out + path.sep)) throw new Error(`a build step tried to write outside ${out}: ${relPath}`);
  return file;
}

function print(problems) {
  for (const { level, where, message } of problems) console.log(`${level.toUpperCase()} ${where}: ${message}`);
}

const count = (problems, level) => problems.filter((p) => p.level === level).length;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Started as a script rather than imported: the file Node was asked to run is this one, by any
// path or link to it. (import.meta.main says the same, but only from Node 24.2.)
function startedAsScript() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (startedAsScript()) {
  let values;
  try {
    ({ values } = parseArgs({
      options: { check: { type: 'boolean' }, present: { type: 'boolean' }, web: { type: 'boolean' }, root: { type: 'string' }, out: { type: 'string' } },
    }));
  } catch (err) {
    console.error(`${err.message}\nusage: node library/build.mjs [--check] [--present] [--web] [--root DIR] [--out DIR]`);
    process.exit(1);
  }
  process.exitCode = await build(values);
}
