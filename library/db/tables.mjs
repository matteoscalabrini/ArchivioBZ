// The rows of the database, made from the library's records (lib/records.mjs) and the media
// held in Blob. The records in git stay the source: the database is rebuilt from them by
// db/sync.mjs and is never edited by hand.
import path from 'node:path';

// tables(lib, root, stored, {kinds}) -> {entries, entryMedia, keywords, places, kinds}.
// stored: [{path}] of the media in Blob; a row's file or picture is linked only when stored.
export function tables(lib, root, stored, { kinds = {} } = {}) {
  const rel = (abs) => path.relative(root, abs).split(path.sep).join('/');
  const have = new Set(stored.map((media) => media.path));
  const entries = [];
  const entryMedia = [];
  for (const entry of lib.entries) {
    const { dir, abs, section, images = [], ...written } = entry;
    const record = images.length ? { ...written, images: images.map(({ abs: _, ...image }) => image) } : written;
    const file = abs ? rel(abs) : null;
    entries.push({
      no: entry.no,
      section: Number(entry.no.split('.')[0]),
      title: entry.title,
      type: entry.type,
      date: entry.date ?? null,
      year: entry.year ?? null,
      keywords: entry.keywords ?? [],
      place: entry.place ?? null,
      confidence: entry.confidence?.level ?? null,
      rights: entry.rights ?? null,
      holder: entry.holder ?? null,
      creator: entry.creator ?? null,
      source_url: entry.source?.url ?? null,
      file,
      folder: rel(dir),
      record,
    });
    if (file && have.has(file)) entryMedia.push({ no: entry.no, path: file, role: 'file', position: 1, caption: null });
    images.forEach((image, n) => {
      const where = rel(image.abs);
      if (have.has(where)) entryMedia.push({ no: entry.no, path: where, role: 'image', position: n + 1, caption: image.caption ?? null });
    });
  }
  const number = (value) => (typeof value === 'number' ? value : null);
  return {
    entries,
    entryMedia,
    keywords: Object.entries(lib.keywords ?? {}).map(([id, data]) => ({ id, label: data.label ?? id, data })),
    places: Object.entries(lib.places ?? {}).map(([id, data]) => ({ id, name: data.name ?? id, lat: number(data.lat), lon: number(data.lon), data })),
    kinds: Object.entries(kinds).map(([id, kind]) => ({ id, label: kind.label, types: kind.types ?? [] })),
  };
}
