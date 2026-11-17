import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import { buildFixtures, buildRoot, cleanRoot } from './helpers.mjs';

// The fixtures built by build.mjs, as the browser gets them.
let built;
function builtIndex() {
  built ??= buildFixtures().then(({ out, run }) => {
    assert.equal(run.status, 0, run.stdout + run.stderr);
    return readFile(path.join(out, 'index.html'), 'utf8');
  });
  return built;
}

// The Library step alone, on the fixtures plus what later steps would add (pictures, the idea,
// table previews, map positions), given by `edit`.
async function renderFull({ idea = null, present = false, web = false, edit = () => {}, prepare = async () => {} } = {}) {
  const root = await cleanRoot();
  await prepare(root);
  const lib = await loadLibrary(root);
  edit(lib);
  const written = new Map();
  const ctx = {
    root,
    out: path.join(root, 'dist'),
    lib,
    idea,
    options: { check: false, present, web },
    problems: lib.problems,
    write: async (relPath, content) => void written.set(relPath, String(content)),
    copyFile: async () => {},
    sourceUrl: (abs) => (web ? null : sourceUrl(root, abs)),
  };
  const { default: step } = await import('../steps/60-library.mjs');
  await step(ctx);
  return { html: written.get('index.html'), problems: lib.problems };
}
const render = async (options) => (await renderFull(options)).html;

const entry = (lib, no) => lib.entries.find((e) => e.no === no);
const rows = (html) =>
  [...html.matchAll(/<article class="([^"]*)"([^>]*)>([\s\S]*?)<\/article>/g)].map(([, cls, attrs, inner]) => ({
    cls,
    attrs,
    inner,
    no: /data-no="([^"]*)"/.exec(attrs)?.[1],
  }));
const row = (html, no) => rows(html).find((r) => r.no === no);
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unesc = (s) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]);
const more = (html, no) => {
  const link = /<a class="more" href="([^"]*)"[^>]*>([^<]*)<\/a>/.exec(row(html, no).inner);
  return link && [unesc(link[2]), unesc(link[1])];
};
const terms = (inner) => [...inner.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]);
const definition = (inner, term) => new RegExp(`<dt>${term}</dt><dd>([\\s\\S]*?)</dd>`).exec(inner)?.[1];
const IDS = ['ponte-druso', 'press', 'archives', 'statistics', 'theory', 'typeface', 'humour', 'irony'];

test('one article.row per entry, in order', async () => {
  const html = await builtIndex();
  const found = rows(html);
  assert.deepEqual(found.map((r) => r.no), ['0.01', '5.00', '5.01', '5.02', '5.03', '12.01']);
  for (const r of found) {
    assert.equal(r.cls, 'row');
    assert.match(r.attrs, /data-type="[^"]+"/);
    assert.match(r.attrs, /data-year="\d+"/);
    assert.match(r.inner, /^\s*<div class="row-head">/);
    assert.match(r.inner, /<div class="row-body" id="[^"]+" inert>/);
  }
  assert.match(row(html, '5.02').attrs, /data-type="Newspaper page" data-year="1931"/);
});

test('no <img src> inside a closed row', async () => {
  const html = await render({
    edit(lib) {
      entry(lib, '5.01').pictures = [
        { src: 'img/5.01-1.jpg', w: 1600, h: 960, caption: 'A picture wider than 1600 pixels.', original: '/source/wide.jpg' },
        { src: 'img/5.01-2.jpg', w: 40, h: 30, caption: 'A small picture.', original: '/source/small.png' },
      ];
    },
  });
  const images = html.match(/<img\b[^>]*>/g) ?? [];
  assert.equal(images.length, 2);
  for (const image of images) {
    assert.match(image, /\sdata-src="img\/5\.01-[12]\.jpg"/);
    assert.doesNotMatch(image, /\ssrc=/);
  }
  const photo = row(html, '5.01').inner;
  assert.match(photo, /<figcaption>A picture wider than 1600 pixels\.<\/figcaption>/);
  assert.match(photo, /<button type="button" class="pic-open" data-original="\/source\/wide\.jpg" aria-label="Show the picture full screen"><img [^>]*><\/button>/,
    'a picture is a button that opens it full screen; off the web it carries the address of its original');
});

