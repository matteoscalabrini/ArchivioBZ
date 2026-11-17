import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import { loadLibrary } from '../lib/records.mjs';
import { COLOURS } from '../lib/find.mjs';
import { cleanRoot } from './helpers.mjs';

const entry = (lib, no) => lib.entries.find((e) => e.no === no);
const FIND = 'research_notes/Inv A/files/05_x/find.json';
const OURS = /(find|colours|names|glossary)\.json$/;

test('find.json is attached to its rows; a row without one gets empty lists', async () => {
  const lib = await loadLibrary(await cleanRoot());
  assert.deepEqual(entry(lib, '5.01').find, { on: ['PONTE DRUSO'], shows: ['a bridge with eagles on pylons'], colours: ['monochrome'], names: ['Drususbrücke'] });
  assert.deepEqual(entry(lib, '5.02').find, { on: [], shows: [], colours: [], names: [] });
  assert.deepEqual(lib.colours.red, ['red', 'rosso', 'rot']);
  assert.deepEqual(lib.names[0], ['Bolzano', 'Bozen']);
  assert.deepEqual(lib.glossary[0], ['eagle', 'aquila', 'Adler']);
  assert.deepEqual(lib.problems.filter((p) => OURS.test(p.where)), []);
});

test('the colours a row may have', () => {
  assert.deepEqual(COLOURS, ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey', 'gold', 'silver', 'monochrome']);
});

test('faults in find.json are errors that name the row', async () => {
  for (const [json, wanted] of [
    ['{', /unparseable JSON/],
    ['[]', /expected an object/],
    ['{"9.99": {}}', /row 9\.99 is not in this folder's entries\.json/],
    ['{"5.01": {"colors": ["red"]}}', /row 5\.01: unknown field "colors"/],
    ['{"5.01": {"on": "PONTE"}}', /row 5\.01: on is not a list of words/],
    ['{"5.01": {"on": ["", "x"]}}', /row 5\.01: on is not a list of words/],
    ['{"5.01": {"colours": ["crimson"]}}', /row 5\.01: unknown colour "crimson"/],
  ]) {
    const root = await cleanRoot();
    await writeFile(path.join(root, FIND), json);
    const { problems } = await loadLibrary(root);
    assert.ok(problems.some((p) => p.level === 'error' && /05_x\/find\.json$/.test(p.where) && wanted.test(p.message)), `${json}: ${JSON.stringify(problems)}`);
  }
});

test('rows with a picture and no entry: one warning for the folder', async () => {
  const root = await cleanRoot();
  await rm(path.join(root, FIND));
  const warnings = (await loadLibrary(root)).problems.filter((p) => /no entry in find\.json/.test(p.message));
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].level, 'warn');
  assert.equal(warnings[0].message, 'with a picture and no entry in find.json: 5.01');
});

test('faults in the shared lists are errors; a missing list is a warning', async () => {
  for (const [name, json, wanted] of [
    ['colours.json', '{"crimson": ["x"]}', /unknown colour "crimson"/],
    ['colours.json', '{"red": "rosso"}', /red is not a list of words/],
    ['names.json', '[["Bolzano"]]', /set 1 has fewer than two names/],
    ['glossary.json', '{"a": 1}', /expected a list of sets/],
    ['glossary.json', '[["eagle", 7]]', /set 1 is not a list of words/],
  ]) {
    const root = await cleanRoot();
    await writeFile(path.join(root, 'library/content', name), json);
    const { problems } = await loadLibrary(root);
    assert.ok(problems.some((p) => p.level === 'error' && p.where.endsWith(name) && wanted.test(p.message)), `${name} ${json}: ${JSON.stringify(problems)}`);
  }
  const root = await cleanRoot();
  await rm(path.join(root, 'library/content/glossary.json'));
  const lib = await loadLibrary(root);
  assert.deepEqual(lib.glossary, []);
  assert.ok(lib.problems.some((p) => p.level === 'warn' && p.where.endsWith('glossary.json')));
});
