import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'fixtures');
const BUILD = path.join(HERE, '..', 'build.mjs');
const FIVE = path.join(ROOT, 'research_notes/Inv A/files/05_x');
const BAD = 'research_notes/Inv A/files/bad/entries.json';
const REFS = 'research_notes/Inv A/files/12_refs/entries.json';

const temps = [];
after(() => Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true }))));
async function tempDir(prefix) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

let loaded;
const load = () => (loaded ??= loadLibrary(ROOT));
const levelled = (problems, level) => problems.filter((p) => p.level === level);
const outsideBad = (entries) => entries.filter((e) => path.basename(e.dir) !== 'bad');

test('rows come back in number order', async () => {
  const { entries } = await load();
  assert.deepEqual(outsideBad(entries).map((e) => e.no), ['0.01', '5.00', '5.01', '5.02', '5.03', '12.01']);
});

test('each entry carries its section, folder and absolute paths', async () => {
  const { entries } = await load();
  const photo = entries.find((e) => e.no === '5.01');
  assert.equal(photo.section, 5);
  assert.equal(photo.dir, FIVE);
  assert.equal(photo.abs, path.join(FIVE, "Teßmann '60.jpg"));
  assert.deepEqual(photo.images.map((i) => i.abs), [path.join(FIVE, 'wide.jpg'), path.join(FIVE, 'small.png')]);
  const reference = entries.find((e) => e.no === '12.01');
  assert.equal(reference.section, 12);
  assert.equal(reference.abs, null);
  assert.deepEqual(reference.images, []);
});

test('a folded keyword resolves', async () => {
  const { entries, keywords, aliases } = await load();
  assert.deepEqual(entries.find((e) => e.no === '5.02').keywords, ['press', 'typeface']);
  assert.equal(aliases.fraktur, 'typeface');
  assert.equal(keywords.fraktur, undefined);
  assert.equal(keywords.typeface.label, 'Typeface');
});

test('every fault is reported with its file and row', async () => {
  const errors = levelled((await load()).problems, 'error');
  assert.equal(errors.length, 5, errors.map((e) => e.message).join('\n'));
  for (const error of errors) assert.equal(error.where, BAD);
  const expected = [['9.01', 'twice'], ['9.02', 'Painting'], ['9.03', 'missing.pdf'], ['9.04', 'nope'], ['9.05', '99.99']];
  for (const [no, word] of expected) {
    assert.ok(errors.some((e) => e.message.includes(no) && e.message.includes(word)), `no error names ${no} and ${word}`);
  }
});

test('proposed keywords and places pass with a warning', async () => {
  const { entries, keywords, places, problems } = await load();
  const reference = entries.find((e) => e.no === '12.01');
  assert.deepEqual(reference.keywords, ['humour', 'irony']);
  assert.equal(reference.place, 'piazza-erbe');
  assert.equal(keywords.irony.label, 'Irony');
  assert.equal(places['piazza-erbe'].name, 'Piazza Erbe');
  const warnings = levelled(problems, 'warn').filter((w) => w.where === REFS);
  assert.ok(warnings.some((w) => w.message.includes('irony') && w.message.includes('12.01')));
  assert.ok(warnings.some((w) => w.message.includes('piazza-erbe') && w.message.includes('12.01')));
  assert.equal(levelled(problems, 'error').filter((e) => e.where === REFS).length, 0);
});

test('an empty text is a warning, not an error', async () => {
  const { problems } = await load();
  assert.ok(levelled(problems, 'warn').some((w) => w.where === REFS && w.message.includes('12.01') && w.message.includes('text')));
  assert.ok(!levelled(problems, 'error').some((e) => e.message.includes('12.01')));
});

test('a place without coordinates is a warning', async () => {
  const { problems } = await load();
  const warning = levelled(problems, 'warn').find((w) => w.message.includes('lager'));
  assert.ok(warning);
  assert.equal(warning.where, 'library/content/places.json');
});

test('a root without any entries.json loads empty', async () => {
  const root = await tempDir('library-empty-');
  await mkdir(path.join(root, 'research_notes'));
  await cp(path.join(ROOT, 'library/content/keywords.json'), path.join(root, 'library/content/keywords.json'));
  const { entries, problems } = await loadLibrary(root);
  assert.deepEqual(entries, []);
  assert.deepEqual(levelled(problems, 'error'), []);
});

// The fixtures without the deliberately broken folder: a library that builds.
async function cleanRoot() {
  const root = await tempDir('library-root-');
  await cp(ROOT, root, { recursive: true, filter: (src) => path.basename(src) !== 'bad' });
  return root;
}
const build = (...args) => spawnSync(process.execPath, [BUILD, ...args], { encoding: 'utf8' });
const exists = (file) => access(file).then(() => true, () => false);

test('build refuses to empty a non-empty folder it did not create', async () => {
  const root = await cleanRoot();
  const out = await tempDir('library-out-');
  await writeFile(path.join(out, 'keep.txt'), 'keep');
  const run = build('--root', root, '--out', out);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /refus/i);
  assert.doesNotMatch(run.stdout, /^ERROR/m);
  assert.equal(await readFile(path.join(out, 'keep.txt'), 'utf8'), 'keep');
});

test('build marks its folder, copies web/, reports counts and rebuilds in place', async () => {
  const root = await cleanRoot();
  const out = path.join(await tempDir('library-out-'), 'dist');
  for (let pass = 1; pass <= 2; pass++) {
    const run = build('--root', root, '--out', out);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /\b6 rows\b/);
    assert.match(run.stdout, /\b1 without text\b/);
    assert.ok(await exists(path.join(out, '.library-dist')));
    assert.ok(await exists(path.join(out, 'web/base.css')));
  }
});

test('build stops on the broken folder and names its five errors', async () => {
  const out = path.join(await tempDir('library-out-'), 'dist');
  const run = build('--root', ROOT, '--out', out);
  assert.equal(run.status, 1);
  const errors = run.stdout.split('\n').filter((line) => line.startsWith('ERROR '));
  assert.equal(errors.length, 5);
  for (const line of errors) assert.ok(line.startsWith(`ERROR ${BAD}: row 9.0`), line);
  assert.equal(await exists(out), false);
});

test('build --check reports without writing', async () => {
  const root = await cleanRoot();
  const out = path.join(await tempDir('library-out-'), 'dist');
  const run = build('--check', '--root', root, '--out', out);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^WARN research_notes\/Inv A\/files\/12_refs\/entries\.json: row 12\.01: empty text$/m);
  assert.equal(await exists(out), false);
});

test('sourceUrl encodes each segment', () => {
  assert.equal(
    sourceUrl(ROOT, ROOT + "/research_notes/Inv A/files/05_x/Teßmann '60.jpg"),
    "/source/research_notes/Inv%20A/files/05_x/Te%C3%9Fmann%20'60.jpg",
  );
});