test('several pictures: ← n / N → under each picture and above its caption; one picture: no switcher', async () => {
  const pictures = (n) => Array.from({ length: n }, (_, i) => ({ src: `img/x-${i + 1}.jpg`, w: 40, h: 30, caption: `Picture ${i + 1}.`, original: `/source/p${i + 1}.jpg` }));
  const html = await render({
    edit(lib) {
      entry(lib, '5.01').pictures = pictures(3);
      entry(lib, '5.02').pictures = pictures(1);
    },
  });
  const figures = [...row(html, '5.01').inner.matchAll(/<figure( hidden)?>([\s\S]*?)<\/figure>/g)];
  assert.deepEqual(figures.map((m) => Boolean(m[1])), [false, true, true], 'the first picture shows');
  figures.forEach(([, , inner], n) => {
    assert.equal(/<p class="pic-nav">([\s\S]*?)<\/p>/.exec(inner)?.[1],
      `<button type="button" data-step="-1" aria-label="Previous picture"${n === 0 ? ' disabled' : ''}>←</button>`
      + `<span class="pic-n">${n + 1} / 3</span>`
      + `<button type="button" data-step="1" aria-label="Next picture"${n === 2 ? ' disabled' : ''}>→</button>`);
    const at = ['<button type="button" class="pic-open"', '<img ', '<p class="pic-nav">', `<figcaption>Picture ${n + 1}.</figcaption>`].map((part) => inner.indexOf(part));
    assert.ok(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])), `picture ${n + 1}: button, picture, switcher, caption, in that order`);
  });
  const single = row(html, '5.02').inner;
  assert.match(single, /<figcaption>Picture 1\.<\/figcaption>/);
  assert.doesNotMatch(single, /pic-nav|data-step|Previous picture|Next picture/);
});

test('a row with empty text and no picture still renders a body', async () => {
  const html = await builtIndex();
  const reference = row(html, '12.01').inner;
  assert.match(reference, /<div class="detail wide">/);
  assert.doesNotMatch(reference, /<p>/);
  assert.equal(definition(reference, 'Confidence'), 'Lead, not yet a fact; source not yet read');
  assert.match(definition(reference, 'Source'), /<a href="https:\/\/example\.org\/reference"[^>]*>Example page<\/a>/);
  assert.equal(more(html, '12.01'), null);
});

test('bottom link wording by kind', async () => {
  const html = await builtIndex();
  assert.deepEqual(more(html, '5.02'), ['Open the PDF →', '/source/research_notes/Inv%20A/files/05_x/page.pdf']);
  assert.deepEqual(more(html, '5.03'), ['Open the full table →', 'table/5.03.html']);
  assert.deepEqual(more(html, '5.00'), ['Read the notes →', 'read/5.00.html']);
  assert.deepEqual(more(html, '0.01'), ['Read the report →', 'read/0.01.html']);
  assert.equal(more(html, '5.01'), null);
});

test('every other kind of bottom link, and a label that overrides', async () => {
  const html = await render({
    edit(lib) {
      entry(lib, '5.00').type = 'Story';
      entry(lib, '5.00').page = 'read/5.00.html';
      entry(lib, '5.03').page = 'table/5.03.html';
      entry(lib, '5.01').more = { kind: 'file' };
      entry(lib, '12.01').more = { kind: 'source' };
      Object.assign(entry(lib, '0.01'), { type: 'Map', more: { kind: 'map' } });
      entry(lib, '5.03').more.label = 'All seven →';
    },
  });
  assert.deepEqual(more(html, '5.00'), ['Read the full story →', 'read/5.00.html']);
  assert.deepEqual(more(html, '5.01'), ['Open the file →', "/source/research_notes/Inv%20A/files/05_x/Te%C3%9Fmann%20'60.jpg"]);
  assert.deepEqual(more(html, '12.01'), ['Open the source →', 'https://example.org/reference']);
  assert.deepEqual(more(html, '0.01'), ['Open the map →', 'map.html']);
  assert.deepEqual(more(html, '5.03'), ['All seven →', 'table/5.03.html']);
});

