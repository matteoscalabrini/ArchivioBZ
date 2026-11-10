# Research Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, offline website in `library/` that shows every item the Studio 1 research holds as one expandable row, filtered through the words of the project's idea, with long reads, tables and a black-on-white dot map of the places.

**Architecture:** Records (`entries.json`) sit beside the material in each downloads folder. A Node build reads and checks them, then runs independent steps (`library/steps/NN-*.mjs`) that each add to a shared context and write static pages into `library/dist/`. A small Node server serves `dist/` and, under `/source/`, the original files where they already are.

**Tech Stack:** Node 24 (ES modules, `node --test`), plain HTML/CSS/JS, `marked` (Markdown) and `mammoth` (Word) as the only dependencies, `sips` and `pdftoppm` for pictures, Three.js copied from BolzanoDot for the map.

**Spec:** `docs/superpowers/specs/2026-11-10-research-library-design.md` (read it first; the approved sketches it names are the visual reference). Catalogue rules for the data tasks: `docs/superpowers/plans/2026-11-10-catalogue-brief.md`.

## Global Constraints

- Repo root is `~/Documents/GitHub/Studio1`. It is **not a git repository**: nothing is committed. Each task ends by running its tests and listing the files it created or changed.
- Nothing existing is moved, renamed or edited: `research_notes/`, `reports/`, `README.md` are read-only for code tasks. `../BolzanoDot` is read-only for everyone; copy from it, never write to it.
- Black `#000` on white `#fff`, one grey `#757575` for secondary text, no other colour anywhere. Serif `"Times New Roman", Times, serif` for titles and headers; sans `"Helvetica Neue", Helvetica, Arial, sans-serif` for the rest. Type sizes 12, 15, 22, 44 px only (plus 9 px for counts). Hairline `1px solid #000` rules, no boxes, cards, icons, shadows or rounded corners.
- No network at build time or in the browser: no CDN, no web fonts, no remote images.
- Dependencies: `marked` and `mammoth` only. No framework, no bundler.
- Subagents write **no reader-facing text**: never fill a record's `text`, never write About or story prose. Labels of a few words ("Show all", "Open the PDF →") are fine and are fixed in this plan.
- Paths contain spaces, umlauts and apostrophes (`Fascist Bolzano media and migration`, `Teßmann`, `anni_'60`). Every URL is built with `encodeURIComponent` per path segment.
- Keyboard: every clickable thing is reachable and operable by keyboard with a visible focus. With `prefers-reduced-motion: reduce` nothing animates.

## Review Focus

1. **Paths with spaces, `ß`, `'`** in a record's `file` or `images` → picture and link still resolve. Pinned in Task 1 (`sourceUrl` test, server test).
2. **A row with no picture and no text yet** → opens cleanly, is counted in the build report, never crashes the build. Pinned in Task 2 and Task 3.
3. **A stale address** (`#k=` or `#o=` naming a keyword or row that no longer exists) → the page shows all rows, nothing thrown. Pinned in Task 2 (`parseState` / `applyState` tests).
4. **A keyword renamed or folded** in `keywords.json` while records and the idea still use the old name → resolved to the new one everywhere, or reported by name. Pinned in Task 1 and Task 4.
5. **A real-world CSV** (quoted commas, quoted newlines, BOM, 400+ rows) → parsed whole; the preview's total equals the file's row count. Pinned in Task 5.

## File Structure

```
package.json                     scripts: build, check, serve, test
library/
  build.mjs                      loads records, runs steps in order, reports problems
  serve.mjs                      static server: dist/ and /source/
  lib/records.mjs                load + validate records, keywords, places
  lib/shell.mjs                  the page frame shared by every page
  lib/idea.mjs  lib/csv.mjs  lib/longread.mjs  lib/geo.mjs
  steps/10-pictures.mjs 20-idea.mjs 30-tables.mjs 40-longreads.mjs 50-map.mjs 60-library.mjs 70-about.mjs
  web/base.css library.css library.js state.js table.js read.css map.css map.js vendor/
  content/keywords.json places.json idea.md about.md entries.json stories/5.01.md   (written by the main session)
  map-data/                      dots.bin.gz, dots.json, height.bin.gz copied from BolzanoDot
  test/*.test.mjs  test/fixtures/
  dist/                          generated
research_notes/<investigation>/files/<thread>/entries.json    one per downloads folder
```

A step is `export default async function (ctx)`. Steps run in file-name order and each must work when the others are absent.

