// ＋ picture (design §6): the site's two JPEGs made from an original with sharp, and the two ways
// an original and its JPEGs are kept, the stores of the cloud and the folders of the local server.
// sharp makes its own inputs here; nothing reaches the network (the cloud's store functions are
// stand-ins that record what they were asked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { makePictures, cloudStores, localStores, publicPut, NOT_A_PICTURE, TAKEN, MAX_ORIGINAL } from '../cloud/pictures.mjs';
import { OpError } from '../cloud/ops.mjs';
import { stripJpeg } from '../lib/metadata.mjs';
import { tempDir } from './helpers.mjs';

// The markers of a JPEG's segments before its scan: e1 is Exif or XMP, e2 a colour profile, ed IPTC.
function markers(buf) {
  const found = [];
  let at = 2;
  while (at + 4 <= buf.length && buf[at] === 0xff && buf[at + 1] !== 0xda) {
    found.push(buf[at + 1].toString(16));
    at += 2 + buf.readUInt16BE(at + 2);
  }
  return found;
}

// A photograph as a phone hands it over: 3000 × 2000 pixels stored on their side with the
// orientation 6 (turn a quarter clockwise to show), the camera and a GPS position in its Exif, the
// position again in XMP, and a colour profile.
const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
  + '<rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="46,30N"/></rdf:RDF></x:xmpmeta>';
const phonePhoto = () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#808080' } })
  .withMetadata({ orientation: 6 })
  .withExif({ IFD0: { Make: 'Phone', Model: 'Camera' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '46/1 30/1 0/1' } })
  .withXmp(XMP)
  .withIccProfile('p3')
  .jpeg()
  .toBuffer();

test('a photograph turned by its orientation comes out upright, 1067 × 1600 and 147 × 220, with no metadata at all', async () => {
  const input = await phonePhoto();
  const given = await sharp(input).metadata();
  assert.deepEqual([given.width, given.height, given.orientation], [3000, 2000, 6], 'the input is stored on its side');
  assert.ok(given.exif.includes(Buffer.from([0x25, 0x88])) && given.xmp && given.icc, 'the input carries a GPS position, XMP and a colour profile');
  const { large, small } = await makePictures(input);
  assert.deepEqual([large.w, large.h], [1067, 1600]);
  assert.deepEqual([small.w, small.h], [147, 220]);
  for (const [name, out] of [['large', large], ['small', small]]) {
    const meta = await sharp(out.buf).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', out.w, out.h], name);
    assert.equal(meta.exif, undefined, `${name}: no Exif, so no GPS`);
    assert.equal(meta.xmp, undefined, `${name}: no XMP`);
    assert.equal(meta.icc, undefined, `${name}: no colour profile`);
    assert.equal(meta.orientation, undefined, `${name}: upright as it is, nothing left to turn`);
    assert.deepEqual(markers(out.buf).filter((m) => ['e1', 'e2', 'ed', 'fe'].includes(m)), [], `${name}: no Exif, XMP, ICC, IPTC or comment segment`);
    assert.ok(stripJpeg(out.buf).equals(out.buf), `${name}: stripping would change nothing`);
  }
});

// sharp as makePictures is given it, counting the pictures it writes out from a pipeline that reads
// `original`: each is a decoding of the original whole (a clone decodes it again).
function countingSharp(original) {
  let decodes = 0;
  const watch = (instance) => {
    const toBuffer = instance.toBuffer.bind(instance);
    instance.toBuffer = (...args) => {
      decodes += 1;
      return toBuffer(...args);
    };
    const clone = instance.clone.bind(instance);
    instance.clone = () => watch(clone());
    return instance;
  };
  const counted = (input, options) => (input === original ? watch(sharp(input, options)) : sharp(input, options));
  return { sharp: counted, decodes: () => decodes };
}

