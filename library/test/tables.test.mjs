import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import { parseCsv } from '../lib/csv.mjs';
import tables from '../steps/30-tables.mjs';
import { compareCells } from '../web/table.js';
import { buildFixtures, cleanRoot } from './helpers.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LUCE = path.join(REPO, 'research_notes', 'Fascist Bolzano media and migration', 'files',
  '02_newsreels_radio_mobilization', 'luce_newsreels_South_Tyrol_1927-1945_catalogue.csv');
const TABLE = ['research_notes', 'Inv A', 'files', '05_x', 'table.csv'];

// The tables step on the fixtures; `csv` replaces the table file of row 5.03 in the copy, `setup`
// may change the copy further.
async function runStep({ csv, setup = async () => {}, edit = () => {} } = {}) {
  const root = await cleanRoot();
  if (csv !== undefined) await writeFile(path.join(root, ...TABLE), csv);
  await setup(root);
  const lib = await loadLibrary(root);
  edit(lib);
  const written = new Map();
  const ctx = {
    root,
    out: path.join(root, 'dist'),
    lib,
    options: {},
    problems: lib.problems,
    write: async (relPath, content) => void written.set(relPath, String(content)),
    copyFile: async () => {},
    sourceUrl: (abs) => sourceUrl(root, abs),
  };
  const before = lib.problems.length;
  await tables(ctx);
  return { written, problems: lib.problems.slice(before), entry: (no) => lib.entries.find((e) => e.no === no) };
}

test('quoted comma stays in one cell', () => {
  assert.deepEqual(parseCsv('title,date\n"Fair, autumn edition",1933\n'), { columns: ['title', 'date'], rows: [['Fair, autumn edition', '1933']] });
});

test('quoted newline stays in one cell', () => {
  assert.deepEqual(parseCsv('a,b\r\n"one\r\ntwo",3\r\n'), { columns: ['a', 'b'], rows: [['one\r\ntwo', '3']] });
});

test('doubled quote becomes one quote', () => {
  assert.deepEqual(parseCsv('a,b\n"He said ""Bolzano"".",""\n'), { columns: ['a', 'b'], rows: [['He said "Bolzano".', '']] });
});

test('BOM is not part of the first column name', () => {
  assert.deepEqual(parseCsv('﻿year,total\n1931,12\n').columns, ['year', 'total']);
});

test('CRLF, a missing final newline and blank trailing lines', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n3,'), { columns: ['a', 'b'], rows: [['1', '2'], ['3', '']] });
  assert.deepEqual(parseCsv('a,b\n1,2\n\n\r\n\n'), { columns: ['a', 'b'], rows: [['1', '2']] });
  assert.deepEqual(parseCsv(''), { columns: [], rows: [] });
});

test('preview total equals the number of data rows', async () => {
  const { entry, problems } = await runStep();
  assert.deepEqual(entry('5.03').preview, {
    columns: ['title', 'date', 'url'],
    rows: [
      ['Inauguration, Ponte Druso', '1931', 'https://example.org/a-001'],
      ['Stadium opening', '1932', 'https://example.org/a-002'],
      ['Victory monument', '1928', 'https://example.org/a-003'],
      ['Fair, autumn edition', '1933', 'https://example.org/a-004'],
      ['New quarter', '1934', 'https://example.org/a-005'],
    ],
    total: 7,
  });
  assert.deepEqual(problems, []);
  for (const no of ['5.00', '5.01', '5.02', '12.01']) assert.equal(entry(no).preview, undefined);
});

test('without more.columns the preview takes the first three; a column the file lacks is an error', async () => {
  const plain = await runStep({ edit: (lib) => delete lib.entries.find((e) => e.no === '5.03').more.columns });
  assert.deepEqual(plain.entry('5.03').preview.columns, ['title', 'date', 'code']);
  assert.deepEqual(plain.entry('5.03').preview.rows[0], ['Inauguration, Ponte Druso', '1931', 'A-001']);

  const wrong = await runStep({ edit: (lib) => (lib.entries.find((e) => e.no === '5.03').more.columns = ['title', 'year']) });
  assert.deepEqual(wrong.entry('5.03').preview.columns, ['title']);
  assert.deepEqual(wrong.problems, [{
    level: 'error',
    where: 'research_notes/Inv A/files/05_x/entries.json',
    message: 'row 5.03: more.columns names "year", which table.csv does not have',
  }]);
});

