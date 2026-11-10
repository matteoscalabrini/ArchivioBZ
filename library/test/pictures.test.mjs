import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import pictures, { convert } from '../steps/10-pictures.mjs';
import { FIXTURES, cleanRoot, tempDir } from './helpers.mjs';

const HELD = path.join(FIXTURES, 'research_notes', 'Inv A', 'files', '05_x');
const ORIGINAL = '/source/research_notes/Inv%20A/files/05_x/';

// The pictures step on the library at `root`, with the ctx build.mjs gives it.
async function runStep(root) {
  const lib = await loadLibrary(root);
  const out = await tempDir('library-out-');
  const ctx = {
    root,
    out,
    lib,
    options: { check: false, present: false },
    problems: lib.problems,
    write: async (relPath, content) => {
      await mkdir(path.dirname(path.join(out, relPath)), { recursive: true });
      await writeFile(path.join(out, relPath), content);
    },
    copyFile: async (abs, relPath) => {
      await mkdir(path.dirname(path.join(out, relPath)), { recursive: true });
      await copyFile(abs, path.join(out, relPath));
    },
    sourceUrl: (abs) => sourceUrl(root, abs),
  };
  const before = lib.problems.length;
  await pictures(ctx);
  return { out, problems: lib.problems.slice(before), entry: (no) => lib.entries.find((e) => e.no === no) };
}

let first;
const fixtures = () => (first ??= cleanRoot().then(runStep));

// Width, height and format of an image file, as sips reads it.
function probe(file) {
  const text = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', file], { encoding: 'utf8' });
  const get = (key) => new RegExp(`${key}: (\\S+)`).exec(text)[1];
  return { w: Number(get('pixelWidth')), h: Number(get('pixelHeight')), format: get('format') };
}

const mtimes = async (dir) =>
  new Map(await Promise.all((await readdir(dir)).map(async (name) => [name, (await stat(path.join(dir, name))).mtimeMs])));

test('a jpg wider than 1600 is scaled to 1600', async () => {
  const { out, entry } = await fixtures();
  const [wide] = entry('5.01').pictures;
  assert.deepEqual(wide, {
    src: 'img/5.01-1.jpg',
    w: 1600,
    h: 960,
    caption: 'A picture wider than 1600 pixels.',
    original: `${ORIGINAL}wide.jpg`,
  });
  assert.deepEqual(probe(path.join(out, wide.src)), { w: 1600, h: 960, format: 'jpeg' });
});

test('a small png becomes a jpg of the same size', async () => {
  const { out, entry } = await fixtures();
  const small = entry('5.01').pictures[1];
  assert.deepEqual(small, { src: 'img/5.01-2.jpg', w: 40, h: 30, caption: 'A small picture.', original: `${ORIGINAL}small.png` });
  assert.deepEqual(probe(path.join(out, small.src)), { w: 40, h: 30, format: 'jpeg' });
  assert.equal(entry('5.01').pictures.length, 2, 'the row\'s file, not an image, makes no picture');
});

test('a picture held in library/content links its original there', async () => {
  const { entry } = await fixtures();
  assert.deepEqual(entry('0.01').pictures, [{ src: 'img/0.01-1.jpg', w: 40, h: 30, caption: '', original: '/source/library/content/cover.png' }]);
});

test('a pdf-only row gets its first page', async () => {
  const { out, entry } = await fixtures();
  const pages = entry('5.02').pictures;
  assert.equal(pages.length, 1);
  const [page] = pages;
  assert.equal(page.src, 'img/5.02-1.jpg');
  assert.equal(page.caption, 'First page');
  assert.equal(page.original, `${ORIGINAL}page.pdf`);
  assert.equal(page.h, 1600, 'a portrait page is 1600 high');
  assert.ok(page.w > 1100 && page.w < 1160, `width ${page.w} keeps the page's 298:420`);
  assert.deepEqual(probe(path.join(out, page.src)), { w: page.w, h: page.h, format: 'jpeg' });
});

