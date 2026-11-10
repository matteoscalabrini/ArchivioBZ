# Catalogue brief

For the subagents that turn a downloads folder into library records. Read first:
`docs/superpowers/specs/2026-11-10-research-library-design.md`, sections "What gets a row", "The
entry record", "Keywords", "Pictures". Then `README.md` (confidence tags, layout).

Repo root: `~/Documents/GitHub/Studio1`.

## What you produce

One `entries.json` in each of your downloads folders (beside `manifest.md`), covering every file
in that folder and its subfolders. Shape:

```json
{
  "keywords_proposed": { "some-id": { "label": "Some label" } },
  "places_proposed": { "some-id": { "name": "Some place" } },
  "entries": [ { "no": "5.02", "title": "…", "type": "Photograph", "date": "1932–35", "year": 1932,
    "keywords": ["ponte-druso"], "text": [], "facts": ["…"],
    "images": [{ "file": "images/x.jpg", "caption": "Mario Gabinio, 1932–35. CC BY 3.0 IT, Wikimedia Commons." }],
    "file": "images/x.jpg", "source": { "label": "Wikimedia Commons", "url": "https://…" },
    "creator": "Mario Gabinio", "holder": "…", "rights": "CC BY 3.0 IT",
    "confidence": { "level": "read" }, "place": "ponte-druso",
    "more": { "kind": "file" } } ]
}
```

Paths (`file`, `images[].file`, a local `more.target`) are relative to the folder of the
`entries.json`. Check your work with `node library/build.mjs --check` from the repo root: no
`ERROR` line may name your folders.

## Hard rules

1. **Never write `text`.** Leave `"text": []` on every record. The main session writes all texts.
2. **Never invent.** Every field comes from the folder's `manifest.md`, the thread's notes file,
   the file itself, or `README.md`. If you do not know, leave the field out.
3. **Never move, rename, edit or delete an existing file.** You only add `entries.json`, and, where
   this brief says so, a derived index CSV with its manifest line.
4. Write only inside your own folders.

## What gets a row

- One row per held item: an image, a scan, a PDF, a saved web page or law text.
- **Sidecars fold in.** An `_OCR.txt`, or a `.txt`/`.html` pair of the same document, belongs to
  the row of the scan or PDF it came from: no row of its own. Name the scan or PDF as `file`.
- **Several pictures of one thing are one row** with several `images`: front and back of a
  postcard, crops of the same newspaper page, pages of the same guidebook.
- **Record dumps compress to one row of type `Table`.** Catalogue exports (CSV), sets of
  catalogue-record text files, portal snapshots, statistical tables. `more` is
  `{ "kind": "table", "target": "<the csv>", "columns": ["…", "…", "…"] }` naming the three
  columns that say most. Where a dump exists only as many small text or HTML files, write one
  index CSV for it in that folder (`<name>_index.csv`: one line per file, with the title, date,
  code and address each file states), add one line for it to `manifest.md` saying it was derived
  on 2026-11-10 from those files, and point the row at it.
- **The thread's notes file** is the first row of the section: number `N.00`, type `Notes`,
  title as the notes file's own heading, `more` `{ "kind": "read", "target": "<relative path to the .md>" }`,
  `confidence` `{ "level": "read" }`, `year` 2026, `date` "2026".
- **Files held twice.** Only the first folder below makes the row; the other folder skips the file:
  - `04_migration_option_genealogy/Senato_1949_DDL_328_ENTV_beni_optanti.pdf` (not `03_internal_colonization_bridge/senato_1949_DDL328_…`)
  - `05_landmarks_heritage/Dunajtschik_Steinacher_2008_…pdf` (not `03_internal_colonization_bridge/dunajtschik_steinacher_2008_…`)
  - `05_landmarks_heritage/images/03_vittoria__AZ_1928_07_13_1_SiD.png` (not `01_posters_graphics/1928-07-13_Alpenzeitung_…Commons.png`)
  - `04_migration_option_genealogy/DiMichele_unibz_Conquista_del_suolo_progetto.pdf` (not `03_internal_colonization_bridge/dimichele_unibz_…`)
  - `05_landmarks_heritage/basrelief_Bolzano_Percorso_tra_architettura_e_fascismo.pdf` (not `04_migration_option_genealogy/ComuneBZ_2007_Verdorfer_…`)
- Group B only: the Teßmann captures in `07_browser_verifications` of *Alpenzeitung* 29 Oct 1931
  p. 3 are extra `images` of the section 3 row for `AZ_1931-10-29_p3.jpg` (path
  `../07_browser_verifications/…`); the 26 Sep 1933 captures are one row in section 7.

## Numbers

`no` is `<section>.<two digits>`. `N.00` is the notes row. Items start at `N.01`, **except
section 5, which starts at `5.02`** (`5.01` is reserved). Order items by `year`, then by title.
Numbers are permanent: once written, never reshuffle them.

## Fields

- **`title`** — an original title in its original language (book, article, newspaper with date
  and page: "Alpenzeitung, 29 October 1931, page 3"); otherwise a plain description, maker first
  ("Mario Gabinio, Ponte Druso, three stone arches with eagles on fasces"). No file names.
- **`type`** — one of: Notes, Newspaper page, Press article, Photograph, Postcard, Poster, Booklet,
  Book, Article, Law text, Archive guide, Table, Web page, Intervention, Reference,
  Counter-reference. Booklet = brochure, guide or leaflet from an institution; Article = journal
  or academic paper, thesis; Archive guide = inventory, finding aid, research guide.
- **`date`** as a reader would write it ("1932–35", "1960s", "29 October 1931"); **`year`** the
  first year as an integer. The date is that of the thing, not of the download.
