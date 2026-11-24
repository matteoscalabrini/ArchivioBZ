# Edit mode, round one — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The rows move into Neon as one draft document; the author logs in at `/edit/`, edits the Library in place (text, type, date, keywords, place, picture order and captions, hide, remove, add, drag, typed numbers, chapters, idea, About), and publishes; the public site is drawn from the latest publish and cached at Vercel's edge.

**Architecture:** The page-writing code of today (`lib/detail.mjs`, the Library, Map and About steps, `lib/searchindex.mjs`) is turned into pure functions that take a `lib`. A new `library/cloud/` turns the archive document (one JSON value in Neon) into such a `lib`, applies edit operations to the document, stores the draft and the publishes, and answers HTTP through two Vercel Functions (`api/site.mjs` for the public pages, `api/edit.mjs` for edit mode). Publish renders the four public files once and stores them; the site function serves them with a cache tag that Publish clears.

**Tech Stack:** Node ≥ 24 (ES modules), plain Vercel Functions (Web `Request`/`Response`), Neon Postgres through `@neondatabase/serverless` (Pool, for transactions), Vercel Blob (public store for pictures), `@vercel/functions` (cache purge), PGlite for tests and local development, SortableJS (vendored) for dragging, puppeteer-core with the installed Chrome for the browser check.

**Spec:** `docs/superpowers/specs/2026-11-24-edit-mode-design.md` (approved 24 Nov 2026). This plan is round one, §12 item 1. Read the spec first.

## Global Constraints

- **Repository habits.** Commits go straight onto `main`. Ask the author before every `git push` and every `vercel deploy`, even a small fix. Never write or rewrite a row's reader-facing text; only the author does, in edit mode.
- **Code voice.** Comments in the codebase's own voice: plain sentences saying what a thing is and why, as in `lib/detail.mjs`. Tests use `node:test` and `node:assert/strict`, live in `library/test/`, and run with `npm test`.
- **Dependencies.** Runtime (`dependencies`): `@neondatabase/serverless` ^1.2.1, `@vercel/functions` ^3.11.3, `marked` ^18.2.0 (moved from dev). Dev: `@vercel/blob` ^2.9.0, `@electric-sql/pglite` ^0.6.0, `puppeteer-core` ^25. Vendored: `library/web/vendor/sortable.esm.js` from `sortablejs@1.15.7` (`modular/sortable.esm.js`), its MIT header kept. Nothing else.
- **A row's id and its number.** A row's **id** never changes: today's number for the 277 rows that move in (`"18.04"`), `"r" + counter` for rows added later (`"r1"`, `"r2"`). A row's **number** is its place: `` `${chapterIndex + 1}.${String(position).padStart(2, '0')}` ``, position counted from 1 among the chapter's rows that are not hidden; a hidden row's number is `''`. **In every page and in `search.json`, the key of a row (`data-no`, `#o=`, `id="body-…"`, `aria-controls`, the search index's `no`) is its id; the number appears only as text** (`.c-no`, the panel's `e-meta`, the map list's `.no`, the search index's `line`). A `lib` read from files (`loadLibrary`) has no `id`; there the key falls back to `no`, so the old build and its tests behave as before: `const key = (entry) => entry.id ?? entry.no`.
- **The archive document** (the draft and every publish):
  ```js
  {
    v: 1,
    chapters: [{ id: 'c1', title: 'Bolzano in dots', rows: ['0.03'] }, …], // story order; hidden rows stay in `rows`
    rows: {
      '18.04': {
        hidden: false,
        record: { title, type, date, year, keywords, text, confidence, facts, source, rights, file,
                  more, creator, holder, place, side_by_side, sources }, // as in entries.json, minus no and images; absent fields stay absent
        find: { on: [], shows: [], colours: [], names: [] },
        pictures: [{ src, w, h, caption }], // src: an absolute URL (Blob) or a root path (/dev-img/…)
        thumb: { src, w, h } | null,
      }, …
    },
    keywords: { id: { label } }, aliases: { folded id: target id },
    places: { id: { name, lat, lon, osm?, source?, inside, x, y, z } },
    idea: '<idea.md as text>', about: '<about.md as text>',
    next: { row: 1, chapter: 19 },
  }
  ```
  `record.file` is a repository path (`research_notes/…/x.pdf`), not relative to a folder. `record.sources` holds ids.
- **Picture addresses.** A picture `src` matching `/^(https?:)?\//` is used as it is; only other `src` values get the page's `up` prefix and `encodePath`.
- **Public files** written at each publish: `index.html`, `map.html`, `about.html`, `search.json`. No hidden row, and nothing that only the draft holds, may appear in any of them.
- **Public responses:** `Cache-Control: public, max-age=0, must-revalidate`, `Vercel-CDN-Cache-Control: max-age=31536000`, `Cache-Tag: site`. Publish clears the tag `site` (`dangerouslyDeleteByTag('site')` in a function; `vercel cache dangerously-delete --tag site --yes` from the command line). Edit responses: `Cache-Control: no-store`.
- **Login.** Cookie `archivio_edit`, value `<expiry ms>.<HMAC-SHA256 of expiry, base64url>`, `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000` (`Secure` left out only by the local dev server). Password hash `scrypt$16384$8$1$<salt base64>$<hash base64>` (64-byte key). More than 10 failed logins in 15 minutes: refused with 429 for the rest of that window; every failure answers after 1 s. A POST to an edit route whose `Origin` host differs from its `Host` is refused (403).
- **Environment variables.** `DATABASE_URL` (exists), `EDIT_PASSWORD_HASH`, `SESSION_SECRET` (32 random bytes, base64), `PICTURES_READ_WRITE_TOKEN` (the new public Blob store `archiviobz-pictures`, fra1). Never in code or git. Local credentials stay in `library/.deploy/.env.local`.
- **Pictures** go to the public store with `addRandomSuffix: true` (an address that cannot be guessed), `contentType: 'image/jpeg'`, and only after `stripJpeg(buf).equals(buf)` (from `lib/metadata.mjs`) holds; each upload is checked by its size from a HEAD request (the 16 Nov lesson: a finished script is not a finished upload).
- **Functions** run in `fra1`, next to the database.
- **Words the author reads in edit mode** (exact): the bar's label `Draft`; buttons `Publish`, `Discard`, `Public site`, `Log out`; the summary, from `summaryLine`, e.g. `6 rows changed, 2 added, 1 hidden, order changed`, or `No changes since the last publish`; confirm `Publish 9 changes?`; confirm `Discard the draft and go back to what is public?`; conflict `Changed in another window. Reload to see it.`; logged out `Logged out. Log in again; what you typed is kept.`; a refused number `A number is a chapter and a place, as in 2.05.` or `There is no chapter 7.`; a refused chapter removal `Only an empty chapter can be removed.`; dragging off `Drag works in the story order: clear the search, the filters and the sort.`

## Review Focus

1. **Two edits in quick succession** (leave the title field and at once drag a row): both are saved, in order, and no false "changed in another window" appears. Pinned in Task 11 (`OpQueue` test).
2. **Text with markup in it** (`<script>`, `&`, quotes, `</script>` inside a paragraph, a title, a chapter title or the idea): shown as typed in the edit page and the public pages, never run; the embedded JSON cannot close its `<script>`. Pinned in Task 5.
3. **Typed numbers off the beaten path** (`"2.5"`, `" 2.05 "`, `"02.05"`, `"3"`, `"2.00"`, `"2.99"` in a chapter of four, `"0.01"`, `"abc"`): `2.5` and `02.05` are place 5 and 5 of chapter 2; past the end is last; `3`, `2.00`, `0.01`, `abc` are refused with the exact line. Pinned in Task 4.
4. **An address naming a hidden or removed row** (`index.html#o=18.04` after 18.04 was hidden): the public page opens nothing and shows the full list; no error. Pinned in Task 5.
5. **The session ending while a field is open**: the save answers 401; the field stays open with what was typed and the line `Logged out. Log in again; what you typed is kept.`; after logging in on another tab, saving again works. Pinned in Task 8 (handler answers 401 with `{error: 'logged-out'}`) and Task 11 (browser check).

---

### Task 1: A row's key is its id; pictures may live elsewhere

