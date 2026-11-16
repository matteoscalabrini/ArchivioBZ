# Research library — design

2026-11-10 · status: **approved by the author on 2026-11-10**, with the map changed as written below ·
midterm: Tuesday 17 November 2026

A private website that catalogues everything the Studio 1 research holds, one row per item, and
lets the project's idea act as the way into it. Approved sketches (open them, they are the visual
reference):

- `.superpowers/brainstorm/28645-1794322929/content/rows-and-topics.html` — row anatomy, layout A
- `.superpowers/brainstorm/28645-1794322929/content/idea-as-index-v2.html` — the idea as the index,
  reference rows, a table row, the map row

Both need the brainstorm preview server for their images (`/files/…`); the pictures sit in the
same folder.

Lines marked **(M)** are the author's decisions, in his words where quoted. Lines marked **(call)**
are the designer's calls: sensible defaults he has heard and not rejected, free to overturn.

## Intent

The studio project is "translocalities in/on Bolzano", taken through the fascist layer. Its
direction since November: charged material (fascist propaganda first, radical texts more widely)
can be defused by a change of form — typeface, wording, colour, scale, layout, voice.

The library has two jobs at the midterm:

1. Show the amount of research at a glance. **(M)** "Should understand the amount of research
   into this."
2. Carry the story. **(M)** "The storytelling of it is important." Entries trace back to the idea
   of the project, and the trace is not literal: no row says which claim it proves. **(M)** "not
   so literal."

It is also the base the research keeps growing in. **(M)** "A comprehensive base where we can
also expand easily our research."

## Who and when

- Shown by the author from his laptop to the midterm room on 17 November. Nobody else opens it for
  now. **(M)**
- Later, possibly online and possibly with a backend for adding entries. Neither is built now;
  neither may be made harder by what is built now.

## Goals

- Every item the research holds is one row in one list.
- A row opens downward, in place, to a picture, a short text and, where there is more, a link at
  the bottom. **(M)**
- Rows relate through shared keywords. A topic is just a keyword; a row can carry several. **(M,
  chose layout A)**
- The idea sits at the top as text, and its marked words are the keywords that filter the list.
  **(M, "perfect")**
- Adding twenty new items a month from now is a small, repeatable job.

## Non-goals

- No backend, editor, login or database now.
- No public deployment now. No decision yet on which third-party files could be republished.
  - **16 Nov 2026:** The author chose to put the site online, open to anyone, at archiviobz.vercel.app
    (`npm run deploy`, README "Online"). The pictures go up as study copies at screen size; the
    originals (1.2 GB of PDFs, full scans and saved pages) stay on disk and the web build links none
    of them. The About page's Rights paragraph says so.
- No search box, no graph view, no timeline view.
- The walk and its photographs appear nowhere: not as rows, not on the map. **(M)**
- No change to BolzanoDot, its data or its deployment. The library takes a copy of the dot data
  and of the drawing code it needs.
- The reports and notes are not rewritten; they are shown as they are.

## Anti-goals

It has failed, even if it works, when:

- it looks like an admin table, a blog template or a dashboard: cards, icons, colour, shadows,
  rounded boxes, badges;
- a row's text says something the notes and manifests do not support;
- the count is padded: catalogue records without material exploded into rows;
- presenting it needs the network, a deploy or a build on the day;
- the idea at the top reads as written by the builder instead of by the author.

## What the visitor sees

### Every page

- Black on white. **(M)** One grey for secondary text. No other colour anywhere; pictures are the
  only colour.
- Serif for headers and titles, sans for everything else. **(M)** Typefaces as in the approved
  sketches: Times New Roman and Helvetica Neue, both already on the laptop, nothing to load.
  **(call)**
- Five type sizes with clear steps, as in the sketches: 12 (labels, meta), 15 (text), 22 (row
  titles), 44 (the idea), plus the 9 px counts if used.
- Hairline black rules between rows. No boxes.
- Top line: project title on the left ("Translocalities in Bolzano" until the author names it), three
  tabs on the right: **Library · Map · About**. **(M: Map as a tab)**

### Library

1. **The idea.** One paragraph in large serif. Words the author marks in it are underlined; clicking
   one filters the list to rows carrying that keyword and brings the list into view. The active
   word is shown inverted. Until the author supplies his text, the stand-in from sketch 2 is used.
