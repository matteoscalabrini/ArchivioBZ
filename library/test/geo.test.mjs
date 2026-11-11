import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { heightAt, locate, toUtm32 } from '../lib/geo.mjs';

const meta = JSON.parse(await readFile(new URL('../map-data/dots.json', import.meta.url), 'utf8'));
const near = (actual, expected, within, what) =>
  assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual} is not within ${within} of ${expected}`);

test('a point converts to its coordinates on the map\'s grid, and the map\'s own origin to itself', () => {
  const { e, n } = toUtm32(46.497287, 11.349983);
  near(e, 680325, 1, 'east');
  near(n, 5151985, 1, 'north');
  const origin = toUtm32(meta.origin.lat, meta.origin.lon);
  near(origin.e, meta.origin.e, 1, 'origin east');
  near(origin.n, meta.origin.n, 1, 'origin north');
});

test('Ponte Druso lands where the dot data labels it', () => {
  const at = locate({ lat: 46.49477, lon: 11.34827 }, meta);
  const bridge = meta.labels.find((l) => l.name.startsWith('Ponte Druso'));
  near(at.x, bridge.e, 15, 'x');
  near(at.y, bridge.n, 15, 'y');
  assert.equal(at.inside, true);

  // The library's own coordinates (places.json, OpenStreetMap) for the two labelled bridges it names.
  const label = (name) => meta.labels.find((l) => l.name.startsWith(name));
  for (const [name, lat, lon] of [['Ponte Druso', 46.4948, 11.34817], ['Ponte Talvera', 46.50023, 11.34701]]) {
    const { x, y } = locate({ lat, lon }, meta);
    assert.ok(Math.hypot(x - label(name).e, y - label(name).n) < 5, `${name} is ${Math.hypot(x - label(name).e, y - label(name).n).toFixed(1)} m from its label`);
  }
});

test('the Semirurali are on the field, Laives is south of it', () => {
  assert.equal(locate({ lat: 46.4870, lon: 11.3250 }, meta).inside, true);
  const laives = locate({ lat: 46.4275, lon: 11.3377 }, meta);
  assert.equal(laives.inside, false);
  assert.ok(laives.y < meta.extent.n[0], 'south of the dot field');
});

test('a place without coordinates is neither inside nor located', () => {
  for (const place of [{ lat: null, lon: null }, { lat: 46.5 }, {}, { lat: '46.5', lon: '11.3' }]) {
    assert.deepEqual(locate(place, meta), { x: null, y: null, inside: false });
  }
});

test('ground height is read between the four nearest grid points', () => {
  const grid = { step: 1, cols: 2, rows: 2, e0: 0, n0: 0, unit: 0.1 };
  const data = Int16Array.from([0, 100, 200, 300]); // row 0: 0, 10 m; row 1: 20, 30 m
  near(heightAt(grid, data, 0, 0), 0, 1e-9, 'corner');
  near(heightAt(grid, data, 0.5, 0.5), 15, 1e-9, 'middle');
  near(heightAt(grid, data, 1, 0), 10, 0.01, 'east corner');
  near(heightAt(grid, data, -50, -50), 0, 1e-9, 'held to the edge');
});
