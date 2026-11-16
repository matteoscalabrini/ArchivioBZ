// Which places have rows, where each place lies on the map, and the OpenStreetMap object a place's
// record names. Shared by the build steps and by what makes the map data (library/mapgen/), so
// that all mean the same places.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { heightAt, locate } from './geo.mjs';

// The dot data belongs to the site's code, so it is found beside this folder, not under a root.
const MAP_DATA = fileURLToPath(new URL('../map-data/', import.meta.url));
const located = new WeakMap(); // a library's places -> the dot data's description, once they are located

// Sets on every place: inside, x, y (metres east and north of the map's origin) and z (ground
// height; 0 outside the dot field). A place without coordinates is not inside and has x, y, z
// null. Returns what dots.json says of the dot data. A second call does nothing more.
export async function locatePlaces(lib) {
  if (located.has(lib.places)) return located.get(lib.places);
  const meta = JSON.parse(await readFile(path.join(MAP_DATA, 'dots.json'), 'utf8'));
  const grid = new Int16Array(new Uint8Array(gunzipSync(await readFile(path.join(MAP_DATA, 'height.bin.gz')))).buffer);
  for (const place of Object.values(lib.places)) {
    const { x, y, inside } = locate(place, meta);
    Object.assign(place, x === null
      ? { inside, x: null, y: null, z: null }
      : { inside, x: tenth(x), y: tenth(y), z: inside ? tenth(heightAt(meta.height, grid, x, y)) : 0 });
  }
  located.set(lib.places, meta);
  return meta;
}

const tenth = (value) => Math.round(value * 10) / 10;

// The ids of the places that at least one row names, in the order of places.json.
export function placesWithRows(lib) {
  const named = new Set(lib.entries.map((entry) => entry.place).filter(Boolean));
  return Object.keys(lib.places).filter((id) => named.has(id));
}

// 'way/123' -> {kind: 'way', id: 123}; anything else (absent, an address, a typo) -> null.
export function osmRef(value) {
  const match = /^(node|way|relation)\/(\d+)$/.exec(String(value ?? '').trim());
  return match ? { kind: match[1], id: Number(match[2]) } : null;
}
