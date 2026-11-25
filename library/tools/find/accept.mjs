// node library/tools/find/accept.mjs   (npm run find:check)
//
// The search on the real library, against the lines "It is right when" of its design
// (docs/superpowers/specs/2026-11-17-search-design.md). Builds the site into a temporary folder,
// reads the index it wrote and runs each line as a named check: "ok", "FAIL" with what was found,
// or "--" for a line that waits for the hidden terms (find.json) and the shared lists. Ends with
// the size of the index and the time of the first search. Exit 1 on any failure.
// With --doc <file>, a draft pulled by npm run draft -- pull, the index is made from that document
// (as a publish would make it) instead of from the files.
//
// The rows named here are today's. A check that fails after the library has grown is a line to
// read again, not always a fault.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../build.mjs';
import { libFromDoc } from '../../cloud/doc.mjs';
import { loadLists } from '../../cloud/render.mjs';
import { searchIndex } from '../../lib/searchindex.mjs';
import { loadLibrary } from '../../lib/records.mjs';
import { prepare, search, words } from '../../web/search.js';
import { layout, POSSIBLE_SHOWN } from '../../web/results.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const docAt = process.argv.indexOf('--doc');
let json;
if (docAt > 0) {
  const { doc } = JSON.parse(await readFile(path.resolve(process.argv[docAt + 1] ?? ''), 'utf8'));
  json = JSON.stringify(searchIndex(libFromDoc(doc, { lists: await loadLists(REPO) })));
} else {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'find-check-'));
  const say = console.log;
  console.log = () => {}; // the build prints every warning; they are npm run check's to show
  try {
    const status = await build({ out: path.join(temp, 'site') }).finally(() => { console.log = say; });
    if (status) {
      console.error('the library does not build: run npm run check');
      process.exit(1);
    }
    json = await readFile(path.join(temp, 'site', 'search.json'), 'utf8');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
const say = console.log;
const index = JSON.parse(json);
const started = performance.now();
const engine = prepare(index);
const readied = performance.now() - started;
// The first search of three words, before anything is remembered: what the first keystroke costs.
const TYPED = 'monumento vittoria inaugurazione';
const from = performance.now();
search(engine, TYPED);
const took = performance.now() - from;

const nos = (hits) => hits.map((hit) => hit.no);
const precise = (typed) => nos(search(engine, typed).precise);
const possible = (typed) => search(engine, typed).possible;
const reasonOf = (typed, no, group = 'precise') => search(engine, typed)[group].find((hit) => hit.no === no)?.reasons ?? [];
const first = (list, n = 6) => (list.length > n ? `${list.slice(0, n).join(', ')}, … (${list.length})` : list.join(', ') || 'none');
const holds = (list, ...wanted) => wanted.every((no) => list.includes(no));
const described = index.rows.some((r) => r.on || r.shows);
const lists = Object.keys(index.colours).length > 0 && index.names.length > 0 && index.glossary.length > 0;

let failed = 0;
function check(name, run, { waits = false } = {}) {
  if (waits) return say(`--    ${name} (waits for the hidden terms and the shared lists)`);
  let result;
  try {
    result = run();
  } catch (err) {
    result = `threw ${err.message}`;
  }
  if (result === true) return say(`ok    ${name}`);
  failed++;
  say(`FAIL  ${name}: ${result}`);
}

// With the engine alone.
check('every row is the first precise hit for its own number', () => {
  // Typed as the row shows it (its number, which is its key in files; in a draft the key is the id).
  const wrong = index.rows.filter((r) => precise(r.line[0])[0] !== r.no).map((r) => r.no);
  return !wrong.length || `not first: ${first(wrong)}`;
});
check('every row is among the first precise hits for its whole title, rows of one title together', () => {
  const key = (r) => words(r.line[1]).map((word) => word.w).join(' ');
  const wrong = index.rows.filter((r) => {
    if (!key(r)) return false;
    const same = index.rows.filter((other) => key(other) === key(r)).map((other) => other.no);
    return precise(r.line[1]).slice(0, same.length).join() !== same.join();
  }).map((r) => r.no);
  return !wrong.length || `not at the top: ${first(wrong)}`;
});
// The press cut of 24 Nov 2026 took 3.06, 3.16 and 3.19: Spinne became Atesiner (3.34), Hochetsch and aquila lost those rows.
check('Atesiner gives 3.34 and no other row', () => precise('Atesiner').join() === '3.34' || first(precise('Atesiner')));
check('Fuehrer ruft gives 16.19 first', () => precise('Fuehrer ruft')[0] === '16.19' || first(precise('Fuehrer ruft')));
check('Hochetsch gives 1.05, precise', () => holds(precise('Hochetsch'), '1.05') || first(precise('Hochetsch')));
// The checks on table records (funivia in 1.03 and 2.02, teschio in 15.01) went with the tables on 24 Nov 2026.
check('funivia gives 1.02, precise', () => holds(precise('funivia'), '1.02') || first(precise('funivia')));
check('Furer stands nowhere and gives 16.19 as a possible link, a near spelling', () =>
  (!precise('Furer').length && /^near /.test(reasonOf('Furer', '16.19', 'possible')[0]?.road ?? '')) || `precise ${first(precise('Furer'))}; possible ${first(nos(possible('Furer')))}`);
check(`an ordinary word (poster) has more than ${POSSIBLE_SHOWN} possible links and puts ${POSSIBLE_SHOWN} on the page`, () => {
  const rows = index.rows.map((r) => ({ no: r.no, type: r.line[2], year: 0, kw: [] }));
  const view = layout(rows, { q: 'poster', k: null, t: null, o: [], s: 'no' }, search(engine, 'poster'));
  const shown = view.items.filter((item) => item.row !== undefined).length - view.precise;
  return (view.possible > POSSIBLE_SHOWN && shown === POSSIBLE_SHOWN) || `${view.possible} possible, ${shown} shown`;
});

// With the hidden terms and the shared lists.
const waits = !described || !lists;
check('rosso, rot and red give the same precise rows, those whose colours hold red first, 17.01, 17.16 and 16.19 among them', () => {
  const [it, de, en] = ['rosso', 'rot', 'red'].map(precise);
  const coloured = index.rows.filter((r) => r.colours?.includes('red')).map((r) => r.no);
  const same = (a, b) => [...a].sort().join() === [...b].sort().join();
  if (!same(it, de) || !same(it, en)) return `rosso ${it.length}, rot ${de.length}, red ${en.length}`;
  if (!holds(coloured, '17.01', '17.16', '16.19')) return `rows whose colours hold red: ${first(coloured, 40)}`;
  return [it, de, en].every((list) => same(list.slice(0, coloured.length), coloured)) || `the first ${coloured.length}: ${first(it, 12)}`;
}, { waits });
check('Hochetsch gives 1.05 first, the words on the notice as its reason', () => {
  const reason = reasonOf('Hochetsch', '1.05')[0];
  return (precise('Hochetsch')[0] === '1.05' && reason?.label === 'on it' && /Hochetsch/.test(reason.text)) || `${first(precise('Hochetsch'))}; ${JSON.stringify(reason)}`;
}, { waits });
check('caricature invalids gives 3.04, precise', () => holds(precise('caricature invalids'), '3.04') || first(precise('caricature invalids')), { waits });
check('aquila stands nowhere and gives 5.05 as a possible link that names its road', () =>
  (!precise('aquila').length && Boolean(reasonOf('aquila', '5.05', 'possible')[0]?.road)) || `precise ${first(precise('aquila'))}; ${JSON.stringify(reasonOf('aquila', '5.05', 'possible'))}`, { waits });
check('vescovo stands nowhere and gives 5.03 as a possible link through the glossary', () =>
  (!precise('vescovo').length && reasonOf('vescovo', '5.03', 'possible').some((reason) => reason.road.includes(' = '))) || `precise ${first(precise('vescovo'))}; ${JSON.stringify(reasonOf('vescovo', '5.03', 'possible'))}`, { waits });
check('funivia gives 1.12 as a possible link', () => holds(nos(possible('funivia')), '1.12') || first(nos(possible('funivia'))), { waits });
check('Bozen gives every row that says Bolzano', () => precise('Bozen').sort().join() === precise('Bolzano').sort().join() || `Bozen ${precise('Bozen').length}, Bolzano ${precise('Bolzano').length}`, { waits });
check('Siegesdenkmal gives every row with the keyword Monumento alla Vittoria', () => {
  const kept = index.rows.filter((r) => r.line.includes('Monumento alla Vittoria')).map((r) => r.no);
  const found = precise('Siegesdenkmal');
  const missing = kept.filter((no) => !found.includes(no));
  return !missing.length || `missing ${first(missing)}`;
}, { waits });
const { problems } = await loadLibrary(REPO);
const bare = problems.filter((p) => /no entry in find\.json/.test(p.message));
say(bare.length ? `${waits ? '--  ' : 'FAIL'}  rows with a picture and no entry in find.json, in ${bare.length} ${bare.length === 1 ? 'folder' : 'folders'}` : 'ok    every row with a picture has an entry in find.json');
if (bare.length && !waits) failed++;

// How heavy and how fast.
say(`\nsearch.json: ${(Buffer.byteLength(json) / 1e6).toFixed(2)} MB, ${index.rows.length} rows, ${engine.units.length} strings, ${engine.where.size} distinct words`);
say(`made ready in ${readied.toFixed(0)} ms; “${TYPED}” in ${took.toFixed(1)} ms the first time`);
check('a three-word search takes under 30 ms', () => took < 30 || `${took.toFixed(1)} ms`);

process.exitCode = failed ? 1 : 0;