2. **Status line**, sticky: what is shown ("All entries" or the active keyword), how many rows, and
   "Show all" when filtered.
3. **The list.** Column heads: No. · Title · Type · Date · Keywords. Default order by number;
   clicking No., Type or Date re-sorts. **(call)**
4. **A closed row**: number, title (serif), type, date, keywords. Each keyword is clickable and
   filters.
5. **An open row** (click anywhere on the closed row; several may be open at once):
   - the picture, with a one-line caption (maker, date, rights);
   - a short text, 30 to 90 words, one or two paragraphs;
   - small meta lines as they apply: holder or publisher, rights, confidence, source link;
   - one link at the bottom when there is more: "Read the full story →", "Open the PDF →", "Open
     the full table →", "Open the map →", "Open the source →".
   - A table row shows its first five records beside the text instead of a picture.
6. **All keywords**, at the foot of the list: every keyword with its count, small, so keywords
   that are not in the idea are still reachable. **(call)**

The address records the active keyword and the open rows (for example `#k=Typeface&o=5.21`), so a
prepared state can be opened directly while presenting. **(call)**

### Long read

Own page per long text: serif title, sans body in a readable column, pictures inline, links kept,
"← Library" returning to where the reader was. Used for the reports, the thread notes and written
stories.

The two reports are shown with their figures. The figures and captions exist only in the Word
versions (50 and 25, against none in the Markdown files; the Word files are also the later ones),
so the report pages are made from the Word versions, figures in place, by the build and not by
hand. **(call)**

### Table

Own page per catalogue table: the CSV as a plain table, link cells clickable, columns sortable.

### Map

**(M, 10 November)** "Make the map inverted, black dots on white bg, for design coherence, also
introduce in the map the artifacts found and drop the walk we did and the pictures we take; we
use the map as another place where we can geolocalize the entries."

- The library's own page, not the live BolzanoDot site: the same three-dimensional dot field of
  the centre, drawn as black dots on white, greys for depth, no colour. No walk, no stops, no
  photographs, no editor.
- Every place that has entries is marked on it with its name and the number of its entries.
  Clicking a place lists its rows (number, title, type); clicking a row goes to the Library with
  that row open. **(call)**
- An open row that has a place shows it as a small line, "Ponte Druso, on the map →", which
  opens the map on that place. **(call)**
- A keyword filter carries over: opened from a filtered list, the map shows only the places with
  rows under that keyword. **(call)**
- The dot data covers the old town, the Talvera, the station and, across the river, the
  Monumento alla Vittoria, Ponte Druso and Piazza Tribunale. Places outside it (the Semirurali,
  the industrial zone, the Lager) are listed beside the map under "Beyond this map" with their
  rows, never drawn at a wrong spot. Widening the dot field is a later job. **(call)**
- The one-line OpenStreetMap credit stays; the data licence requires it.
- The map has one row in the list, with a picture of it and "Open the map →". **(M)**
- Nothing on it needs the network.

### About

How the research was gathered, what the confidence levels mean, rights note (study copies, shown
privately), credits, and counts of entries by type. **(call)**

## What gets a row

- **A row needs material we hold.** **(M)** "If it has material has a row, otherwise we compress."
  Images, scans, PDFs, saved law texts, booklets: one row each.
- **Sidecars fold into their row.** An OCR or text extraction belongs to the row of the scan or PDF
  it came from. Several crops of the same newspaper page are several pictures of one row.
- **Catalogue records without material compress into one row per table.** The 414 museum-portal
  poster records, the Luce newsreel and documentary catalogues, the Luce record text files, the
  Antenati portal snapshots, the ASTAT tables: one row each, opening to the table.
- **The map**: one row. **(M)**
- **Places.** One file lists the places entries can point to, each with a name and coordinates
  taken from OpenStreetMap, the source noted. A row is tied to a place only when the thing it
  shows or reports stands or stood there. **(call)**
