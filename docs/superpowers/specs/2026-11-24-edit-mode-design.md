# Edit mode, with the archive in the cloud — design

2026-11-24 · status: **approved by the author on 2026-11-24**, as it stands · next: the revision session with the
professors, the week after (date not given)

A change to the research library (`docs/superpowers/specs/2026-11-10-research-library-design.md`,
`2026-11-17-search-design.md`). Until now the site was built on the author's Mac from the
`entries.json` files in git and the downloads on the disk, and uploaded as finished files; Vercel
built nothing. After this change the rows live in the database, the author edits them on the
site itself behind a login, and a Publish button makes the public site match.

Lines marked **(M)** are the author's decisions, in the author's words where quoted. Lines marked
**(call)** are the designer's calls: said in the conversation and not rejected, or sensible
defaults, free to overturn.

## Intent

**(M)** "a backend for this website. under credentials obv. Needs to be more like an edit mode
more than a backend a mode you enter where you can edit text, images, keywords, add new entries,
remove or hide entries, and also re-arrange entries. takes the same shape of the website. but with
icons to edit text etc."

**(M)** "the edit enables me to create a story by arranging items in a certain way."

The midterm critique was that the archive was "massive" and uncurated, "a re-invention of the
internet". Since then rows have been cut by asking for it in a session (400 → 277 on 24 Nov). Edit
mode puts curation in the author's hands: the order of the rows becomes the story, and the author
can write, cut, hide and arrange without going through a session.

## What exists today

- **Rows**: 277, in 22 `entries.json` files under `research_notes/**/files/` and one in
  `library/content/`. About 800 KB of records. Fields in use: `no title type date year keywords
  text confidence facts source rights file more creator holder images place side_by_side`.
- **Hidden search terms**: a `find.json` beside each `entries.json`, keyed by row number (`on`,
  `shows`, `colours`, `names`), 190 KB. Shared lists in `library/content/`: `colours.json`,
  `names.json`, `glossary.json`.
- **Vocabulary**: 55 keywords (`keywords.json`, with folds `{into}`), 21 places (`places.json`),
  8 kinds (`kinds.json`), 26 row types (`TYPES` in `library/lib/records.mjs`), the idea
  (`idea.md`, the midterm stand-in, `[[word|Keyword]]` marks keywords) and About (`about.md`).
- **Order**: by section, then running number. Sections today: 0 (one row, 0.03 *Bolzano in dots*),
  1–10, 12–18; numbers have gaps where rows were cut. Visitors can also sort by type or date.
- **Pictures**: 301 images named by records, plus first pages of PDFs; the build turns each into a
  JPEG of at most 1600 px (`sips`, `pdftoppm`, Mac only) and a 220 px thumbnail for the map, and
  strips camera, time and GPS (`steps/90-metadata.mjs`). Built output: 383 pictures, 131 MB.
- **Pages**: `index.html` (Library, 132 KB gzipped), `map.html` (three.js over
  `library/map-data/`, 30 MB, in git, made on the Mac by `npm run map-data`), `about.html`,
  `search.json`. The reads and story pages were emptied on 24 Nov.
- **Rendering code** (plain Node, string templates, no framework): `lib/shell.mjs` (frame),
  `lib/detail.mjs` (an open row, shared by Library and Map), `steps/50-map.mjs`,
  `steps/60-library.mjs`, `steps/70-about.mjs`, `lib/searchindex.mjs`, `lib/idea.mjs`. Front end in
  `library/web/` (vanilla modules: `library.js`, `state.js`, `search.js`, `results.js`, `map.js`,
  `pictures.js`, `lightbox.js`). 239 tests (`npm test`).
- **Cloud**: Vercel project `archiviobz` (Pro team), Neon Postgres `archiviobz-db` (free plan,
  fra1; today a mirror of the old 400 rows, rewritten by `npm run db:sync`), private Blob store
  `archiviobz-media` (the 730 originals, 1.4 GB, never deleted from).
- **Addresses in use**: `index.html#o=18.04` opens a row; `#q=`, `#k=`, `#t=`, `#s=` for search,
  keyword, kind and sort; `map.html#p=<place>`.

