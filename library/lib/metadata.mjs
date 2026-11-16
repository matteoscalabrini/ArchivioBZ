// What a picture says about who took it, where and with what: a phone writes the camera, the
// time and the GPS position into the Exif block, and editors add XMP, IPTC and comments. The
// site's pictures carry none of it (steps/90-metadata.mjs).

const SOS = 0xda;
const DROPPED = new Set([0xe1, 0xed, 0xfe]); // APP1 (Exif, XMP), APP13 (IPTC), COM
const ORIENTATION = 0x0112;

// stripJpeg(buf) -> the JPEG without its Exif, XMP, IPTC and comment segments, and with an Exif
// block holding only the orientation when the picture is turned (a phone keeps a portrait
// photograph's pixels on their side and says so there). The colour profile and the image data
// are left as they are. Not a JPEG, or one cut short: null.
export function stripJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const kept = [buf.subarray(0, 2)];
  let orientation = 1;
  let at = 2;
  for (;;) {
    if (at + 4 > buf.length || buf[at] !== 0xff) return null;
    const marker = buf[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (marker === SOS) break;
    const end = at + 2 + buf.readUInt16BE(at + 2);
    if (end > buf.length) return null;
    const body = buf.subarray(at + 4, end);
    if (marker === 0xe1 && body.subarray(0, 6).toString('latin1') === 'Exif\0\0') orientation = orientationOf(body.subarray(6)) ?? orientation;
    if (!DROPPED.has(marker)) kept.push(buf.subarray(at, end));
    at = end;
  }
  if (orientation !== 1) kept.splice(1, 0, orientationBlock(orientation));
  kept.push(buf.subarray(at));
  return Buffer.concat(kept);
}

// jpegOrientation(buf) -> the Exif orientation of a JPEG, 1 to 8; 1 (as stored) when it has none.
// 5 to 8 turn the picture a quarter: it shows with its width and height exchanged.
export function jpegOrientation(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  let at = 2;
  while (at + 4 <= buf.length && buf[at] === 0xff && buf[at + 1] !== SOS) {
    if (buf[at + 1] === 0xff) {
      at += 1;
      continue;
    }
    const end = at + 2 + buf.readUInt16BE(at + 2);
    const body = buf.subarray(at + 4, Math.min(end, buf.length));
    if (buf[at + 1] === 0xe1 && body.subarray(0, 6).toString('latin1') === 'Exif\0\0') return orientationOf(body.subarray(6)) ?? 1;
    at = end;
  }
  return 1;
}

// The orientation in the first directory of a TIFF structure, or null.
function orientationOf(tiff) {
  if (tiff.length < 8) return null;
  const order = tiff.subarray(0, 2).toString('latin1');
  if (order !== 'II' && order !== 'MM') return null;
  const little = order === 'II';
  const u16 = (at) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + 12 * n;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === ORIENTATION) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

// An APP1 segment with an Exif block of one entry: the orientation.
function orientationBlock(orientation) {
  const segment = Buffer.alloc(4 + 6 + 26);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(segment.length - 2, 2);
  segment.write('Exif\0\0MM', 4, 'latin1');
  segment.writeUInt16BE(42, 12);
  segment.writeUInt32BE(8, 14); // the directory follows the header
  segment.writeUInt16BE(1, 18); // one entry
  segment.writeUInt16BE(ORIENTATION, 20);
  segment.writeUInt16BE(3, 22); // SHORT
  segment.writeUInt32BE(1, 24);
  segment.writeUInt16BE(orientation, 28);
  segment.writeUInt32BE(0, 32); // no next directory
  return segment;
}