- **`creator`**, **`holder`** (the archive, library or publisher that holds or issued it),
  **`rights`** exactly as the manifest states it, **`source`** `{label, url}` from the manifest.
- **`images[].caption`** — one line built from the manifest: maker, date, rights, where from.
- **`confidence`** — how well the row's facts are established, from the tags in the notes:
  `read` for `[V]`, `[DB✓]`, `[VERIFIED-*]`, `[T]`; `secondary` for `[S]`, `[SECONDARY]`; `lead`
  for `[SS]`, `[IDX]`, `[INF]`, `[I]`, `[D]`. A held document that was simply downloaded and is
  what it says it is: `read`. Use `note` for a specific doubt the notes or manifest raise
  ("photographer and rights unclear").
- **`more`** — `{ "kind": "file" }` for a PDF or saved page a reader should be able to open;
  `{ "kind": "table", … }` for tables; `{ "kind": "source", "target": "<url>" }` when the row is
  an image whose fuller context is online. Omit for a plain image.
- **`place`** — only when the thing shown or reported stands or stood at that spot in Bolzano.
  Known ids: `ponte-druso`, `ponte-talvera`, `monumento-vittoria`, `casa-del-fascio`,
  `palazzo-giustizia`, `corso-liberta`, `cristo-re`, `stadio-druso`, `piazza-walther`,
  `stazione`, `semirurali`, `zona-industriale`, `lager`. Another real, findable place in Bolzano:
  add it to `places_proposed` with its name. Nothing outside Bolzano gets a place.
- **`facts`** — your working notes for the person who will write the row's text. Three to eight
  short items, each close to the wording of its source and ending with where it comes from:
  `"… (manifest)"`, `"… (notes 05, §1, [V])"`. Keep the confidence tag when the notes give one.
  Include: what the thing is; what it shows or says that matters; why the notes care about it;
  any doubt, conflict between sources, or warning about rights. For every image, open it and add
  one item beginning `Seen in the image:` saying only what is plainly visible. For a PDF, the
  manifest and notes are enough; read into the file only to settle a title, author or date.

## Keywords

One to five ids per row from `library/content/keywords.json`. What they mean:

- Places and things in Bolzano: `ponte-druso`, `monumento-vittoria`, `casa-del-fascio` (the Casa
  Littoria on Piazza Tribunale and its Piffrader relief), `new-city` (the fascist town west of
  the Talvera in general: Corso Libertà, Palazzo di Giustizia, Cristo Re, Stadio Druso…),
  `old-town`, `cinemas`, `semirurali`, `zona-industriale`, `lager`.
- What happened: `option` (the 1939 Option and its aftermath), `migration` (Italians brought or
  moving to South Tyrol), `colonization` (internal colonization as policy and machinery: the
  Commissariato, ONC, ENTV; the settler-colonial reading), `agro-pontino`, `libya`, `eritrea`,
  `ethiopia`, `dodecanese`, `race` (racial law and zoning), `language` (Italianization, place
  names, language groups, "allogeni"), `romanita` (Rome invoked: Drusus, eagles, fasces, Latin),
  `inauguration` (ceremonies, anniversaries, staged openings).
- Media and kinds of source: `press`, `posters`, `postcards`, `newsreels`, `radio`, `film`,
  `guidebooks`, `tourism`, `brand` (the post-war South Tyrol image), `overtourism`, `statistics`,
  `law`, `archives` (inventories, finding aids), `tracing-people` (genealogy, name lists, how to
  follow a person), `heritage` (what is done with the fascist legacy today), `theory`
  (translocality, method).
- Changes of form: `typeface`, `wording`, `colour`, `scale`, `layout`, `voice`, `symbol`,
  `humour`, `removal`. Use one of these on original material **only** when one of your `facts`
  says something about that form (the page is set in Fraktur, the relief carries a slogan, the
  eagles were taken down). No fact, no keyword.

Missing something the folder clearly needs? Add it to `keywords_proposed` and use it; keep to a
handful.

## References (Task 10 only)

Source: `docs/superpowers/specs/2026-11-10-reference-chat.md`. Each named project is one row,
section 12, type `Reference` or `Counter-reference` (the appendix lists the five), in
`research_notes/Defusing by form/files/01_references/part-<a|b|c>/`. Numbers: part a `12.01`–
`12.11`, part b `12.21`–`12.31`, part c `12.41`–`12.51`.

For each:

1. Find the page the chat names (it gives page names, not addresses). Prefer the maker's or
   institution's own page, then a reference work, then press.
2. Read it. In `facts`, quote what the chat says about the work, then for each statement say
   whether the page you read confirms it: `"Confirmed by <url>: '…short quote…'"` or
   `"Not found on <url>"`. Never smooth over a mismatch.
3. Save one picture of the work into your part folder, the best that the source offers (a file
   from Wikimedia Commons with a stated licence when one exists). Add a `manifest.md` line:
   file, source URL, maker, date, rights as stated. No picture found: say so in your report and
   leave `images` out.
4. `confidence` is `lead` unless every statement you kept in `facts` was confirmed on a page you
   read, in which case `read` with `note` naming that page.
5. `keywords`: the change-of-form ids that fit (`typeface`, `wording`, `colour`, `scale`,
   `layout`, `voice`, `symbol`, `humour`, `removal`) and, where the work is about one, the medium
   (`press`, `posters`…). `casa-del-fascio` for the Bolzano frieze, with `place`.
6. `source` is the page you read; `more` is `{ "kind": "source", "target": "<url>" }`.

Do not put the user's name, this project's name or any local path into a search or request.

## Your report

Rows written per type; proposed keywords and places; files you could not place and why; anything
that contradicts the manifest or the README (a count that differs, a file the manifest does not
list). Short.
