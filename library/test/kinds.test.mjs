import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { rm, writeFile } from 'node:fs/promises';
import { readKinds, kindOf } from '../lib/kinds.mjs';
import { cleanRoot } from './helpers.mjs';

const file = (root) => path.join(root, 'library', 'content', 'kinds.json');
const PRESS = { id: 'press', label: 'Press', types: ['Newspaper page', 'Press article'] };

test('readKinds gives the kinds in the order of the file', async () => {
  const { kinds, problems } = await readKinds(await cleanRoot());
  assert.deepEqual(kinds.map((kind) => kind.id), ['press', 'pictures', 'film', 'documents', 'references', 'project']);
  assert.deepEqual(kinds[0], PRESS);
  assert.deepEqual(problems, []);
});

test('kindOf gives the kind that names a type, and null for a type no kind names', () => {
  const kinds = [PRESS, { id: 'pictures', label: 'Pictures', types: ['Photograph'] }];
  assert.equal(kindOf('Press article', kinds), 'press');
  assert.equal(kindOf('Photograph', kinds), 'pictures');
  assert.equal(kindOf('Table', kinds), null);
  assert.equal(kindOf('Table', []), null);
});

test('a type named by two kinds stays with the first and is reported', async () => {
  const root = await cleanRoot();
  await writeFile(file(root), JSON.stringify({
    press: { label: 'Press', types: ['Newspaper page'] },
    pictures: { label: 'Pictures', types: ['Photograph', 'Newspaper page'] },
  }));
  const { kinds, problems } = await readKinds(root);
  assert.equal(kindOf('Newspaper page', kinds), 'press');
  assert.deepEqual(kinds[1].types, ['Photograph']);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].level, 'warn');
  assert.equal(problems[0].where, 'library/content/kinds.json');
  assert.match(problems[0].message, /"Newspaper page".*"press".*"pictures"/);
});

test('a kind that names a type the library does not have is reported', async () => {
  const root = await cleanRoot();
  await writeFile(file(root), JSON.stringify({ press: { label: 'Press', types: ['Newspaper page', 'Newspapr page'] } }));
  const { kinds, problems } = await readKinds(root);
  assert.deepEqual(kinds[0].types, ['Newspaper page', 'Newspapr page']);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].level, 'warn');
  assert.match(problems[0].message, /"press".*"Newspapr page"/);
});

test('a library without kinds.json has no kinds and no problem', async () => {
  const root = await cleanRoot();
  await rm(file(root));
  assert.deepEqual(await readKinds(root), { kinds: [], problems: [] });
});

test('a kinds.json that cannot be read is an error naming the file', async () => {
  const root = await cleanRoot();
  await writeFile(file(root), '{ "press": ');
  const { kinds, problems } = await readKinds(root);
  assert.deepEqual(kinds, []);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].level, 'error');
  assert.equal(problems[0].where, 'library/content/kinds.json');
});
