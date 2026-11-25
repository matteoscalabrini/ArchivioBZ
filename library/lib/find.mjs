// The hidden layer the search reads: beside each entries.json a find.json, keyed by row number,
// with what no page shows (the words on the thing, what it shows or says, its colours, its other
// names), and three shared lists in library/content/: the colours' names in three languages, the
// sets of names of one thing, the sets of words that mean the same. Loaded and checked here for
// lib/records.mjs; every fault becomes a problem naming the file and the row.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const COLOURS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey', 'gold', 'silver', 'monochrome'];
const FIELDS = ['on', 'shows', 'colours', 'names'];

// Gives every entry its `find` = { on, shows, colours, names } (empty lists where it has none)
// and returns the shared lists. `files` = the entries.json files read; `report(level, abs, message)`.
export async function attachFind({ root, files, entries, report }) {
  for (const entry of entries) entry.find = { on: [], shows: [], colours: [], names: [] };

  for (const file of files) {
    const dir = path.dirname(file);
    const findFile = path.join(dir, 'find.json');
    const rows = new Map(entries.filter((entry) => entry.dir === dir).map((entry) => [entry.no, entry]));
    const data = await readJson(findFile, report);
    const described = new Set();
    if (data !== undefined && !isObject(data)) report('error', findFile, 'expected an object, from a row number to its terms');
    for (const [no, terms] of Object.entries(isObject(data) ? data : {})) {
      const entry = rows.get(no);
      if (!entry) {
        report('error', findFile, `row ${no} is not in this folder's entries.json`);
        continue;
      }
      described.add(no);
      if (!isObject(terms)) {
        report('error', findFile, `row ${no}: expected an object`);
        continue;
      }
      for (const [field, value] of Object.entries(terms)) {
        if (!FIELDS.includes(field)) report('error', findFile, `row ${no}: unknown field "${field}"`);
        else if (!isWords(value)) report('error', findFile, `row ${no}: ${field} is not a list of words`);
        else if (field === 'colours') {
          for (const colour of value) if (!COLOURS.includes(colour)) report('error', findFile, `row ${no}: unknown colour "${colour}"`);
          entry.find.colours = value.filter((colour) => COLOURS.includes(colour));
        } else entry.find[field] = value.map((words) => words.trim());
      }
    }
    const bare = [...rows.values()].filter((entry) => entry.images.length && !described.has(entry.no)).map((entry) => entry.no);
    if (bare.length) report('warn', findFile, `with a picture and no entry in find.json: ${bare.join(', ')}`);
  }

  return readSearchLists(root, report);
}

// The three shared lists alone, from library/content/ under `root`: the colours' names, the sets of
// names, the glossary. The cloud reads them so, since its rows live in the archive document.
// `report(level, abs, message)`, as above.
export async function readSearchLists(root, report) {
  const content = path.join(root, 'library', 'content');
  return {
    colours: await colourNames(path.join(content, 'colours.json'), report),
    names: await sets(path.join(content, 'names.json'), 'names', report),
    glossary: await sets(path.join(content, 'glossary.json'), 'words', report),
  };
}

// colours.json: { colour: [its names in English, Italian, German] }.
async function colourNames(file, report) {
  const data = await readJson(file, report, true);
  if (data === undefined) return {};
  if (!isObject(data)) {
    report('error', file, 'expected an object, from a colour to its names');
    return {};
  }
  const colours = {};
  for (const [id, names] of Object.entries(data)) {
    if (!COLOURS.includes(id)) report('error', file, `unknown colour "${id}"`);
    else if (!isWords(names)) report('error', file, `${id} is not a list of words`);
    else colours[id] = names.map((name) => name.trim());
  }
  return colours;
}

// names.json and glossary.json: [[one thing's names], …], [[words that mean the same], …].
async function sets(file, what, report) {
  const data = await readJson(file, report, true);
  if (data === undefined) return [];
  if (!Array.isArray(data)) {
    report('error', file, 'expected a list of sets');
    return [];
  }
  const kept = [];
  for (const [n, set] of data.entries()) {
    if (!isWords(set)) report('error', file, `set ${n + 1} is not a list of words`);
    else if (set.length < 2) report('error', file, `set ${n + 1} has fewer than two ${what}`);
    else kept.push(set.map((item) => item.trim()));
  }
  return kept;
}

// Absent file -> undefined (a warning when it is `needed`). Unparseable -> undefined and an error.
async function readJson(file, report, needed = false) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    if (needed) report('warn', file, 'missing, so the search has no such list');
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    report('error', file, `unparseable JSON: ${err.message}`);
    return undefined;
  }
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWords = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());
