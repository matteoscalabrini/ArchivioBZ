// What the two functions load, read from their imports: every package they reach must be one of
// package.json's dependencies, since an install for the cloud may leave the devDependencies out
// and then the public site would fail as it loads. (mammoth, a devDependency, was reached through
// lib/longread.mjs until About's Markdown moved to lib/markdown.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { dependencies } = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const IMPORT = /\b(?:import|export)\s[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

// Every file of the repository reached from `entry` by its imports, and every package named.
function reached(entry) {
  const files = new Set();
  const packages = new Set();
  const visit = (file) => {
    if (files.has(file)) return;
    files.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (spec.startsWith('.')) visit(path.resolve(path.dirname(file), spec));
      else if (!spec.startsWith('node:') && !builtinModules.includes(spec)) packages.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
    }
  };
  visit(path.join(REPO, entry));
  return { files: [...files].map((f) => path.relative(REPO, f)), packages: [...packages].sort() };
}

for (const entry of ['api/site.mjs', 'api/edit.mjs']) {
  test(`${entry} loads only the runtime dependencies`, () => {
    const { files, packages } = reached(entry);
    assert.ok(files.includes('library/cloud/render.mjs'), 'the pages are drawn in the function');
    assert.ok(!files.includes('library/lib/longread.mjs'), 'longread.mjs loads mammoth');
    assert.deepEqual(packages.filter((name) => !Object.hasOwn(dependencies, name)), []);
  });
}

// ＋ picture: sharp (a native image library) and @vercel/blob are the edit function's
// alone. handlers.mjs is given the picture stores and never imports them, so the public site's
// function, which every visit runs, carries neither.
test('api/site.mjs reaches neither sharp nor @vercel/blob; api/edit.mjs reaches both, as runtime dependencies', () => {
  const site = reached('api/site.mjs');
  assert.ok(!site.files.includes('library/cloud/pictures.mjs'));
  assert.deepEqual(site.packages.filter((name) => ['sharp', '@vercel/blob'].includes(name)), []);
  const edit = reached('api/edit.mjs');
  assert.ok(edit.files.includes('library/cloud/pictures.mjs'));
  for (const name of ['sharp', '@vercel/blob']) {
    assert.ok(edit.packages.includes(name), name);
    assert.ok(Object.hasOwn(dependencies, name), `${name} is a runtime dependency`);
  }
});