test('a read or table row without its page links the file it holds, or nothing', async () => {
  const html = await render({
    edit(lib) {
      entry(lib, '5.00').abs = path.join(entry(lib, '5.00').dir, 'page.pdf');
      entry(lib, '5.03').abs = path.join(entry(lib, '5.03').dir, 'table.csv');
      entry(lib, '5.03').more.label = 'All seven →';
    },
  });
  assert.deepEqual(more(html, '5.00'), ['Open the PDF →', '/source/research_notes/Inv%20A/files/05_x/page.pdf']);
  assert.deepEqual(more(html, '5.03'), ['Open the file →', '/source/research_notes/Inv%20A/files/05_x/table.csv']);
  assert.equal(more(html, '0.01'), null, 'no page and no file held: no bottom link');
  assert.doesNotMatch(html, /href="(read|table)\//);
});

test('on the web a row links no file it holds and no original of its pictures; its Source line stays', async () => {
  const html = await render({
    web: true,
    edit(lib) {
      entry(lib, '5.01').more = { kind: 'file' };
      entry(lib, '5.00').abs = path.join(entry(lib, '5.00').dir, 'page.pdf');
      entry(lib, '5.01').pictures = [{ src: 'img/5.01-1.jpg', w: 40, h: 30, caption: 'A small picture.', original: null }];
    },
  });
  assert.equal(more(html, '5.01'), null, 'a file kind');
  assert.equal(more(html, '5.02'), null, 'a file kind by default');
  assert.equal(more(html, '5.00'), null, 'a read without its page');
  assert.match(row(html, '5.01').inner, /<button type="button" class="pic-open" aria-label="Show the picture full screen"><img /, 'the picture opens full screen, with no original');
  assert.match(definition(row(html, '5.02').inner, 'Source'), /<a href="https:\/\/example\.org\/az-1931"[^>]*>Example archive<\/a>/);
  assert.doesNotMatch(html, /\/source\//);
});

// Steps run in order on the fixtures, as build.mjs runs them; `setup` changes the copy after the
// loader has checked it, so a file it removes is gone by the time the steps look for it.
async function runSteps(names, { setup = async () => {} } = {}) {
  const root = await cleanRoot();
  const lib = await loadLibrary(root);
  await setup(root);
  const written = new Map();
  const ctx = {
    root,
    out: path.join(root, 'dist'),
    lib,
    options: { check: false, present: false },
    problems: lib.problems,
    write: async (relPath, content) => void written.set(relPath, String(content)),
    copyFile: async () => {},
    sourceUrl: (abs) => sourceUrl(root, abs),
  };
  const before = lib.problems.length;
  for (const name of names) {
    const { default: step } = await import(`../steps/${name}.mjs`);
    await step(ctx);
  }
  return { written, problems: lib.problems.slice(before), html: written.get('index.html') };
}

test('a read row whose target is missing: a warning, no page, no read/ link', async () => {
  const { written, problems, html } = await runSteps(['40-longreads', '60-library'], {
    setup: (root) => rm(path.join(root, 'reports', 'first study.md')),
  });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].level, 'warn');
  assert.equal(problems[0].where, 'library/content/entries.json');
  assert.match(problems[0].message, /^row 0\.01: reports\/first study\.md cannot be rendered \(ENOENT\), so it has no page$/);
  assert.deepEqual([...written.keys()].sort(), ['index.html', 'read/5.00.html']);
  assert.doesNotMatch(html, /read\/0\.01\.html/);
  assert.equal(more(html, '0.01'), null);
  assert.deepEqual(more(html, '5.00'), ['Read the notes →', 'read/5.00.html']);
});