test('the step records the page it wrote on the entry', async () => {
  const { entry, written } = await runStep();
  assert.equal(entry('5.03').page, 'table/5.03.html');
  assert.ok(written.has(entry('5.03').page));
  for (const no of ['0.01', '5.00', '5.01', '5.02', '12.01']) assert.equal(entry(no).page, undefined);
});

test('a CSV that is missing, empty or not a CSV is a warning naming row and file: no page, no entry.page', async () => {
  const where = 'research_notes/Inv A/files/05_x/entries.json';
  const cases = [
    [{ setup: (root) => rm(path.join(root, ...TABLE)) }, 'row 5.03: research_notes/Inv A/files/05_x/table.csv cannot be read (ENOENT), so it has no page'],
    [{ csv: '' }, 'row 5.03: research_notes/Inv A/files/05_x/table.csv is empty, so it has no page'],
    [{ edit: (lib) => (lib.entries.find((e) => e.no === '5.03').more.target = 'page.pdf') },
      'row 5.03: research_notes/Inv A/files/05_x/page.pdf is not a CSV file, so it has no page'],
  ];
  for (const [options, message] of cases) {
    const { entry, written, problems } = await runStep(options);
    assert.deepEqual(problems, [{ level: 'warn', where, message }]);
    assert.deepEqual([...written.keys()], []);
    assert.equal(entry('5.03').page, undefined);
    assert.equal(entry('5.03').preview, undefined);
  }
});

test('a preview cell longer than 160 characters is cut at a word boundary, with an ellipsis', async () => {
  const words = 'Newsreel summary from the catalogue, with the inauguration, the crowd, the prefect and the bridge seen from the river, then the eagles on their globes and fasces, once more.';
  const unbroken = `https://example.org/${'x'.repeat(200)}`;
  const { entry, written } = await runStep({ csv: `title,date,url\n"${words}",1931,${unbroken}\n` });
  const [cells] = entry('5.03').preview.rows;
  // 173 characters; "fasces" would end at 161, so the last whole word within 160 is "and".
  assert.equal(cells[0], 'Newsreel summary from the catalogue, with the inauguration, the crowd, the prefect and the bridge seen from the river, then the eagles on their globes and…');
  assert.ok(words.startsWith(cells[0].slice(0, -1)) && cells[0].length <= 161);
  assert.equal(cells[2], `${unbroken.slice(0, 160)}…`, 'no space to cut at: cut at 160');
  assert.ok(written.get('table/5.03.html').includes(words), 'the table page keeps the whole cell');
});

