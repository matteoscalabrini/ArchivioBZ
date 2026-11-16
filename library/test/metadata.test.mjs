import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { stripJpeg } from '../lib/metadata.mjs';
import { buildRoot, cleanRoot } from './helpers.mjs';

const segment = (marker, body) => {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
};

// An Exif block as a phone writes one: camera model, orientation and a GPS pointer in IFD0.
function exif({ orientation, little = false }) {
  const tiff = Buffer.alloc(8 + 2 + 3 * 12 + 4);
  const u16 = (value, at) => (little ? tiff.writeUInt16LE(value, at) : tiff.writeUInt16BE(value, at));
  const u32 = (value, at) => (little ? tiff.writeUInt32LE(value, at) : tiff.writeUInt32BE(value, at));
  tiff.write(little ? 'II' : 'MM', 0, 'latin1');
  u16(42, 2);
  u32(8, 4);
  u16(3, 8);
  const entries = [[0x0110, 2, 4], [0x0112, 3, 1], [0x8825, 4, 1]];
  entries.forEach(([tag, type, count], n) => {
    const at = 10 + 12 * n;
    u16(tag, at);
    u16(type, at + 2);
    u32(count, at + 4);
    if (tag === 0x0110) tiff.write('iPh\0', at + 8, 'latin1');
    if (tag === 0x0112) u16(orientation, at + 8);
    if (tag === 0x8825) u32(1234, at + 8);
  });
  return segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]));
}

const SOI = Buffer.from([0xff, 0xd8]);
const JFIF = segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
const XMP = segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS</x:xmpmeta>', 'latin1'));
const ICC = segment(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01colour', 'latin1'));
const COMMENT = segment(0xfe, Buffer.from('taken by someone', 'latin1'));
const SCAN = Buffer.concat([segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd9])]);
const jpeg = (...parts) => Buffer.concat([SOI, ...parts, SCAN]);

// The segments of a JPEG up to its scan, as [marker, body].
function segments(buf) {
  const found = [];
  let at = 2;
  while (buf[at + 1] !== 0xda) {
    const length = buf.readUInt16BE(at + 2);
    found.push([buf[at + 1], buf.subarray(at + 4, at + 2 + length)]);
    at += 2 + length;
  }
  return found;
}

test('a picture loses its Exif, XMP and comments and keeps its colour profile and its image data', () => {
  const out = stripJpeg(jpeg(JFIF, exif({ orientation: 1 }), XMP, ICC, COMMENT));
  assert.deepEqual(segments(out).map(([marker]) => marker), [0xe0, 0xe2], 'JFIF and the ICC profile only');
  assert.ok(out.subarray(out.length - SCAN.length).equals(SCAN), 'the scan is untouched');
  for (const word of ['iPh', 'GPS', 'someone']) assert.equal(out.includes(word), false, word);
});

test('a turned picture keeps only its orientation, in either byte order', () => {
  for (const little of [false, true]) {
    const out = stripJpeg(jpeg(JFIF, exif({ orientation: 6, little }), COMMENT));
    const [, body] = segments(out).find(([marker]) => marker === 0xe1);
    assert.equal(body.subarray(0, 6).toString('latin1'), 'Exif\0\0');
    const tiff = body.subarray(6);
    assert.equal(tiff.readUInt16BE(8), 1, 'one entry');
    assert.deepEqual([tiff.readUInt16BE(10), tiff.readUInt16BE(12), tiff.readUInt32BE(14), tiff.readUInt16BE(18)], [0x0112, 3, 1, 6]);
    assert.equal(out.includes('iPh'), false);
  }
});

test('a picture without metadata comes back the same; what is not a JPEG comes back as null', () => {
  const plain = jpeg(JFIF);
  assert.ok(stripJpeg(plain).equals(plain));
  assert.equal(stripJpeg(Buffer.from('not a picture')), null);
  assert.equal(stripJpeg(Buffer.concat([SOI, JFIF.subarray(0, 3)])), null, 'cut short');
});

test('the build writes no camera, place or comment into any JPEG, even from a phone photograph', async () => {
  const root = await cleanRoot();
  const photo = path.join(root, 'research_notes', 'Inv A', 'files', '05_x', 'wide.jpg');
  const original = await readFile(photo);
  await writeFile(photo, Buffer.concat([original.subarray(0, 2), exif({ orientation: 1 }), COMMENT, original.subarray(2)]));
  const { out, run } = await buildRoot(root);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const pictures = (await readdir(out, { recursive: true })).filter((name) => /\.jpe?g$/i.test(name));
  assert.ok(pictures.includes(path.join('img', '5.01-1.jpg')), pictures.join(', '));
  for (const name of pictures) {
    const buf = await readFile(path.join(out, name));
    for (const word of ['iPh', 'someone']) assert.equal(buf.includes(word), false, `${word} in ${name}`);
    assert.equal(segments(buf).some(([marker]) => marker === 0xe1 || marker === 0xed || marker === 0xfe), false, name);
  }
});