---

### Task 1: Foundation — records, page frame, build, server

**Files:**
- Create: `package.json`, `library/lib/records.mjs`, `library/lib/shell.mjs`, `library/build.mjs`, `library/serve.mjs`, `library/web/base.css`
- Test: `library/test/records.test.mjs`, `library/test/serve.test.mjs`, `library/test/fixtures/` (a miniature repo: `research_notes/Inv A/files/05_x/entries.json` with a jpg wider than 1600 px, a small png, a one-page pdf, a 7-record csv, an md, and one image named `Teßmann '60.jpg`; `research_notes/Inv A/files/bad/entries.json`; `research_notes/Inv A/files/12_refs/entries.json`; `library/content/{keywords,places}.json`, `entries.json`). Fixture rows: `0.01` Report (`more` read → an md), `5.00` Notes (read → the md), `5.01` Photograph (two images, a place, the `Teßmann '60.jpg` file), `5.02` Newspaper page (`file` the pdf, keywords `press` and `fraktur`, `more` file), `5.03` Table (`more` table → the csv), `12.01` Reference (empty `text`, no file, no images). Later tasks reuse these fixtures and may add files beside them, never change these rows.

**Interfaces — produces:**

```js
// library/lib/records.mjs
export const TYPES = ['Report','Notes','Story','Newspaper page','Press article','Photograph','Postcard',
  'Poster','Booklet','Book','Article','Law text','Archive guide','Table','Web page','Intervention',
  'Reference','Counter-reference','Map'];
export const MORE_KINDS = ['read','file','table','map','source'];
export async function loadLibrary(root)   // → { entries, keywords, aliases, places, problems }
export function sourceUrl(root, absPath)  // → '/source/' + each repo-relative segment encodeURIComponent-ed
```

- `loadLibrary` reads every `research_notes/**/entries.json` plus `library/content/entries.json`, and `library/content/keywords.json`, `places.json`.
- File shape: `{ "keywords_proposed": {id:{label}}, "places_proposed": {id:{name}}, "entries": [ … ] }` (first two optional).
- Record fields (spec, "The entry record"): `no` (`/^\d{1,2}\.\d{2}$/`), `title`, `type`, `date`, `year` (integer), `keywords` (1–5 ids), `text` (array of paragraphs, may be empty), `facts` (array, never rendered), `images` (`[{file, caption}]`), `file`, `source` (`{label, url}`), `holder`, `creator`, `rights`, `confidence` (`{level: 'read'|'secondary'|'lead', note?}`), `more` (`{kind, target?, label?, columns?}`), `sources` (row numbers), `place` (place id). Required: `no, title, type, date, year, keywords, confidence`.
- `file`, `images[].file` and a non-URL `more.target` are relative to the folder of their `entries.json`.
- Each returned entry adds: `section` (integer before the dot), `dir` (absolute), `abs` (absolute `file` or null), `images[].abs`, and `keywords` resolved to canonical ids.
- `entries` are sorted by section, then by the number after the dot, both numerically.
- `keywords.json`: `{ id: {label} }` or `{ id: {into: otherId} }`. `keywords` returned holds canonical ids only (`id → {label}`); `aliases` maps every folded id to its canonical id. `places.json`: `{ id: {name, lat, lon, osm?, source?} }`, `lat`/`lon` may be null.
- `problems`: `{level: 'error'|'warn', where, message}`; `where` is the repo-relative path of the file at fault, `message` names the row number.
  - error: missing required field, bad `no`, `no` used twice, unknown `type`, unknown `more.kind`, keyword in neither `keywords.json` nor that file's `keywords_proposed`, place in neither `places.json` nor `places_proposed`, a `file`/`images[].file`/local `more.target` that does not exist, `sources` naming an unknown row, unparseable JSON.
  - warn: empty `text`, a proposed keyword or place in use, a place without coordinates.

```js
// library/lib/shell.mjs
export function esc(s)                                  // HTML-escape
export function page({ title, tab, body, css = [], js = [], depth = 0, head = '' })  // → full HTML document
```

`page` gives every page the same frame: `<a class="wordmark">Translocalities in Bolzano</a>` and tabs `Library` (`index.html`), `Map` (`map.html`), `About` (`about.html`), the tab named by `tab` (`'library'|'map'|'about'|null`) marked `aria-current="page"`; `depth` prefixes links and assets with `../` per level; `web/base.css` always first; `js` entries are loaded as modules.