test('a second build converts nothing', async () => {
  const root = await cleanRoot();
  const cache = path.join(root, 'library', '.cache', 'img');
  const once = await runStep(root);
  const converted = await mtimes(cache);
  assert.equal(converted.size, 4, 'three images and one first page');

  const twice = await runStep(root);
  assert.deepEqual(await mtimes(cache), converted);
  for (const no of ['0.01', '5.01', '5.02']) {
    assert.deepEqual(twice.entry(no).pictures, once.entry(no).pictures);
    for (const picture of twice.entry(no).pictures) {
      assert.deepEqual(await readFile(path.join(twice.out, picture.src)), await readFile(path.join(once.out, picture.src)));
    }
  }
});

test('a row with nothing gets [] and one warning naming its number', async () => {
  const { problems, entry } = await fixtures();
  assert.deepEqual(entry('12.01').pictures, []);
  assert.deepEqual(
    problems.filter((p) => p.message.includes('12.01')),
    [{ level: 'warn', where: 'research_notes/Inv A/files/12_refs/entries.json', message: 'row 12.01: no picture' }],
  );
  for (const no of ['5.00', '5.03']) {
    assert.deepEqual(entry(no).pictures, [], `${no} has nothing to show`);
    assert.ok(!problems.some((p) => p.message.includes(no)), `${no} is Notes or Table: no warning`);
  }
});

test('a file named with spaces and ß converts', async () => {
  const dest = path.join(await tempDir("pictures ß '"), "Teßmann '60 scaled.jpg");
  assert.deepEqual(await convert(path.join(HELD, "Teßmann '60.jpg"), dest), { w: 120, h: 80 });
  assert.deepEqual(probe(dest), { w: 120, h: 80, format: 'jpeg' });
});

test('a transparent png comes out on white', async () => {
  const dir = await tempDir('pictures-alpha-');
  const png = path.join(dir, 'clear.png');
  await writeFile(png, rgbaPng(8, 4, (x) => [0, 0, 0, x < 4 ? 0 : 255]));
  const jpg = path.join(dir, 'clear.jpg');
  assert.deepEqual(await convert(png, jpg), { w: 8, h: 4 });
  const bmp = path.join(dir, 'clear.bmp');
  execFileSync('sips', ['-s', 'format', 'bmp', jpg, '--out', bmp], { stdio: 'ignore' });
  const [clear, black] = [pixel(await readFile(bmp), 1, 2), pixel(await readFile(bmp), 6, 2)];
  assert.ok(clear.every((v) => v > 245), `transparent became ${clear}, not white`);
  assert.ok(black.every((v) => v < 10), `opaque black became ${black}`);
});

test('a file that cannot be converted is a warning naming row and file; the rest still converts', async () => {
  const root = await cleanRoot();
  await writeFile(path.join(root, 'research_notes', 'Inv A', 'files', '05_x', 'small.png'), 'not a picture');
  const { problems, entry } = await runStep(root);
  assert.deepEqual(entry('5.01').pictures.map((p) => p.src), ['img/5.01-1.jpg']);
  assert.equal(entry('5.02').pictures.length, 1);
  const failed = problems.filter((p) => p.message.includes('5.01'));
  assert.equal(failed.length, 1);
  assert.equal(failed[0].level, 'warn');
  assert.equal(failed[0].where, 'research_notes/Inv A/files/05_x/entries.json');
  assert.match(failed[0].message, /^row 5\.01: no picture from "small\.png"/);
});

// An 8-bit RGBA PNG, `rgba(x, y)` per pixel.
function rgbaPng(w, h, rgba) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header.set([8, 6], 8); // 8 bits, RGBA
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0); // no filter
    for (let x = 0; x < w; x++) raw.push(...rgba(x, y));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// [r, g, b] at (x, y) of an uncompressed 24- or 32-bit BMP.
function pixel(bmp, x, y) {
  const offset = bmp.readUInt32LE(10);
  const width = bmp.readInt32LE(18);
  const height = bmp.readInt32LE(22);
  const bytes = bmp.readUInt16LE(28) / 8;
  const stride = Math.ceil((width * bytes) / 4) * 4;
  const row = height < 0 ? y : height - 1 - y;
  const at = offset + row * stride + x * bytes;
  return [bmp[at + 2], bmp[at + 1], bmp[at]];
}
