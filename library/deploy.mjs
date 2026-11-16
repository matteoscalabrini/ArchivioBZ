// node library/deploy.mjs [--preview]      (npm run deploy)
//
// Puts the library online at https://archiviobz.vercel.app. Builds the web version (build.mjs
// --web --present: no links to the originals, which stay on this disk, and no stand-in idea) into
// library/.deploy/.vercel/output/static, the Build Output API's folder for static files, then
// uploads that folder as it is with `vercel deploy --prebuilt`: Vercel builds nothing, because
// the build needs the downloads, which are only here. library/dist, the local site, is untouched.
//
// Needs the Vercel CLI (npm i -g vercel), logged in, and library/.deploy linked to the project
// once: vercel link --cwd library/.deploy --project archiviobz
// --preview uploads to a preview address instead of the public one.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const LIBRARY = path.dirname(fileURLToPath(import.meta.url));
const DEPLOY = path.join(LIBRARY, '.deploy');
const OUTPUT = path.join(DEPLOY, '.vercel', 'output');
const preview = process.argv.includes('--preview');

if (!existsSync(path.join(DEPLOY, '.vercel', 'project.json'))) {
  console.error('library/.deploy is not linked to a Vercel project. Once: vercel link --cwd library/.deploy --project archiviobz');
  process.exit(1);
}
if (await build({ out: path.join(OUTPUT, 'static'), web: true, present: true })) process.exit(1);
await mkdir(OUTPUT, { recursive: true });
await writeFile(path.join(OUTPUT, 'config.json'), `${JSON.stringify({ version: 3 }, null, 2)}\n`);

const args = ['deploy', '--prebuilt', '--cwd', DEPLOY, ...(preview ? [] : ['--prod'])];
console.log(`vercel ${args.join(' ')}`);
const run = spawnSync('vercel', args, { stdio: 'inherit' });
if (run.error) console.error(run.error.code === 'ENOENT' ? 'no vercel command: npm i -g vercel' : run.error.message);
process.exit(run.status ?? 1);