```js
// library/build.mjs   —   node library/build.mjs [--check] [--present] [--root DIR] [--out DIR]
// ctx = { root, out, lib, options: {check, present}, problems,
//         write(relPath, content), copyFile(absSrc, relPath), sourceUrl(absPath) }
```

Build loads the library, prints every problem as `LEVEL where: message`, stops with exit code 1 if any is an error, otherwise (unless `--check`) empties `out` (default `library/dist`) — but only a directory that is empty, absent, or carries the marker file `.library-dist` the build itself writes there; any other non-empty `out` is refused with a message and exit code 1, nothing deleted — copies `library/web/` to `out/web/`, imports each `library/steps/*.mjs` in name order and awaits its default export, then prints counts: rows, rows without text, rows without picture.

`library/serve.mjs` — `node library/serve.mjs [--root DIR] [--out DIR]`, port from `PORT` or 5180, binds 127.0.0.1. `/source/<path>` serves files under `root/research_notes/` and `root/reports/` only; everything else comes from `out`, `/` → `index.html`. Supports `Range`. Exports `createServer({root, out})` for the tests.

`web/base.css`: the tokens and sizes from Global Constraints, the frame, `:focus-visible` outline `2px solid #000`, the reduced-motion rule.

- [ ] **Step 1: Write the fixtures and `records.test.mjs`**

```js
test('rows come back in number order', …)        // nos deepEqual ['0.01','5.00','5.01','5.02','5.03','12.01']
test('a folded keyword resolves', …)             // keywords.json has fraktur:{into:'typeface'}; row 5.02 lists 'fraktur' → ['press','typeface']
test('every fault is reported with its file and row', …)
  // bad/entries.json: 9.01 twice, type 'Painting', file 'missing.pdf', keyword 'nope', sources ['99.99']
  // → 5 errors, each where === 'research_notes/Inv A/files/bad/entries.json', each message includes its row number
test('proposed keywords and places pass with a warning', …)
test('an empty text is a warning, not an error', …)
test('sourceUrl encodes each segment', …)
  // sourceUrl(root, root + "/research_notes/Inv A/files/05_x/Teßmann '60.jpg")
  //   === "/source/research_notes/Inv%20A/files/05_x/Te%C3%9Fmann%20'60.jpg"
```

- [ ] **Step 2: Run `node --test library/test/records.test.mjs`** — expected: fails, module not found.
- [ ] **Step 3: Implement `records.mjs`** to the interface above.
- [ ] **Step 4: Run the test** — expected: all pass.
- [ ] **Step 5: Write `serve.test.mjs`** (and add to `records.test.mjs`: `'build refuses to empty a non-empty folder it did not create'` — a temp dir holding `keep.txt` passed as `--out` → exit code 1, `keep.txt` still there)

```js
test('serves a source file whose name has spaces, ß and an apostrophe', …)   // 200, image/jpeg
test('refuses /source/library/build.mjs', …)                                  // 403
test('refuses /source/research_notes/../package.json', …)                     // 403 or 404, never 200
test('answers Range: bytes=0-9 with 206 and 10 bytes', …)
test('/ returns index.html from out', …)
```

- [ ] **Step 6: Implement `shell.mjs`, `build.mjs`, `serve.mjs`, `base.css`, `package.json`** (`"type":"module"`, scripts `build`, `check` = `build -- --check`, `serve`, `test` = `node --test library/test/`).
- [ ] **Step 7: Run `npm test`** and `node library/build.mjs --root library/test/fixtures --out /tmp/…` on a copy without the `bad` folder — expected: tests pass; build prints counts and exits 0; with `bad` present it prints 5 errors and exits 1.

---

### Task 2: The Library page

**Files:**
- Create: `library/steps/60-library.mjs`, `library/web/library.css`, `library/web/library.js`, `library/web/state.js`
- Test: `library/test/library.test.mjs`, `library/test/state.test.mjs`

**Interfaces:**
- Consumes: `ctx`, entries from Task 1; optional `entry.pictures` (`[{src, w, h, caption, original}]`, Task 3), `ctx.idea` (`{html, keywords, standin}`, Task 4), `entry.preview` (`{columns, rows, total}`, Task 5), `ctx.lib.places[id].inside` (Task 7; treat `undefined` as true).
- Produces: `out/index.html`. Markup later tasks rely on: `article.row[data-no][data-kw="id id"][data-type][data-year]` containing `.row-head` and `.row-body`; address state `#k=<keyword id>&o=<no,no>&s=<no|type|date>`.