**Files:**
- Modify: `library/lib/detail.mjs`, `library/steps/50-map.mjs`, `library/steps/60-library.mjs`, `library/lib/searchindex.mjs`, `library/web/state.js`, `library/web/library.js`
- Test: `library/test/library.test.mjs`, `library/test/map.test.mjs`, `library/test/searchindex.test.mjs`, `library/test/state.test.mjs`

**Interfaces:**
- Produces: `export const rowKey = (entry) => entry.id ?? entry.no` in `lib/detail.mjs`, used by every renderer. `compare(a, b, key)` in `web/state.js` now orders `'no'` by `a.at - b.at` (rows carry `at`, their place in the story); ties under `'type'` and `'date'` fall back to `at`. Rows in the Library page carry `data-at="<index in lib.entries>"`.
- Produces: an entry may carry `id`, `sourceNumbers` (shown numbers of its `sources`, same order), and `dir: null`/`abs: null`; `rowDetail` then links no held file.

- [ ] **Step 1: Write the failing tests.** In `library.test.mjs`, using `renderFull({ edit })`:

```js
test('a row with an id is keyed by its id and shows its number', async () => {
  const { html } = await renderFull({ edit: (lib) => { const e = lib.entries[0]; e.id = e.no; e.no = '3.07'; } });
  const id = /data-no="([^"]+)"/.exec(html)[1];
  assert.notEqual(id, '3.07');
  assert.match(html, new RegExp(`<span class="c-no">3\\.07</span>`));
  assert.match(html, new RegExp(`id="body-${id.replace('.', '\\.')}"`));
});
test('a picture at an absolute address is linked as it is', async () => {
  const { html } = await renderFull({ edit: (lib) => { lib.entries[0].pictures = [{ src: 'https://x.public.blob.vercel-storage.com/p/a-Zq9.jpg', w: 10, h: 10, caption: '' }, { src: '/dev-img/b.jpg', w: 10, h: 10, caption: '' }]; } });
  assert.match(html, /data-src="https:\/\/x\.public\.blob\.vercel-storage\.com\/p\/a-Zq9\.jpg"/);
  assert.match(html, /data-src="\/dev-img\/b\.jpg"/);
});
test('rows carry their place in the story', async () => {
  const { html } = await renderFull();
  assert.deepEqual([...html.matchAll(/data-at="(\d+)"/g)].map((m) => Number(m[1])).slice(0, 3), [0, 1, 2]);
});
```

In `map.test.mjs`: a row with `id: '5.02', no: '1.04'` placed on the map gives `data-no="5.02"` on its pin, its list item and its panel article, `index.html#o=5.02` in its links, and the text `1.04` in the list's `.no` and the panel's `e-meta`. In `searchindex.test.mjs`: `searchIndex(lib).rows[0]` is `{ no: <id>, line: ['3.07', …] }` for an entry `{ id, no: '3.07' }`. In `state.test.mjs`: `compare({at: 2, no: 'r1'}, {at: 1, no: '1.01'}, 'no') > 0`; `compare({at: 0, type: 'Poster'}, {at: 1, type: 'Poster'}, 'type') < 0`.

- [ ] **Step 2: Run them to see them fail.** Run: `npm test` — Expected: the new tests FAIL (no `data-at`, key equals the shown number, absolute `src` mangled by `encodePath`), every old test passes.

- [ ] **Step 3: Implement.** Replace each keying use of `entry.no` with `rowKey(entry)` and keep `entry.no` where it is shown; `pictureBlock` and the map's `picture()` use the address as it is when it matches `/^(https?:)?\//`; `meta()` shows `entry.sourceNumbers?.[i] || no` for each source; `more()` returns `''` for kind `file` when `entry.dir == null`; `60-library` adds `data-at`; `searchindex` writes `no: rowKey(entry)` and puts `entry.no` first in `line`; `state.js` as in Interfaces; `library.js` reads `at: Number(el.dataset.at)` into each row. Existing tests that build rows for `compare` get an `at`.

- [ ] **Step 4: Run all tests.** Run: `npm test` — Expected: all pass (239 old, adjusted where they built rows without `at`, plus the new ones).

