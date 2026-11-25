// node library/cloud/assemble.mjs      (vercel.json's buildCommand)
//
// The static part of the deployment, in library/.public/ (vercel.json's outputDirectory): the
// pages' scripts and styles as web/, and the map's dot data as map-data/. Everything else the site
// shows is answered by the functions in api/ from the database, so the build reads no record and
// needs none of the downloads.
import path from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const LIBRARY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(LIBRARY, '.public');
const MAP_DATA = ['dots.json', 'dots.bin.gz'];

await rm(OUT, { recursive: true, force: true });
await cp(path.join(LIBRARY, 'web'), path.join(OUT, 'web'), { recursive: true });
await mkdir(path.join(OUT, 'map-data'));
for (const name of MAP_DATA) await cp(path.join(LIBRARY, 'map-data', name), path.join(OUT, 'map-data', name));
console.log(`${path.relative(process.cwd(), OUT) || OUT}: web/, map-data/${MAP_DATA.join(', map-data/')}`);