```js
// library/web/state.js  (pure, imported by library.js and by the tests)
export function parseState(hash, known)   // known = {keywords:Set, rows:Set} → {k:string|null, o:string[], s:'no'|'type'|'date'}; unknown values dropped
export function formatState(state)        // → '#k=…&o=…' ('' for the default state)
export function matches(row, state)       // row = {kw:string[]} → boolean
export function compare(a, b, key)        // rows {no, type, year} → number; ties fall back to number order
```

Behaviour (spec "Library", sketch `idea-as-index-v2.html`):
- All rows are in the page, closed. A closed row's pictures are not requested: `<img data-src>` gets its `src` when the row first opens.
- Closed row columns `64px 1fr 150px 120px minmax(0,300px)`: number, title (serif 22), type, date, keyword labels (each a button that filters).
- Open row: picture with caption (first of `entry.pictures`; when there are several, small text buttons `1 2 3` under it switch pictures), or the table preview (`First 5 of N records`), or nothing; the text paragraphs; meta lines in this order when present — Holder, Creator, Rights, Confidence (`read` → "Read in the source", `secondary` → "From a secondary source", `lead` → "Lead, not yet a fact", then the note), Source (link), Place (`<name>, on the map →` to `map.html#p=<id>`, or `<name>, beyond the map` when `inside === false`), Sources (`N rows`, each number a link that opens that row); the bottom link by `more.kind`: `read` → "Read the full story →" (Story), "Read the report →" (Report), "Read the notes →" (Notes), href `read/<no>.html`; `file` → "Open the PDF →" for `.pdf`, otherwise "Open the file →", href `sourceUrl`; `table` → "Open the full table →", `table/<no>.html`; `map` → "Open the map →"; `source` → "Open the source →", external. `more.label` overrides.
- Top block: `ctx.idea.html` in serif 44 with a 12 px grey label "The idea" — unless there is no idea, or it is a stand-in and `options.present` is set; then the keyword index is shown there instead, serif 44, every keyword that has rows, as buttons. A stand-in shown without `--present` carries the grey label "The idea (stand-in)".
- Sticky status line: active keyword label or "All entries"; "N of M entries" or "M entries"; "Show all" when filtered; when filtered, "On the map →" to `map.html#k=<id>`.
- Column heads No., Type, Date are buttons that sort; the active one is underlined.
- Foot: "All keywords", every keyword with rows and its count, 12 px, as filter buttons.
- Several rows may be open. The address follows the state; loading an address restores it.
- Below 800 px the type, date and keyword columns fold under the title.

- [ ] **Step 1: Write `state.test.mjs`**

```js
test('parseState drops an unknown keyword and unknown rows', …)
  // parseState('#k=gone&o=5.01,77.77&s=date', {keywords:new Set(['press']), rows:new Set(['5.01'])})
  //   deepEqual {k:null, o:['5.01'], s:'date'}
test('parseState survives garbage', …)        // '#%%%', '', '#k' → {k:null,o:[],s:'no'}, nothing thrown
test('formatState round-trips', …)            // {k:'typeface',o:['5.21'],s:'no'} → '#k=typeface&o=5.21'
test('compare sorts 12.01 after 5.02 by number, and by year with number as tie-break', …)
```

- [ ] **Step 2: Write `library.test.mjs`** (builds the fixtures into a temp dir, reads `index.html`)

```js
test('one article.row per entry, in order', …)
test('no <img src> inside a closed row', …)               // only data-src
test('a row with empty text and no picture still renders a body', …)   // fixture 12.01
test('bottom link wording by kind', …)                    // 'Open the PDF →', 'Open the full table →', 'Read the notes →'
test('keyword labels shown, ids in data-kw', …)           // data-kw="press typeface", text 'Press', 'Typeface'
test('with --present and a stand-in idea, the keyword index replaces the paragraph', …)
test('a path with spaces is encoded in the source link', …)
```

- [ ] **Step 3: Run both** — expected: fail.
- [ ] **Step 4: Implement the step, the stylesheet and the client script.**
- [ ] **Step 5: Run `npm test`** — expected: pass.
- [ ] **Step 6: Look at it.** Build the fixtures, serve, and capture `index.html`, `index.html#k=typeface&o=5.02` at 1440 px and 390 px wide with headless Chrome (`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=… --window-size=1440,2000 URL`). Compare by eye with sketch 2; report the screenshot paths.