test('the original is decoded once for both pictures, the small one made from the large one\'s pixels', async () => {
  const input = await phonePhoto();
  const counting = countingSharp(input);
  const { large, small } = await makePictures(input, { sharp: counting.sharp });
  assert.equal(counting.decodes(), 1);
  assert.deepEqual([large.w, large.h, small.w, small.h], [1067, 1600, 147, 220]);
  for (const out of [large, small]) assert.ok(stripJpeg(out.buf).equals(out.buf));
  const grey = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#777' } }).greyscale().png().toBuffer();
  const fromGrey = await makePictures(grey);
  assert.deepEqual([fromGrey.large.w, fromGrey.large.h, fromGrey.small.w, fromGrey.small.h], [1600, 800, 220, 110], 'a picture of one channel');
  assert.equal((await sharp(fromGrey.small.buf).metadata()).format, 'jpeg');
});

test('a picture smaller than 1600 px keeps its size: never enlarged', async () => {
  const input = await sharp({ create: { width: 500, height: 300, channels: 3, background: '#336699' } }).png().toBuffer();
  const { large, small } = await makePictures(input);
  assert.deepEqual([large.w, large.h], [500, 300]);
  assert.deepEqual([small.w, small.h], [220, 132]);
  const tiny = await makePictures(await sharp({ create: { width: 100, height: 60, channels: 3, background: '#000' } }).webp().toBuffer());
  assert.deepEqual([tiny.large.w, tiny.large.h, tiny.small.w, tiny.small.h], [100, 60, 100, 60], 'the small one is not enlarged either');
});

test('a PNG with transparency comes out a JPEG, white where it was clear', async () => {
  const red = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const input = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: red, left: 0, top: 0 }]).png().toBuffer();
  const { large } = await makePictures(input);
  const meta = await sharp(large.buf).metadata();
  assert.deepEqual([meta.format, meta.hasAlpha], ['jpeg', false]);
  const { data, info } = await sharp(large.buf).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  const near = (got, want) => got.every((v, i) => Math.abs(v - want[i]) <= 12);
  assert.ok(near(pixel(32, 10), [255, 255, 255]), `the clear half is white, not ${pixel(32, 10)}`);
  assert.ok(near(pixel(6, 10), [255, 0, 0]), `the red half stays red, not ${pixel(6, 10)}`);
});

test('a text file is refused with the sentence, and so is a picture of a kind not taken', async () => {
  const refused = (e) => e instanceof OpError && e.message === NOT_A_PICTURE;
  assert.equal(NOT_A_PICTURE, 'That file is not a picture the site can take: JPEG, PNG or WebP.');
  await assert.rejects(makePictures(Buffer.from('Notes on the Monument, not a picture.\n')), refused);
  await assert.rejects(makePictures(Buffer.alloc(0)), refused);
  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
  await assert.rejects(makePictures(gif), refused, 'sharp reads a GIF, but the site takes JPEG, PNG and WebP');
  const cut = (await phonePhoto()).subarray(0, 4000);
  await assert.rejects(makePictures(cut), refused, 'a JPEG cut short');
});

// The client-upload handshake (@vercel/blob/client's handleUpload): a token for one original,
// made here from a stand-in read-write token, with no request to Vercel.
const ORIGINALS_TOKEN = 'vercel_blob_rw_privatestore_secretone';
const PICTURES_TOKEN = 'vercel_blob_rw_publicstore_secrettwo';
const asked = (pathname, type = 'blob.generate-client-token') => ({ type, payload: { pathname, clientPayload: null, multipart: false } });
const anyRequest = new Request('https://a.test/api/edit?route=upload', { method: 'POST' });
// Names an address reads otherwise than as one name: @vercel/blob pastes the name into the store's
// address as it is, and %2e%2e is a step up there as .. is; # and ? end the path.
const ODD_NAMES = ['originals/%2e%2e', 'originals/.%2E', 'originals/%2E%2E', 'originals/a%2fb.jpg', 'originals/a#b.jpg', 'originals/a?b.jpg', 'originals/a b.jpg', 'originals/\\..'];

