// node library/tools/find/vocabulary.mjs [--min N]
//
// The words the glossary is written from: every word of four letters or more in the rows' titles
// and in the `shows` of their find.json that no set of library/content/glossary.json, no name and
// no colour holds yet, with the number of rows it stands in, the most rows first. --min N lists
// only the words that stand in N rows or more (default 2).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadLibrary } from '../../lib/records.mjs';
import { words } from '../../web/search.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { values } = parseArgs({ options: { min: { type: 'string', default: '2' } } });
const min = Number(values.min) || 1;

const lib = await loadLibrary(ROOT);
const listed = [...lib.glossary.flat(), ...lib.names.flat(), ...Object.values(lib.colours).flat()];
const known = new Set(listed.flatMap((item) => words(item).map((word) => word.w)));
const rowsOf = new Map();
for (const entry of lib.entries) {
  for (const text of [entry.title, ...entry.find.shows]) {
    for (const { w } of words(text)) {
      if (w.length < 4 || /\d/.test(w) || known.has(w)) continue;
      if (!rowsOf.has(w)) rowsOf.set(w, new Set());
      rowsOf.get(w).add(entry.no);
    }
  }
}
const list = [...rowsOf].filter(([, rows]) => rows.size >= min).sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
for (const [word, rows] of list) console.log(`${String(rows.size).padStart(4)}  ${word}`);
console.log(`${list.length} words in ${min} ${min === 1 ? 'row' : 'rows'} or more, not yet in the glossary`);