---

### Task 3: Pictures

**Files:** Create `library/steps/10-pictures.mjs`; Test `library/test/pictures.test.mjs`

**Interfaces:**
- Consumes: entries (`images[].abs`, `abs`).
- Produces: `entry.pictures = [{src, w, h, caption, original}]` — `src` relative to `out` (`img/<no>-<n>.jpg`), `original` = `sourceUrl` of the untouched file. For each image: JPEG, longer side at most 1600 px (`sips -Z 1600 -s format jpeg`), never enlarged. For an entry with no images whose `file` is a `.pdf`: its first page (`pdftoppm -f 1 -l 1 -scale-to 1600 -jpeg`), caption "First page". Otherwise `pictures = []` and, unless the type is Table, Notes or Law text, a `warn` problem "no picture".
- Scaled files are cached in `library/.cache/img/` keyed by source path + size + mtime and copied into `out`, so a rebuild converts nothing it has already converted.

- [ ] **Step 1: Write the test** — `'a jpg wider than 1600 is scaled to 1600'`, `'a small png becomes a jpg of the same size'`, `'a pdf-only row gets its first page'`, `'a second build converts nothing'` (cache file mtimes unchanged), `'a row with nothing gets [] and one warning naming its number'`, `'a file named with spaces and ß converts'`.
- [ ] **Step 2: Run** — fails. **Step 3: Implement.** **Step 4: Run** — passes.

---

### Task 4: The idea

**Files:** Create `library/lib/idea.mjs`, `library/steps/20-idea.mjs`; Test `library/test/idea.test.mjs`

**Interfaces:**
- `parseIdea(text, {keywords, aliases})` → `{html, keywords: string[], standin: boolean, problems}`, taking `keywords` and `aliases` as `loadLibrary` returns them.
- Source format: optional first line `status: stand-in`; then paragraphs; `[[shown words|keyword]]` or `[[keyword]]`, where `keyword` is an id or a label, case-insensitive, folds resolved. Output: escaped text with `<button data-k="<canonical id>">shown words</button>`, paragraphs as `<p>`.
- Unknown keyword → `error` problem naming it. The step also adds a `warn` for a marked keyword that no row carries, and sets `ctx.idea`. No file → `ctx.idea = null`.

- [ ] **Step 1: Write the test** — `'[[word|Wording]] becomes a button with data-k="wording" and text "word"'`, `'a label matches whatever its case'`, `'a folded id resolves to its target'`, `'an unknown keyword is an error that names it'`, `'status: stand-in sets standin and is not printed'`, `'angle brackets in the text are escaped'`.
- [ ] **Step 2–4: Run (fails), implement, run (passes).**

---

### Task 5: Tables

**Files:** Create `library/lib/csv.mjs`, `library/steps/30-tables.mjs`, `library/web/table.js`; Test `library/test/tables.test.mjs`

**Interfaces:**
- `parseCsv(text)` → `{columns: string[], rows: string[][]}`: RFC 4180 with quoted commas, doubled quotes, quoted newlines, CRLF, a leading BOM, a missing final newline; blank trailing lines ignored.
- For every entry with `more.kind === 'table'`: `entry.preview = {columns, rows, total}` where columns are `more.columns` or the first three, rows the first five; and a page `out/table/<no>.html` (`page({depth: 1, tab: 'library'})`): the title, "N records", a "← Library" link to `../index.html#o=<no>`, the whole table at 12 px with hairlines, header cells as sort buttons (`table.js`), cells that are `http(s)` addresses as links.

- [ ] **Step 1: Write the test** — `'quoted comma stays in one cell'`, `'quoted newline stays in one cell'`, `'doubled quote becomes one quote'`, `'BOM is not part of the first column name'`, `'preview total equals the number of data rows'` (fixture of 7 → 7), and, skipped when the file is absent, `'the real Luce newsreel table has 172 records'` against `research_notes/Fascist Bolzano media and migration/files/02_newsreels_radio_mobilization/luce_newsreels_South_Tyrol_1927-1945_catalogue.csv`.
- [ ] **Step 2–4: Run (fails), implement, run (passes).**

---

### Task 6: Long reads

**Files:** Create `library/lib/longread.mjs`, `library/steps/40-longreads.mjs`, `library/web/read.css`; Test `library/test/longreads.test.mjs`. Run `npm install --save-dev marked mammoth` first.

