// ＋ picture (design §6). A picture the author adds in edit mode goes from the browser straight to
// the private store as it is: the original, never deleted and never public. /edit/picture then
// reads it back, makes the site's two JPEGs from it (1600 px and its small one of 220 px, the
// photograph turned upright, no metadata) and puts them into the public store; the page adds them
// to the row with the op add-picture. Here: making the two JPEGs, putting a JPEG where the public
// sees it with the checks every public picture passes, and the two sets of stores handlers.mjs is
// given, the cloud's (two Blob stores, the original sent by the browser after a handshake) and this
// computer's (two folders, the original sent to /edit/original). sharp and @vercel/blob load only
// when they are needed, and handlers.mjs never imports this file: api/edit.mjs gives it the stores,
// so the public site's function (api/site.mjs) carries neither.
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { OpError } from './ops.mjs';
import { stripJpeg } from '../lib/metadata.mjs';

// The kinds of file taken, and the largest original: what the handshake's token allows, and what
// /edit/original takes. HEIC is not taken: sharp's own build cannot read it (an iPhone hands a
// browser a JPEG all the same).
export const TAKEN = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_ORIGINAL = 104857600; // 100 MB
export const NOT_A_PICTURE = 'That file is not a picture the site can take: JPEG, PNG or WebP.';
const NOT_AN_ORIGINAL = 'That is not the name of an original.';
const NOT_TAKEN = 'Only JPEG, PNG and WebP pictures are taken.';

// The build's sizes and quality (steps/10-pictures.mjs makes them with sips at 75).
const LARGE = 1600;
const SMALL = 220;
const QUALITY = 75;
// What sharp says each taken kind is.
const FORMATS = ['jpeg', 'png', 'webp'];