test('the table page: title, count, way back, sort buttons, links', async () => {
  const { written } = await runStep();
  const html = written.get('table/5.03.html');
  assert.ok(html, 'table/5.03.html is written');
  assert.match(html, /<title>A catalogue of seven records<\/title>/);
  assert.match(html, /<a href="\.\.\/index\.html" aria-current="page">Library<\/a>/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/web\/base\.css">/);
  assert.match(html, /<script type="module" src="\.\.\/web\/table\.js"><\/script>/);
  assert.match(html, /<a class="back" href="\.\.\/index\.html#o=5\.03">← Library<\/a>/);
  assert.match(html, /<h1>A catalogue of seven records<\/h1>/);
  assert.match(html, /<p class="count">7 records<\/p>/);
  const heads = [...html.matchAll(/<th scope="col"><button type="button" data-col="(\d)">([^<]*)<\/button><\/th>/g)];
  assert.deepEqual(heads.map((m) => [m[1], m[2]]), [['0', 'title'], ['1', 'date'], ['2', 'code'], ['3', 'url']]);
  assert.doesNotMatch(/<thead>[\s\S]*<\/thead>/.exec(html)[0], /aria-sort/, 'unsorted until a head is pressed');
  const body = /<tbody>([\s\S]*)<\/tbody>/.exec(html)[1];
  assert.equal((body.match(/<tr>/g) ?? []).length, 7);
  assert.ok(body.includes('<tr><td>Inauguration, Ponte Druso</td><td class="short">1931</td><td class="short">A-001</td>'
    + '<td class="long"><a href="https://example.org/a-001" target="_blank" rel="noopener">https://example.org/a-001</a></td></tr>'));
});

test('raw column names wrap after underscores; cells are escaped and only http(s) addresses link', async () => {
  const { written } = await runStep({ csv: 'summary_from_catalogue,link\n<b>bold</b>,javascript:alert(1)\nplain,http://example.org/?a=1&b=2\n' });
  const html = written.get('table/5.03.html');
  assert.match(html, /data-col="0">summary_<wbr>from_<wbr>catalogue<\/button>/);
  assert.ok(html.includes('<td class="short">&lt;b&gt;bold&lt;/b&gt;</td><td class="long">javascript:alert(1)</td>'));
  assert.ok(html.includes('<td class="long"><a href="http://example.org/?a=1&amp;b=2" target="_blank" rel="noopener">http://example.org/?a=1&amp;b=2</a></td>'));
  assert.match(html, /<p class="count">2 records<\/p>/);
});

test('numbers and codes stay on one line or may break; words never break', async () => {
  const { written } = await runStep({
    csv: 'a,b,c,d\n46.49477,"Ein Fremdenverkehrsverband, nicht mehr",45.895770831703665,IT022253B566UC9TNJ\n',
  });
  const cells = [.../<tbody>\s*<tr>([\s\S]*?)<\/tr>/.exec(written.get('table/5.03.html'))[1].matchAll(/<td( class="(\w+)")?>/g)];
  assert.deepEqual(cells.map((m) => m[2] ?? 'words'), ['short', 'words', 'long', 'long']);
});

test('sorting puts numbers in numeric order, words in alphabetical order and empty cells last', () => {
  const sorted = (cells) => [...cells].sort(compareCells);
  assert.deepEqual(sorted(['10', '9', '-2', '46.5', '46.49', '']), ['-2', '9', '10', '46.49', '46.5', '']);
  assert.deepEqual(sorted(['b', '', 'A-010', 'A-002', 'a']), ['a', 'A-002', 'A-010', 'b', '']);
});

test('dates sort by time, written day first, month and year, or year alone', () => {
  const sorted = (cells) => [...cells].sort(compareCells);
  assert.deepEqual(
    sorted(['1945', '01/02/1939', '04/1928', '', '1931', '15/10/1931', '12.03.1925 — 1930', '01/06/1938']),
    ['12.03.1925 — 1930', '04/1928', '1931', '15/10/1931', '01/06/1938', '01/02/1939', '1945', ''],
  );
  assert.deepEqual(sorted(['2026-09-13', '2026-01-02', '2025-12-31']), ['2025-12-31', '2026-01-02', '2026-09-13']);
});

test('the build writes the table page and the Library shows its first five records', async () => {
  const { out, run } = await buildFixtures();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const index = await readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(index, /<caption>First 5 of 7 records<\/caption>/);
  assert.match(await readFile(path.join(out, 'table', '5.03.html'), 'utf8'), /<p class="count">7 records<\/p>/);
});

test('the real Luce newsreel table has 172 records', { skip: !existsSync(LUCE) && 'the research folder is not here' }, async () => {
  const { columns, rows } = parseCsv(await readFile(LUCE, 'utf8'));
  assert.equal(rows.length, 172);
  assert.equal(columns.length, 15);
  assert.ok(rows.every((cells) => cells.length === columns.length));
  assert.ok(columns.includes('summary_from_catalogue'));
});