**Interfaces:**
- `renderMarkdown(text, {linkBase})` → HTML (via `marked`); relative links to local files are rewritten to `/source/…` addresses using `linkBase` (the absolute folder of the Markdown file); external links open in a new tab.
- `renderDocx(absPath, {imageDir, imageUrl})` → HTML (via `mammoth`), each embedded image written to `imageDir` as `fig-<n>.<ext>` and referenced as `imageUrl + name`.
- For every entry with `more.kind === 'read'`: target `.md` → Markdown, `.docx` → Word; page `out/read/<no>.html` (`depth: 1`): "← Library" to `../index.html#o=<no>`, the entry title in serif 44, the body in a column of at most 68ch at 15 px with serif headings (22 px), images at column width with 12 px grey captions, and for a Story a closing "Sources" list linking each row (`../index.html#o=<no>`).

- [ ] **Step 1: Write the test** — `'markdown headings and paragraphs render'`, `'a relative link to a file with spaces becomes an encoded /source/ address'`, `'an external link is left alone'`, `'a script tag in the markdown is not executed markup'` (escaped or removed), and, skipped when absent, `'the first report keeps its 50 figures'` / `'the second report keeps at least 25'` counting `<img` in the rendered Word reports under `reports/`.
- [ ] **Step 2–4: Run (fails), implement, run (passes).**

---

### Task 7: The map

**Files:**
- Create: `library/lib/geo.mjs`, `library/steps/50-map.mjs`, `library/web/map.js`, `library/web/map.css`
- Copy (unchanged): `../BolzanoDot/public/vendor/{three.module.js,three.core.js,addons/}` → `library/web/vendor/`; `../BolzanoDot/public/data/{dots.bin.gz,dots.json,height.bin.gz}` → `library/map-data/`
- Read for reference, do not import: `../BolzanoDot/public/js/{main.js,dots.js,labels.js,height.js,util.js,photometa.js}`, `../BolzanoDot/docs/architecture.md`
- Test: `library/test/geo.test.mjs`, `library/test/map.test.mjs`

**Interfaces:**
- `toUtm32(lat, lon)` → `{e, n}` in EPSG:25832 metres (port `photometa.js:toUtm32`).
- `locate(place, meta)` → `{x, y, inside}`: metres east and north of `meta.origin`, `inside` when within `meta.extent.e` and `.n`.
- The step sets `place.inside`, `place.x`, `place.y`, `place.z` (ground height sampled from `height.bin.gz`; 0 when outside) on every place with coordinates, **before** the Library step runs; copies `map-data/` to `out/map-data/`; writes `out/map.html` (`tab: 'map'`).
- Address state: `map.html#p=<place id>&k=<keyword id>`.

Behaviour (spec "Map"):
- The dot field from `dots.bin.gz` exactly as BolzanoDot draws it, with these changes: page and canvas background `#fff`; every layer's two colours replaced by greys so that dots read black on white (ground `#c8c8c8→#8a8a8a`, streets `#9a9a9a→#5a5a5a`, water `#d6d6d6→#b4b4b4`, trees `#b0b0b0→#707070`, rails `#6a6a6a→#3a3a3a`, roofs `#3a3a3a→#000000`, walls `#8a8a8a→#1e1e1e`, bridges `#4a4a4a→#000000`); distance fades towards white, not black; water does not shimmer; no walk attributes, no pulse; orbit, pan and zoom as in BolzanoDot; the opening view fits the area.
- A marker for every place that is `inside` and has at least one entry (after the keyword filter `k`): a thin black vertical stem from the ground with an HTML label above it, `Name` in serif 22 and the count in 12 px grey. Labels are buttons.
- Clicking a place (or arriving with `#p=`) opens a panel on the right, white, hairline left border: the place name (serif 22), then its rows as `No. · Title · Type` (12/15 px), each a link to `index.html#o=<no>`; "Close" hides it. The camera eases to the place unless motion is reduced.
- Left bottom, 12 px: "Beyond this map" with each outside place that has entries, name and count, expanding to the same list of rows.
- With `#k=`, a line at the top left names the keyword and offers "Show all places".
- The OpenStreetMap credit from `dots.json` `sources`, 12 px grey, bottom right.
- If WebGL is unavailable the page shows the places as a plain list with their rows.

- [ ] **Step 1: Write `geo.test.mjs`**

