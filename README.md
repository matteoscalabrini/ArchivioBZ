# Studio 1 — Translocalities in/on Bolzano (fascist layer)

Research base for the studio project. Everything here was gathered on 22 October 2026 from online archives, catalogues, newspaper libraries and statistical portals, and is organised so it can be cited and extended.

## The library (from 10 November 2026)

`library/` is a website that shows everything in this folder as one list of rows, one row per item held, with the project's idea as the way in. Why it is built the way it is: `docs/superpowers/specs/2026-11-10-research-library-design.md`. Since 16 November 2026 it is also online, open to anyone, at https://archiviobz.vercel.app.

The code and the texts written for the project are under the MIT licence (`LICENSE`); the material gathered from archives and publishers is not, and stays under the rights each manifest records (`NOTICE` says what is covered and what is not).

```sh
npm install        # once
npm run build      # checks every record, then writes library/dist/
npm run serve      # http://127.0.0.1:5180, works offline
npm run check      # checks the records without building
npm run deploy     # builds the web version and puts it online
```

Add `-- --present` to the build for a showing: it hides a stand-in idea text and puts the keyword index in its place.

### Online

`npm run deploy` (`library/deploy.mjs`) builds with `--web` (not `--present`: the idea text stays on the page) into `library/.deploy/.vercel/output/static` and uploads that folder as it is (`vercel deploy --prebuilt --prod`), to the Vercel project `archiviobz` on the author's Hobby account. Vercel builds nothing: the build needs the downloads, which are not in git. `-- --preview` uploads to a preview address instead.

The web version differs from the local one in one way: the originals (the PDFs, full scans and saved pages under `research_notes/` and `reports/`, 1.2 GB) are not online, so nothing links to them. A row has no "Open the file" link and its pictures link nowhere; its Source line still leads to the holder. In a read, a link to a file a row holds leads to that row, a link to any other file is plain words, and a picture is copied in at 1600 px under `img/read/`. `library/dist` stays the local site, with the originals.

Once per machine: `npm i -g vercel`, `vercel login`, `vercel link --cwd library/.deploy --project archiviobz`.

### Media and database (from 16 November 2026)

The files git does not keep (the downloads under `research_notes/`, the Word reports, the photographs in `Foto Vittoria/`: 730 files, 1.4 GB) are copied to a **private** Vercel Blob store, `archiviobz-media` in Frankfurt; nothing there has a public address, and the site links none of it. The database `archiviobz-db` (Neon, free plan, Frankfurt) once held a mirror of the records in the tables `entries`, `media`, `entry_media` (which file and pictures each row holds), `keywords`, `places` and `kinds` (`library/db/schema.sql`).

```sh
npm run db:sync               # uploads new or changed media to Blob
npm run db:sync -- --dry-run  # says what it would upload
```

`db:sync` no longer touches the database: the rows live in the draft (`npm run draft`), and the old mirror tables are left as they are. A file is uploaded when Blob lacks it or holds an older copy; nothing is ever deleted from Blob, so a lost or emptied disk cannot empty the backup (files in Blob and no longer on disk are listed). Credentials come from `library/.deploy/.env.local`, git-ignored, refreshed with `vercel env pull --cwd library/.deploy`.

### Changing the rows from a session

```sh
npm run draft -- pull [file]    # the draft as { version, doc }, default library/.cache/draft.json
npm run draft -- push [file]    # checks it, saves it if the draft is still at that version
npm run draft -- status | publish | discard | restore <publish id> | publishes
```

`--dev` works on the local draft (`library/.cache/dev-db`). `publish` does what the Publish button does, then deletes the edge's copies with `vercel cache dangerously-delete --tag site`. `npm run find:check -- --doc library/.cache/draft.json` runs the search checks on a pulled draft.

### Adding material

