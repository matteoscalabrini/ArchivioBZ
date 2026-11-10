import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import { buildFixtures, cleanRoot } from './helpers.mjs';

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
async function render({ idea = null, present = false, edit = () => {} } = {}) {
  const root = await cleanRoot();
  const lib = await loadLibrary(root);
  edit(lib);
  const written = new Map();
  const ctx = {
    root,
    out: path.join(root, 'dist'),
    lib,
    idea,
    options: { check: false, present },
    problems: lib.problems,
    write: async (relPath, content) => void written.set(relPath, String(content)),
    copyFile: async () => {},
    sourceUrl: (abs) => sourceUrl(root, abs),
  };
  const { default: step } = await import('../steps/60-library.mjs');
  await step(ctx);
  return written.get('index.html');
}

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
  assert.match(photo, /<a href="\/source\/wide\.jpg"><img /);
  const switches = [...photo.matchAll(/<button type="button" data-pic="(\d)" aria-pressed="(true|false)">(\d)<\/button>/g)];
  assert.deepEqual(switches.map((m) => [m[1], m[2], m[3]]), [['0', 'true', '1'], ['1', 'false', '2']]);
  assert.doesNotMatch(row(html, '5.02').inner, /data-pic/, 'one picture or none: no switch');
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

  const changed = await render({
    edit(lib) {
      lib.places['ponte-druso'].inside = false;
      entry(lib, '5.01').sources = ['5.02', '12.01'];
      Object.assign(entry(lib, '5.03'), { type: 'Map', confidence: { level: 'read' } });
      entry(lib, '12.01').confidence = { level: 'read', note: 'Date from the file, not printed.' };
    },
  });
  assert.equal(definition(row(changed, '5.01').inner, 'Place'), 'Ponte Druso, beyond the map');
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

test('status line, sortable column heads and every keyword at the foot', async () => {
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
  const foot = /<footer class="foot">([\s\S]*?)<\/footer>/.exec(html)[1];
  assert.match(foot, /^<span class="lab">All keywords<\/span>/);
  const counts = [...foot.matchAll(/data-k="([^"]+)" aria-pressed="false">([^<]+)<sup>(\d+)<\/sup>/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(counts.map((c) => c[0]), IDS);
  assert.deepEqual(counts.find((c) => c[0] === 'archives'), ['archives', 'Archives', '2']);
  assert.deepEqual(counts.find((c) => c[0] === 'irony'), ['irony', 'Irony', '1']);
  assert.match(html, /<link rel="stylesheet" href="web\/library.css">/);
  assert.match(html, /<script type="module" src="web\/library.js"><\/script>/);
});
