# Studio 1 — Translocalities in/on Bolzano (fascist layer)

Research base for the studio project. Everything here was gathered on 22 October 2026 from online archives, catalogues, newspaper libraries and statistical portals, and is organised so it can be cited and extended.

## The library (from 10 November 2026)

`library/` is a private website that shows everything in this folder as one list of rows, one row per item held, with the project's idea as the way in. Why it is built the way it is: `docs/superpowers/specs/2026-11-10-research-library-design.md`.

```sh
npm install        # once
npm run build      # checks every record, then writes library/dist/
npm run serve      # http://127.0.0.1:5180, works offline
npm run check      # checks the records without building
```

Add `-- --present` to the build for a showing: it hides a stand-in idea text and puts the keyword index in its place.

### Adding material

1. **File it.** Put the download in the matching `files/` folder and add its line to that folder's `manifest.md`: file, source address, maker, date, rights. Nothing changes here from before.
2. **Record it.** Add one record to the `entries.json` in the same folder. The fields are explained in the design document under "The entry record"; the cataloguing rules are in `docs/superpowers/plans/2026-11-10-catalogue-brief.md`.
3. **Number it.** Give it the next free number of its section. Numbers were set in date order on 10 November 2026 and never change after that, so that a row can be cited. A later addition takes the next number, not a slot in between.
4. **Write its text.** Thirty to ninety words from the manifest and the notes, nothing the notes do not support, doubt carried over.
5. `npm run check`, then `npm run build`.

What gets a row: anything we hold material for. A catalogue export, a set of record files or a statistical table is one row of type Table that opens to the table. An OCR or text copy belongs to the row of the scan it came from.

One thing, one row. Several views of the same thing are one row with several pictures, which the reader steps through with the arrows under the picture: by day and at night, the whole and a detail, before and after, front and back, the same document as a gazette scan and as a consolidated text. Before adding a row, check whether the thing already has one, and add the picture there.

Where the shared lists live: keywords in `library/content/keywords.json` (rename or merge a keyword there, in one line, never by editing records), places in `library/content/places.json`, the idea in `library/content/idea.md`. The idea is the author's text; a word is made a keyword by writing `[[word|Keyword]]`.

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

Teßmann digital (`digital.tessmann.it`) and the Catalogo generale dei Beni Culturali run browser checks that refuse scripts; both open normally in Chrome. FamilySearch images need a free login. The Comune di Bolzano residence certificates and the Archivio di Stato di Bolzano call-up lists are reading-room or request-only; see the tracing guide in `04_migration_option_genealogy.md`.
