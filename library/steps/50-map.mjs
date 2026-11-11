// The Map page, out/map.html: the dot field (drawn by web/map.js from out/map-data/); for every
// place on it that has rows, its name and one small picture per row; a panel with each place's
// rows and each row as the Library shows it open; the places beyond the field listed. Runs before
// the Library step, which reads place.inside.
//
// Sets on every place: inside, x, y (metres east and north of the map's origin) and z (ground
// height; 0 outside the dot field). A place without coordinates is not inside and has x, y, z null.
// The dot data belongs to the site's code, so it is found beside this file, not under ctx.root.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { heightAt, locate } from '../lib/geo.mjs';
import { esc, page } from '../lib/shell.mjs';
import { placesWithRows } from '../lib/places.mjs';
import { encodePath, rowDetail } from '../lib/detail.mjs';

const MAP_DATA = fileURLToPath(new URL('../map-data/', import.meta.url));
const FILES = ['dots.json', 'dots.bin.gz']; // what the page draws from; the height grid is read here only
// A small picture on the map is 60 px high and as wide as its shape asks, between 40 and 90 px;
// the frame of a row without a picture is 46 px wide (web/map.js lays them out).
const PICTURE = { height: 60, min: 40, max: 90, blank: 46 };
const IMPORT_MAP = { imports: { three: './web/vendor/three.module.js', 'three/addons/': './web/vendor/addons/' } };

export default async function map(ctx) {
  const meta = JSON.parse(await readFile(path.join(MAP_DATA, 'dots.json'), 'utf8'));
  const grid = new Int16Array(new Uint8Array(gunzipSync(await readFile(path.join(MAP_DATA, 'height.bin.gz')))).buffer);
  const { places, entries, keywords } = ctx.lib;

  for (const place of Object.values(places)) {
    const { x, y, inside } = locate(place, meta);
    Object.assign(place, x === null
      ? { inside, x: null, y: null, z: null }
      : { inside, x: tenth(x), y: tenth(y), z: inside ? tenth(heightAt(meta.height, grid, x, y)) : 0 });
  }

  const rowsAt = new Map();
  for (const entry of entries) {
    if (!entry.place || !Object.hasOwn(places, entry.place)) continue;
    if (!rowsAt.has(entry.place)) rowsAt.set(entry.place, []);
    rowsAt.get(entry.place).push(entry);
  }
  const withRows = placesWithRows(ctx.lib).filter((id) => rowsAt.has(id));
  const drawn = withRows.filter((id) => places[id].inside);
  const beyond = withRows.filter((id) => !places[id].inside);

  // The buildings of a place are drawn at full resolution only if the dot data was made when the
  // place already had rows (dots.json lists the places it was made for).
  const late = meta.focus ? drawn.filter((id) => !meta.focus.places.includes(id)) : [];
  if (late.length) {
    ctx.problems.push({ level: 'warn', where: 'library/map-data/dots.json',
      message: `made before ${late.map((id) => places[id].name ?? id).join(', ')} had rows: drawn like the rest of the city until "npm run map-data" is run again` });
  }

  const body = [
    '<div class="map" id="map">',
    '<canvas class="scene" id="scene" tabindex="0" aria-label="Map"></canvas>',
    `<div class="labels" id="labels">${drawn.map((id) => marker(id, places[id], rowsAt.get(id).length)
      + rowsAt.get(id).map((entry) => picture(id, entry)).join('')).join('')}</div>`,
    '<p class="filter" id="filter" hidden><span class="what"></span> <button type="button" class="show-all">Show all places</button></p>',
    '<aside class="panel" id="panel" hidden>',
    '<button type="button" class="close">Close</button>',
    ...drawn.map((id, n) => `<section class="rows-of" data-for="${esc(id)}" aria-labelledby="place-${n + 1}" hidden>`
      + `<h2 id="place-${n + 1}" tabindex="-1">${esc(places[id].name)}</h2>${rowList(rowsAt.get(id))}`
      + `${rowsAt.get(id).map((entry) => article(entry, ctx, places)).join('')}</section>`),
    '</aside>',
    `<section class="beyond" id="beyond" aria-labelledby="beyond-head"${beyond.length ? '' : ' hidden'}>`,
    '<h2 class="lab" id="beyond-head">Beyond this map</h2>',
    `<ul>${beyond.map((id, n) => `<li data-beyond="${esc(id)}">`
      + `<button type="button" aria-expanded="false" aria-controls="beyond-${n + 1}">${nameAndCount(places[id].name, rowsAt.get(id).length)}</button>`
      + rowList(rowsAt.get(id), ` id="beyond-${n + 1}" hidden`) + '</li>').join('')}</ul>`,
    '</section>',
    `<p class="credit">${esc(credit(meta))}</p>`,
    '</div>',
    `<script type="application/json" id="keyword-labels">${json(Object.fromEntries(Object.entries(keywords).map(([id, k]) => [id, k.label ?? id])))}</script>`,
  ].join('\n');

  const head = `<script type="importmap">${json(IMPORT_MAP)}</script>\n<script type="module" src="web/map.js"></script>`;
  await ctx.write('map.html', page({ title: 'Map', tab: 'map', body, css: ['web/detail.css', 'web/map.css'], head }));
  for (const file of FILES) await ctx.copyFile(path.join(MAP_DATA, file), `map-data/${file}`);
}