- **The references from the author's reference chat**: one row each, with a picture gathered for
  each. **(M)** "Also gather picture for the entries that do not have them (like the reference
  ironic projects)." 33 are named in the chat, which is kept word for word in
  `2026-11-10-reference-chat.md` beside this document. Five are counter-references and typed as
  such: Tommy Robinson's Comic Sans cover, the Daily Stormer style guide, Laibach / NSK, "Gay
  clown Putin", the debate around the annotated Mein Kampf. The chat gives page names, not
  addresses, so each source has to be found before it can be read.
- **Long reads are rows too**: the two reports (type Report), the eleven thread notes (type
  Notes) and stories (type Story), each opening to its own page. **(call)**
- **Stories.** One exists for the midterm: "The eagles of Ponte Druso", the row both approved
  sketches open with. Its short text is the one in the sketches; its page is drawn from section 1
  of the landmarks notes, nothing new added. Further stories are written when the author asks for
  them, by the builder, from the notes only, for him to edit. **(M: agreed in the summary of 10
  November)** A story sits in the section of its subject (the eagles are `5.01`), and lists the
  rows it rests on.

Measured on 10 November: 336 held items after folding sidecars; about 250 rows once the record
dumps compress; about 300 with references, long reads and the map.

## The entry record

One record per row. Records are plain structured text kept beside the material: one
`entries.json` in each downloads folder, next to its `manifest.md`. **(call)** Nothing existing is
moved or renamed; records point at files where they are.

Fields:

| field | meaning |
|---|---|
| `no` | the row's number, `section.running` (e.g. `5.02`). Stable once given: never renumbered, so it can be cited. |
| `title` | as shown; original language for original titles |
| `type` | from a short controlled list (below) |
| `date` | as shown ("1932–35", "1960s") |
| `year` | a number for sorting |
| `keywords` | one to five, from the shared vocabulary |
| `text` | the short text, as paragraphs |
| `images` | files with caption each; the first is the row's picture |
| `file` | the held material the bottom link opens, when there is one |
| `source` | label and URL of where it came from |
| `holder`, `creator` | as they apply |
| `rights` | as the manifest states it |
| `confidence` | `read`, `secondary` or `lead`, with an optional note |
| `more` | the bottom link: kind (`story`, `pdf`, `table`, `map`, `source`) and target |
| `place` | where it is, when it has a place in Bolzano: the name of an entry in the places file |
| `sources` | for a Story: the numbers of the rows it rests on, shown as "Sources: 7 rows" and linking to them |

Types to start: Report, Notes, Story, Newspaper page, Press article, Photograph, Postcard,
Poster, Booklet, Book, Article, Law text, Archive guide, Table, Web page, Intervention, Reference,
Counter-reference, Map. The list may grow.

Sections: 1 to 7 are the threads of the first investigation, 8 to 11 the threads of the Semirurali
investigation, 12 the references, 0 the project's own outputs (reports, map). A thread's notes
are the first row of its section. A verification
capture belongs to the row of the thing it verifies, whichever folder holds it. **(call)**

Confidence, shown in words, mapped from the existing tags:

- **Read in the source**: `[V]`, `[DB✓]`, `[VERIFIED-*]`, `[T]`
- **From a secondary source**: `[S]`, `[SECONDARY]`
- **Lead, not yet a fact**: `[SS]`, `[IDX]`, `[INF]`, `[I]`, `[D]`, and every reference from the
  chat until its source has been read

The build refuses a record with a missing required field, an unknown type, a file that does not
exist, or a number used twice, and says which.

## Keywords

- One flat vocabulary. In practice two families sit in it side by side: what a thing is about
  (Ponte Druso, Monumento alla Vittoria, Casa del Fascio, Semirurali, Press, Posters, Luce
  newsreels, the Option…) and how form was changed (Typeface, Wording, Colour, Scale, Layout,
  Voice, Removal). The page does not separate them. **(M, layout A)**
- **A form keyword marks both sides**: the works that changed a form, and the original material
  in which that form carries the charge. Under "Typeface" the 1931 Alpenzeitung page set in
  Fraktur sits beside the Arendt letters, Haacke and Musikarat. **(M: sketch 2, "perfect")** To
  keep this honest, an original gets a form keyword only when its short text says something about
  that form (its type, wording, colour, scale, layout or voice). No sentence, no keyword.
  **(call)**
- The builder drafts the vocabulary from the material and the reference chat; the author prunes it.
  **(call)**