test('a table row whose CSV is missing: a warning, no page, no table/ link', async () => {
  const { written, problems, html } = await runSteps(['30-tables', '60-library'], {
    setup: (root) => rm(path.join(root, 'research_notes', 'Inv A', 'files', '05_x', 'table.csv')),
  });
  assert.deepEqual(problems, [{
    level: 'warn',
    where: 'research_notes/Inv A/files/05_x/entries.json',
    message: 'row 5.03: research_notes/Inv A/files/05_x/table.csv cannot be read (ENOENT), so it has no page',
  }]);
  assert.deepEqual([...written.keys()], ['index.html']);
  assert.doesNotMatch(html, /table\/5\.03\.html/);
  assert.equal(more(html, '5.03'), null);
  assert.match(row(html, '5.03').inner, /<div class="detail wide">/, 'no preview either');
});

test('the build goes on past a read and a table it cannot render, and links the files held instead', async () => {
  const root = await cleanRoot();
  const file = path.join(root, 'research_notes', 'Inv A', 'files', '05_x', 'entries.json');
  const data = JSON.parse(await readFile(file, 'utf8'));
  Object.assign(data.entries.find((e) => e.no === '5.00'), { file: 'page.pdf', more: { kind: 'read', target: 'page.pdf' } });
  data.entries.find((e) => e.no === '5.03').file = 'table.csv';
  await writeFile(file, JSON.stringify(data));
  await writeFile(path.join(path.dirname(file), 'table.csv'), '');

  const { out, run } = await buildRoot(root);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const where = 'WARN research_notes/Inv A/files/05_x/entries.json';
  assert.ok(run.stdout.includes(`${where}: row 5.00: research_notes/Inv A/files/05_x/page.pdf is not Markdown or Word, so it has no page\n`), run.stdout);
  assert.ok(run.stdout.includes(`${where}: row 5.03: research_notes/Inv A/files/05_x/table.csv is empty, so it has no page\n`), run.stdout);
  assert.equal(existsSync(path.join(out, 'read', '5.00.html')), false);
  assert.equal(existsSync(path.join(out, 'table', '5.03.html')), false);
  const html = await readFile(path.join(out, 'index.html'), 'utf8');
  assert.deepEqual(more(html, '5.00'), ['Open the PDF →', '/source/research_notes/Inv%20A/files/05_x/page.pdf']);
  assert.deepEqual(more(html, '5.03'), ['Open the file →', '/source/research_notes/Inv%20A/files/05_x/table.csv']);
  assert.deepEqual(more(html, '0.01'), ['Read the report →', 'read/0.01.html']);
  assert.doesNotMatch(html, /read\/5\.00\.html|table\/5\.03\.html/);
});

test('keyword labels shown, ids in data-kw', async () => {
  const html = await builtIndex();
  const page = row(html, '5.02');
  assert.match(page.attrs, /data-kw="press typeface"/);
  const head = /<div class="row-head">([\s\S]*?)<\/div>/.exec(page.inner)[1];
  const labels = [...head.matchAll(/<button type="button" data-k="([^"]+)" aria-pressed="false">([^<]+)<\/button>/g)];
  assert.deepEqual(labels.map((m) => [m[1], m[2]]), [['press', 'Press'], ['typeface', 'Typeface']]);
});