## Goals

1. **Edit on the site's own pages.** **(M)** Edit mode is the Library page as visitors see it, with
   icons on what can change. Not a separate admin.
2. **Change everything a row shows**: title, number, type, date, year, keywords, text, pictures
   (add, remove, reorder, captions, side by side), holder, creator, rights, confidence, source,
   place. **(M)** for text, images, keywords; **(call)** for the rest of what a row shows.
3. **Add a row, hide a row, remove a row.** **(M)**
4. **Arrange the rows into a story**, by dragging or by typing a number. **(M)** "the numbers must
   be able to be edited, or content dragged in the list top or bottom to move up or down."
5. **The number is the position.** **(M)** chose (a): drop a row at the top of chapter 1 and it is
   1.01; the rows after it move down one.
6. **Draft, then Publish.** **(M)** "every time i enter edit mode i see the draft, which i can
   discard/publish/edit". Nothing reaches visitors until Publish.
7. **Usable from any machine** with a browser and the password; no session with Claude, no Mac.
   **(M)** chose "the database becomes the source", "makes this actually usable".
8. **The public site stays as it is** in look, speed and addresses, apart from the chapter headings
   (below). **(call)**

## Non-goals

- **No second editor.** One login, the author's. **(call)** Say so if someone else needs one.
- **No editing on the Map page.** A row's place is set in the row, in the Library; the map follows.
  **(call)**
- **No new dot data in the cloud.** Making the map's dot field (`npm run map-data`: OpenStreetMap,
  the laser survey, Python) stays on the Mac. A new place shows on the map as a point; its
  buildings are drawn at full resolution after the next `npm run map-data` and code deploy.
  **(call)**
- **No editing of the shared search lists** (`colours.json`, `names.json`, `glossary.json`), the
  kinds or the row types in edit mode. They stay files in the code, changed in a session.
  **(call)**
- **No uploading of held originals** (PDFs, full scans) through edit mode. The web site has never
  linked them; they stay in the private store. **(call)**
- **No several stories.** One story: the Library list. **(call)**
- **No live collaboration**, comments or per-change undo. Discard (the whole draft) and the
  publish history are the undo. **(call)**

## Anti-goals (it would be a failure even if it worked)

- **A hidden row, or anything of the draft, reaching a visitor**: in a page, in `search.json`, on
  the map, in a picture's address that is guessable from public pages. Hidden is checked by tests.
