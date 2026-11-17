// Loads and checks the library's records: every entries.json beside the material, the keyword
// vocabulary, the places, and what the search reads under the rows (lib/find.mjs). Nothing here throws on bad data; every fault becomes a problem
// naming the file and the row.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { attachFind } from './find.mjs';

export const TYPES = ['Report', 'Notes', 'Story', 'Newspaper page', 'Press article', 'Photograph', 'Postcard',
  'Poster', 'Booklet', 'Book', 'Article', 'Law text', 'Archive guide', 'Table', 'Web page', 'Intervention',
  'Reference', 'Counter-reference', 'Map', 'Film', 'Drawing', 'Object', 'Sound', 'Minutes', 'Magazine', 'Leaflet'];
export const MORE_KINDS = ['read', 'file', 'table', 'map', 'source'];
// The folders, relative to the root, whose files serve.mjs hands out under /source/: a record's
// file, images and local more.target must lie inside one of them for the site to link to it.
export const SOURCE_DIRS = ['research_notes', 'reports', 'library/content'];

const LEVELS = ['read', 'secondary', 'lead'];
const REQUIRED = ['no', 'title', 'type', 'date', 'year', 'keywords', 'confidence'];
const NUMBER = /^\d{1,2}\.\d{2}$/;
const URL_LIKE = /^[a-z][a-z\d+.-]*:/i;
const MAX_KEYWORDS = 5;

export function sourceUrl(root, absPath) {
  const rel = path.relative(path.resolve(root), path.resolve(absPath));
  return '/source/' + rel.split(path.sep).map(encodeURIComponent).join('/');
}

export async function loadLibrary(root) {
  root = path.resolve(root);
  const problems = [];
  const repoPath = (abs) => path.relative(root, abs).split(path.sep).join('/');
  const report = (level, abs, message) => problems.push({ level, where: repoPath(abs), message });
  const servedDirs = SOURCE_DIRS.map((dir) => path.join(root, ...dir.split('/')) + path.sep);
  const served = (abs) => servedDirs.some((dir) => abs.startsWith(dir));
  const SERVED = SOURCE_DIRS.map((dir) => `${dir}/`).join(', ').replace(/, ([^,]*)$/, ' and $1');

  const content = path.join(root, 'library', 'content');
  const keywordsFile = path.join(content, 'keywords.json');
  const placesFile = path.join(content, 'places.json');
  const { keywords, aliases } = readVocabulary(await readObject(keywordsFile, report), keywordsFile, report);
  const places = readPlaces(await readObject(placesFile, report), placesFile, report);

  const files = [...(await findEntryFiles(path.join(root, 'research_notes'))), path.join(content, 'entries.json')];
  const entries = [];
  const firstSeen = new Map(); // row number -> repo path of the file that used it first
  const citing = []; // rows with `sources`, checked once every number is known
  const proposedKeywords = new Map(); // id -> label, for proposed keywords in use
  const proposedPlaces = new Map(); // id -> name, for proposed places in use

  for (const file of files) {
    const data = await readJson(file, report);
    if (data === undefined) continue;
    if (!isObject(data) || !Array.isArray(data.entries)) {
      report('error', file, 'expected an object with an "entries" list');
      continue;
    }
    const dir = path.dirname(file);
    const offeredKeywords = isObject(data.keywords_proposed) ? data.keywords_proposed : {};
    const offeredPlaces = isObject(data.places_proposed) ? data.places_proposed : {};
    const keywordUse = new Map(); // proposed keyword id -> row numbers using it
    const placeUse = new Map();

    for (const [index, record] of data.entries.entries()) {
      if (!isObject(record)) {
        report('error', file, `entry ${index + 1}: not an object`);
        continue;
      }
      const name = isMissing(record.no) ? `entry ${index + 1}` : String(record.no);
      const row = isMissing(record.no) ? name : `row ${name}`;
      const fault = (message) => report('error', file, `${row}: ${message}`);
      const unserved = (what, abs) => {
        if (!served(abs)) report('warn', file, `${row}: ${what} "${repoPath(abs)}" is outside ${SERVED}, so the site cannot link to it`);
      };

      const missing = REQUIRED.filter((field) => isMissing(record[field]));
      if (missing.length) fault(`missing ${missing.join(', ')}`);

      const goodNumber = typeof record.no === 'string' && NUMBER.test(record.no);
      if (!isMissing(record.no) && !goodNumber) fault('bad number, expected section.two digits as in 5.02');
      if (goodNumber) {
        if (firstSeen.has(record.no)) fault(`number used twice, first in ${firstSeen.get(record.no)}`);
        else firstSeen.set(record.no, repoPath(file));
      }

      if (!isMissing(record.type) && !TYPES.includes(record.type)) fault(`unknown type "${record.type}"`);
      if (!isMissing(record.year) && !Number.isInteger(record.year)) fault(`year ${JSON.stringify(record.year)} is not a whole number`);
      if (!isMissing(record.confidence) && !LEVELS.includes(record.confidence.level)) {
        fault(`unknown confidence level ${JSON.stringify(record.confidence.level)}`);
      }

      const text = Array.isArray(record.text) ? record.text : [];
      if (record.text !== undefined && !Array.isArray(record.text)) fault('text is not a list of paragraphs');
      else if (!text.some((p) => String(p).trim())) report('warn', file, `${row}: empty text`);

      const resolved = [];
      if (Array.isArray(record.keywords)) {
        if (record.keywords.length > MAX_KEYWORDS) fault(`${record.keywords.length} keywords, at most ${MAX_KEYWORDS}`);
        for (const id of record.keywords) {
          if (Object.hasOwn(keywords, id)) resolved.push(id);
          else if (Object.hasOwn(aliases, id)) resolved.push(aliases[id]);
          else if (Object.hasOwn(offeredKeywords, id)) {
            resolved.push(id);
            noteUse(keywordUse, id, name);
            if (!proposedKeywords.has(id)) proposedKeywords.set(id, offeredKeywords[id]?.label ?? id);
          } else fault(`unknown keyword "${id}"`);
        }
      } else if (!isMissing(record.keywords)) fault('keywords is not a list');

      if (!isMissing(record.place) && !Object.hasOwn(places, record.place)) {
        if (Object.hasOwn(offeredPlaces, record.place)) {
          noteUse(placeUse, record.place, name);
          if (!proposedPlaces.has(record.place)) proposedPlaces.set(record.place, offeredPlaces[record.place]?.name ?? record.place);
        } else fault(`unknown place "${record.place}"`);
      }

      const abs = isMissing(record.file) ? null : path.resolve(dir, String(record.file));
      if (abs && !(await isFile(abs))) fault(`file "${record.file}" not found`);
      if (abs) unserved('file', abs);

      const images = [];
      if (record.images !== undefined && !Array.isArray(record.images)) fault('images is not a list');
      for (const [n, image] of (Array.isArray(record.images) ? record.images : []).entries()) {
        if (!isObject(image) || isMissing(image.file)) {
          fault(`image ${n + 1} names no file`);
          continue;
        }
        const imageAbs = path.resolve(dir, String(image.file));
        if (!(await isFile(imageAbs))) fault(`image "${image.file}" not found`);
        unserved('image', imageAbs);
        images.push({ ...image, abs: imageAbs });
      }

      if (record.more !== undefined) {
        const kind = isObject(record.more) ? record.more.kind : undefined;
        if (!MORE_KINDS.includes(kind)) fault(`unknown more.kind ${JSON.stringify(kind)}`);
        const target = isObject(record.more) ? record.more.target : undefined;
        if (typeof target === 'string' && target && !URL_LIKE.test(target)) {
          const targetAbs = path.resolve(dir, target);
          if (!(await isFile(targetAbs))) fault(`more.target "${target}" not found`);
          unserved('more.target', targetAbs);
        }
      }

      if (record.sources !== undefined) {
        if (Array.isArray(record.sources)) citing.push({ file, row, sources: record.sources });
        else fault('sources is not a list');
      }

      if (goodNumber) {
        entries.push({
          ...record,
          section: Number(record.no.split('.')[0]),
          dir,
          abs,
          text,
          images,
          keywords: [...new Set(resolved)],
        });
      }
    }

    for (const [id, rows] of keywordUse) report('warn', file, `proposed keyword "${id}" in use: ${rows.join(', ')}`);
    for (const [id, rows] of placeUse) report('warn', file, `proposed place "${id}" in use: ${rows.join(', ')}`);
  }

  for (const { file, row, sources } of citing) {
    const unknown = sources.filter((no) => !firstSeen.has(no));
    if (unknown.length) report('error', file, `${row}: sources name unknown rows ${unknown.join(', ')}`);
  }

  for (const [id, label] of proposedKeywords) keywords[id] = { label };
  for (const [id, name] of proposedPlaces) places[id] = { name, lat: null, lon: null };

  entries.sort((a, b) => a.section - b.section || runningNumber(a) - runningNumber(b));
  const { colours, names, glossary } = await attachFind({ root, files, entries, report });
  return { entries, keywords, aliases, places, problems, colours, names, glossary };
}