test('with --present and a stand-in idea, the keyword index replaces the paragraph', async () => {
  const idea = { html: '<p>Fascism made Bolzano Italian in the <button data-k="press">press</button>.</p>', keywords: ['press'], standin: true };
  const building = await render({ idea });
  assert.match(building, /<span class="lab">The idea \(stand-in\)<\/span><p>Fascism made Bolzano Italian in the /);

  const presented = await render({ idea, present: true });
  assert.ok(!presented.includes('Fascism made'));
  assert.doesNotMatch(presented, /The idea/);
  const top = /<section class="idea index">([\s\S]*?)<\/section>/.exec(presented)[1];
  assert.deepEqual([...top.matchAll(/<button type="button" data-k="([^"]+)"/g)].map((m) => m[1]), IDS);
  assert.match(top, />Ponte Druso<\/button>/);
});

test('an idea that is not a stand-in shows under "The idea"; no idea gives the index', async () => {
  const idea = { html: '<p>The <button data-k="typeface">letters</button> change.</p>', keywords: ['typeface'], standin: false };
  for (const present of [false, true]) {
    const html = await render({ idea, present });
    assert.match(html, /<section class="idea"><span class="lab">The idea<\/span><p>The <button data-k="typeface">/);
    assert.doesNotMatch(html, /stand-in|class="idea index"/);
  }
  const none = await builtIndex();
  assert.match(none, /<section class="idea index">/);
  assert.doesNotMatch(none, /The idea/);
});

test('a comma or full stop after a marked word of the idea stays on its line', async () => {
  const idea = {
    html: '<p>In the <button data-k="press">press</button>, on <button data-k="humour">jokes</button> and <button data-k="typeface">type</button>.</p>',
    keywords: [],
    standin: false,
  };
  const html = await render({ idea });
  assert.ok(html.includes('<p>In the <span class="kw"><button data-k="press">press</button>,</span> on '), html);
  assert.ok(html.includes(' on <button data-k="humour">jokes</button> and <span class="kw"><button data-k="typeface">type</button>.</span></p>'), html);
});

test('a path with spaces is encoded in the source link', async () => {
  const html = await builtIndex();
  assert.match(row(html, '5.02').inner, /<a class="more" href="\/source\/research_notes\/Inv%20A\/files\/05_x\/page\.pdf">/);
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]*)"/g)) assert.doesNotMatch(url, /[\sß]/, url);
});

test('meta lines in order; no Confidence on Report, Notes or Map; places and sources link', async () => {
  const html = await builtIndex();
  assert.deepEqual(terms(row(html, '5.01').inner), ['Creator', 'Rights', 'Confidence', 'Place']);
  assert.deepEqual(terms(row(html, '5.02').inner), ['Holder', 'Rights', 'Confidence', 'Source']);
  assert.equal(definition(row(html, '5.01').inner, 'Confidence'), 'From a secondary source; photographer unclear');
  assert.equal(definition(row(html, '5.02').inner, 'Confidence'), 'Read in the source');
  assert.equal(definition(row(html, '5.01').inner, 'Place'), '<a href="map.html#p=ponte-druso">Ponte Druso, on the map →</a>');
  assert.deepEqual(terms(row(html, '0.01').inner), []);
  assert.deepEqual(terms(row(html, '5.00').inner), []);
  assert.equal(definition(row(html, '12.01').inner, 'Place'), '<a href="map.html#p=piazza-erbe">Piazza Erbe, beyond the map →</a>');

  const changed = await render({
    edit(lib) {
      lib.places['ponte-druso'].inside = false;
      entry(lib, '5.01').sources = ['5.02', '12.01'];
      Object.assign(entry(lib, '5.03'), { type: 'Map', confidence: { level: 'read' } });
      entry(lib, '12.01').confidence = { level: 'read', note: 'Date from the file, not printed.' };
    },
  });
  assert.equal(definition(row(changed, '5.01').inner, 'Place'), '<a href="map.html#p=ponte-druso">Ponte Druso, beyond the map →</a>');
  assert.equal(
    definition(row(changed, '5.01').inner, 'Sources'),
    '2 rows: <a href="#o=5.02" data-jump="5.02">5.02</a>, <a href="#o=12.01" data-jump="12.01">12.01</a>',
  );
  assert.deepEqual(terms(row(changed, '5.03').inner), []);
  assert.equal(definition(row(changed, '12.01').inner, 'Confidence'), 'Read in the source. Date from the file, not printed.');
});