test('the handshake gives a token for a name under originals/ only: the three types, 100 MB, a random suffix, no callback', async () => {
  assert.deepEqual(TAKEN, ['image/jpeg', 'image/png', 'image/webp']);
  assert.equal(MAX_ORIGINAL, 104857600);
  const store = cloudStores({ originals: ORIGINALS_TOKEN, pictures: PICTURES_TOKEN });
  const answer = await store.handshake(asked('originals/r1-mf3k2a.jpg'), anyRequest);
  assert.equal(answer.type, 'blob.generate-client-token');
  assert.match(answer.clientToken, /^vercel_blob_client_privatestore_/, 'a token for the private store');
  const payload = getPayloadFromClientToken(answer.clientToken);
  assert.equal(payload.pathname, 'originals/r1-mf3k2a.jpg');
  assert.deepEqual(payload.allowedContentTypes, TAKEN);
  assert.equal(payload.maximumSizeInBytes, MAX_ORIGINAL);
  assert.equal(payload.addRandomSuffix, true);
  assert.equal(payload.onUploadCompleted, undefined, 'no onUploadCompleted: Vercel calls nothing back');
  assert.equal(payload.allowOverwrite, undefined, 'an original is never written over');
  for (const pathname of ['pictures/x.jpg', '../x', 'originals/a/b.jpg', 'originals/', 'originals/..', 'x/originals/a.jpg', '', null, 7, ...ODD_NAMES]) {
    await assert.rejects(store.handshake(asked(pathname), anyRequest), OpError, `the name ${JSON.stringify(pathname)}`);
  }
  await assert.rejects(store.handshake(asked('originals/a.jpg', 'blob.upload-completed'), anyRequest), OpError, 'only a token is asked for');
  await assert.rejects(store.handshake(null, anyRequest), OpError);
});

// The cloud's two stores, their functions stood in for: `get` and `put` of @vercel/blob, and
// fetch for the HEAD that checks an upload's size.
function standIns({ original = null, heldSize = null } = {}) {
  const calls = [];
  const kept = new Map();
  const blob = {
    async get(pathname, options) {
      calls.push(['get', pathname, options]);
      return original ? { statusCode: 200, stream: new Response(original).body, blob: { size: original.length } } : null;
    },
    async put(pathname, body, options) {
      calls.push(['put', pathname, options]);
      const url = `https://publicstore.public.blob.vercel-storage.com/${pathname.replace(/\.jpg$/, '-R4nd0m.jpg')}`;
      kept.set(url, Buffer.from(body));
      return { url, pathname };
    },
  };
  const fetch = async (url, options) => {
    calls.push(['fetch', url, options?.method]);
    const size = heldSize ?? kept.get(url)?.length;
    return new Response(null, { status: size == null ? 404 : 200, headers: size == null ? {} : { 'content-length': String(size) } });
  };
  return { calls, kept, blob: async () => blob, fetch };
}

test('in the cloud, the original is read from the private store by its name, and each JPEG put in the public store, checked', async () => {
  const original = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#aa8844' } }).jpeg().toBuffer();
  const stand = standIns({ original });
  const store = cloudStores({ originals: ORIGINALS_TOKEN, pictures: PICTURES_TOKEN, blob: stand.blob, fetch: stand.fetch });
  const picture = await store.picture('18.04', 'originals/18.04-mf3k2a-Xy12.jpg');
  const [get, putLarge, headLarge, putSmall, headSmall] = stand.calls;
  assert.deepEqual(get, ['get', 'originals/18.04-mf3k2a-Xy12.jpg', { access: 'private', token: ORIGINALS_TOKEN }], 'by its name and the token, never by an address');
  assert.match(putLarge[1], /^pictures\/18\.04-[0-9a-z]+\.jpg$/);
  assert.equal(putSmall[1], putLarge[1].replace(/\.jpg$/, '-small.jpg'));
  for (const put of [putLarge, putSmall]) {
    assert.deepEqual(put[2], { access: 'public', addRandomSuffix: true, contentType: 'image/jpeg', token: PICTURES_TOKEN });
  }
  assert.deepEqual([headLarge[2], headSmall[2]], ['HEAD', 'HEAD'], 'each upload asked for again');
  for (const buf of stand.kept.values()) assert.ok(stripJpeg(buf).equals(buf), 'what was put carries no metadata');
  const [largeUrl, smallUrl] = [...stand.kept.keys()];
  assert.deepEqual(picture, { src: largeUrl, w: 1600, h: 800, small: { src: smallUrl, w: 220, h: 110 } });
  assert.equal(stand.calls.length, 5);

  const missing = cloudStores({ originals: ORIGINALS_TOKEN, pictures: PICTURES_TOKEN, ...standIns() });
  await assert.rejects(missing.picture('a', 'originals/a-1.jpg'), (e) => e instanceof OpError && e.message === 'There is no original originals/a-1.jpg.');
  for (const pathname of ['../x', 'pictures/x.jpg', 'originals/a/b.jpg', 'originals/..', null, ...ODD_NAMES]) {
    const refusing = standIns({ original });
    const nowhere = cloudStores({ originals: ORIGINALS_TOKEN, pictures: PICTURES_TOKEN, blob: refusing.blob, fetch: refusing.fetch });
    await assert.rejects(nowhere.picture('a', pathname), OpError, JSON.stringify(pathname));
    assert.equal(refusing.calls.length, 0, `${JSON.stringify(pathname)}: nothing asked of the stores`);
  }
});