1. **File it.** Put the download in the matching `files/` folder and add its line to that folder's `manifest.md`: file, source address, maker, date, rights. Nothing changes here from before.
2. **Record it.** Add one record to the `entries.json` in the same folder. The fields are explained in the design document under "The entry record"; the cataloguing rules are in `docs/superpowers/plans/2026-11-10-catalogue-brief.md`.
3. **Number it.** Give it the next free number of its section. Numbers were set in date order on 10 November 2026 and never change after that, so that a row can be cited. A later addition takes the next number, not a slot in between.
4. **Write its text.** Thirty to ninety words from the manifest and the notes, nothing the notes do not support, doubt carried over.
5. **Describe it for the search.** Add the row to the `find.json` in the same folder: the words that stand on the thing (`on`), what it shows or says (`shows`), its colours from the fixed list (`colours`), its other names (`names`). No page shows these terms; the search reads them, and shows one only as the reason a row was found. The rules are in `docs/superpowers/plans/2026-11-17-find-brief.md`. A row with a picture and no entry is a warning in `npm run check`.
6. `npm run check`, then `npm run build`.

Row types added on 12 November 2026: Film (a still plus the catalogue record, linking to where the film plays), Drawing (plans and architectural drawings), Object, Sound, Minutes (council and parliamentary records), Magazine, Leaflet. The list is in `library/lib/records.mjs`.

What gets a row: anything we hold material for. A catalogue export, a set of record files or a statistical table is one row of type Table that opens to the table. An OCR or text copy belongs to the row of the scan it came from.

One thing, one row. Several views of the same thing are one row with several pictures, which the reader steps through with the arrows under the picture: by day and at night, the whole and a detail, before and after, front and back, the same document as a gazette scan and as a consolidated text. Before adding a row, check whether the thing already has one, and add the picture there. A row with `"side_by_side": true` shows all its pictures at once, next to each other, each with its caption and no arrows: for a before and an after that the reader should compare at a glance (row 18.05, one postcard as printed and as covered).

A photograph of a flat thing taken at an angle (a poster or a page in a showcase, a framed print) is cut to the sheet and set square before it becomes a row's picture. Keep the full-size photograph in the folder's `photos/`, describe the cut in the folder's `rectify.json` (photograph, the sheet's four corners, where the picture goes), and run `uv run library/tools/rectify.py cut "<folder>/rectify.json" --debug <a scratch folder>`. The same tool's `look` command makes the gridded close-ups the corners are read from; the head of the file explains both, how the sheet's proportions are worked out from the lens, and how to check a cut. Photographs dragged out of the Photos app's library can be 360 px previews when the originals are still in iCloud: check the pixel size, and export from Photos with "Export Unmodified Original".