test('a table row shows its first records beside the text', async () => {
  const records = [['One', '1928', 'https://example.org/1'], ['Two', '1929', ''], ['Three', '1930', ''], ['Four', '1931', ''], ['Five', '1932', '']];
  const html = await render({
    edit(lib) {
      entry(lib, '5.03').preview = { columns: ['title', 'date', 'url'], rows: records, total: 7 };
    },
  });
  const table = row(html, '5.03').inner;
  assert.match(table, /<div class="detail table">/);
  assert.match(table, /<caption>First 5 of 7 records<\/caption>/);
  assert.deepEqual([...table.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]), ['title', 'date', 'url']);
  assert.equal((table.match(/<tr>/g) ?? []).length, 6);
  assert.match(table, /<td>One<\/td><td>1928<\/td><td>https:\/\/example\.org\/1<\/td>/);
});

test('a table row reads preview, text, meta lines, then the bottom link', async () => {
  const records = [['One', '1928', ''], ['Two', '1929', '']];
  const html = await render({
    edit(lib) {
      Object.assign(entry(lib, '5.03'), { preview: { columns: ['title', 'date', 'url'], rows: records, total: 7 }, page: 'table/5.03.html' });
    },
  });
  const body = /<div class="row-body"[^>]*>([\s\S]*)<\/div>/.exec(row(html, '5.03').inner)[1];
  const at = (marker) => {
    const index = body.indexOf(marker);
    assert.notEqual(index, -1, `no ${marker}`);
    return index;
  };
  assert.ok(at('<table class="recs">') < at('<p>'), 'the preview comes before the text');
  assert.ok(at('<p>') < at('<dl class="meta">'), 'the text comes before the meta lines');
  assert.ok(at('</dl>') < at('<a class="more"'), 'the bottom link comes after the meta lines');
});

test('status line, sortable column heads and every keyword with its count under the idea', async () => {
  const html = await builtIndex();
  assert.match(html, /<a href="index.html" aria-current="page">Library<\/a>/);
  assert.match(html, /<span class="what">All entries<\/span><span class="n">6 entries<\/span>/);
  assert.match(html, /<button type="button" class="show-all" hidden>Show all<\/button>/);
  assert.match(html, /<a class="on-map" href="map.html" hidden>On the map →<\/a>/);
  const heads = /<div class="colhead">([\s\S]*?)<\/div>/.exec(html)[1];
  assert.deepEqual(
    [...heads.matchAll(/<(button|span)[^>]*?(?: data-sort="(\w+)" aria-pressed="(\w+)")?>([^<]*)</g)].map((m) => [m[1], m[2], m[3], m[4]]),
    [['button', 'no', 'true', 'No.'], ['span', undefined, undefined, 'Title'], ['button', 'type', 'false', 'Type'],
      ['button', 'date', 'false', 'Date'], ['span', undefined, undefined, 'Keywords']],
  );
  const all = /<div class="keywords">([\s\S]*?)<\/div>/.exec(html)?.[1];
  assert.ok(all, 'the keywords stand in their own block');
  assert.match(all, /^<span class="lab">All keywords<\/span>/);
  const idea = html.indexOf('<section class="idea');
  const keywordsAt = html.indexOf('<div class="keywords">');
  assert.ok(idea > -1 && idea < keywordsAt && keywordsAt < html.indexOf('<div class="status">'), 'under the idea, above the status line');
  assert.doesNotMatch(html, /<footer class="foot">/, 'no longer at the foot');
  const counts = [...all.matchAll(/data-k="([^"]+)" aria-pressed="false">([^<]+)<sup>(\d+)<\/sup>/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(counts.map((c) => c[0]), IDS);
  assert.deepEqual(counts.find((c) => c[0] === 'archives'), ['archives', 'Archives', '2']);
  assert.deepEqual(counts.find((c) => c[0] === 'irony'), ['irony', 'Irony', '1']);
  assert.match(html, /<link rel="stylesheet" href="web\/library.css">/);
  assert.match(html, /<script type="module" src="web\/library.js"><\/script>/);
});

const onMap = (html) => JSON.parse(/<script type="application\/json" id="keywords-on-map">([^<]*)<\/script>/.exec(html)[1]);