// keywords.json: { id: {label} } or { id: {into: otherId} }; folds may chain.
function readVocabulary(raw, file, report) {
  const keywords = {};
  const aliases = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!isObject(entry) || entry.into === undefined) keywords[id] = { label: entry?.label ?? id };
  }
  for (const [id, entry] of Object.entries(raw)) {
    if (!isObject(entry) || entry.into === undefined) continue;
    let target = entry.into;
    const trail = new Set([id]);
    while (isObject(raw[target]) && raw[target].into !== undefined && !trail.has(target)) {
      trail.add(target);
      target = raw[target].into;
    }
    if (Object.hasOwn(keywords, target)) aliases[id] = target;
    else report('error', file, `keyword "${id}" folds into "${entry.into}", which leads to no keyword`);
  }
  return { keywords, aliases };
}

// places.json: { id: {name, lat, lon, osm?, source?} }; lat/lon may be null.
function readPlaces(raw, file, report) {
  const places = {};
  for (const [id, place] of Object.entries(raw)) {
    const entry = isObject(place) ? place : {};
    places[id] = { ...entry, lat: entry.lat ?? null, lon: entry.lon ?? null };
    if (typeof entry.lat !== 'number' || typeof entry.lon !== 'number') report('warn', file, `place "${id}" has no coordinates`);
  }
  return places;
}

async function findEntryFiles(dir) {
  let names;
  try {
    names = await readdir(dir, { recursive: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return names.filter((name) => path.basename(name) === 'entries.json').sort().map((name) => path.join(dir, name));
}

// Absent file -> undefined, silently. Unparseable -> undefined and an error.
async function readJson(file, report) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    report('error', file, `unparseable JSON: ${err.message}`);
    return undefined;
  }
}

async function readObject(file, report) {
  const data = await readJson(file, report);
  if (data === undefined) return {};
  if (isObject(data)) return data;
  report('error', file, 'expected an object');
  return {};
}

async function isFile(abs) {
  try {
    return (await stat(abs)).isFile();
  } catch {
    return false;
  }
}

function noteUse(uses, id, no) {
  if (!uses.has(id)) uses.set(id, []);
  uses.get(id).push(no);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isMissing = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
const runningNumber = (entry) => Number(entry.no.split('.')[1]);
