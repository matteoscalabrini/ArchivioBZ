# Research expansion brief (12 November 2026)

For the researchers who add a new thread to the research base. Each researcher has one thread,
one notes file and one downloads folder, named in their own task. This file holds what is common
to all of them.

Repo root: `~/Documents/GitHub/Studio1`. Investigation folder:
`research_notes/Fascist Bolzano media and migration/` (called INV below).

## Read first

1. `README.md`: layout, confidence tags, platforms that need a hand-opened browser.
2. The existing notes your task names, so that you extend them and never repeat them. What is
   already held is listed in each `INV/files/0N_…/manifest.md`.
3. `docs/superpowers/plans/2026-11-10-catalogue-brief.md`: how a library record is written.
   Everything there applies to you except where this file says otherwise.

## What the project is

A university studio project on Bolzano/Bozen under the theme "translocalities": how Fascism made
an Italian city beside and over the Tyrolean one (new quarters across the Talvera, monuments,
state-organised migration, the 1939 Option), how Italians elsewhere were shown that city, and
what has been done with that layer since. A second direction is how charged material is defused
by a change of form (typeface, wording, colour, scale, layout, voice, removal). The base is shown
as a private library website: one row per item held, a picture for every row where possible.

The job now is **new media and new leads**: things that can be held and shown (photographs,
drawings, plans, maps, film stills, posters, postcards, objects, scans of period magazines and
books, sound), each with its source and rights, and concrete next steps for what could not be
reached. Depth before coverage: twenty strong items with sure provenance beat sixty weak ones.
Aim for 15 to 30 held items; do not pad.

## What you produce

1. **Notes**: `INV/NN_<slug>.md`, in the house style of the existing notes: an H1 title, a short
   header (research date 12 November 2026, the tag legend you use), then numbered sections, each
   with `### Takeaway`, `### Cited Findings`, `### Inferences`, `### Gaps`. Every finding is one
   bullet that ends with its tag and a Markdown link to the page it was read on. Close with
   `## Leads` (a table: lead, concrete next step, portal or record series, named people or items)
   and `## Needs a hand-opened browser` (exact addresses or exact search terms, dates and page
   numbers for anything a script could not open).
2. **Downloads**: `INV/files/NN_<slug>/`, images in `images/`. A `manifest.md` beside them with
   one table line per file: file, source URL (the page it was found on, not only the file
   address), creator, date of the thing, rights exactly as the source states them, one-line
   description, and whether it is the original or a scaled copy.
3. **Records**: `INV/files/NN_<slug>/entries.json` as the catalogue brief describes. `"text": []`
   on every record: you never write a row text. Row numbers `NN.00` for your notes file (type
   `Notes`), then `NN.01`, `NN.02`… in date order of the things. Check with
   `node library/build.mjs --check` from the repo root: no `ERROR` may name your folder (the
   "empty text" warnings are expected).

Row types now also include `Film`, `Drawing` (plans, maps, architectural drawings, perspectives),
`Object` (medals, stamps, plaques, models, things), `Sound`, `Minutes` (council and parliamentary records), `Magazine` and `Leaflet`. A film is held as a still or
poster frame plus its catalogue record saved as text, with `more` `{ "kind": "source", "target":
"<address where it can be watched>" }`; do not download streams.

## Tags

`[V]` read by you on the cited page or in the cited file. `[S]` from a secondary source read in
full. `[W]` Wikipedia text or footnote. `[SS]` a search-result snippet only, page not opened.
`[INF]` your inference. Snippet-only and inferred statements are leads, never facts: say so.
Where two sources disagree, give both and say how it could be settled. Quote originals in their
language, short, in quotation marks.

## Rules

- **Never invent.** A date, name, number or attribution you did not read goes in as a lead with
  its tag, or stays out. Do not smooth over a mismatch between sources.
- **Verify every download.** Run `file` on it, open every image with the Read tool and confirm it
  shows what its name says (a past pass saved two wrong newspaper pages). Write one fact beginning
  `Seen in the image:` saying only what is plainly visible. Delete a wrong or broken download.
- **Rights.** Take study copies only of what a site serves publicly without a login, a paywall or
  a technical block; never work around one. Prefer the largest openly licensed version (Wikimedia
  Commons, Europeana, Internet Archive, museum open-access portals) and read the licence from the
  file page, not from a search result. Record rights as stated; where unstated write "rights not
  stated; © presumed" and say whose.
- **Privacy.** Never put a person's name from this machine, the project's name or any local path
  into a search query, a request header or a URL. Use a generic client name for downloads.
- **Blocked platforms.** Teßmann digital (`digital.tessmann.it`) and the Catalogo generale dei
  Beni Culturali refuse scripts; do not fight them and do not use any browser-automation tool.
  List what should be opened there, exactly, in `## Needs a hand-opened browser`. Europeana holds
  a 2019 copy of the Teßmann newspapers (Alpenzeitung, Dolomiten and others) with OCR and can be
  searched through its API.
- **One thing, one row.** Several views of one thing (front and back, whole and detail, day and
  night, pages of one booklet) are several `images` of one record. Before making a row, check the
  existing manifests: if the thing is already held, do not download it again; mention it in your
  notes with its existing row number (see the `no` fields in the existing `entries.json` files).
- **Write only inside your own notes file and your own downloads folder.** Never move, rename,
  edit or delete anything else. Scripts and scratch files go in the session scratchpad named in
  your task, never in the repo; never run an interpreter from inside a downloads folder, and run
  Python that reads downloaded files with `-I`.
- **Places.** A record gets `place` only when the thing stands or stood at that spot in Bolzano.
  Known ids are listed in the catalogue brief; also `oltrisarco`, `lido`, `noi-techpark`,
  `sparkasse-sede`. For a new place add it to `places_proposed` with its name, and give in your
  report its OpenStreetMap object (`way/…`, `relation/…` or `node/…`) and coordinates as read
  from OpenStreetMap or Nominatim.
- **Keywords.** One to five per row from `library/content/keywords.json` (read it; it also has
  `architecture`, `military`, `autonomy`). Propose at most three new ones in `keywords_proposed`.

## What the first round taught (added by the lead researcher, 12 November 2026)

- Two threads found the same Luce newsreel. Before making a row for a film, a decree or a magazine issue, search every `entries.json` under `research_notes/` for its code, number or date.
- Wikimedia's upload server answered 429 for most of the session to four researchers working at once. Take Commons files early, one at a time, and list in the manifest what could not be fetched.
- A proposed keyword that is really a form keyword (`symbol`, `typeface`, `wording`…) needs a fact about that form in the record, or the lead researcher removes it.
- Magazine issues are `Magazine`, not `Booklet`.
- The Comune's plan sheets are served as tiled zoom viewers and can be stitched; the method is described in `14_city_architecture.md`.

## Your report back

Short: rows written per type; the five best finds, one line each; the strongest new leads;
proposed keywords and places (with OSM object and coordinates); what was blocked and where;
anything that contradicts the existing notes, with both sources.
