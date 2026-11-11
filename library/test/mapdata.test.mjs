// The dot data in library/map-data/, as library/mapgen/ made it: what the Map page and the build
// rely on, checked without the network or Python.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { osmRef, placesWithRows } from '../lib/places.mjs';

const read = (name) => readFile(new URL(`../map-data/${name}`, import.meta.url));
const meta = JSON.parse(await read('dots.json'));
const dots = await read('dots.bin.gz');
const height = await read('height.bin.gz');
const area = JSON.parse(await readFile(new URL('../mapgen/area.json', import.meta.url), 'utf8'));

test('the field is the rectangle of area.json, around its own origin', () => {
  const [x0, y0, x1, y1] = area.bbox;
  assert.deepEqual(area.bbox, [677300, 5149300, 681700, 5153200], '4.4 x 3.9 km');
  assert.deepEqual([meta.origin.e, meta.origin.n], [(x0 + x1) / 2, (y0 + y1) / 2]);
  assert.deepEqual(meta.extent.e, [x0 - meta.origin.e, x1 - meta.origin.e]);
  assert.deepEqual(meta.extent.n, [y0 - meta.origin.n, y1 - meta.origin.n]);
});

test('the layers fill the dot file end to end, the four fine ones among them', () => {
  let offset = 0;
  for (const layer of meta.layers) {
    assert.equal(layer.offset, offset, layer.name);
    offset += layer.count;
  }
  assert.equal(offset, meta.count);
  for (const name of ['focus_ground', 'focus_roofs', 'focus_walls', 'focus_bridges']) {
    assert.ok(meta.layers.find((layer) => layer.name === name)?.count > 0, name);
  }
  assert.equal(gunzipSync(dots).length, meta.count * 7, 'three Int16 and a shade per dot');
  assert.ok(meta.count <= 8_200_000, `${meta.count} dots: no more than the map that was tried and approved, with 5% to spare`);
});

test('the height grid covers the field at the step it states', () => {
  const { step, cols, rows, e0, n0 } = meta.height;
  assert.equal(step, 2);
  assert.deepEqual([e0, n0], [meta.extent.e[0], meta.extent.n[0]]);
  assert.ok(e0 + (cols - 1) * step >= meta.extent.e[1] && n0 + (rows - 1) * step >= meta.extent.n[1]);
  assert.equal(gunzipSync(height).length, cols * rows * 2);
});

test('the data says which places it was made for and how close their dots stand', () => {
  assert.ok(meta.focus.places.includes('monumento-vittoria') && meta.focus.places.includes('zona-industriale'));
  assert.deepEqual([meta.focus.roofs, meta.focus.walls, meta.focus.ground, meta.focus.bridges], [0.5, [0.5, 0.7], 1, [0.45, 0.65]]);
});

test('placesWithRows lists the places some row names, in the order of the records', () => {
  const lib = { places: { a: {}, b: {}, c: {} }, entries: [{ place: 'c' }, { place: 'a' }, { place: 'gone' }, {}] };
  assert.deepEqual(placesWithRows(lib), ['a', 'c']);
});

test('osmRef reads kind/number and nothing else', () => {
  assert.deepEqual(osmRef('way/1005176285'), { kind: 'way', id: 1005176285 });
  assert.deepEqual(osmRef(' relation/4003691 '), { kind: 'relation', id: 4003691 });
  assert.deepEqual(osmRef('node/2749562298'), { kind: 'node', id: 2749562298 });
  for (const other of [undefined, null, '', 'https://www.openstreetmap.org/', 'way/', 'way/12a', 'area/3']) assert.equal(osmRef(other), null);
});