test('a JPEG is put in the public store only once stripping would change nothing, and an upload of another size is an error', async () => {
  const bare = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#000' } }).jpeg().toBuffer();
  const withExif = await sharp(bare).withExif({ IFD0: { Make: 'Phone' } }).jpeg().toBuffer();
  const stand = standIns();
  const put = publicPut(PICTURES_TOKEN, { blob: stand.blob, fetch: stand.fetch });
  await assert.rejects(put(withExif, 'pictures/x.jpg'), /metadata/);
  assert.equal(stand.calls.length, 0, 'a JPEG with Exif is never sent');
  const url = await put(bare, 'pictures/x.jpg');
  assert.equal(url, 'https://publicstore.public.blob.vercel-storage.com/pictures/x-R4nd0m.jpg');
  const short = standIns({ heldSize: 7 });
  const cut = publicPut(PICTURES_TOKEN, { blob: short.blob, fetch: short.fetch });
  await assert.rejects(cut(bare, 'pictures/x.jpg'), new RegExp(`holds 7 bytes, not ${bare.length}`));
});

// The local server's stand-in: originals in one folder, never served; the pictures in the folder
// it serves at /dev-img/.
test('on this computer an original is kept as sent in its own folder, and the pictures go to the served one', async () => {
  const dir = await tempDir('local-pictures-');
  const originals = path.join(dir, 'originals');
  const served = path.join(dir, 'img');
  const store = localStores({ originals, pictures: served });
  const photo = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#123456' } }).png().toBuffer();
  const { pathname } = await store.receive({ pathname: 'originals/a-mf3k2a.png', type: 'image/png', bytes: photo });
  assert.match(pathname, /^originals\/a-mf3k2a-[0-9a-f]{16}\.png$/, 'a random suffix, as the store adds one');
  assert.ok((await readFile(path.join(originals, pathname.slice('originals/'.length)))).equals(photo), 'kept as sent');
  const picture = await store.picture('a', pathname);
  assert.match(picture.src, /^\/dev-img\/a-[0-9a-z]+-[0-9a-f]{16}\.jpg$/);
  assert.match(picture.small.src, /^\/dev-img\/a-[0-9a-z]+-small-[0-9a-f]{16}\.jpg$/);
  assert.deepEqual([picture.w, picture.h, picture.small.w, picture.small.h], [900, 600, 220, 147]);
  assert.deepEqual((await readdir(served)).sort(), [picture.src, picture.small.src].map((src) => src.slice('/dev-img/'.length)).sort(), 'the original is not among the served files');
  for (const [pathname, type] of [['originals/a.gif', 'image/gif'], ['originals/a.txt', 'text/plain'], ['pictures/a.png', 'image/png'], ['originals/../a.png', 'image/png'], ['originals/..', 'image/png'],
    ...ODD_NAMES.map((name) => [name, 'image/png'])]) {
    await assert.rejects(store.receive({ pathname, type, bytes: photo }), OpError, `${pathname} as ${type}`);
  }
  await assert.rejects(store.picture('a', 'originals/nothing.png'), (e) => e instanceof OpError && e.message === 'There is no original originals/nothing.png.');
  assert.equal(store.largest, MAX_ORIGINAL);
  assert.equal(store.handshake, undefined, 'no handshake: the page sends the original itself');
});
