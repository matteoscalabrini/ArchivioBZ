import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import { buildFixtures, cleanRoot } from './helpers.mjs';

const WEB = new URL('../web/', import.meta.url);

// The Map step alone, on the fixtures with three places in play: Ponte Druso inside with a row
// (5.01), Laives outside (7 km south), given row 5.02 here, and Piazza Walther inside with no row.
async function render(edit = () => {}) {
  const root = await cleanRoot();
  const lib = await loadLibrary(root);
  lib.places.laives = { name: 'Laives', lat: 46.4275, lon: 11.3377 };
  lib.entries.find((e) => e.no === '5.02').place = 'laives';
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
  return { html: written.get('map.html'), lib, copied, problems: lib.problems };
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
  assert.match(button, /\bdata-x="701\.\d" data-y="451\.\d" data-z="-?\d+(\.\d)?"/);
});

test('outside places are listed under #beyond', async () => {
  const { html } = await render();
  const beyond = section(html, 'beyond');
  assert.match(beyond, />Beyond this map</);
  assert.match(beyond, /<span class="name">Laives<\/span>/);
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
  const links = [...rows.matchAll(/<li data-no="([^"]*)" data-kw="([^"]*)"><a href="([^"]*)">([\s\S]*?)<\/a><\/li>/g)];
  assert.deepEqual(links.map((m) => [m[1], m[2], m[3]]), [['5.01', 'ponte-druso', 'index.html#o=5.01']]);
  const text = links[0][4].replace(/<[^>]+>/g, '');
  assert.equal(text, '5.01 · Two photographs of a bridge · Photograph');
  assert.match(rows, /<button type="button" class="close">Close<\/button>/);
});

test('the step places every located place before the Library step reads them', async () => {
  const { lib, copied } = await render();
  const druso = lib.places['ponte-druso'];
  assert.equal(druso.inside, true);
  assert.ok(Math.abs(druso.x - 701.9) < 0.1 && Math.abs(druso.y - 451.4) < 0.1, `${druso.x}, ${druso.y}`);
  assert.ok(Number.isFinite(druso.z) && druso.z > -15 && druso.z < 30, `ground height ${druso.z}`);
  assert.equal(lib.places.semirurali.inside, true, 'the wider field holds the Semirurali');
  assert.equal(lib.places.laives.inside, false);
  assert.equal(lib.places.laives.z, 0);
  assert.equal(lib.places.lager.inside, false, 'no coordinates: not on the map');
  assert.deepEqual(copied.map(([, rel]) => rel).sort(), ['map-data/dots.bin.gz', 'map-data/dots.json'], 'the height grid is read by the build, not by the page');
});

