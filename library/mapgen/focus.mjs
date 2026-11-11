// node library/mapgen/focus.mjs [--root DIR]
//
// Writes library/.cache/map-raw/focus.json: every place that has rows and coordinates, with the
// OpenStreetMap object its record names. fetch.py asks for those objects and build.py draws the
// buildings on them at full resolution. The list comes from the site's own loader, so "a place
// with rows" means here what it means on the site.
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadLibrary } from '../lib/records.mjs';
import { osmRef, placesWithRows } from '../lib/places.mjs';

const LIBRARY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { values } = parseArgs({ options: { root: { type: 'string' } } });
const root = path.resolve(values.root ?? path.dirname(LIBRARY));
const lib = await loadLibrary(root);

const focus = {};
for (const id of placesWithRows(lib)) {
  const { name, lat, lon, osm } = lib.places[id];
  if (Number.isFinite(lat) && Number.isFinite(lon)) focus[id] = { name: name ?? id, lat, lon, osm: osmRef(osm) };
}
const file = path.join(root, 'library', '.cache', 'map-raw', 'focus.json');
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, `${JSON.stringify(focus, null, 1)}\n`);
console.log(`${Object.keys(focus).length} places with rows: ${Object.keys(focus).join(', ')}`);
