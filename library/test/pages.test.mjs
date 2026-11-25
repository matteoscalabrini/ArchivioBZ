import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import { readKinds } from '../lib/kinds.mjs';
import { locatePlaces } from '../lib/places.mjs';
import { renderMarkdown } from '../lib/longread.mjs';
import { libraryPage, mapPage, aboutPage } from '../lib/pages.mjs';
import { cleanRoot } from './helpers.mjs';

// The fixtures, loaded afresh for each test, since a test may set chapters or places on them.
const fixtures = async () => {
  const root = await cleanRoot();
  return { root, lib: await loadLibrary(root) };
};

// A step run on `lib` through a capturing ctx: what it writes, and the problems it adds.
async function runStep(name, root, lib, { idea = null, present = false } = {}) {
  const written = new Map();
  const ctx = {
    root,
    out: path.join(root, 'dist'),
    lib,
    idea,
    options: { check: false, present, web: false },
    problems: [],
    write: async (relPath, content) => void written.set(relPath, String(content)),
    copyFile: async () => {},
    sourceUrl: (abs) => sourceUrl(root, abs),
  };
  const { default: step } = await import(`../steps/${name}.mjs`);
  await step(ctx);
  return { written, problems: ctx.problems };
}

test('chapters are headed in the story order and their rows say which chapter', async () => {
  const { lib } = await fixtures();
  const [a, b] = lib.entries;
  lib.chapters = [{ id: 'c1', no: 1, title: 'First <b>', ids: [a.no] }, { id: 'c2', no: 2, title: 'Second', ids: [b.no] }, { id: 'c3', no: 3, title: 'Empty', ids: [] }];
  const { html } = libraryPage(lib, {});
  assert.match(html, /<h2 class="chapter" data-chapter="c1"><span class="ch-no">1<\/span> First &lt;b&gt;<\/h2>\s*<article class="row"[^>]*data-chapter="c1"/);
  assert.match(html, /<\/article>\s*<h2 class="chapter" data-chapter="c2"><span class="ch-no">2<\/span> Second<\/h2>\s*<article class="row"[^>]*data-chapter="c2"/);
  assert.doesNotMatch(html, /data-chapter="c3"/, 'a chapter with no row has no heading');
  const list = /<div class="list">([\s\S]*?)<\/div>\n<script/.exec(html)[1];
  assert.ok(list.indexOf('data-chapter="c1"') < list.indexOf('data-chapter="c2"'));
  const unchaptered = [...html.matchAll(/<article class="row"([^>]*)>/g)].slice(2);
  assert.equal(unchaptered.length, lib.entries.length - 2);
  for (const [, attrs] of unchaptered) assert.doesNotMatch(attrs, /data-chapter/, 'a row in no chapter says none');
});

test('a chapter is headed once, before its first row', async () => {
  const { lib } = await fixtures();
  lib.chapters = [{ id: 'c1', no: 1, title: 'All', ids: lib.entries.map((e) => e.no) }];
  const { html } = libraryPage(lib, {});
  assert.equal(html.match(/<h2 class="chapter"/g).length, 1);
  assert.match(html, /<div class="list">\n<h2 class="chapter" data-chapter="c1">/);
  assert.equal(html.match(/<article class="row"[^>]*data-chapter="c1"/g).length, lib.entries.length);
});

test('without chapters the page has no headings', async () => {
  const { lib } = await fixtures();
  assert.doesNotMatch(libraryPage(lib, {}).html, /class="chapter"|data-chapter/);
});

test('edit extras: assets, data and row marks', async () => {
  const { lib } = await fixtures();
  const { html } = libraryPage(lib, { depth: 1, extra: { css: ['web/edit.css'], js: ['web/edit.js'], data: { v: '</script>' }, mark: () => ' data-hidden="true"' } });
  assert.match(html, /href="\.\.\/web\/edit\.css"/);
  assert.match(html, /<script type="module" src="\.\.\/web\/edit\.js"><\/script>/);
  assert.match(html, /<script type="application\/json" id="edit-data">\{"v":"\\u003c\/script>"\}<\/script>/);
  assert.equal(html.match(/<article class="row"[^>]*data-hidden="true"/g).length, lib.entries.length);
  assert.doesNotMatch(libraryPage(lib, {}).html, /edit-data|edit\.js|data-hidden/, 'no extras, none of them');
});

