// Shared by the test files: temporary folders removed after the file's tests, and the fixtures
// copied without their deliberately broken folder, so that a build of them runs.
import { after } from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtemp, cp, rm } from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(HERE, 'fixtures');
export const BUILD = path.join(HERE, '..', 'build.mjs');

const temps = [];
after(() => Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true }))));

export async function tempDir(prefix) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

// The fixtures without the deliberately broken folder `bad/`: a library that builds.
export async function cleanRoot() {
  const root = await tempDir('library-root-');
  await cp(FIXTURES, root, { recursive: true, filter: (src) => path.basename(src) !== 'bad' });
  return root;
}

// Runs build.mjs on a clean copy of the fixtures; `run` is the finished process.
export async function buildFixtures(...args) {
  const root = await cleanRoot();
  const out = path.join(await tempDir('library-out-'), 'dist');
  const run = spawnSync(process.execPath, [BUILD, '--root', root, '--out', out, ...args], { encoding: 'utf8' });
  return { root, out, run };
}