// The name and count of a place, a button that web/map.js stands on the point (x, y, z).
function marker(id, place, count) {
  const at = ['x', 'y', 'z'].map((axis) => ` data-${axis}="${place[axis].toFixed(1)}"`).join('');
  return `<button type="button" class="place" data-place="${esc(id)}"${at} aria-controls="panel" aria-expanded="false">`
    + `${nameAndCount(place.name, count)}</button>`;
}

// A row's small picture on the map, a button; without a picture, its type word in the same frame.
// data-w: the width of the picture in px. No `src` until web/map.js first shows it.
function picture(id, entry) {
  const attrs = `data-for="${esc(id)}" data-no="${esc(entry.no)}" aria-label="${esc(`${entry.no} · ${entry.title}`)}"`;
  const thumb = entry.thumb;
  if (!thumb?.src || !(thumb.w > 0) || !(thumb.h > 0)) {
    return `<button type="button" class="pin blank" ${attrs} data-w="${PICTURE.blank}">${esc(entry.type)}</button>`;
  }
  const w = Math.max(PICTURE.min, Math.min(PICTURE.max, Math.round((PICTURE.height * thumb.w) / thumb.h)));
  return `<button type="button" class="pin" ${attrs} data-w="${w}">`
    + `<img data-src="${esc(encodePath(thumb.src))}" alt="" width="${thumb.w}" height="${thumb.h}"></button>`;
}

// A row as the panel shows it: number · type · date, the title, what the Library shows in the
// open row, and the way to that row in the Library.
function article(entry, ctx, places) {
  const facts = [entry.no, entry.type, entry.date].filter(Boolean).map(esc).join(' · ');
  return `<article class="entry" data-no="${esc(entry.no)}" hidden><p class="e-meta">${facts}</p>`
    + `<h3 tabindex="-1">${esc(entry.title)}</h3>${rowDetail(entry, { ctx, places, onMap: true })}`
    + `<a class="e-library" href="index.html#o=${esc(encodeURIComponent(entry.no))}">Open in the Library →</a></article>`;
}

const nameAndCount = (name, count) => `<span class="name">${esc(name)}</span> <span class="n">${count}</span>`;

// No. · Title · Type, each a link to its row, open, in the Library.
function rowList(rows, attrs = '') {
  return `<ol class="rows"${attrs}>${rows.map((entry) => `<li data-no="${esc(entry.no)}" data-kw="${esc(entry.keywords.join(' '))}">`
    + `<a href="index.html#o=${esc(encodeURIComponent(entry.no))}">`
    + `<span class="no">${esc(entry.no)}</span><span class="sep"> · </span>`
    + `<span class="title">${esc(entry.title)}</span><span class="sep"> · </span>`
    + `<span class="type">${esc(entry.type)}</span></a></li>`).join('')}</ol>`;
}

// The OpenStreetMap line of the dot data's sources, with the address of the licence as text.
function credit(meta) {
  const osm = (meta.sources ?? []).find((s) => /OpenStreetMap/.test(s.text ?? ''));
  return osm ? [osm.text, osm.url].filter(Boolean).join(', ') : '';
}

const tenth = (value) => Math.round(value * 10) / 10;
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