- [ ] **Step 5: Commit.** `git commit -am "A row's key in the pages is its id, its number only words; pictures may sit at an absolute address"` (message in the repository's own style: what changed and why, in sentences).

### Task 2: Pages as pure functions, with chapters

**Files:**
- Create: `library/lib/pages.mjs`
- Modify: `library/steps/50-map.mjs`, `library/steps/60-library.mjs`, `library/steps/70-about.mjs` (each becomes a wrapper), `library/web/library.js`, `library/web/library.css`
- Test: `library/test/pages.test.mjs` (new); the existing step tests keep passing unchanged

**Interfaces:**
- Consumes: `rowKey` (Task 1).
- Produces, in `lib/pages.mjs`:
  - `libraryPage(lib, { idea = null, kinds = [], present = false, depth = 0, sourceUrl = () => null, extra = null }) -> { html: string, problems: Problem[] }`. `idea` is `{ html, standin }` or null. `extra`, for edit mode: `{ css: string[], js: string[], data: object, mark: (entry) => string }`: its CSS and JS join the page's, `data` is written as `<script type="application/json" id="edit-data">` (escaped as the other JSON scripts, `<` as `\u003c`), and `mark(entry)` returns extra attributes for a row's `<article>` (e.g. ` data-hidden="true" data-changed="true"`).
  - When `lib.chapters` is a list `[{ id, no, title, ids }]`, every row's `<article>` carries `data-chapter="<chapter id>"`, and `.list` holds, before each chapter's first row, `<h2 class="chapter" data-chapter="<id>"><span class="ch-no">${no}</span> ${esc(title)}</h2>`. A chapter with no row in `lib.entries` gets no heading.
  - `mapPage(lib, { meta, sourceUrl = () => null }) -> { html, problems }` — `meta` is the parsed `library/map-data/dots.json`; it uses `place.inside/x/y/z` already on `lib.places` and does not call `locatePlaces` (the step still calls it, then `mapPage`).
  - `aboutPage(lib, { aboutHtml }) -> string`.
- Produces, in `web/library.js`: `export function rescan()` — reads the rows, headings, keywords and kinds from the page again (for edit mode, after it changes the list), keeps the state, and draws.

- [ ] **Step 1: Write the failing tests** in `pages.test.mjs`, on `loadLibrary(cleanRoot())` with `lib.chapters` set by hand:

```js
test('chapters are headed in the story order and their rows say which chapter', () => {
  lib.chapters = [{ id: 'c1', no: 1, title: 'First <b>', ids: [a.no] }, { id: 'c2', no: 2, title: 'Second', ids: [b.no] }, { id: 'c3', no: 3, title: 'Empty', ids: [] }];
  const { html } = libraryPage(lib, {});
  assert.match(html, /<h2 class="chapter" data-chapter="c1"><span class="ch-no">1<\/span> First &lt;b&gt;<\/h2>\s*<article class="row" data-no="[^"]+" data-chapter="c1"/);
  assert.doesNotMatch(html, /data-chapter="c3"/);
});
test('without chapters the page has no headings', () => assert.doesNotMatch(libraryPage(lib, {}).html, /class="chapter"/));
test('edit extras: assets, data and row marks', () => {
  const { html } = libraryPage(lib, { depth: 1, extra: { css: ['web/edit.css'], js: ['web/edit.js'], data: { v: '</script>' }, mark: () => ' data-hidden="true"' } });
  assert.match(html, /href="\.\.\/web\/edit\.css"/);
  assert.match(html, /<script type="application\/json" id="edit-data">\{"v":"\\u003c\/script>"\}<\/script>/);
  assert.match(html, /<article class="row" data-no="[^"]+" data-hidden="true"/);
});
```

and for `mapPage` and `aboutPage`: the same HTML as the steps wrote before for the fixtures (compare `mapPage(lib, { meta }).html` with what `steps/50-map.mjs` writes through a capturing `ctx`).

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/pages.test.mjs` — Expected: FAIL, `lib/pages.mjs` missing.

- [ ] **Step 3: Implement** by moving the bodies of the three steps into `lib/pages.mjs` (the steps keep only reading files, `readKinds`, `locatePlaces`, and `ctx.write`). In `library.js`, headings are kept in a `Map(chapter id → element)`; when nothing is searched and the sort is `no`, `wanted` puts each heading before the first row of its chapter in `sorted`, and a heading is hidden when none of its chapter's rows shows; otherwise headings are left out of the list. `library.css`: `.chapter` in the headers' serif, one size above the row titles, with the room above it that a section break needs.

- [ ] **Step 4: Run all tests.** Run: `npm test` — Expected: all pass, the step tests unchanged.

- [ ] **Step 5: Commit.**

### Task 3: The archive document

**Files:**
- Create: `library/cloud/doc.mjs`
- Test: `library/test/doc.test.mjs`

**Interfaces:**
- Consumes: `loadLibrary` (`lib/records.mjs`), the document shape (Global Constraints).
- Produces:
  - `docFromLibrary(lib, { root, chapterTitles, pictures, idea, about }) -> doc` — `lib` from `loadLibrary(root)` with `locatePlaces(lib)` already run; `chapterTitles`: `{ [section number]: title }`, one chapter per section that has rows, in section order, ids `c1…cN`; `pictures`: `Map(no → { pictures: [{src, w, h, caption}], thumb })`; `idea`, `about`: file texts. Records lose `no`, `images`, and the load-time fields (`section`, `dir`, `abs`, `find`); `file` becomes a repository path; `find` moves to the row's `find`. `next = { row: 1, chapter: N + 1 }`.
  - `numbering(doc) -> Map<id, string>` — every row; `''` for hidden rows.
  - `libFromDoc(doc, { hidden = false, lists = { colours: {}, names: [], glossary: [] } }) -> lib` — `entries` in story order, each `{ ...record, id, no, section: chapter index + 1, chapter: chapter id, hidden, text: record.text ?? [], keywords: record.keywords ?? [], images: [], find, pictures, thumb, dir: null, abs: null, sourceNumbers }`, hidden rows only when `hidden` is true; `chapters: [{ id, no, title, ids }]` (ids of the entries included); `keywords`, `aliases`, `places`, `colours`, `names`, `glossary`; `problems: []`.
  - `diffDocs(before, after) -> { changed, added, removed, hidden, shown, order, chapters, idea, about, keywords, count }` — arrays of ids and booleans; `changed` = rows in both whose `record`, `find` or `pictures` differ (by `JSON.stringify` of each, keys sorted); `order` = the sequence of visible ids differs; `chapters` = titles or count differ; `count` = `changed + added + removed + hidden + shown` lengths plus one for each true boolean.
  - `checkDoc(doc, { types = TYPES }) -> string[]` — problems: a chapter or row id twice, a row in no chapter or in two, a row id in a chapter that `rows` lacks, an unknown type, keyword or place, more than 5 keywords, an empty title, a `year` that is neither an integer nor null.

- [ ] **Step 1: Write the failing tests** on the fixtures:

```js
test('moving in keeps every row, in order, under its section', () => {
  const doc = docFromLibrary(lib, { root, chapterTitles: { 1: 'One', 2: 'Two' }, pictures: new Map(), idea: 'x', about: 'y' });
  assert.deepEqual(doc.chapters.flatMap((c) => c.rows), lib.entries.map((e) => e.no));
  assert.equal(doc.chapters[0].title, 'One');
  assert.deepEqual(checkDoc(doc), []);
  assert.equal(doc.rows[lib.entries[0].no].record.no, undefined);
});
test('numbers follow the place and skip hidden rows', () => {
  const doc = sample(); // c1: a, b, c ; c2: d
  doc.rows.b.hidden = true;
  assert.deepEqual(Object.fromEntries(numbering(doc)), { a: '1.01', b: '', c: '1.02', d: '2.01' });
});
test('ten rows and more keep two digits', () => assert.equal(numbering(sampleWith(12)).get('l'), '1.12'));
test('the public lib leaves hidden rows out; the edit lib keeps them', () => {
  const doc = sample(); doc.rows.b.hidden = true;
  assert.deepEqual(libFromDoc(doc).entries.map((e) => e.id), ['a', 'c', 'd']);
  assert.deepEqual(libFromDoc(doc, { hidden: true }).entries.map((e) => [e.id, e.no]), [['a', '1.01'], ['b', ''], ['c', '1.02'], ['d', '2.01']]);
});
test('diff names what changed', () => {
  const before = sample(); const after = structuredClone(before);
  after.rows.a.record.title = 'New'; after.rows.c.hidden = true;
  after.chapters[0].rows.reverse();
  const d = diffDocs(before, after);
  assert.deepEqual([d.changed, d.hidden, d.order], [['a'], ['c'], true]);
});
test('checkDoc names a row in two chapters', () => { const doc = sample(); doc.chapters[1].rows.push('a'); assert.match(checkDoc(doc).join('\n'), /a.*two chapters/); });
```

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/doc.test.mjs` — Expected: FAIL, module missing.
- [ ] **Step 3: Implement `library/cloud/doc.mjs`.**
- [ ] **Step 4: Run all tests.** Run: `npm test` — Expected: all pass.
- [ ] **Step 5: Commit.**

### Task 4: Edit operations

**Files:**
- Create: `library/cloud/ops.mjs`
- Test: `library/test/ops.test.mjs`

**Interfaces:**
- Consumes: `numbering`, `checkDoc` (Task 3), `TYPES` (`lib/records.mjs`).
- Produces: `export class OpError extends Error {}`; `applyOp(doc, op) -> { doc, result }`, never changing its input (`structuredClone` first), throwing `OpError` with one of the exact lines of Global Constraints, or a plain sentence naming the field, when an op cannot apply. The ops (round one):

| `op.op` | fields | does | `result` |
|---|---|---|---|
| `set-row` | `id`, `fields` | merges fields into the record; a field set to `''`, `null` or `[]` is removed, except `title`, `type`, `keywords`, `text` | `{}` |
| `set-pictures` | `id`, `pictures: [{src, caption}]` | keeps the row's pictures named by `src`, in that order, with those captions; a `src` the row lacks is refused | `{}` |
| `move-row` | `id`, `chapter`, `index` | takes the row out, puts it at `index` (clamped) of `chapter`'s `rows` | `{}` |
| `set-number` | `id`, `number` | see below | `{}` |
| `hide-row` | `id`, `hidden` | sets `hidden` | `{}` |
| `remove-row` | `id` | deletes the row and its place in its chapter | `{}` |
| `add-row` | `chapter`, `index`, `title`, `type` | new row `r${next.row}`, record `{ title, type, date: '', year: null, keywords: [], text: [] }`, `find` empty, no pictures | `{ id }` |
| `add-chapter` | `index`, `title` | new chapter `c${next.chapter}` at `index` | `{ id }` |
| `rename-chapter` | `chapter`, `title` | | `{}` |
| `move-chapter` | `chapter`, `index` | | `{}` |
| `remove-chapter` | `chapter` | refused unless its `rows` is empty | `{}` |
| `add-keyword` | `label` | id = the label lower-cased, accents taken off (NFD, marks removed), runs of anything but `a-z0-9` as `-`, trimmed of `-`; `-2`, `-3`… if taken; a label equal to an existing one (case and spacing aside) returns that id | `{ id, existed }` |
| `set-idea` | `text` | refused if `parseIdea(text, doc)` reports an error | `{}` |
| `set-about` | `text` | | `{}` |

Fields `set-row` takes and how each is checked: `title` (non-empty after trim), `type` (in `TYPES`), `date` (string), `year` (integer or null), `keywords` (known ids or folded ids, resolved, no repeats, at most 5), `text` (strings; empty ones dropped), `holder`, `creator`, `rights` (strings), `confidence` (`{ level: 'read'|'secondary'|'lead', note? }`), `source` (`{ label?, url? }`), `place` (a known place id or null), `side_by_side` (boolean). Any other field is refused.

`set-number` (the algorithm the tests pin):

```js
const NUMBER = /^\s*(\d{1,3})\.(\d{1,3})\s*$/;
// chapter n (from 1) and place p (from 1). Refused: no match, n < 1, p < 1 → 'A number is a chapter and a place, as in 2.05.';
// n > chapters → `There is no chapter ${n}.`
// Take the row out. V = the visible rows left in chapter n. If V has a p-th row, put the row just
// before it; otherwise put it last in the chapter (after any hidden rows at the end).
```

- [ ] **Step 1: Write the failing tests**, on `sample()` = `c1: a, b, c, d` and `c2: e, f`:

```js
test('typing a number moves the row there and the rest move down', () => {
  const { doc } = applyOp(sample(), { op: 'set-number', id: 'e', number: '1.02' });
  assert.deepEqual(doc.chapters.map((c) => c.rows), [['a', 'e', 'b', 'c', 'd'], ['f']]);
});
for (const [typed, rows] of [['1.2', ['a', 'f', 'b', 'c', 'd']], [' 01.02 ', ['a', 'f', 'b', 'c', 'd']], ['1.99', ['a', 'b', 'c', 'd', 'f']]]) {
  test(`"${typed}" is understood`, () => assert.deepEqual(applyOp(sample(), { op: 'set-number', id: 'f', number: typed }).doc.chapters[0].rows, rows));
}
for (const typed of ['3', '1.00', '0.01', 'abc', '']) {
  test(`"${typed}" is refused`, () => assert.throws(() => applyOp(sample(), { op: 'set-number', id: 'f', number: typed }), { message: 'A number is a chapter and a place, as in 2.05.' }));
}
test('a chapter that does not exist is refused by name', () =>
  assert.throws(() => applyOp(sample(), { op: 'set-number', id: 'f', number: '7.01' }), { message: 'There is no chapter 7.' }));
test('hidden rows are not counted when placing by number', () => {
  const doc = sample(); doc.rows.b.hidden = true;
  assert.deepEqual(applyOp(doc, { op: 'set-number', id: 'f', number: '1.02' }).doc.chapters[0].rows, ['a', 'b', 'f', 'c', 'd']);
});
test('the input is never changed', () => { const doc = sample(); const copy = structuredClone(doc); applyOp(doc, { op: 'remove-row', id: 'a' }); assert.deepEqual(doc, copy); });
test('add-row gives r1, then r2', () => {
  const one = applyOp(sample(), { op: 'add-row', chapter: 'c2', index: 0, title: 'T', type: 'Poster' });
  const two = applyOp(one.doc, { op: 'add-row', chapter: 'c2', index: 0, title: 'U', type: 'Poster' });
  assert.deepEqual([one.result.id, two.result.id, two.doc.chapters[1].rows.slice(0, 2)], ['r1', 'r2', ['r2', 'r1']]);
});
test('a chapter with rows, hidden or not, cannot be removed', () => {
  const doc = sample(); doc.rows.e.hidden = true; doc.rows.f.hidden = true;
  assert.throws(() => applyOp(doc, { op: 'remove-chapter', chapter: 'c2' }), { message: 'Only an empty chapter can be removed.' });
});
test('a sixth keyword is refused, a folded one resolved', () => { /* five keywords set; a sixth throws; an alias id is stored as its target */ });
test('add-keyword: "Città nuova" → "citta-nuova", again → existed', () => { /* … */ });
test('set-pictures keeps the named pictures in the given order and refuses a stranger', () => { /* … */ });
test('set-row refuses an unknown field and an unknown type', () => { /* … */ });
```

(The `/* … */` tests are written out in full by the implementer from the table above: one assertion per rule.)

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/ops.test.mjs` — Expected: FAIL, module missing.
- [ ] **Step 3: Implement `library/cloud/ops.mjs`.** After every op, `checkDoc` of the result must be empty (an internal error otherwise).
- [ ] **Step 4: Run all tests.** Run: `npm test` — Expected: all pass.
- [ ] **Step 5: Commit.**

### Task 5: Rendering from the document

**Files:**
- Create: `library/cloud/render.mjs`
- Test: `library/test/render.test.mjs`

**Interfaces:**
- Consumes: `libFromDoc`, `diffDocs` (Task 3); `libraryPage`, `mapPage`, `aboutPage` (Task 2); `searchIndex`; `parseIdea`; `renderMarkdown` (`lib/longread.mjs`); `readKinds`.
- Produces:
  - `loadLists(root) -> Promise<{ colours, names, glossary, kinds, mapMeta }>` — reads `library/content/{colours,names,glossary,kinds}.json` and `library/map-data/dots.json` (export the readers of colours and sets from `lib/find.mjs` for this, as `readSearchLists(root, report)`).
  - `renderSite(doc, lists) -> { files: Map<path, { body: string, type: string }>, problems }` — the four public files from `libFromDoc(doc)`, depth 0; types `text/html; charset=utf-8` and `application/json; charset=utf-8`.
  - `renderEditPage(doc, { version, published, lists }) -> string` — the Library from `libFromDoc(doc, { hidden: true })` at depth 1 (the page lives at `/edit/`), with `extra = { css: ['web/edit.css'], js: ['web/edit.js'], data: { version, doc, types: TYPES, summary: summaryLine(diffDocs(published, doc)) , changed: [...] }, mark }`; `mark` gives `data-hidden="true"` and `data-changed="true"`. `published` is the latest publish's document, or null (then every row counts as added).
  - `renderEditRow(doc, id, lists) -> string` — one `<article class="row">` exactly as `renderEditPage` draws it.
  - `editSearch(doc, lists) -> object` — `searchIndex` of `libFromDoc(doc, { hidden: true })`.
  - `summaryLine(diff) -> string` — parts in this order, each only when not zero/false: `N rows changed` (`1 row changed`), `N added`, `N removed`, `N hidden`, `N shown again`, `order changed`, `chapters changed`, `idea changed`, `About changed`, `keywords changed`; joined by `, `; `No changes since the last publish` when nothing.
  - The idea: `parseIdea(doc.idea, doc)`; the stand-in label stays while the text starts with `status: stand-in`.

- [ ] **Step 1: Write the failing tests**, on a document made by `docFromLibrary` from the fixtures (Task 3), the anti-goals first:

```js
test('a hidden row is in no public file', () => {
  const doc = fixtureDoc(); const id = firstId(doc);
  doc.rows[id].hidden = true; doc.rows[id].record.title = 'HIDDEN-TITLE-7f3';
  doc.rows[id].pictures = [{ src: 'https://x/HIDDEN-PIC.jpg', w: 1, h: 1, caption: '' }];
  doc.rows[id].find.on = ['HIDDEN-TERM'];
  const { files } = renderSite(doc, lists);
  for (const [path, { body }] of files) for (const mark of ['HIDDEN-TITLE-7f3', 'HIDDEN-PIC', 'HIDDEN-TERM', `"${id}"`]) assert.ok(!body.includes(mark), `${mark} in ${path}`);
});
test('markup typed into a title, a text, a chapter title and the idea stays words', () => {
  const doc = fixtureDoc(); const id = firstId(doc);
  doc.rows[id].record.title = '<script>alert(1)</script> & "q"';
  doc.rows[id].record.text = ['</script><b>x</b>'];
  doc.chapters[0].title = '<img src=x onerror=alert(1)>';
  doc.idea = 'A <i>tag</i> and [[press]]';
  const page = renderEditPage(doc, { version: 1, published: null, lists });
  const site = renderSite(doc, lists).files.get('index.html').body;
  for (const html of [page, site]) { assert.ok(!html.includes('<script>alert')); assert.ok(!html.includes('<img src=x')); assert.ok(!html.includes('<b>x</b>')); }
  assert.equal(page.match(/<\/script>/g).length, page.match(/<script\b/g).length); // the JSON cannot close its own tag
});
test('the public Library has chapter headings and numbers from the place', () => { /* index.html holds <h2 class="chapter" … ch-no">1< and the first row shows c-no 1.01 */ });
test('an address naming a hidden row opens nothing: the row is not on the page', () => { /* parseState('#o=<hidden id>', known-from-page).o is [] */ });
test('the edit page carries hidden rows, marked, and the draft as data', () => { /* data-hidden="true" on the hidden row; edit-data JSON parses to {version: 1, doc, types, summary} */ });
test('summaryLine', () => {
  assert.equal(summaryLine({ changed: ['a', 'b'], added: ['r1'], removed: [], hidden: ['c'], shown: [], order: true, chapters: false, idea: false, about: false, keywords: false }), '2 rows changed, 1 added, 1 hidden, order changed');
  assert.equal(summaryLine({ changed: [], added: [], removed: [], hidden: [], shown: [], order: false, chapters: false, idea: false, about: false, keywords: false }), 'No changes since the last publish');
});
test('the published site from a fresh move-in lists every fixture row with its title and pictures', () => { /* each lib entry's title is in index.html; img count per row equals pictures.length */ });
```

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/render.test.mjs` — Expected: FAIL, module missing.
- [ ] **Step 3: Implement `library/cloud/render.mjs`.**
- [ ] **Step 4: Run all tests.** Run: `npm test` — Expected: all pass.
- [ ] **Step 5: Commit.**

### Task 6: The database and the store

**Files:**
- Create: `library/cloud/schema.sql`, `library/cloud/db.mjs`, `library/cloud/store.mjs`
- Modify: `package.json` (dependencies as in Global Constraints; `npm install`)
- Test: `library/test/store.test.mjs` (on PGlite in memory)

**Interfaces:**
- Produces, `schema.sql` (created by `store.init()`, `if not exists`; the old mirror tables of `library/db/schema.sql` are left alone):

```sql
create table if not exists draft (id smallint primary key default 1 check (id = 1), version integer not null, doc jsonb not null, saved_at timestamptz not null default now());
create table if not exists publishes (id serial primary key, at timestamptz not null default now(), kind text not null check (kind in ('publish', 'set-aside')), doc jsonb not null, summary text);
create table if not exists site_files (path text primary key, body text not null, content_type text not null, publish_id integer not null references publishes (id));
create table if not exists login_failures (at timestamptz not null default now());
```

- Produces, `db.mjs`: `neonDb(url) -> Db` (a `Pool` from `@neondatabase/serverless`), `pgliteDb(pglite) -> Db`, where `Db = { query(text, params = []) -> Promise<rows[]>, transaction(fn: (q: (text, params) => Promise<rows[]>) => Promise<T>) -> Promise<T>, end() }`.
- Produces, `store.mjs`: `export class ConflictError extends Error { version }`, `makeStore(db) -> Store`:
  - `init()`; `getDraft() -> { version, doc, savedAt } | null`;
  - `createDraft(doc, { replace = false }) -> 1` (throws `Error('There is a draft already; --replace to overwrite it')` unless `replace`);
  - `saveDraft(doc, expected) -> version` (`update … where id = 1 and version = $expected`; none updated → `ConflictError` carrying the current version);
  - `latestPublish() -> { id, at, doc } | null` (kind `publish` only);
  - `publish(expected, files, summary) -> { id }` — one transaction: draft at `expected` (else `ConflictError`), insert the publish, replace all rows of `site_files` with `files`;
  - `discard(expected) -> version` — draft becomes the latest publish's document (`Error('Nothing has been published yet')` if none);
  - `restore(publishId, expected) -> version` — one transaction: the current draft is inserted as kind `set-aside`, the draft becomes that publish's document;
  - `listPublishes() -> [{ id, at, kind, summary }]`; `siteFile(path) -> { body, type } | null`;
  - `recentLoginFailures(minutes) -> number`; `recordLoginFailure()`.

- [ ] **Step 1: Write the failing tests** (`new PGlite()` per test, `makeStore(pgliteDb(pg))`, `init()`):

```js
test('a save against an older version is refused and says the current one', async () => {
  await store.createDraft(sample());
  assert.equal(await store.saveDraft(sample(), 1), 2);
  await assert.rejects(store.saveDraft(sample(), 1), (e) => e instanceof ConflictError && e.version === 2);
});
test('publish stores the document and replaces the site files', async () => {
  await store.createDraft(sample());
  await store.publish(1, new Map([['index.html', { body: 'one', type: 'text/html' }], ['old.json', { body: 'x', type: 'application/json' }]]), 's');
  await store.publish(1, new Map([['index.html', { body: 'two', type: 'text/html' }]]), 's');
  assert.equal((await store.siteFile('index.html')).body, 'two');
  assert.equal(await store.siteFile('old.json'), null);
  assert.equal((await store.listPublishes()).length, 2);
});
test('discard goes back to the latest publish', async () => { /* createDraft, publish, saveDraft(changed), discard → getDraft().doc deepEqual the published doc, version +1 */ });
test('restore sets the draft aside first', async () => { /* … listPublishes holds a set-aside whose doc is the draft before */ });
test('a publish against an older version changes nothing', async () => { /* rejects ConflictError; siteFile unchanged; listPublishes unchanged */ });
test('login failures are counted in their window', async () => { /* record 3 → recentLoginFailures(15) === 3 */ });
```

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/store.test.mjs` — Expected: FAIL, modules missing.
- [ ] **Step 3: Implement** `schema.sql`, `db.mjs`, `store.mjs`. Documents go in as `$1::jsonb` with `JSON.stringify`.
- [ ] **Step 4: Run all tests.** Run: `npm test` — Expected: all pass.
- [ ] **Step 5: Commit.**

### Task 7: The login

**Files:**
- Create: `library/cloud/auth.mjs`, `library/tools/password.mjs`
- Modify: `package.json` (`"password": "node library/tools/password.mjs"`)
- Test: `library/test/auth.test.mjs`

**Interfaces:**
- Produces: `hashPassword(password) -> Promise<string>`, `verifyPassword(password, stored) -> Promise<boolean>` (constant-time compare; a malformed `stored` is false), `makeSession(secret, now = Date.now()) -> string`, `readSession(cookieHeader, secret, now = Date.now()) -> boolean`, `sessionCookie(value, { secure = true }) -> string`, `clearedCookie({ secure = true }) -> string`, `COOKIE = 'archivio_edit'`, `SESSION_MS = 2592000000`.
- `library/tools/password.mjs`: reads a password twice from the terminal without echo (refuses if they differ or are shorter than 12 characters), hashes it, and for `production` and `preview` runs `vercel env add EDIT_PASSWORD_HASH <env> --cwd library/.deploy` with the hash on stdin (after `vercel env rm … --yes` if it exists); with `--print` it prints the hash instead. The password never appears on screen or in a file.

- [ ] **Step 1: Write the failing tests:**

```js
test('the right password passes, a wrong one does not', async () => { const h = await hashPassword('correct horse battery'); assert.ok(await verifyPassword('correct horse battery', h)); assert.ok(!(await verifyPassword('correct horse batterY', h))); assert.match(h, /^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/); });
test('a session lasts 30 days and no longer', () => { const v = makeSession('s', 0); assert.ok(readSession(`archivio_edit=${v}`, 's', SESSION_MS - 1)); assert.ok(!readSession(`archivio_edit=${v}`, 's', SESSION_MS + 1)); });
test('a session signed with another secret, or altered, fails', () => { const v = makeSession('s', 0); assert.ok(!readSession(`archivio_edit=${v}`, 't', 1)); assert.ok(!readSession(`archivio_edit=9${v}`, 's', 1)); });
test('the cookie is locked down', () => assert.equal(sessionCookie('v'), 'archivio_edit=v; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000'));
test('a malformed stored hash is simply wrong', async () => assert.equal(await verifyPassword('x', 'nonsense'), false));
```

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/auth.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** with `node:crypto` (`scrypt`, `createHmac`, `timingSafeEqual`, `randomBytes`).
- [ ] **Step 4: Run all tests.** Run: `npm test` — Expected: all pass.
- [ ] **Step 5: Commit.**

### Task 8: The functions, the routes and the deployment's shape

**Files:**
- Create: `library/cloud/handlers.mjs`, `api/site.mjs`, `api/edit.mjs`, `library/cloud/assemble.mjs`, `vercel.json`, `.vercelignore`, `library/web/login.css` (the login form's few lines, or rules in `base.css`)
- Modify: `.gitignore` (add `.vercel/`, `.env*.local`, `library/.public/`)
- Test: `library/test/handlers.test.mjs`

**Interfaces:**
- Consumes: `makeStore` (Task 6), `auth.mjs` (Task 7), `render.mjs` (Task 5), `applyOp`/`OpError` (Task 4), `diffDocs`, `numbering` (Task 3).
- Produces: `makeHandlers({ store, env: { EDIT_PASSWORD_HASH, SESSION_SECRET }, lists, purge = async () => {}, secure = true, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) -> { site(request), edit(request) }`, both `(Request) -> Promise<Response>`:
  - `site`: the route is the query `path` (`index.html`, `map.html`, `about.html`, `search.json`; anything else 404). The stored file with the public headers of Global Constraints; before any publish, 503 `Not published yet` with `no-store`.
  - `edit`: the route is the query `route`:
    - `''` GET — logged in: `renderEditPage` of the draft (`published` = latest publish's document); not logged in: the login form (one password field, button `Log in`, in the site's frame, `noindex`).
    - `search.json` GET — `editSearch` of the draft.
    - `login` POST (form `password`) — refused 429 if over the limit; wrong: `recordLoginFailure`, wait 1 s, the form again with `Wrong password.` (401); right: 303 to `/edit/` with `sessionCookie(makeSession(SESSION_SECRET))`.
    - `logout` POST — 303 to `/edit/` with `clearedCookie`.
    - `op` POST JSON `{ version, op }` — `applyOp` on the draft, `saveDraft`; answers 200 `{ version, numbers: { id: number }, chapters: [{ id, no, title, rows }], summary, row?: html }` (`row` for `set-row`, `set-pictures`, `add-row`, `hide-row`: `renderEditRow` of that row); `OpError` → 422 `{ error }`; `ConflictError` → 409 `{ error: 'Changed in another window. Reload to see it.', version }`.
    - `publish` POST JSON `{ version }` — `renderSite` of the draft, `store.publish(version, files, summary)`, then `purge()`; 200 `{ id }`. Problems with level `error` from rendering → 422 and nothing published.
    - `discard` POST JSON `{ version }` — 200 `{ version }`.
    - Every edit route but the GET of `''` and `login`: not logged in → 401 `{ error: 'logged-out' }`. Every POST: `Origin` host ≠ `Host` → 403. Every edit response: `Cache-Control: no-store`.
- `api/site.mjs` and `api/edit.mjs` (if Vercel does not take `.mjs` files in `api/` as functions, name them `.js`: the package is `"type": "module"`): `export async function GET(request)` / `POST`, each calling a module-level `makeHandlers` built once per instance with `makeStore(neonDb(process.env.DATABASE_URL))`, `loadLists(root)` and `purge = () => dangerouslyDeleteByTag('site')` from `@vercel/functions`. Before coding, read `node_modules/@vercel/functions` for the exact name and arguments of the tag purge and the cache headers it honours; if they differ from Global Constraints, follow the package and say so in the commit.
- `vercel.json`:

```json
{
  "buildCommand": "node library/cloud/assemble.mjs",
  "outputDirectory": "library/.public",
  "installCommand": "npm install",
  "regions": ["fra1"],
  "cleanUrls": false,
  "functions": { "api/*.mjs": { "includeFiles": "library/{content/kinds.json,content/colours.json,content/names.json,content/glossary.json,map-data/dots.json}" } },
  "redirects": [{ "source": "/edit", "destination": "/edit/", "permanent": false }],
  "rewrites": [
    { "source": "/", "destination": "/api/site?path=index.html" },
    { "source": "/(index\\.html|map\\.html|about\\.html|search\\.json)", "destination": "/api/site?path=$1" },
    { "source": "/edit/", "destination": "/api/edit?route=" },
    { "source": "/edit/:route", "destination": "/api/edit?route=:route" }
  ]
}
```

- `assemble.mjs`: empties `library/.public/` and copies into it `library/web/` (as `web/`) and `library/map-data/dots.json`, `dots.bin.gz` (as `map-data/`).
- `.vercelignore`: `research_notes/`, `reports/`, `Foto Vittoria/`, `docs/`, `library/.cache/`, `library/dist/`, `library/.deploy/`, `library/.public/`, `library/test/`, `library/mapgen/`, `.superpowers/`.

- [ ] **Step 1: Write the failing tests** (PGlite store; a draft from `sample()` published once; a session cookie from `makeSession`):

```js
test('the public page carries the cache tag and the published body', async () => {
  const res = await h.site(new Request('https://a.test/api/site?path=index.html'));
  assert.equal(res.headers.get('cache-tag'), 'site');
  assert.equal(res.headers.get('vercel-cdn-cache-control'), 'max-age=31536000');
  assert.match(await res.text(), /<article class="row"/);
});
test('before any publish the site says so and is not cached', async () => { /* 503, cache-control no-store */ });
test('an op without a session answers logged-out', async () => {
  const res = await h.edit(post('op', { version: 1, op: { op: 'hide-row', id: 'a', hidden: true } }, { cookie: '' }));
  assert.equal(res.status, 401); assert.deepEqual(await res.json(), { error: 'logged-out' });
});
test('an op from another origin is refused', async () => { /* Origin https://evil.test, Host a.test → 403 */ });
test('an op saves, renumbers and gives back the row', async () => {
  const res = await h.edit(post('op', { version: 1, op: { op: 'hide-row', id: 'b', hidden: true } }));
  const body = await res.json();
  assert.deepEqual([res.status, body.version, body.numbers.b, body.numbers.c], [200, 2, '', '1.02']);
  assert.match(body.row, /data-hidden="true"/);
});
test('a stale version is a conflict with the exact line', async () => { /* 409, error 'Changed in another window. Reload to see it.' */ });
test('publish writes the site and purges the cache', async () => { let purged = 0; /* makeHandlers({ purge: async () => purged++ }); publish → 200; site shows the change; purged === 1 */ });
test('a wrong password waits, counts and refuses after ten', async () => { /* wait stub records 1000; 11th try → 429 */ });
test('logging in sets the locked cookie and sends to /edit/', async () => { /* 303, location /edit/, set-cookie starts archivio_edit= and has HttpOnly; Secure; SameSite=Strict */ });
```

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/handlers.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `handlers.mjs`, the two API files, `assemble.mjs`, `vercel.json`, `.vercelignore`, `.gitignore` lines.
- [ ] **Step 4: Run all tests, then assemble.** Run: `npm test && node library/cloud/assemble.mjs && ls library/.public/web/edit.css library/.public/map-data/dots.bin.gz` — Expected: all pass; both files listed (edit.css arrives in Task 11; until then check `library/.public/web/library.js`).
- [ ] **Step 5: Commit.**

### Task 9: Moving in

**Files:**
- Create: `library/tools/move-in.mjs`
- Modify: `package.json` (`"move-in": "node --env-file-if-exists=library/.deploy/.env.local library/tools/move-in.mjs"`)
- Test: `library/test/movein.test.mjs`

**Interfaces:**
- Consumes: `loadLibrary`, `steps/10-pictures.mjs` (run with a build-like `ctx` into a temporary `out`, as `test/library.test.mjs`'s `renderFull` builds one), `stripJpeg`, `locatePlaces`, `docFromLibrary`, `checkDoc`, `makeStore`.
- Produces: `moveIn({ root, store, putPicture, chapterTitles = CHAPTER_TITLES, replace = false, dryRun = false }) -> { doc, rows, pictures, problems }` where `putPicture(file, name) -> Promise<string>` returns the picture's address; `devPictures(dir) -> putPicture` (copies into `dir`, returns `/dev-img/<name>`) and `blobPictures(token) -> putPicture` (the public store, size-checked), both exported. Command line: `npm run move-in [-- --dev] [--replace] [--dry-run]`; without `--dev` the store is Neon (`DATABASE_URL`) and `putPicture` is the public Blob store (`put('pictures/' + name, buffer, { access: 'public', addRandomSuffix: true, token: process.env.PICTURES_READ_WRITE_TOKEN, contentType: 'image/jpeg' })`, then a HEAD request whose `content-length` must equal the file's size); with `--dev` the store is PGlite at `library/.cache/dev-db/` and `putPicture` copies to `library/.cache/dev-img/<name>` and returns `/dev-img/<name>`.
- The chapter titles (the spec's list, with section 9 named for what it now holds):

```js
const CHAPTER_TITLES = { 0: 'Bolzano in dots', 1: 'Posters, graphics, postcards', 2: 'Newsreels and radio', 3: 'Press',
  4: 'Migration and the Option', 5: 'Landmarks', 6: 'Brand and tourism', 7: 'Browser checks', 8: 'The Semirurali',
  9: 'Emigration from Trentino', 10: 'Internal colonization', 12: 'Defusing by form: references', 13: 'The Cinema Corso',
  14: 'City architecture', 15: 'Film and radio', 16: 'Print', 17: 'The Monument visit', 18: 'Covered names' };
```

- Any `error` from `loadLibrary`, a section without a title, a JPEG that `stripJpeg` would still change, or an upload whose size differs: stop, write nothing, name it. It prints: rows, chapters, pictures uploaded, and the first five rows as `number · id · title`.

- [ ] **Step 1: Write the failing tests** on the fixtures (PGlite store, `putPicture = devPictures(<temp folder>)`, the fixtures' sections titled through `chapterTitles`):

```js
test('every fixture row moves in, in order, with its pictures as addresses', async () => {
  const { doc, rows } = await moveIn({ root, store, putPicture, chapterTitles: { 1: 'One', 2: 'Two', … } });
  assert.equal(rows, lib.entries.length);
  assert.deepEqual(doc.chapters.flatMap((c) => c.rows), lib.entries.map((e) => e.no));
  for (const row of Object.values(doc.rows)) for (const p of row.pictures) assert.match(p.src, /^\/dev-img\//);
  assert.equal((await store.getDraft()).version, 1);
});
test('a second move-in refuses unless asked to replace', async () => { /* rejects with 'There is a draft already; --replace to overwrite it' */ });
test('a section without a chapter title stops everything', async () => { /* rejects naming the section; getDraft() null; no picture written */ });
test('every picture written is free of metadata', async () => { /* each file in the temp folder: stripJpeg(buf).equals(buf) */ });
```

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/movein.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement `library/tools/move-in.mjs`.**
- [ ] **Step 4: Run all tests, then a dry run on the real library.** Run: `npm test && npm run move-in -- --dev --dry-run` — Expected: all pass; the dry run prints `277 rows, 18 chapters` and a picture count near 383, writes nothing.
- [ ] **Step 5: Commit.**

### Task 10: Working locally

**Files:**
- Create: `library/tools/dev.mjs`
- Modify: `package.json` (`"dev": "node library/tools/dev.mjs"`)
- Test: `library/test/dev.test.mjs`

**Interfaces:**
- Consumes: `makeHandlers` (Task 8), `pgliteDb`, `makeStore`, `loadLists`, `hashPassword`.
- Produces: `startDev({ port = 5180, dataDir = 'library/.cache/dev-db', password = 'dev' }) -> { url, close }`. A `node:http` server on `127.0.0.1` that routes as `vercel.json` does (the same table of rewrites, read from `vercel.json` so the two cannot drift), serves `library/web/` at `/web/`, `library/map-data/` at `/map-data/`, `library/.cache/dev-img/` at `/dev-img/`, uses `secure: false` cookies, a fresh random `SESSION_SECRET` per start, and the password `dev`. It never reads `DATABASE_URL`: local work cannot touch the real draft. (The spec says a Neon branch; PGlite gives the same guarantee without a Neon account step; the spec marked this a call.)

- [ ] **Step 1: Write the failing test:** `startDev` on a temp `dataDir` seeded by `moveIn` (fixtures, `--dev` mode): `GET /edit/` without a cookie shows the login form; `POST /edit/login` with `dev` answers 303 with a cookie that has no `Secure`; `GET /` before a publish is 503; `GET /web/library.js` is 200 `text/javascript`.
- [ ] **Step 2: Run to see it fail.** Run: `node --test library/test/dev.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement `library/tools/dev.mjs`.**
- [ ] **Step 4: Run all tests, then seed and open.** Run: `npm test && npm run move-in -- --dev --replace && npm run dev` — Expected: all pass; the server prints `http://127.0.0.1:5180/edit/ (password: dev)`.
- [ ] **Step 5: Commit.**

### Task 11: The edit layer in the page

**Files:**
- Create: `library/web/edit.js`, `library/web/editmodel.js`, `library/web/edit.css`, `library/web/vendor/sortable.esm.js`, `library/test/browser/edit.check.mjs`
- Modify: `package.json` (`"check:edit": "node library/test/browser/edit.check.mjs"`)
- Test: `library/test/editmodel.test.mjs`

**Interfaces:**
- Consumes: the `edit-data` JSON, the `data-hidden`/`data-changed`/`data-chapter`/`data-at` attributes, the op routes and their answers (Task 8), `rescan` (Task 2).
- Produces, `web/editmodel.js` (pure, tested in Node):
  - `dropTarget(sequence, draggedId) -> { chapter, index }` — `sequence` is the list after a drop, `[{ kind: 'chapter' | 'row', id }]`; the chapter is the nearest heading before the dragged row, `index` its place among that chapter's rows (hidden ones count). A row dropped above every heading goes to the first chapter at index 0.
  - `toParagraphs(text) -> string[]` (split at empty lines, each trimmed, empty ones dropped) and `fromParagraphs(list) -> string` (joined by one empty line).
  - `class OpQueue { constructor(send, version); push(op) -> Promise<answer>; version }` — sends one op at a time, each with the version the previous answer gave; a 409 or 401 rejects that op and every op queued after it, with the answer's `error`.
- Behaviour of `web/edit.js` (round one; the look is the spec's sketch in §5, icons drawn in `edit.js` as inline SVG line icons, 14 px, `currentColor`):
  - The bar above the idea, fixed under the frame: `Draft · <summary>`, then `Public site` (link to `/`), `Discard`, `Publish`, `Log out`. Publish and Discard ask with the exact lines (a `<dialog>`, never `window.confirm`); after Publish the summary reads `No changes since the last publish`; after Discard the page reloads.
  - A click on an icon, a field or a select never opens or closes the row.
  - Each row head: a grip (drag), ✎ on the number (a field; Enter sends `set-number`), ✎ on the title (a field), ✎ on the date (two fields: the date as words, and the year as a whole number for the date sort, sent together in one `set-row`), the type as a `<select>` of `types`, keywords each with ✕ and a ＋ that opens a list of the vocabulary with a last line `New keyword…` (sends `add-keyword`, then `set-row`), 👁 (`hide-row`), 🗑 (asks `Remove “<title>”? It goes at the next publish and can be brought back from an older publish.`, then `remove-row`).
  - Each open row: ✎ on the text (one `<textarea>`, paragraphs by empty lines), on Holder, Creator, Rights, Confidence (level select + note), Source (words + address), Place (a `<select>` of places, `None` first); each picture with ✕, ←, → and ✎ on its caption (`set-pictures`); a switch `Side by side` (`set-row` `side_by_side`).
  - `＋ row here` after each row and at the end of each chapter (asks for a title and a type, sends `add-row`); each chapter heading: grip, ✎ title, 🗑 when empty; `＋ chapter here` after each chapter's last row.
  - ✎ on the idea (a `<textarea>` with the Markdown, `set-idea`); in the bar a button `About ✎` that opens the About text in a `<dialog>` (`set-about`).
  - Every field saves on Enter (single-line) or on leaving it (all), puts the old value back on Escape, and on a refused save stays open, keeps the typed text and shows the answer's `error` under it. A row answered with `row` HTML is swapped in, then `rescan()`; numbers from `numbers` are written into every `.c-no` (`—` for hidden); chapter numbers and titles from `chapters`; after a move, the rows and headings are put in the order `chapters` gives, each row's `data-at` and `data-chapter` rewritten from it, then `rescan()`.
  - Dragging uses `Sortable` on `.list` with the grip as handle; while a chapter's grip is held the rows fold away (`.list.folding` hides `article.row`) so chapters move among chapters, and the drop sends `move-chapter`. Dragging is off, with the exact line in the status bar, unless the sort is `no` and nothing is searched or filtered.
  - Changed rows carry a small mark (`data-changed`), hidden rows are grey with `—` as number.
- `library/test/browser/edit.check.mjs`: starts `startDev` on a fresh seeded PGlite (fixtures), drives the installed Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) headless with puppeteer-core, and checks, failing with a message at the first miss: log in with `dev`; change a title and see it after reload; type `2.01` on a row of chapter 1 and see it move and the numbers change; drag a row below another and see the order after reload; hide a row and see `—`; Publish and see the public `/` without the hidden row and with the new title; a title saved after the cookie is deleted shows `Logged out. Log in again; what you typed is kept.` with the typed text still in the field; two saves fired back to back both land. It writes screenshots of the edit page and the public page to `library/.cache/check-edit/`.

- [ ] **Step 1: Write the failing tests** for `editmodel.js`:

```js
test('a row dropped under the second heading lands in that chapter at its place', () =>
  assert.deepEqual(dropTarget([{ kind: 'chapter', id: 'c1' }, { kind: 'row', id: 'a' }, { kind: 'chapter', id: 'c2' }, { kind: 'row', id: 'b' }, { kind: 'row', id: 'x' }], 'x'), { chapter: 'c2', index: 1 }));
test('a row dropped above every heading goes first in the first chapter', () =>
  assert.deepEqual(dropTarget([{ kind: 'row', id: 'x' }, { kind: 'chapter', id: 'c1' }, { kind: 'row', id: 'a' }], 'x'), { chapter: 'c1', index: 0 }));
test('paragraphs go both ways', () => { assert.deepEqual(toParagraphs(' One\n\n\n Two \n'), ['One', 'Two']); assert.equal(fromParagraphs(['One', 'Two']), 'One\n\nTwo'); });
test('two ops pushed at once go in order, each with the version before it', async () => {
  const seen = []; const q = new OpQueue(async ({ version, op }) => { seen.push([version, op.n]); return { status: 200, body: { version: version + 1 } }; }, 4);
  await Promise.all([q.push({ n: 1 }), q.push({ n: 2 })]);
  assert.deepEqual(seen, [[4, 1], [5, 2]]); assert.equal(q.version, 6);
});
test('after a conflict the ops queued behind it are not sent', async () => { /* first answers 409; second push rejects with the same error; send called once */ });
```

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/editmodel.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `editmodel.js`, then vendor Sortable (`npm pack sortablejs@1.15.7`, copy `modular/sortable.esm.js` with its header), then `edit.js` and `edit.css`, then `edit.check.mjs`.
- [ ] **Step 4: Run the tests and the browser check.** Run: `npm test && npm run check:edit` — Expected: all pass; the check prints each step as passed and the two screenshot paths. Look at both screenshots: the edit page is the Library with small black icons and the bar; the public page shows chapter headings and no icons.
- [ ] **Step 5: Commit.**

### Task 12: Sessions write into the draft

**Files:**
- Create: `library/tools/draft.mjs`
- Modify: `package.json` (`"draft": "node --env-file-if-exists=library/.deploy/.env.local library/tools/draft.mjs"`), `library/tools/find/accept.mjs`, `library/db/sync.mjs` (media half only)
- Test: `library/test/draftcli.test.mjs`

**Interfaces:**
- Consumes: `makeStore`, `neonDb`/`pgliteDb`, `renderSite`, `loadLists`, `checkDoc`, `diffDocs`, `summaryLine`, `libFromDoc`.
- Produces: `runDraft(args, { store, root, purge, out = console }) -> exit code`; the command line `npm run draft -- <command> [--dev]`:
  - `status` — draft version, saved time, `summaryLine` against the latest publish.
  - `pull [file]` — writes `{ version, doc }` (two-space JSON) to `file`, default `library/.cache/draft.json`.
  - `push [file]` — reads it, `checkDoc` (problems: print, exit 1), `saveDraft(doc, version)`; a conflict prints `The draft changed since it was pulled (now version N). Pull again.` and exits 1; on success prints the new version and `summaryLine`, and rewrites the file's version.
  - `publish` — as the edit route does; `purge` runs `vercel cache dangerously-delete --tag site --yes --cwd library/.deploy`.
  - `discard`, `restore <publish id>`, `publishes`.
- `accept.mjs` (`npm run find:check`) takes `--doc <file>` (a pulled draft): the lib is `libFromDoc(doc, { lists })`; without it, it keeps its old behaviour.
- `library/db/sync.mjs`: the database half is removed (it would empty the old tables once the records leave git); the media half stays as it is.

- [ ] **Step 1: Write the failing tests** (PGlite):

```js
test('pull, change, push: the draft has the change and a new version', async () => { /* pull → edit doc.rows.a.record.title → push → getDraft().version 2, title changed */ });
test('a push from an old pull is refused with the line', async () => { /* pull; saveDraft elsewhere; push → exit 1, out has 'The draft changed since it was pulled (now version 2). Pull again.' */ });
test('a push of a broken document is refused and nothing changes', async () => { /* row in two chapters → exit 1, version unchanged */ });
test('publish from the command line purges', async () => { /* purge stub called once; siteFile index.html present */ });
```

- [ ] **Step 2: Run to see them fail.** Run: `node --test library/test/draftcli.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run all tests and the search checks on a pulled dev draft.** Run: `npm test && npm run draft -- pull --dev && npm run find:check -- --doc library/.cache/draft.json` — Expected: all pass; `find:check` reports the same `19 of 19` as on the files (the dev draft holds the real library after Task 10's seed).
- [ ] **Step 5: Commit.**

### Task 13: Into the cloud, the author's first Publish, and the files retire

This task changes things outside the repository and needs the author at three points (marked **Author**). Ask before each deploy and each push.

**Files:**
- Modify: `README.md` (the library's sections: where rows live now, edit mode, `npm run draft`, `move-in`, `dev`, `check:edit`; the offline build retired), `package.json` (remove `build`, `check`, `present`, `serve`, the old `deploy`, `db:sync`'s database wording; `deploy` becomes `vercel deploy --prod`), `library/deploy.mjs` (deleted)
- Delete (one commit, after the first publish is live): every `research_notes/**/entries.json`, every `research_notes/**/find.json`, `library/content/entries.json`; `entries.draft.json` stays (thread 18's proposals, for `npm run import` in round two)

- [ ] **Step 1: The public picture store.** Run in `library/.deploy`: `vercel blob create-store archiviobz-pictures --access public --region fra1`; when asked for the environment variable's prefix, give `PICTURES` (if the command offers none, connect the store in the dashboard with that prefix). Then `vercel env ls` — Expected: `PICTURES_READ_WRITE_TOKEN` in Production, Preview, Development.
- [ ] **Step 2: Secrets.** **Author:** types `! npm run password` and their password twice. Then run `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | vercel env add SESSION_SECRET production --cwd library/.deploy` and the same for `preview` (the value never printed). Then `vercel env pull --cwd library/.deploy`. Expected: `vercel env ls` lists `EDIT_PASSWORD_HASH` and `SESSION_SECRET` in Production and Preview.
- [ ] **Step 3: Move in, for real.** Run: `npm run move-in` — Expected: `277 rows, 18 chapters`, every picture uploaded and size-checked, draft version 1. `npm run draft -- status` — Expected: version 1, every row counted as added (nothing published yet).
- [ ] **Step 4: A preview deployment.** Ask the author. Run at the repository root: `vercel link --project archiviobz --yes`, then `vercel deploy` — Expected: a preview address; `curl -sI <preview>/web/library.js` 200 (through `vercel curl` if the preview is protected; see the `access-protected-vercel-deployment` skill); `<preview>/edit/` shows the login form (which proves the bundled `library/content/*.json` reached the function: the page reads the kinds); archiviobz.vercel.app unchanged.
- [ ] **Step 5: The author's first Publish.** **Author:** logs in at `<preview>/edit/`, reads the chapters and their titles, renames or moves what they want, and presses Publish. Then check: `<preview>/` shows 277 rows less any the author hid, chapter headings, pictures; a row's `#o=<old number>` opens it.
- [ ] **Step 6: Production.** Ask the author. Run: `vercel deploy --prod` at the root. Expected: `https://archiviobz.vercel.app/` serves the published Library (`x-vercel-cache` HIT on a second request), `/edit/` the login, `/index.html#o=18.04` the Mendola postcard. Publish once more from edit mode with a harmless change and its revert, and see it live on the next request (`x-vercel-cache` not HIT just after).
- [ ] **Step 7: The files retire.** Run: `git rm` of the files listed above; edit `README.md` and `package.json`; delete `library/deploy.mjs`; `npm test` — Expected: all pass (the tests read `library/test/fixtures/`, not the deleted files). Commit: "The rows live in the database now: …".
- [ ] **Step 8: Record and hand over.** Update the memory file `studio1-research-library.md` (rows in Neon, edit mode at `/edit/`, the CLI for sessions, what round two holds) and write the session log `docs/superpowers/plans/2026-11-24-edit-mode-log.md` (what was done, checked, and left). Ask the author before pushing.