// An original's name in the private store: originals/ and one name, which the page makes from the
// row's id and the time (originals/18.04-mf3k2a.jpg) and the store follows with a random suffix:
// letters, digits, _, - and . only, and not . or .. alone. @vercel/blob puts the name into the
// store's address as it is, where %2e%2e would be a step up as .. is, and # or ? would end the path.
const isOriginal = (pathname) => typeof pathname === 'string' && /^originals\/[\w.-]+$/.test(pathname) && !/^originals\/\.\.?$/.test(pathname);
// A row's id as it can stand in a file's name: today's numbers (18.04) and r1, r2… Checked against
// the draft by handlers.mjs; here, so that no other id can ever name a file.
const isRowId = (id) => typeof id === 'string' && /^[\w.-]+$/.test(id) && !/^\.\.?$/.test(id);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The two JPEGs of the site made from an original: { large, small }, each { buf, w, h }. The
// photograph is turned as its Exif orientation says, laid on white where it is transparent, fitted
// inside 1600 × 1600 and 220 × 220 and never enlarged, and written at quality 75 with no metadata:
// sharp keeps none unless asked. The original is decoded once, into the large picture's pixels, and
// the small one is made from those, so that an original of 100 MB is held and read once in the
// function. A file sharp cannot read, or reads as another kind than JPEG, PNG or WebP (a GIF, a
// TIFF, an SVG sent under another type), is refused with the sentence. `sharp`: given only by the
// tests.
export async function makePictures(original, { sharp } = {}) {
  sharp ??= (await import('sharp')).default;
  try {
    // failOn 'error': a camera's harmless warning does not refuse a photograph; a file cut short does.
    const { format } = await sharp(original, { failOn: 'error' }).metadata();
    if (!FORMATS.includes(format)) throw new OpError(NOT_A_PICTURE);
    const inside = (side) => [side, side, { fit: 'inside', withoutEnlargement: true }];
    const pixels = await sharp(original, { failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(...inside(LARGE))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = pixels.info;
    const jpeg = async (image) => {
      const { data, info } = await image.jpeg({ quality: QUALITY }).toBuffer({ resolveWithObject: true });
      return { buf: data, w: info.width, h: info.height };
    };
    const raw = () => sharp(pixels.data, { raw: { width, height, channels } });
    return { large: await jpeg(raw()), small: await jpeg(raw().resize(...inside(SMALL))) };
  } catch (error) {
    if (error instanceof OpError) throw error;
    throw new OpError(NOT_A_PICTURE);
  }
}

// Every JPEG put where the public sees it passes this first: stripping its metadata would change
// nothing (lib/metadata.mjs), so no GPS, camera or time goes with it.
function bareOrRefused(buf, pathname) {
  if (!stripJpeg(buf)?.equals(buf)) throw new Error(`${pathname}: the JPEG still carries metadata, so it was not put`);
}

const loadBlob = () => import('@vercel/blob');

// Puts a JPEG into the public Blob store at `pathname` with a random suffix (an address that
// cannot be guessed) and answers its address. It is asked for again with HEAD and its size
// compared with the file's: a script that has finished is not an upload that has (16 Nov 2026,
// "[object Promise]" for 730 files). Used by /edit/picture and by the move-in.
export function publicPut(token, { blob = loadBlob, fetch = (...args) => globalThis.fetch(...args) } = {}) {
  return async (buf, pathname) => {
    bareOrRefused(buf, pathname);
    const { put } = await blob();
    const { url } = await put(pathname, buf, { access: 'public', addRandomSuffix: true, contentType: 'image/jpeg', token });
    const head = await fetch(url, { method: 'HEAD' });
    const held = head.headers.get('content-length');
    if (!head.ok || Number(held) !== buf.length) throw new Error(`${pathname}: uploaded as ${url}, but it holds ${held} bytes, not ${buf.length}`);
    return url;
  };
}

// What both sets of stores answer /edit/picture with: the original at `pathname` read back
// (`read`, null when there is none), its two JPEGs made and put (`put`) as
// pictures/<row id>-<time in base 36>.jpg and …-small.jpg, and the picture for add-picture.
function picturesFrom({ read, put }) {
  return async (id, pathname) => {
    if (!isOriginal(pathname)) throw new OpError(NOT_AN_ORIGINAL);
    if (!isRowId(id)) throw new OpError(`There is no row ${id}.`);
    const original = await read(pathname);
    if (!original) throw new OpError(`There is no original ${pathname}.`);
    const { large, small } = await makePictures(original);
    const name = `pictures/${id}-${Date.now().toString(36)}`;
    const src = await put(large.buf, `${name}.jpg`);
    const smallSrc = await put(small.buf, `${name}-small.jpg`);
    return { src, w: large.w, h: large.h, small: { src: smallSrc, w: small.w, h: small.h } };
  };
}

// The cloud's stores: `originals`, the private store's read-write token (BLOB_READ_WRITE_TOKEN,
// archiviobz-media); `pictures`, the public store's (PICTURES_READ_WRITE_TOKEN,
// archiviobz-pictures). `blob` and `fetch` are @vercel/blob and the HEAD's fetch, given otherwise
// only by the tests.
export function cloudStores({ originals, pictures, blob = loadBlob, fetch } = {}) {
  return {
    // The client-upload handshake of @vercel/blob/client: a token with which the browser puts one
    // original into the private store, under originals/ only, of the three kinds, at most 100 MB,
    // with a random suffix. Nothing is called back once the upload is done (no onUploadCompleted):
    // the page asks for the picture itself. handlers.mjs answers only a logged-in, same-origin
    // request.
    async handshake(body, request) {
      if (!isObject(body) || body.type !== 'blob.generate-client-token' || !isObject(body.payload)) {
        throw new OpError('Only a token for an original is given here.');
      }
      const { handleUpload } = await import('@vercel/blob/client');
      return handleUpload({
        token: originals,
        request,
        body,
        onBeforeGenerateToken: async (pathname) => {
          if (!isOriginal(pathname)) throw new OpError(NOT_AN_ORIGINAL);
          return { allowedContentTypes: TAKEN, maximumSizeInBytes: MAX_ORIGINAL, addRandomSuffix: true };
        },
      });
    },
    // Read by its name with the private store's token: never at an address the request names.
    picture: picturesFrom({
      async read(pathname) {
        const { get } = await blob();
        const found = await get(pathname, { access: 'private', token: originals });
        if (!found || found.statusCode !== 200) return null;
        return Buffer.from(await new Response(found.stream).arrayBuffer());
      },
      put: publicPut(pictures, { blob, fetch }),
    }),
  };
}

// 'a-mf3k2a.png' -> 'a-mf3k2a-<suffix>.png', as Blob's addRandomSuffix names a file.
function withSuffix(name, suffix) {
  const ext = path.extname(name);
  return `${name.slice(0, name.length - ext.length)}-${suffix}${ext}`;
}
const suffix = () => randomBytes(8).toString('hex');

// This computer's stand-in for the two stores (tools/dev.mjs): the originals in the folder
// `originals`, which the local server never serves, and the pictures in `pictures`, which it
// serves at `base` (/dev-img/), each named as the store would name it. The page sends an original
// to /edit/original, which hands it here (`receive`), since there is no store to send it to.
export function localStores({ originals, pictures, base = '/dev-img/' }) {
  const inFolder = (dir, name) => {
    const file = path.resolve(dir, name);
    if (path.dirname(file) !== path.resolve(dir)) throw new OpError(NOT_AN_ORIGINAL);
    return file;
  };
  return {
    largest: MAX_ORIGINAL, // what /edit/original reads at most
    async receive({ pathname, type, bytes }) {
      if (!isOriginal(pathname)) throw new OpError(NOT_AN_ORIGINAL);
      if (!TAKEN.includes(type)) throw new OpError(NOT_TAKEN);
      if (bytes.length > MAX_ORIGINAL) throw new OpError('The picture is larger than 100 MB.');
      const name = withSuffix(pathname.slice('originals/'.length), suffix());
      await mkdir(originals, { recursive: true });
      await writeFile(inFolder(originals, name), bytes, { flag: 'wx' }); // never over another
      return { pathname: `originals/${name}` };
    },
    picture: picturesFrom({
      async read(pathname) {
        try {
          return await readFile(inFolder(originals, pathname.slice('originals/'.length)));
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      },
      async put(buf, pathname) {
        bareOrRefused(buf, pathname);
        const name = withSuffix(path.posix.basename(pathname), suffix());
        const file = inFolder(pictures, name);
        await mkdir(pictures, { recursive: true });
        await writeFile(file, buf, { flag: 'wx' });
        const held = (await stat(file)).size;
        if (held !== buf.length) throw new Error(`${pathname}: written as ${file}, but it holds ${held} bytes, not ${buf.length}`);
        return `${base}${name}`;
      },
    }),
  };
}