The search has three shared lists in `library/content/`: `colours.json` (each colour's names in English, Italian and German: typed in any of them, a colour finds the same rows), `names.json` (sets of names of one thing, such as Bolzano and Bozen: a row that says one is found under the others) and `glossary.json` (sets of ordinary words that mean the same: a row reached through one is a possible link, not a precise one). `npm run find:check` runs the search on the whole library against the lines of its design; `node library/tools/find/vocabulary.mjs` lists the words the glossary does not hold yet.

Where the shared lists live: keywords in `library/content/keywords.json` (rename or merge a keyword there, in one line, never by editing records), places in `library/content/places.json`, the idea in `library/content/idea.md`. The kinds of entry that the Library page filters by (Press, Pictures, References…) are groups of row types in `library/content/kinds.json`: regroup or rename there; the build warns when a row's type belongs to no kind. The idea is the author's text; a word is made a keyword by writing `[[word|Keyword]]`.

### Texts for readers (from 16 November 2026)

A report or a notes file is the researcher's text, written to the author. What the site shows a reader is a version rewritten for someone outside, in `library/content/reads/<row number>.md`, named in the row's `more.target`. The researcher's file stays where it is and stays the row's `file`. All 19 long reads have one: the two reports (0.01, 0.02) and the notes of threads 1 to 17. Such a text is told in the order things happened, keeps every source as a link, says doubt in words instead of bracket tags, ends on a list "Still open", and does not link to the researcher's file. In the Markdown:

- A heading of the first level (`# …`) starts a part, and each part is a page of its own (`read/0.01.html`, `read/0.01-2.html`, …) that lists the others. With one such heading, or none, the text is one page.
- A paragraph that opens with a picture is a figure; the rest of that paragraph is its caption.
- A link whose address is the source of a row, or of a record in a table the library holds, opens that row in a panel beside the text, as a row opens on the map. `[words](row:5.01)` names a row outright; use it where several rows share one source address. Any other link leaves the site and is marked with an arrow.
- A row may give its text a title of its own in `more.title`. The notes rows do: their titles in the Library are the researcher's catalogue titles, and the page is headed by the reader's title.

Before a text is rewritten, check what later threads found: several claims of October 2026 were overtaken in November (the Monument on two posters, the Cinema Corso's demolition, the eagle heads, the popular trains to Bolzano, the ban on two Trenker films), and the reader's text gives the later state.

The scripts used are in `library/tools/reads/`:

```sh
python3 library/tools/reads/show.py "research_notes/…/01_posters_graphics.md"   # a notes file with each address cut to a short key, or to row:N.NN where a row holds it
python3 library/tools/reads/rows.py 13                                         # the rows of a section: number, kind, date, title, first picture
python3 library/tools/reads/find.py 200 3 "Verona e Rovigo"                    # where the notes and reports say something
python3 library/tools/reads/make.py 13.00 draft.md                             # write reads/13.00.md from a draft, and check it
python3 library/tools/reads/make.py 13.00                                      # check the published text again
library/tools/reads/publish.sh 13.00 "The title for readers"                   # point the row at it, rebuild, check
```

In a draft a link may be written `[words](@key)` and a picture `![alt](@img:13_cinema_corso/images/file.jpg)`: `make.py` turns each key into the one address or file of the research base that contains it and stops if there is none or more than one, so no address reaches a reader's text that the research does not hold. It then lists what every `row:` link is hung on, and names the numbers and quotations in the text that are in no notes file, report, row or manifest. A quotation it names is either an English gloss or a mistake.

### The map's dot data

The map draws `library/map-data/`, which `library/mapgen/` makes from OpenStreetMap and the Province's half-metre laser survey. Why and how: `docs/superpowers/specs/2026-11-11-map-pictures-wider-field-design.md`.

```sh
npm run map-data   # needs uv; fetches what is missing into library/.cache/map-raw/, then rebuilds the data
```

Run it again, then `npm run build`, when:

- a place gets its first row. The build says so by name ("made before … had rows"). Until then the place is on the map, but its buildings are drawn like the rest of the city, not at full resolution.
- a place is added to `library/content/places.json` or its `osm` object changes.
- the rectangle in `library/mapgen/area.json` changes.

Building and showing the site need neither the network nor Python; only this command does. The downloads (about 380 MB) stay outside git; delete `library/.cache/map-raw/osm.json` to take OpenStreetMap afresh.

A fifth thread was added on 14 November 2026: 17 below, a morning in the Monument to Victory. The author photographed the exhibition *BZ '18–'45* in its crypt; five printed pieces shown there were cut square from the photographs and traced to their originals, makers and occasions. It is the first thread that starts from our own photographs: all 49 are in `files/17_monument_visit/photos/` at full size and in the library, as rows 17.01 to 17.30 or as pictures added to rows 5.01, 5.02 and 5.12; the previews first put in the repository are in `Foto Vittoria/`.

A fourth round was added on 12 November 2026: threads 13 to 16 below (the Cinema Corso, city architecture, propaganda on film and radio, propaganda in print), 99 new rows. Their numbers are also their library sections; 8 to 12 were already taken by the Semirurali investigation and the references. How the round was briefed: `docs/superpowers/plans/2026-11-12-research-expansion-brief.md`.

A third investigation was added on 10 November 2026: `research_notes/Defusing by form/`, the references on defusing charged material by changing its form. Its notes file is the conversation in which that direction was worked out.

## Start here

Word versions of both reports, with figures from the gathered material, are in `reports/`:
`Fascist Bolzano media and migration.docx` (49 figures) and `Semirurali versus Libyan villages.docx` (24 figures). On opening, let Word update the fields so the table of contents fills in.


- `reports/Fascist Bolzano media and migration.md` — the synthesis (about 12,000 words, ~200 source links). Read the Conclusion, then "Detective leads" and "Open gaps and blocked sources" at the end. The Addendum records what was verified by hand in a browser after the main pass.

## Research notes and material

`research_notes/Fascist Bolzano media and migration/` holds one notes file per thread and a matching `files/0N_…/` folder of downloads. Every files folder has a `manifest.md` with source URL, date and rights note for each item.

| Thread | Notes | Downloads |
|---|---|---|
| 01 Posters, graphics, postcards 1919–43 (Touriseum/OMA portal, Salce, Lenhart) | `01_posters_graphics.md` | `files/01_posters_graphics/` (OMA export of 414 records, 13 open images) |
| 02 Luce newsreels, Trenker films, EIAR radio, Dopolavoro trains, army, school | `02_newsreels_radio_mobilization.md` | `files/02_newsreels_radio_mobilization/` (Luce catalogue CSVs: 163 newsreels, 50 documentaries; Radiocorriere scans) |
| 03 Press: Alpenzeitung, Dolomiten, La Provincia di Bolzano, La Stampa, Vie d'Italia, Rivista Illustrata | `03_press_print.md` | `files/03_press_print/` (31 newspaper pages with OCR, 8 LPB front pages, 2 books) |
| 04 Worker migration, Semirurali, the Option, genealogy portals, Lager Bozen | `04_migration_option_genealogy.md` | `files/04_migration_option_genealogy/` (Comune booklets, Lager name lists, ASTAT tables, Antenati snapshots) |
| 05 Ponte Druso eagles, Corso Italia cinemas, fascist built heritage and its defusing | `05_landmarks_heritage.md` | `files/05_landmarks_heritage/` (10 PDFs incl. the Comune's 2007 route, 28 images) |
| 06 Postwar brand, ASTAT tourism 1950–2025, bed cap, overtourism, translocality theory | `06_brand_overtourism_theory.md` | `files/06_brand_overtourism_theory/` (ASTAT workbooks, derived series CSV, law texts) |
| 07 Hand-opened verifications: Teßmann 1931/1933 bridge pages, Salce records, FamilySearch | `07_browser_verifications.md` | `files/07_browser_verifications/` (9 captures) |
| 13 The Cinema Corso, ex Palazzo del Turismo (Armando Ronca, 1938–41): design, art show of 1940, Option commissariat, occupation, cinema years, the demolition of 1988–89 in the provincial council's minutes | `13_cinema_corso.md` | `files/13_cinema_corso/` (Dolomiten 1938 design, TCI and Pedrotti photographs, Turris Babel 73; in `tessmann/` the council minutes 1980–96 and Tandem 1985) |
| 14 City architecture and plan 1922–43: the 1929 competition, Piacentini's plan sheets of 1935 and 1938, maps before and after, what was removed (Walther, Laurin, the Museum tower, Gries) | `14_city_architecture.md` | `files/14_city_architecture/` (stitched plan sheets, 1858 cadastre, Baedeker 1927 and War Office 1942 plans, decrees, Canali 2016) |
| 15 Propaganda on film and radio: Luce films and photographs, censorship of Trenker's films, the EIAR station, cinemas and travelling cinema | `15_propaganda_film_radio.md` | `files/15_propaganda_film_radio/` (12 film stills with catalogue records, Luce photo index of 144 records, Italia Taglia table, Chamber record of 6 Feb 1926) |
| 16 Propaganda in print, object and school, and the print that answered it: Tolomei's Prontuario, the name, school and surname decrees, Atesia Augusta, Option leaflets and posters | `16_propaganda_print.md` | `files/16_propaganda_print/` (41 images, 3 Gazzetta Ufficiale issues, Ianes 2019) |
| 17 A morning in the Monument to Victory, 14 November 2026: all 49 of the author's photographs catalogued. Five printed pieces shown in BZ '18–'45 cut square and traced (the exhibition poster of 1929, Steinberger's pamphlet cover of 1932, Anton Hofer's poster of 1933, the *Illustrazione Italiana* cover of 1935, the column poster of 1938); the eagle heads of Ponte Druso, the Cadorin frescoes, two newspaper pages, five photographic prints, the exhibition's panels, the monument and the column behind it | `17_monument_visit.md` | `files/17_monument_visit/` (the 49 originals in `photos/`, 18 cut pictures and their `rectify.json`, newspaper pages of each occasion, two Salce catalogue photographs, one ANNO scan) |

## Second thread: Semirurali versus Libyan villages (26 Oct 2026)

Tests the settler-colonial reading at the scale of the house: were the Bolzano Semirurali built with the same toolkit (offices, people, architects, typologies, naming, selection rules, vocabulary) as the regime's colonization villages in the Agro Pontino, Libya, Ethiopia and the Dodecanese?

- Report: `reports/Semirurali versus Libyan villages.md` (comparison table, verdict, implications for the settler-colonial claim, leads, gaps).
- Notes and material in `research_notes/Semirurali versus Libyan villages/`:

| Thread | Notes | Downloads |
|---|---|---|
| 01 The Semirurali as designed object: IFACP, Ing. Giulio Garbini, types, plots, costs, names, afterlife | `01_semirurali_bolzano.md` | `files/01_semirurali_bolzano/` (Turris Babel 1985–88 with plan crops, decree texts, LPB 10 Oct 1939, Alpenzeitung OCR) |
| 02 Overseas villages: Libya village by village, Ethiopia regional bodies, Rhodes and Kos, architects, settler origins | `02_overseas_villages.md` | `files/02_overseas_villages/` (Capresi 2007 thesis, Ertola, Grosselli, Luce records, PD images) |
| 04 Eritrea and Asmara as control case: 1908 racial zoning, Cavagnari and Cafiero plans, the 1938–39 Italian majority, the CMCI worker flow, villaggi operai, UNESCO 2017 | `04_eritrea_asmara.md` | `files/04_eritrea_asmara/` (UNESCO dossier and ICOMOS evaluation, racial decrees, 40 Luce records, CTI 1938 guide pages, open-access articles) |
| 03 The institutional bridge: Commissariato per le migrazioni e la colonizzazione interna, ONC and Agro Pontino, ENTV, Razza, Pergher, vocabulary | `03_internal_colonization_bridge.md` | `files/03_internal_colonization_bridge/` (law and decree texts, Senate bills, open-access articles) |

## Confidence tags

Each notes file tags its claims. Roughly: [V]/[DB✓]/[VERIFIED-*] = read in the primary source or on the portal; [S]/[SECONDARY] = from a full secondary article; [SS]/[IDX] = from a search snippet or index only; [T] = transcribed from a Fraktur scan; [INF]/[I]/[D] = the researcher's inference or derivation. Treat snippet-only and inference claims as leads, not facts.

## Platforms that need a hand-opened browser

Teßmann digital (`digital.tessmann.it`) and the Catalogo generale dei Beni Culturali run browser checks that refuse scripts; both open normally in Chrome. On Teßmann, search through the site's own form, open a hit, and use its "Downloaden / Drucken" button (PNG or PDF; "Hohe Auflösung" for the full scan); a search address typed by hand may be refused. Besides newspapers it holds the word-for-word minutes of the provincial council and magazines such as Tandem, all open. Newspapers of recent decades (the Dolomiten and Volksbote of the 1980s, for example) are indexed but can be read only at the library's own workstations; the dates worth reading there for the Cinema Corso are listed in `13_cinema_corso.md`, section 12. FamilySearch images need a free login. The Comune di Bolzano residence certificates and the Archivio di Stato di Bolzano call-up lists are reading-room or request-only; see the tracing guide in `04_migration_option_genealogy.md`.