test('place ids and names are escaped in the markup', async () => {
  const { html } = await render((lib) => {
    lib.places["l'arco & co"] = { name: 'Arco <test>', lat: 46.4982, lon: 11.35481 };
    lib.entries.find((e) => e.no === '5.03').place = "l'arco & co";
  });
  const found = markers(html).map((m) => m[1]);
  assert.deepEqual(found, ['ponte-druso', 'l&#39;arco &amp; co']);
  assert.match(html, /<span class="name">Arco &lt;test&gt;<\/span>/);
  assert.match(html, /<li data-no="5\.03" data-kw="archives statistics"><a href="index\.html#o=5\.03">/);
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

test('nothing on the map page is loaded from elsewhere', async () => {
  const { html } = await render((lib) => {
    lib.entries.find((e) => e.no === '5.02').place = 'ponte-druso'; // a row with a source on the web, in the panel
  });
  const credit = /<p class="credit">([^<]*)<\/p>/.exec(html);
  assert.ok(credit, 'the OpenStreetMap credit is on the page');
  assert.match(credit[1], /© OpenStreetMap contributors/);
  assert.ok(credit[1].includes(OSM), 'the credit names where the licence is');
  assert.doesNotMatch(credit[0], /<a\b/, 'the credit is text, not a link');
  // A link the reader may follow to a source is allowed, as in the Library; nothing is fetched.
  assert.match(html, /<a href="https:\/\/example\.org\/az-1931" target="_blank" rel="noopener">Example archive<\/a>/);
  assert.doesNotMatch(html, /\s(?:src|data-src|srcset|action|poster)="\s*(?:https?:)?\/\//i, 'no picture, script or frame from another site');
  assert.doesNotMatch(html, /<link\b[^>]*href="\s*(?:https?:)?\/\//i, 'no stylesheet from another site');
  assert.doesNotMatch(html.replace(/<a\b[^>]*>/g, '').replace(credit[0], ''), /https?:\/\//, 'no other remote address');
  for (const name of (await readdir(WEB)).filter((n) => /^map.*\.(js|css)$/.test(n))) {
    assert.doesNotMatch(await readFile(new URL(name, WEB), 'utf8'), /https?:\/\/|@import|url\(/, name);
  }
});

test('a build of the fixtures writes map.html, the dot data and Three.js', async () => {
  const { out, run } = await buildFixtures();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  for (const file of ['map.html', 'map-data/dots.bin.gz', 'map-data/dots.json', 'img/t/5.01.jpg',
    'web/map.js', 'web/map.css', 'web/detail.css', 'web/pictures.js', 'web/vendor/three.module.js', 'web/vendor/three.core.js', 'web/vendor/addons/controls/OrbitControls.js']) {
    assert.ok((await stat(path.join(out, file))).size > 0, file);
  }
  const index = await readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(index, /<a href="map\.html#p=ponte-druso">Ponte Druso, on the map →<\/a>/);
});

// ------------------------------------------------------------------ the pictures and the rows in the panel

const pins = (html) => [...html.matchAll(/<button type="button" class="pin( blank)?" data-for="([^"]*)" data-no="([^"]*)" aria-label="([^"]*)" data-w="(\d+)">([\s\S]*?)<\/button>/g)]
  .map((m) => ({ blank: Boolean(m[1]), place: m[2], no: m[3], label: m[4], w: Number(m[5]), inner: m[6] }));

test('a row with a place stands on the map as its small picture, in a frame as wide as its shape asks', async () => {
  const shapes = { '5.01': { w: 220, h: 147 }, '5.02': { w: 80, h: 220 }, '5.03': { w: 220, h: 40 } };
  const { html } = await render((lib) => {
    for (const [no, { w, h }] of Object.entries(shapes)) {
      const entry = lib.entries.find((e) => e.no === no);
      entry.place = 'ponte-druso';
      entry.thumb = { src: `img/t/${no}.jpg`, w, h };
    }
  });
  const found = pins(html);
  assert.deepEqual(found.map((pin) => [pin.place, pin.no, pin.blank]), [['ponte-druso', '5.01', false], ['ponte-druso', '5.02', false], ['ponte-druso', '5.03', false]]);
  assert.deepEqual(found.map((pin) => pin.w), [90, 40, 90], '60 px high: 90 wide at most, 40 at least');
  assert.equal(found[0].label, '5.01 · Two photographs of a bridge');
  assert.equal(found[0].inner, '<img data-src="img/t/5.01.jpg" alt="" width="220" height="147">', 'no src until the picture first shows');
  assert.match(html, /<span class="n">3<\/span>/);
});

test('a row with a place and no picture gets a frame with its type word', async () => {
  const { html } = await render(); // the Map step alone: no small pictures were made
  const [pin] = pins(html);
  assert.deepEqual([pin.no, pin.blank, pin.w, pin.inner], ['5.01', true, 46, 'Photograph']);
  assert.equal(pins(html).length, 1, 'nothing for the place beyond the map');
});

test('the panel holds each row as the Library shows it open, without the Place line', async () => {
  const { html } = await render((lib) => {
    lib.entries.find((e) => e.no === '5.01').pictures = [{ src: 'img/5.01-1.jpg', w: 1600, h: 1067, caption: 'A caption.', original: '/source/x.jpg' }];
  });
  const article = /<article class="entry" data-no="5\.01" hidden>([\s\S]*?)<\/article>/.exec(section(html, 'panel'))?.[1];
  assert.ok(article, 'the row is in the panel, closed');
  assert.match(article, /^<p class="e-meta">5\.01 · Photograph · 1960s<\/p><h3 tabindex="-1">Two photographs of a bridge<\/h3><div class="detail">/);
  assert.match(article, /<img data-src="img\/5\.01-1\.jpg" alt="" width="1600" height="1067">/);
  assert.match(article, /<figcaption>A caption\.<\/figcaption>/);
  assert.match(article, /<p>A fixture photograph row with two pictures\.<\/p>/);
  assert.match(article, /<dt>Creator<\/dt><dd>Fixture maker<\/dd>/);
  assert.doesNotMatch(article, /<dt>Place<\/dt>/, 'the reader is at the place already');
  assert.match(article, /<a class="e-library" href="index\.html#o=5\.01">Open in the Library →<\/a>$/);
  assert.doesNotMatch(section(html, 'beyond'), /<article/, 'rows of places beyond the map stay links to the Library');
});

test('a link from a row in the panel to another row leads to the Library', async () => {
  const { html } = await render((lib) => {
    lib.entries.find((e) => e.no === '5.01').sources = ['5.02'];
  });
  assert.match(section(html, 'panel'), /<dt>Sources<\/dt><dd>1 row: <a href="index\.html#o=5\.02">5\.02<\/a><\/dd>/);
});

test('a place the dot data was made without is named in a warning, and still drawn', async () => {
  const { html, problems } = await render((lib) => {
    lib.entries.find((e) => e.no === '5.03').place = 'piazza-walther';
  });
  assert.deepEqual(markers(html).map((m) => m[1]), ['ponte-druso', 'piazza-walther']);
  const warning = problems.find((p) => p.where === 'library/map-data/dots.json');
  assert.equal(warning?.level, 'warn');
  assert.match(warning.message, /^made before Piazza Walther had rows: .*npm run map-data/);
  const clean = await render();
  assert.equal(clean.problems.find((p) => p.where === 'library/map-data/dots.json'), undefined, 'Ponte Druso was in the data');
});
