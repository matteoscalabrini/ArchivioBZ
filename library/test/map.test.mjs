import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import { buildFixtures, cleanRoot } from './helpers.mjs';

const WEB = new URL('../web/', import.meta.url);

// The Map step alone, on the fixtures with three places in play: Ponte Druso inside with a row
// (5.01), the Semirurali outside, given row 5.02 here, and Piazza Walther inside with no row.
async function render(edit = () => {}) {
  const root = await cleanRoot();
  const lib = await loadLibrary(root);
  lib.entries.find((e) => e.no === '5.02').place = 'semirurali';
  lib.places['piazza-walther'] = { name: 'Piazza Walther', lat: 46.4982, lon: 11.35481 };
  edit(lib);
  const written = new Map();
  const copied = [];
  const ctx = {
    root,
    out: path.join(root, 'dist'),
    lib,
    options: { check: false, present: false },
    problems: lib.problems,
    write: async (relPath, content) => void written.set(relPath, String(content)),
    copyFile: async (abs, relPath) => void copied.push([abs, relPath]),
    sourceUrl: (abs) => sourceUrl(root, abs),
  };
  const { default: step } = await import('../steps/50-map.mjs');
  await step(ctx);
  return { html: written.get('map.html'), lib, copied };
}

const markers = (html) => [...html.matchAll(/<button\b[^>]*\bdata-place="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)];
const section = (html, id) => {
  const open = new RegExp(`<(section|aside)\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
  assert.ok(open, `no #${id}`);
  const close = html.indexOf(`</${open[1]}>`, open.index);
  return html.slice(open.index, close);
};
const OSM = 'https://www.openstreetmap.org/copyright';

test('one [data-place] per inside place that has rows', async () => {
  const { html } = await render();
  const found = markers(html);
  assert.deepEqual(found.map((m) => m[1]), ['ponte-druso']);
  const [button, , inner] = found[0];
  assert.match(inner, /<span class="name">Ponte Druso<\/span>/);
  assert.match(inner, /<span class="n">1<\/span>/);
  assert.match(button, /\bdata-x="-123\.\d" data-y="-283\.\d" data-z="-?\d+(\.\d)?"/);
});

test('outside places are listed under #beyond', async () => {
  const { html } = await render();
  const beyond = section(html, 'beyond');
  assert.match(beyond, />Beyond this map</);
  assert.match(beyond, /<span class="name">Semirurali<\/span>/);
  assert.match(beyond, /href="index\.html#o=5\.02"/);
  assert.doesNotMatch(beyond, /Ponte Druso/);
  assert.doesNotMatch(beyond, /data-place=/, 'nothing beyond the map is drawn on it');
});

test('a place without rows is not drawn', async () => {
  const { html, lib } = await render();
  assert.equal(lib.places['piazza-walther'].inside, true, 'it is inside the dot field');
  assert.doesNotMatch(html, /Piazza Walther|piazza-walther/);
  assert.doesNotMatch(html, /Lager|lager/, 'a place with neither rows nor coordinates is nowhere');
});

test('a place\'s rows read No. · Title · Type and link back to their open row', async () => {
  const { html } = await render();
  const rows = section(html, 'panel');
  assert.match(rows, /<h2[^>]*>Ponte Druso<\/h2>/);
  const links = [...rows.matchAll(/<li data-kw="([^"]*)"><a href="([^"]*)">([\s\S]*?)<\/a><\/li>/g)];
  assert.deepEqual(links.map((m) => [m[1], m[2]]), [['ponte-druso', 'index.html#o=5.01']]);
  const text = links[0][3].replace(/<[^>]+>/g, '');
  assert.equal(text, '5.01 · Two photographs of a bridge · Photograph');
  assert.match(rows, /<button type="button" class="close">Close<\/button>/);
});

test('the step places every located place before the Library step reads them', async () => {
  const { lib, copied } = await render();
  const druso = lib.places['ponte-druso'];
  assert.equal(druso.inside, true);
  assert.ok(Math.abs(druso.x + 123.1) < 0.1 && Math.abs(druso.y + 283.6) < 0.1, `${druso.x}, ${druso.y}`);
  assert.ok(Number.isFinite(druso.z) && druso.z > -15 && druso.z < 30, `ground height ${druso.z}`);
  assert.equal(lib.places.semirurali.inside, false);
  assert.equal(lib.places.semirurali.z, 0);
  assert.equal(lib.places.lager.inside, false, 'no coordinates: not on the map');
  assert.deepEqual(copied.map(([, rel]) => rel).sort(), ['map-data/dots.bin.gz', 'map-data/dots.json', 'map-data/height.bin.gz']);
});

test('place ids and names are escaped in the markup', async () => {
  const { html } = await render((lib) => {
    lib.places["l'arco & co"] = { name: 'Arco <test>', lat: 46.4982, lon: 11.35481 };
    lib.entries.find((e) => e.no === '5.03').place = "l'arco & co";
  });
  const found = markers(html).map((m) => m[1]);
  assert.deepEqual(found, ['ponte-druso', 'l&#39;arco &amp; co']);
  assert.match(html, /<span class="name">Arco &lt;test&gt;<\/span>/);
  assert.match(html, /<li data-kw="archives statistics"><a href="index\.html#o=5\.03">/);
});

test('the page loads Three.js through an import map set before the module, from this site only', async () => {
  const { html } = await render();
  const importMap = html.indexOf('<script type="importmap">');
  const module = html.indexOf('<script type="module" src="web/map.js">');
  assert.ok(importMap !== -1 && module !== -1, 'import map and module script present');
  assert.ok(importMap < module, 'the import map comes first');
  const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.deepEqual(map, { imports: { three: './web/vendor/three.module.js', 'three/addons/': './web/vendor/addons/' } });
  assert.match(html, /<link rel="stylesheet" href="web\/map\.css">/);
  assert.match(html, /<a href="map\.html" aria-current="page">Map<\/a>/);
});

test('no remote address appears in map.html or map.js', async () => {
  const { html } = await render();
  const credit = /<p class="credit">([^<]*)<\/p>/.exec(html);
  assert.ok(credit, 'the OpenStreetMap credit is on the page');
  assert.match(credit[1], /© OpenStreetMap contributors/);
  assert.ok(credit[1].includes(OSM), 'the credit names where the licence is');
  assert.doesNotMatch(html.replace(credit[0], ''), /https?:\/\//);
  assert.doesNotMatch(html, /<a\b[^>]*href="https?:/, 'the credit is text, not a link');
  for (const name of (await readdir(WEB)).filter((n) => /^map.*\.(js|css)$/.test(n))) {
    assert.doesNotMatch(await readFile(new URL(name, WEB), 'utf8'), /https?:\/\/|@import|url\(/, name);
  }
});

test('a build of the fixtures writes map.html, the dot data and Three.js', async () => {
  const { out, run } = await buildFixtures();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  for (const file of ['map.html', 'map-data/dots.bin.gz', 'map-data/dots.json', 'map-data/height.bin.gz',
    'web/map.js', 'web/map.css', 'web/vendor/three.module.js', 'web/vendor/three.core.js', 'web/vendor/addons/controls/OrbitControls.js']) {
    assert.ok((await stat(path.join(out, file))).size > 0, file);
  }
  const index = await readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(index, /<a href="map\.html#p=ponte-druso">Ponte Druso, on the map →<\/a>/);
});