test('a row\'s mark is asked of that row', async () => {
  const { lib } = await fixtures();
  const marked = lib.entries[1].no;
  const { html } = libraryPage(lib, { extra: { css: [], js: [], data: {}, mark: (entry) => (entry.no === marked ? ' data-changed="true"' : '') } });
  const changed = [...html.matchAll(/<article class="row"([^>]*)>/g)].filter(([, attrs]) => attrs.includes('data-changed="true"'));
  assert.deepEqual(changed.map(([, attrs]) => /data-no="([^"]*)"/.exec(attrs)[1]), [marked]);
});

test('at depth 1 the page reaches the site\'s files and the map one folder up', async () => {
  const { lib } = await fixtures();
  const { html } = libraryPage(lib, { depth: 1 });
  assert.match(html, /<link rel="stylesheet" href="\.\.\/web\/library\.css">/);
  assert.match(html, /<script type="module" src="\.\.\/web\/library\.js"><\/script>/);
  assert.match(html, /<a class="on-map" href="\.\.\/map\.html" hidden>/);
  assert.match(html, /<a href="\.\.\/map\.html#p=ponte-druso">/, 'a row\'s place');
  assert.match(libraryPage(lib, {}).html, /<a class="on-map" href="map\.html" hidden>/);
});

test('the Library page is what the step writes, and the step adds its problems', async () => {
  const { root, lib } = await fixtures();
  const idea = { html: '<p>The <button data-k="typeface">letters</button> change.</p>', keywords: ['typeface'], standin: true };
  const { kinds, problems: kindProblems } = await readKinds(root);
  lib.entries[0].type = 'Recording'; // a type no kind of the fixtures names
  for (const present of [false, true]) {
    const { written, problems } = await runStep('60-library', root, lib, { idea, present });
    const made = libraryPage(lib, { idea, kinds, present, sourceUrl: (abs) => sourceUrl(root, abs) });
    assert.equal(made.html, written.get('index.html'));
    assert.deepEqual(problems, [...kindProblems, ...made.problems]);
    assert.match(made.problems.map((p) => p.message).join('\n'), /no kind names the type "Recording"/);
  }
});

test('the Map page is what the step writes', async () => {
  const { root, lib } = await fixtures();
  lib.places.laives = { name: 'Laives', lat: 46.4275, lon: 11.3377 };
  lib.entries.find((e) => e.no === '5.02').place = 'laives';
  const meta = await locatePlaces(lib);
  const { written, problems } = await runStep('50-map', root, lib);
  const made = mapPage(lib, { meta, sourceUrl: (abs) => sourceUrl(root, abs) });
  assert.equal(made.html, written.get('map.html'));
  assert.deepEqual(problems, made.problems);
  assert.match(made.html, /data-place="ponte-druso"/);
  assert.match(made.html, /<span class="name">Laives<\/span>/);
});

test('the Map page names the places drawn before the dot data knew them', async () => {
  const { lib } = await fixtures();
  const meta = await locatePlaces(lib);
  const { problems } = mapPage(lib, { meta: { ...meta, focus: { places: [] } } });
  assert.deepEqual(problems.map((p) => [p.level, p.where]), [['warn', 'library/map-data/dots.json']]);
  assert.match(problems[0].message, /Ponte Druso/);
});

test('the About page is what the step writes, with about.md and without', async () => {
  const { root, lib } = await fixtures();
  const file = path.join(root, 'library', 'content', 'about.md');
  const aboutHtml = renderMarkdown(await readFile(file, 'utf8'), { linkBase: path.dirname(file), root });
  const withText = await runStep('70-about', root, lib);
  assert.equal(aboutPage(lib, { aboutHtml }), withText.written.get('about.html'));
  assert.match(aboutPage(lib, { aboutHtml }), /What this is/);
  await rm(file);
  const without = await runStep('70-about', root, lib);
  assert.equal(aboutPage(lib, {}), without.written.get('about.html'));
  assert.doesNotMatch(aboutPage(lib, {}), /What this is/);
});

test('the pages are made at once from the library alone, with no file beside its rows', async () => {
  const { lib } = await fixtures();
  const meta = await locatePlaces(lib);
  for (const entry of lib.entries) Object.assign(entry, { dir: null, abs: null });
  assert.match(libraryPage(lib, {}).html, /<div class="list">/);
  assert.match(mapPage(lib, { meta }).html, /<canvas class="scene"/);
  assert.match(aboutPage(lib, { aboutHtml: '<p>Hi</p>' }), /<p>Hi<\/p>/);
});