```js
test('the map origin converts to its stated coordinates', …)
  // toUtm32(46.497287, 11.349983) within 1 m of {e: 680325, n: 5151985}
test('Ponte Druso lands where the dot data labels it', …)
  // locate({lat: 46.49477, lon: 11.34827}, meta) → x within 15 of -131.3, y within 15 of -280.2, inside true
test('the Semirurali fall outside', …)          // locate({lat: 46.4870, lon: 11.3250}, meta).inside === false
test('a place without coordinates is neither inside nor located', …)
```

- [ ] **Step 2: Write `map.test.mjs`** (fixtures with three places: inside with rows, outside with rows, inside without rows) — `'one [data-place] per inside place that has rows'`, `'outside places are listed under #beyond'`, `'a place without rows is not drawn'`, `'no remote address appears in map.html or map.js'` (no `https://` other than the credit text).
- [ ] **Step 3: Run** — fails. **Step 4: Implement.** **Step 5: Run** — passes.
- [ ] **Step 6: Look at it.** Serve a build of the real library (or the fixtures with the real `map-data`) and capture `map.html` and `map.html#p=<a place>` at 1440×900 with headless Chrome using `--use-angle=metal --enable-gpu --virtual-time-budget=20000`; if the capture is blank, load it through `puppeteer-core` with the installed Chrome and wait for the first frame. The dots must read black on white with the places labelled. Report the screenshot paths.

---

### Task 8: About

**Files:** Create `library/steps/70-about.mjs`; Test `library/test/about.test.mjs`

**Interfaces:** `out/about.html` (`tab: 'about'`): `library/content/about.md` rendered with `renderMarkdown` (Task 6) in the long-read column, then a table "Entries by type" (type, count, descending) and the totals: rows, places, keywords. Missing `about.md` → the counts alone.

- [ ] **Step 1: Write the test** — `'counts by type match the fixtures'`, `'the page builds without about.md'`.
- [ ] **Step 2–4: Run (fails), implement, run (passes).**

---

### Task 9: Catalogue the held material (data, parallel)

One subagent per group, all following `docs/superpowers/plans/2026-11-10-catalogue-brief.md`, each writing only inside its own folders. Needs Task 1.

| Group | Folders | Section |
|---|---|---|
| A | `Fascist…/files/01_posters_graphics`, `02_newsreels_radio_mobilization` | 1, 2 |
| B | `Fascist…/files/03_press_print`, `07_browser_verifications` | 3, 7 |
| C | `Fascist…/files/04_migration_option_genealogy` | 4 |
| D | `Fascist…/files/05_landmarks_heritage` | 5 |
| E | `Fascist…/files/06_brand_overtourism_theory` | 6 |
| F | `Semirurali…/files/01_semirurali_bolzano`, `02_overseas_villages` | 8, 9 |
| G | `Semirurali…/files/03_internal_colonization_bridge` | 10 |
| H | `Semirurali…/files/04_eritrea_asmara` | 11 |

- [ ] **Step 1:** Write `entries.json` per the brief. **Step 2:** `node library/build.mjs --check` shows no error from your folders. **Step 3:** Report rows per type, proposed keywords and places, and anything in the folder that contradicts its manifest or the README.

### Task 10: The references (data, parallel)

Three subagents, each taking a third of the 33 references in `docs/superpowers/specs/2026-11-10-reference-chat.md`, writing into `research_notes/Defusing by form/files/01_references/` (`part-a|b|c/` each with its own `entries.json`, `manifest.md` and pictures), section 12, per the brief's section "References".

### Task 11: Places (data)

One subagent after Tasks 9 and 10: gather every `place` and `places_proposed` used, find each in OpenStreetMap, write `library/content/places.json` (`name, lat, lon, osm, source`), and report any place it could not fix with confidence instead of guessing.

### Task 12: Texts (main session, not a subagent)

`library/content/keywords.json`, `idea.md` (stand-in), `about.md`, `entries.json` (reports, map), `stories/5.01.md`; every record's `text`; folding of proposed keywords; the README section on adding material.

### Task 13: The whole thing

- [ ] `npm test` passes; `node library/build.mjs --present` exits 0 with no errors.
- [ ] Headless captures of: the Library top; a filtered state with an open row; a table page; a report page; the map with a place open; About — at 1440 px, and the Library at 390 px.
- [ ] The build report's "rows without text" and "rows without picture" are both listed for the main session.