- **A photograph's GPS, camera or time reaching the public**, from a new upload as from the
  migrated pictures. (The author's rule of 16 Nov: "purge my personal data".)
- **A published site slower than today's.** Visitors get cached pages, not a database query per
  visit.
- **Losing work**: a publish that cannot be undone, a draft that vanishes on a failed save, a
  picture deleted from storage.
- **An edit mode that looks like a CMS dashboard.** It is the same black-on-white page; the icons
  are small, black, line-drawn, and appear only in edit mode.

## Constraints

- Vercel: function request bodies are limited to 4.5 MB, so pictures go from the browser straight
  to Blob (client upload), not through a function.
- Node only in the cloud: `sips` and `pdftoppm` are not there. Pictures are resized with a library
  that runs in a Vercel Function (sharp, or the builder's equal), metadata stripped.
- Neon free plan: 0.5 GB. A full snapshot of the archive is about 1 MB of JSON (less stored, as
  Postgres compresses large values); hundreds of publishes fit.
- The repository is public (ArchivioBZ). Passwords and secrets live in Vercel's environment
  variables only, never in the code.
- The public addresses stay: `/`, `index.html`, `map.html`, `about.html`, `search.json`, and the
  `#o=`, `#q=`, `#k=`, `#t=`, `#s=`, `#p=` parts.

## Approaches

**A. Keep the site's own generator and run it in the cloud — chosen (M).** The code that writes the
pages today stays and reads from Neon instead of the JSON files. Edit mode is the same pages drawn
from the draft, with an edit layer on top; Publish turns the draft into the public pages. Keeps the
approved look exactly and the 239 tests' worth of rendering; the work is the edit layer, the
cloud picture step, the move of the data, and the login.

**B. Rewrite as a Next.js app.** Standard Vercel kit (login, page refresh on publish come ready),
but the Library, the row panels, the 700-line map and the search front end would be rewritten in
React to reach where the site already is, and the look would drift. Not chosen.

**Dropped:** a ready-made CMS (Sanity, Payload): edits happen in a separate admin, not on the
site's pages, which is against goal 1, and the renumbering and chapters would be custom anyway.
Keeping git as the source with a cloud build: the author chose the database as the source.

## The design

### 1. Where things live

| What | Where | Note |
|---|---|---|
| The draft: rows, chapters, idea, About, keywords, places | Neon, tables of the draft | The source. |
| Every publish | Neon, one row per publish holding the full snapshot (JSON) | The public site is drawn from the latest; older ones are the history. |
| The site's pictures (1600 px and 220 px, stripped) | a new **public** Blob store (`archiviobz-pictures`, **(call)**) | Served to visitors. |
| An uploaded photograph as it came | the private store `archiviobz-media` | Kept, never public. |
| The code, the map's dot data, the shared search lists, kinds, types | git, deployed to Vercel | As now. |

The old mirror tables (`entries`, `media`, `entry_media`, …) and `npm run db:sync`'s database half
are retired; its media half (backing up the research files on disk to the private store) stays.
**(call)**

### 2. A row's identity and its number

- **Every row has an id that never changes and is never shown as its number.** At migration a
  row's id is its number of today, frozen (`18.04` stays id `18.04` forever). A row added later
  gets a new id that cannot be taken for a number (for example `r` and a counter: `r1`, `r2`).
  **(call)**
- **Addresses name the id.** `#o=18.04` keeps opening the Mendola postcard whatever its number
  becomes, so every link shared until now keeps working, and so does every link shared later.
  The `sources` field and `find.json` were keyed by number, which is the id, so they carry over
  as they are. (This replaces the "lookup table for old links" said in the conversation: a lookup
  by number cannot work once numbers are reused by other rows.) **(call)**
- **The number shown is the position**: `chapter.place-in-chapter`, two digits after the point
  (1.01 … 1.99), counting only rows that are not hidden. **(M)** for the position, **(call)** for
  not counting hidden rows.
- **Typing a number moves the row** there; the rows from that place on move down one. A number
  past the end of a chapter puts the row last in it; a chapter number that does not exist is
  refused with a line saying so. **(call)**
- **Search by number** finds the row by the number it shows now. **(call)**
- At the first publish the shown numbers close up (section 0 becomes chapter 1, gaps left by cut
  rows disappear), so most numbers change at once. The ids keep the links. **(call)**

### 3. Chapters

- The sections of today become the chapters, in today's order, each with a title. The titles at
  migration are the threads' names, shortened (for example "Bolzano in dots", "Posters, graphics,
  postcards", "Newsreels and radio", "Press", "Migration and the Option", "Landmarks", "Brand and
  tourism", "Browser checks", "The Semirurali", "Overseas villages", "Internal colonization",
  "Defusing by form: references", "The Cinema Corso", "City architecture", "Film and radio",
  "Print", "The Monument visit", "Covered names"); the author renames them. **(call)**
- Chapters are numbered from 1 by their order, counting only chapters with at least one row that
  is not hidden: a chapter whose rows are all hidden, or that has none, takes no number (edit mode
  shows `—`), and the chapters after it close up. Typing a number names a numbered chapter; an
  unnumbered one is reached by dragging or by ＋ row here. **(M)** "Ideally yes", 25 Nov 2026, to
  the chapter numbers closing up. A chapter can be added (anywhere), renamed, dragged to another
  place (its rows renumber with it) and deleted once empty. **(call)**
- **The public Library shows a heading line per chapter** (number and title, in the serif of the
  headers) above its rows, in the story order. Sorting by type or date, and the search's two
  groups, drop the headings. Filtering by a keyword or a kind keeps the headings of chapters that
  still have rows showing. **(call)**
- A chapter heading has no text of its own beyond its title. **(call)** (A chapter introduction
  is an easy later addition if the story needs one.)

### 4. Draft and Publish

- **There is always exactly one draft.** Entering edit mode opens it. **(M)**
- **Every change saves on its own** when a field is left or a drag is dropped; there is no Save
  button. A failed save keeps the field open, says why, and loses nothing typed. **(call)**
- **A bar at the top in edit mode** says "Draft" and how it differs from what is public ("6 rows
  changed, 2 added, 1 hidden, order changed"), with **Publish**, **Discard**, **Public site**
  (opens the public page) and **Log out**. A row changed since the last publish carries a small
  mark. **(call)**
- **Publish** asks once ("Publish 9 changes?"), stores the draft as a new publish, and makes the
  public site show it within a minute. The draft stays as it is, now equal to the public site.
- **Discard** asks once, then makes the draft equal to the latest publish again. **(M)**
- **History** **(call)**: a list of past publishes (date, time, row count, what changed). Any one
  can be loaded as the draft, looked at in edit mode, and published again. Before it replaces the
  draft, the draft as it was is kept in the history too ("draft set aside, <date time>"), so
  loading an old publish never loses unpublished work. Nothing is deleted from the history.
- **Removed rows** **(call)**: a list, reached from the edit bar, of every row that is in some
  past publish and not in the draft, newest removal first. "Bring back" puts one into the draft as
  a hidden row at the end of the chapter it was last in (or of the last chapter, if that one is
  gone); a keyword or place it carried that no longer exists is dropped and said so.
- **Two windows** (the Mac and the phone) on the one draft: the draft carries a version; a save
  against an older version is refused with "changed in another window, reload". **(call)**

### 5. Edit mode on the page

Edit mode is entered at `/edit` (a login form if not logged in, then the Library in edit mode).
The public pages carry no link to it. **(call)** The look: the same page; icons in black line
drawing, small, at the end of what they act on, shown only in edit mode. **(call)**

```
 DRAFT · 6 changed, 2 added, 1 hidden, order changed     History  Public site  Discard  [Publish]  Log out

 The idea ✎
 Fascism made Bolzano Italian in public: in the press, on posters …

 ─────────────────────────────────────────────────────────────────────────────────────────────
 ⠿  1  Bolzano in dots ✎                                                          🗑
 ⠿  1.01 ✎  Bolzano in dots ✎                         Map ▾       2026 ✎     maps ✕  ＋     👁  🗑
    ＋ row here
 ⠿  2  Covered names ✎
 ⠿  2.01 ✎  Strada della Mendola verso Bolzano … ✎   Postcard ▾  1904–14 ✎  postcards ✕ language ✕ ＋   👁  🗑
 ░  —    Kurort Meran (hidden) ✎                       Postcard ▾  1909 ✎     …                   👁̸  🗑
 ⠿  2.02 ✎  …
    ＋ row here                                                           ＋ chapter here
```

- **⠿ drag handle** on every row and chapter heading: drag to move. On a phone, where dragging a
  long list is awkward, typing the number does the same. **(call)**
- **✎** turns the thing it follows into a field in the same place and font. Enter or leaving the
  field saves; Escape puts it back. The row text is one field, paragraphs separated by an empty
  line. **(call)**
- **Type** is a choice from the 26 types; **year** is a whole number, **date** free text.
- **Keywords**: each with ✕; ＋ opens the list of keywords to pick from, with a line "new
  keyword…" that adds one to the vocabulary. At most five per row, as now. **(call)**
- **👁** hides or shows the row. A hidden row stays in its place in edit mode, greyed, with no
  number. **(M)** for hide; **(call)** for how it looks.
- **🗑** removes the row from the draft after one question. It is gone from the public site at the
  next publish, and still in every earlier publish, so it can be brought back from the list of
  removed rows (§4). **(call)**
- **＋ row here** between rows and at the end of each chapter adds an empty row there, open, with
  the title field ready. A new row needs a title and a type before it is saved; the rest may stay
  empty. **(call)**
- **The open row** shows what it shows today, each part with ✎: pictures, text, Holder, Creator,
  Rights, Confidence (level and note), Source (words and address), Place (a choice from the
  places, with "new place…": a name and coordinates). Rows whose `more` link is a source or the
  map keep it; the builder decides whether `more` needs a field or follows from Source. **(call)**
- **Under the open row, folded: "Hidden"**, the parts no page shows: the search terms (`on`,
  `shows`, `colours` from the fixed list, `names`) and the `facts`, each a list, one item a line.
  **(call)**
- **The idea** at the top has ✎: its Markdown in a field, `[[word|Keyword]]` as now. **(call)**
  The About page has ✎ the same way. **(call)** The stand-in flag goes when the author first
  saves their own idea. **(call)**
- **Search, keyword and kind filters, and the sorts work in edit mode** on the draft. Dragging
  works only in the story order (sort by No., no filter, no search); otherwise the handles are
  off and a line says why. **(call)**

### 6. Pictures

- **＋ picture** in an open row: choose files (several at once) or drop them on the row. Each goes
  from the browser straight to the private store as it is, then is made into the site's 1600 px
  JPEG and 220 px thumbnail, orientation applied, every metadata field stripped, in the public
  store. **(call)** JPEG, PNG and WebP are taken; HEIC is the builder's call (iPhones usually hand
  a browser a JPEG).
- Each picture in edit mode shows with ✕ (remove from the row), ← → (move), and its caption ✎.
  A switch "side by side" on the row sets `side_by_side`. **(call)**
- Removing a picture removes it from the row, never from storage. **(call)**
- `rectify.py` (cutting an angled photograph square) stays a Mac tool; its output is uploaded like
  any picture. **(call)**

### 7. Keywords and places

- Keywords: added from a row (5); renamed in one place, from a list of keywords reached from the
  edit bar, where each shows its count; a keyword on no row can be deleted. Folds (`into`) are
  kept as they are and resolved at migration. **(call)**
- **(M)** The order of "All keywords" is the author's: "the keywords in the All the keywords cannot
  get moved. and put in an order" (25 Nov 2026, on the first day of edit mode). In edit mode its
  keywords are dragged into an order, kept as the vocabulary's order in the draft, and the public
  strip shows that order after Publish. A keyword new from a row joins the strip at once, at its
  end, with its count, and every count follows the draft as it changes: "New keywords added next
  to a file, do not get placed in the 'all the keywords' top field" (same day).
- Places: chosen in a row; a new place is a name and coordinates (typed, or pasted from a map
  link). It is a point on the map; see Non-goals for its buildings. **(call)**

### 8. The public site after a publish

- Drawn by the same rendering code from the latest publish: `index.html`, `map.html`,
  `about.html`, `search.json`, with hidden rows left out of all four. **(call)**
- **Cached at Vercel's edge**, so visitors never wait on the database; a publish refreshes the
  cache. How (pages written to storage at publish, or drawn on request and cached until the next
  publish) is the builder's call, held to: as fast as today, and a publish visible within a minute.
- Pictures are linked from the public store. The map's dot data and `web/` are deployed with the
  code as now.
- Anything the build now reads from the disk while building (picture sizes, the first pages of
  PDFs, such as row 4.03's) is captured once at migration and kept with the row.

### 9. Login

- One password, its hash in a Vercel environment variable; a signed session cookie (HttpOnly,
  Secure, SameSite=Strict), valid 30 days. Every edit page and every edit request checks it.
  Wrong passwords are slowed down. **(call)** No outside login service: one user does not need one.
- Log out ends the session on that device.

### 10. Moving in (once)

A script reads today's records the way `lib/records.mjs` does (folds resolved, problems checked),
and writes the draft: rows with their ids, order and chapters, `find.json` terms, facts, the
vocabulary, the idea, About. It uploads today's 383 built pictures (`library/.cache/img`, already
stripped by the build's metadata step, re-checked) to the public store. It writes the draft only:
archiviobz.vercel.app keeps showing today's site until the author presses Publish for the first
time, so the chapter titles and the new numbers reach visitors only when the author has read
them. The check before that first publish: the draft, drawn as the public site would be, lists
the same 277 rows, with the same texts and pictures, as archiviobz.vercel.app does now (apart from
numbers and chapter headings). **(call)**

### 11. Git after the move

- **The database is the source.** The `entries.json` and `find.json` files stop being read by the
  site. They are removed from the repository in one commit that says so (git history keeps them),
  so that two sources cannot drift apart. **(call)**
- **Backup**: `npm run pull` on any machine fetches the latest publish and writes it to
  `library/content/published.json` for a commit. Edit mode also offers the latest publish as a
  download. **(call)** Since the repository is public, a hidden row is in that backup: hidden means
  "not in the story", not "secret". **(call)**
- **New research** (a thread's proposed rows, as in thread 18's `entries.draft.json`) comes in with
  `npm run import <file>`: its rows join the draft as hidden rows at the end of a new chapter
  "Proposals", where the author shows, edits or removes them. **(call)**
- **Claude sessions write into the draft.** **(M)** "yes" to sessions keeping their part in the
  work after the move. A command line on the Mac (`npm run draft -- …`, **(call)** for the name),
  holding the database credentials in `library/.deploy/.env.local` as `db:sync` does today, reads
  the draft as records and writes changes back through the same rules and the same version check
  as edit mode: a text corrected, rows removed by a rule, a keyword dropped from every row, search
  terms written under the find brief. What a session changes is draft: the author sees it in edit
  mode, marked as changed, and publishes it or not. `npm run find:check` and the search tests read
  the draft. **(call)** for how.
- **The offline copy is not kept.** **(M)** "not necessarily". The local build from `entries.json`
  (`npm run build`, `serve`, `--present`, `library/dist` with links to the originals on disk) is
  retired with the move; presenting needs the network. The rendering code it shared with the cloud
  stays. **(call)** for retiring it rather than keeping it half alive.
- **Working on the code locally**: `npm run dev` runs the same site on the Mac against a Neon
  branch (a copy of the database), so trying things never touches the real draft. **(call)**

### 12. Two rounds

**(M)** Edit mode has to work before the revision session with the professors (the week after
24 Nov; date not given). So it is built in two rounds, each finished, checked and usable on its
own:

1. **Before the revision session**: the move of the data into the draft; the public site drawn
   from the latest publish, hidden rows left out, cached; the login; edit mode on the Library with
   drag, typed numbers and chapters; hide and remove; editing every text field of a row, its type,
   date, year, keywords (from the existing list, plus a new one), place (from the existing list),
   the idea and About; draft, Discard and Publish; the command line for sessions (§11). Pictures
   in round one are the migrated ones; a row's pictures can be removed and reordered, captions
   edited, side by side switched. **(M)** Moved into round one on its first day online: ＋ picture
   (§6), since "when you edit a row, remove the image, and want to put another image into it.
   Nothing enables you to do so" (25 Nov 2026); and the order of "All keywords" (§7).
2. **After it**: the History screen and Removed rows (until then, the
   publishes are stored all the same, and a session can restore one from the command line); the
   keyword list with rename and delete; new places; `npm run import`; `npm run pull`; the
   "Hidden" fold for search terms and facts in edit mode (until then, sessions edit them through
   the command line).

### 13. Tests

Kept: the rendering tests, fed from records in the new shape. New: numbering (drag, typed number,
hidden rows, chapters), draft against publish, discard, history, the login and the cookie, and the
anti-goals as tests: no hidden row and no draft change in any public file, no metadata in any
public picture.

## Left to the builder

The stack around the rendering code (plain Vercel Functions, or a small router such as Hono);
the database tables; how the public pages are cached and refreshed (§8, within its bounds); the
picture library; the icon drawings; whether an edit redraws the row on the server (reusing
`lib/detail.mjs`) or in the browser; how `more` is edited; HEIC; how login attempts are slowed;
the order of the work inside each round (§12), with the migration checked against the live site
before the first publish.
