import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadLibrary } from '../lib/records.mjs';
import { localMedia, plan } from '../db/media.mjs';
import { tables } from '../db/tables.mjs';
import { cleanRoot } from './helpers.mjs';

const file = (p, size, mtimeMs = 1000) => ({ path: p, size, mtimeMs });
const blob = (pathname, size, uploadedAt = 2000) => [pathname, { pathname, size, uploadedAt: new Date(uploadedAt), url: `https://store/${pathname}` }];

test('the plan uploads what Blob lacks, what changed size and what changed after its upload, and deletes nothing', () => {
  const local = [file('a.pdf', 10), file('b.jpg', 20), file('c.jpg', 30), file('d.jpg', 40, 5000)];
  const remote = new Map([blob('b.jpg', 20), blob('c.jpg', 31), blob('d.jpg', 40), blob('gone.pdf', 50)]);
  const { upload, same, orphaned } = plan(local, remote);
  assert.deepEqual(upload.map((f) => f.path), ['a.pdf', 'c.jpg', 'd.jpg']);
  assert.deepEqual(same.map((f) => f.path), ['b.jpg']);
  assert.deepEqual(orphaned, ['gone.pdf'], 'on Blob, no longer on disk: reported, kept');
});

test('the media are the files git ignores in the research folders, nothing tracked and no .DS_Store', async () => {
  const root = await cleanRoot();
  const folder = path.join(root, 'research_notes', 'Inv A', 'files', '05_x');
  await writeFile(path.join(root, '.gitignore'), 'research_notes/**/*.pdf\nresearch_notes/**/*.png\n.DS_Store\n');
  await writeFile(path.join(folder, '.DS_Store'), 'x');
  await mkdir(path.join(root, 'elsewhere'));
  await writeFile(path.join(root, 'elsewhere', 'other.pdf'), 'x');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  const media = await localMedia(root);
  assert.deepEqual(media.map((m) => m.path).sort(), ['research_notes/Inv A/files/05_x/page.pdf', 'research_notes/Inv A/files/05_x/small.png']);
  assert.ok(media.every((m) => m.size > 0 && m.mtimeMs > 0));
});

test('the tables hold every row with repository paths, the links to stored media, and the vocabularies', async () => {
  const root = await cleanRoot();
  const lib = await loadLibrary(root);
  const stored = [{ path: 'research_notes/Inv A/files/05_x/page.pdf' }, { path: 'research_notes/Inv A/files/05_x/small.png' }];
  const t = tables(lib, root, stored, { kinds: { press: { label: 'Press', types: ['Newspaper page'] } } });
  assert.equal(t.entries.length, lib.entries.length);
  const page = t.entries.find((e) => e.no === '5.02');
  assert.equal(page.file, 'research_notes/Inv A/files/05_x/page.pdf');
  assert.equal(page.folder, 'research_notes/Inv A/files/05_x');
  assert.equal(page.source_url, 'https://example.org/az-1931');
  assert.equal(page.confidence, 'read');
  assert.equal(page.record.dir, undefined, 'no absolute paths of this machine');
  assert.doesNotMatch(JSON.stringify(t), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(t.entryMedia.map(({ no, path: p, role, position }) => [no, p, role, position]).sort(), [
    ['5.01', 'research_notes/Inv A/files/05_x/small.png', 'image', 2],
    ['5.02', 'research_notes/Inv A/files/05_x/page.pdf', 'file', 1],
  ], 'only files that are stored');
  assert.ok(t.keywords.some((k) => k.id === 'ponte-druso' && k.label));
  assert.ok(t.places.some((p) => p.id === 'ponte-druso' && typeof p.lat === 'number'));
  assert.deepEqual(t.kinds, [{ id: 'press', label: 'Press', types: ['Newspaper page'] }]);
});