test('the page lists the keywords that have a row placed on the map, for "On the map →"', async () => {
  const html = await builtIndex();
  // ponte-druso: 5.01 at Ponte Druso, on the map. press: no row with a place. humour and irony:
  // 12.01 at Piazza Erbe, which has no coordinates and so lies beyond the map.
  assert.deepEqual(onMap(html), ['ponte-druso']);

  const moved = await render({
    edit(lib) {
      lib.places['ponte-druso'].inside = false;
      lib.places['piazza-erbe'].inside = false;
      lib.places.semirurali.inside = true;
      entry(lib, '5.02').place = 'semirurali';
    },
  });
  assert.deepEqual(onMap(moved), ['press', 'typeface']);
});


// The kind buttons above the column heads as [id, label, count], or null when the page has none.
const kindButtons = (html) => {
  const line = /<div class="kinds">([\s\S]*?)<\/div>/.exec(html)?.[1];
  if (line === undefined) return null;
  return [...line.matchAll(/<button type="button" data-kind="([^"]*)" aria-pressed="false">([^<]*)<sup>(\d+)<\/sup><\/button>/g)]
    .map((m) => [m[1], unesc(m[2]), Number(m[3])]);
};

test('each row carries the kind its type belongs to', async () => {
  const html = await builtIndex();
  assert.match(row(html, '5.02').attrs, /data-kind="press"/);
  assert.match(row(html, '5.01').attrs, /data-kind="pictures"/);
  assert.match(row(html, '12.01').attrs, /data-kind="references"/);
  assert.match(row(html, '0.01').attrs, /data-kind="project"/);
});

test('the kinds that have rows stand between the status line and the column heads, in the order of kinds.json, each with its count', async () => {
  const html = await builtIndex();
  assert.deepEqual(kindButtons(html), [
    ['press', 'Press', 1],
    ['pictures', 'Pictures', 1],
    ['documents', 'Documents', 1],
    ['references', 'References', 1],
    ['project', 'Reports and notes', 2],
  ]);
  const at = (cls) => html.indexOf(`<div class="${cls}">`);
  assert.ok(at('status') < at('kinds') && at('kinds') < at('colhead'), 'status, kinds, column heads');
});

test('the page hands the script the label of every kind in kinds.json', async () => {
  const html = await builtIndex();
  const labels = JSON.parse(/<script type="application\/json" id="kind-labels">([^<]*)<\/script>/.exec(html)[1]);
  assert.deepEqual(labels, {
    press: 'Press', pictures: 'Pictures', film: 'Film and sound', documents: 'Documents', references: 'References', project: 'Reports and notes',
  });
});

test('a type that no kind names leaves its row without a kind and is named in a warning', async () => {
  const { html, problems } = await renderFull({ edit: (lib) => { entry(lib, '5.03').type = 'Archive guide'; } });
  assert.doesNotMatch(row(html, '5.03').attrs, /data-kind=/);
  assert.deepEqual(kindButtons(html).map((kind) => kind[0]), ['press', 'pictures', 'references', 'project'], 'no row is a document now');
  const warning = problems.find((p) => p.where === 'library/content/kinds.json');
  assert.equal(warning?.level, 'warn');
  assert.match(warning.message, /Archive guide/);
  assert.match(warning.message, /5\.03/);
});

test('a library without kinds.json has no kinds line and no row with a kind', async () => {
  const html = await render({ prepare: (root) => rm(path.join(root, 'library', 'content', 'kinds.json')) });
  assert.equal(kindButtons(html), null);
  assert.doesNotMatch(html, /data-kind=/);
  assert.doesNotMatch(html, /id="kind-labels"/);
});

test('every row has a place for the reason it was found, empty until a search', async () => {
  const html = await builtIndex();
  for (const r of rows(html)) assert.match(r.inner, /<h2 class="c-title"><button[^>]*>[\s\S]*?<\/button><span class="why"><\/span><\/h2>/, r.no);
  assert.equal(rows(html).length, 6);
});