- The vocabulary is kept in one file. Records name keywords by a fixed short name; the file gives
  each its shown spelling and may fold one keyword into another. Renaming or merging a keyword is
  therefore one line in that file, never a pass over three hundred records. A record using a
  keyword not in the file fails the build.

## The idea

- One text file, written by the author, with the keyword words marked in a simple way (for example
  `[[word|Wording]]`: the text shown, then the keyword it stands for).
- A marked keyword that matches no row is reported by the build.
- Rows whose keywords do not appear in the idea stay in the list.
- The keywords on the rows do not wait for the idea: they come from the material. The idea only
  chooses which of them are the way in.
- **If the idea text is not there by the evening of Monday 16 November**, the top of the Library
  shows no paragraph. The keyword index takes its place, large, and works the same way. The
  stand-in from sketch 2 is used while building and never shown at the midterm. **(call)**

## Pictures

Every row should open to a picture. **(M)** In order of preference:

1. a held image, scaled for the page (the original stays untouched and is what "open" shows);
2. for a PDF or booklet, its first page rendered as the picture;
3. for a reference or any row with nothing to show, a picture fetched from its source. It is
   stored as a download like any other, in the thread's downloads folder with a manifest line
   (source URL, maker, date, rights), following the rule already in the README;
4. none: the row opens to text only, and the build lists it under "rows without a picture".

Tables show their first records instead of a picture.

## Texts

- The builder writes each row's short text from the manifests and notes: what the thing is, what
  it shows or says, and why it is in the base. Nothing is added that the notes do not support;
  doubt is carried over (the eagles' removal year stays "not confirmed"). **(call)**
- English, with titles and quotations in their original language. **(call)**
- Reference texts start from the reference chat and are marked as leads until the source is read.

## Where things live

- `research_notes/<investigation>/files/<thread>/entries.json` — the records, beside the material.
- `research_notes/Defusing by form/` — new investigation for the references: the reference chat as
  its notes file, `files/01_references/` for gathered pictures, manifest and records.
- `library/` — the site: its code, the idea text, the keyword vocabulary, the places, written
  stories, the copied dot data, and the generated output.
- `docs/superpowers/specs/` — this document.

## How it gets made **(call)**

- Plain HTML, CSS and JavaScript with a small Node build script, no framework: the same choice as
  BolzanoDot. Node 24, `pdftoppm` and `sips` are on the laptop.
- The build reads every record, checks it, makes the scaled pictures and first-page renders,
  turns the long texts into pages, and writes a static site.
- One command builds it and one command serves it locally. The original files open straight from
  the research folders.
- Nothing in it depends on the network.
- Built with subagents on Opus at most; every text a reader sees (row texts, the story, About)
  is written by the main session, not by a subagent. **(M)**

## How it grows

The author hands over new material (photos of documents, PDFs, links). **(M)** "Realistically I go
back to you." The builder files each item in the right downloads folder, adds its manifest line as
before, writes its record, and rebuilds. The README gets a short section saying exactly this, so
any later session does it the same way. Because the records are already structured data, an "add
entry" form can be put on top later without redoing them.

## Order for the week

1. The site with the approved look, and records for all held material of both investigations.
2. The references: records, pictures, manifest.
3. The long reads: two reports with their figures, eleven thread notes, the eagles story.
4. The map with its places, About, the keyword index.
5. The author's idea text replaces the stand-in; he prunes the keywords.

Each step leaves something that can be shown.

## Left to the builder

- The exact record format details, file names inside `library/`, and how the build is split into
  files.
- Whether the page loads its data as a file or carries it inline.
- How a row with several pictures lets the reader move between them.
- The phone layout. It is presented on a laptop; on a narrow screen it must not break, and the
  columns may fold under the title.
- Keyboard use, visible focus, and no animation for readers who ask for reduced motion.
- The wording of small labels.

## Known limits

- The dot field stops short of the Semirurali, the industrial zone and the Lager; those places
  are listed, not drawn.
- Rights: many held files are © their publishers and kept as study copies. That is fine for a
  private showing and must be settled per file before anything goes online.
- The Luce newsreel table holds 172 records while the README says 163; the row will state what
  the file holds, and the difference should be looked at when that row is written.
