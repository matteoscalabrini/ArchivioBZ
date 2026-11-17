# Search, with a hidden layer under every row — design

2026-11-17 · status: **approved by the author on 2026-11-17**, as it stands · midterm: today, Tuesday 17 November 2026

An addition to the research library
(`docs/superpowers/specs/2026-11-10-research-library-design.md`). It adds one field to the frame
every page shares and one way of narrowing the Library's list. Nothing that is there changes.

The place of the field and the look of the results were tried as a sketch and chosen from use. The
sketch is the reference for look and behaviour and is kept, outside git, in
`.superpowers/brainstorm/26607-1794904449/content/search-placement.html` (place **B** in its
strip). Its code is a toy over 20 rows and is not to be kept.

Lines marked **(M)** are the author's decisions, in the author's words where quoted. Lines marked
**(call)** are the designer's calls: shown in the sketch or said in the conversation and not
rejected, or sensible defaults, free to overturn.

## Intent

**(M)** "a search engine on the website. The search engine must have a whole layer of 'hidden
keywords' that enable even the most obscure artifact to be discovered."

**(M)** Someone at the screen "might type a word they saw in a poster, describe the press by the
content, or the posters by the colour. an advanced search engine, that first might show a precise
correspondence, then second a possible link to it."

Today a row is reached by its place in the list, by one of 57 keywords or by its kind. A reader
who remembers a red poster with a winged figure, or the words "Königin des Hochetsch", has no way
in. After this change they type what they remember and the row comes up, with the reason it was
found.

## What exists already

Every record carries `facts`, which no page shows: 67,600 words over the 400 rows, against 28,200
words of row text. 236 of the 240 rows with a picture have a line "Seen in the image: …" that
transcribes words on the thing. Colour is mentioned in 146 rows, in loose prose. This is half of
the hidden layer and costs nothing; the other half is written new (below).

## Goals

1. **A word seen on the thing finds it**: a slogan, a headline, a signature, an imprint, a stamp.
2. **A description of what it shows or says finds it**: a bishop, a cable car, a caricature of
   the war blind, the unveiling of the monument.
3. **A colour finds the things in that colour**, typed in English, Italian or German.
4. **Two groups, in this order: precise, then possible links.** **(M)**
5. **Every hit that the row's own line does not explain says why it was found.** **(call)**
6. **It runs where the site runs**: locally with `npm run serve`, online as static files. **(call)**

## Non-goals

- No search on the Map, inside a read page or inside a table page. The field is there, in the
  shared frame, and leads to the Library.
- No server and no database search. Neon and Blob are not touched and `npm run db:sync` does not
  change.
- No suggestions under the field, no completion, no history.
- No machine "meaning" search (embeddings, a model asked at search time). The links are made by
  written terms and a written glossary, so that every hit can name its reason. **(call)**
- No reading of whole newspaper pages. A press row's hidden terms cover its headlines and the
  items the row is about.
- No change to the visible keywords, the row texts, the row numbers or the idea.
- No phone design. On a narrow screen it must not break.
- Publishing is not part of the build. **(M)** "first locally then if good, we push."

## Anti-goals

It has failed, even if it works, when:

- a thing with a picture cannot be found by a word plainly legible on it, or by its main colour;
- a hit quotes words that are not on the thing, or names something the picture does not show.
  The hidden layer holds only what was seen or what the notes support. A doubtful reading is left
  out;
- precise and possible stand mixed in one list;
- "possible" drowns the page: half the library for an ordinary word;
- it looks like an app's search: a box, a magnifier, a dropdown, coloured highlights. It is one
  hairline, black on white;
- hidden terms show anywhere other than as the reason for a hit;
- it needs the network, or anything installed, to work in the room.

## What the visitor sees

### The field

- **(M)** Beside the tabs, after About ("B", chosen after trying all three places): a text field
  with no box, one black hairline under it, the placeholder "Search" in grey, 12 px sans, about
  190 px wide. In focus the hairline is 2 px.
- It is in the frame, so it is on every page. **(call)**
- On the Library, the list narrows as one types. Enter moves the page to the top of the list.
  Escape empties the field. The key `/` puts the cursor in it. **(call)**
- On any other page, Enter opens the Library with what was typed. **(call)**
- What was typed is kept in the address as `q`, beside `k`, `t`, `o` and `s`, so a search can be
  linked and survives a reload. **(call)**

### The results

- The list shows only the rows found, in two groups. Each group starts with a line in the manner
  of the column heads: "Precise" and its count, "Possible links" and its count, each followed in
  grey by a few words saying what the group is. A group with nothing in it has no line.
- Under the title of a found row, in grey 12 px, stands why it was found, with the words that
  matched in black:
  - `on it: “die Königin des Hochetsch”` for words on the thing;
  - `shows: a bishop in mitre and vestments` for what it shows or says;
  - `colour: red`;
  - `also called: Siegesdenkmal`;
  - `in the description: …` for the row's text, `in its table: …` for a record of its table,
    `in the long read: …` for its read: a short cut around the word, at most about 90
    characters;
  - `in the notes: Hochetsch` for its facts: the matched word alone, never a cut. The facts are
    the cataloguers' working notes and were not written for readers (see "Who writes it");
  - a loose road is named in brackets: `(aquila = eagle)`, `(near “furer”)`,
    `(same word family)`.
  - `place: Ponte Druso`, `made by: Anton Reckziegel`, `held by: Touriseum` for the row's place,
    maker and holder: they count with its own line but the closed row does not show them;
  - Nothing is added when the words stand in the row's own line (number, title, type, date,
    keywords): the reader sees them.
- The sticky line says what is shown: `“rosso” · 6 precise · 2 possible · of 400 entries`. With a
  keyword or a kind chosen as well, all narrow together and the line names them all. "Show all"
  clears everything. **(call)**
- Nothing found: one grey line, `Nothing found for “…”.`
- Rows open in place as always.
- At most 30 possible links show; a last line says how many more there are and shows them on a
  click. **(call)**

## The hidden layer

### What a row is found by

In order of strength:

1. **Its own line**: number, title, type, date, keywords, place, maker, holder.
2. **The thing itself**, new and hidden (next section): the words on it, what it shows or says,
   its colours, its other names, and the other names of whatever its line and text name.
3. **Its description and its notes**: the row text and `facts`, with the notes' source tags
   (`(manifest)`, `(notes 01, Q4, [IMG✓])`) taken out.
4. **What hangs from it**: every record of its table and the text of its read. This is how a
   newsreel that has no row of its own is found: through the row of the catalogue table that
   lists it. **(call)**

### The new hidden terms

A file `find.json` beside each `entries.json`, keyed by row number. **(call)** The records are
not touched.

```json
{
  "1.05": {
    "on": ["Vom Rathause Bolzano, 19. Mai 1925", "Der Präfekturskommissär STEFFANINI", "die Königin des Hochetsch"],
    "shows": ["a bilingual public notice", "tricolour flags ordered for the visit of Italian war invalids", "a border of fruit and leaves"],
    "colours": ["red", "green", "blue"],
    "names": ["Stadtgemeinde Bozen", "Comune di Bolzano"]
  }
}
```

- `on`: words that stand on the thing, verbatim, in its language and spelling: titles, headlines,
  slogans, signatures, imprints, stamps, captions, inscriptions. Only what is read with certainty
  in the picture or given in the notes.
- `shows`: what it shows or says, as short English phrases, not sentences: motifs, people,
  objects, buildings, events, the subject of an article, a law or a book.
- `colours`: from a fixed list, the main one first, and only where colour belongs to the thing as
  printed or painted: red, orange, yellow, green, blue, purple, pink, brown, black, white, grey,
  gold, silver. A black-and-white or sepia photograph, print or film is `monochrome`. A page of
  plain text has none.
- `names`: other names of the thing, its maker or its subject: the other language, the older or
  newer name, the short form. Only names in use, none made up.
- All four are optional. A row with a picture and no `find` entry is a warning in `npm run check`.

Three shared lists, in `library/content/`:

- `colours.json`: each colour's names in English, Italian and German. They count as one word
  wherever they stand: `rosso`, `rot` and `red` find the same rows, whether the colour is in a
  row's `colours`, in what it shows or in its notes. Precise.
- `names.json`: sets of names of one thing, for proper names: Bolzano and Bozen; Monumento alla
  Vittoria, Siegesdenkmal, Victory Monument and Monument to Victory; Ponte Druso and
  Drususbrücke; Alto Adige, Südtirol and South Tyrol. Wherever one of a set stands in a row, in
  any of its sources, the row is found under the others, precisely, with the reason
  `also called: Bozen`. A keyword's label and a place's name stand in the row's line, so this
  covers them. `names` in `find.json` is for a name that belongs to one row only.
- `glossary.json`: sets of ordinary words that mean the same in the three languages (eagle,
  aquila, Adler). It covers the vocabulary of `shows` and of the titles. A hit through it is a
  possible link, in both directions: "ponte" reaches "bridge" and "bridge" reaches "Ponte".
  A glossary step may be followed by a word-family step (aquila, eagle, eagles).

### Who writes it

- The `find.json` files are drafted by subagents, on Opus at most, one per records folder. Each
  looks at every picture of its rows (the originals in the folder) and reads the record and its
  facts. **(call, said in the conversation and not rejected)**
- The author's rule is that every text a reader sees is written by the main session. The reason
  line makes fragments of the hidden layer visible. So the reason line quotes only what the main
  session has written or read: **(call, the author's to overturn)**
  - the main session writes the brief, reads every `find.json` in full before it goes in, checks
    the terms of every poster and of a sample of the rest against the pictures, and corrects.
    These terms may be quoted;
  - the existing `facts` (67,600 words, drafted by subagents as working notes, never shown) are
    searched but never quoted: the reason gives the matched word alone. What is worth quoting
    from them, the words seen on the thing, comes into `find.json` and is read there;
  - the three shared lists are written by the main session.
- The brief for the subagents goes in `docs/superpowers/plans/`, beside the catalogue brief.
- The README's "Adding material" gets one step: describe the new row in `find.json`.

## How it finds

- Case, accents and ß do not matter: Teßmann is found by tessmann, Führer by fuhrer and by
  fuehrer, Romanità by romanita.
- Small words (the, of, di, der…) are ignored.
- Words inside quotation marks must stand together, in that order.
- **Precise**: every typed word stands in the row, in sources 1 to 3 taken together, or all of
  them in one record of its table, or all of them in one paragraph of its read. A word counts as
  standing in the row when one of its colour names or one of its other names (`colours.json`,
  `names.json`) does.
- **Possible link**: the row is not precise, and it is reached by
  - only some of the typed words (at least half of them), or
  - the same word family (eagle and eagles, Meran and Merano), or
  - the glossary, or
  - a near spelling: one letter off in a word of five to seven letters, two in a longer one.
- **Order.** Precise: the rows whose `colours` hold a colour that was typed; then the rows where
  what was typed stands as typed, before those that hold only another of its names (typed
  "Hochetsch", the notice that says Hochetsch before the hundred rows that say Alto Adige); then
  the strongest source (1, 2, 3, 4); among equals the row whose number or whole title was typed;
  then the row number. Possible: more of the typed words first, then word family, glossary, near
  spelling, then the source, then the number. A click on a column head sorts inside each group.
  **(call; the first two steps and the title step were added while building, from what the real
  library showed)**

## How it is made

- **(call)** In the browser, from an index the build writes into the site. No package is added:
  400 rows need no search library, and the two groups and the reason line are the engine's own.
- The matching is plain functions in one module that the browser and the tests both load, as
  `web/state.js` is.
- The index is fetched when the field is first focused, or at once when the address carries `q`.
  Once it is there, typing answers without a visible wait on the author's laptop.
- The build checks `find.json`: a row number that does not exist, a colour that is not on the
  list and a list that is not a list are errors.

Left to the builder: the module and file layout, the index's format and whether it is one file or
two, the exact numbers in the ordering, the wording of the two group lines, how far the glossary
goes beyond the vocabulary found, the tests' layout.

## Order of work

1. The engine and the field over what exists already (the rows' lines, texts, facts, tables and
   reads). From here on it can be tried.
2. The `find.json` files, by subagents in parallel, then read and corrected.
3. The three shared lists.
4. The checks below, on the real library.
5. The author tries it locally. Only on their word: commit, push, `npm run deploy`.

Every step leaves a search that works; nothing here depends on the midterm's hour. What is online
at the midterm is whatever the author has tried and asked to publish by then.

**(M)** "now on dont use the browser. I might be presenting." While that holds: nothing is opened
or driven in a browser, no build writes into `library/dist` (a build empties it first) and nothing
is started or stopped on port 5180. Builds go to a folder of their own (`--out`) and are checked
from the terminal.

## It is right when

The rules above govern. The lines below were checked against the records on 17 November; where a
line and a rule disagree, the line is wrong.

After step 1, on the real library:

- every row is among the first precise hits for its own number and for its whole title; rows
  with the same title (1.10 and 1.11, both "Merano") stand together at the top, in number order;
- `Spinne` gives 3.06 and no other row;
- `Fuehrer ruft` gives 16.19 first;
- `Hochetsch` gives 1.05 and 3.19, precise;
- `funivia` gives 1.02, precise (the word stands in its notes), and the tables 1.03 and 2.02;
- `teschio` stands only in a record of the table 15.01 and gives that row, with the record as
  its reason;
- `Furer` stands nowhere: no precise row, and 16.19 among the possible links, marked as a near
  spelling;
- an ordinary word (`poster`) has more than 30 possible links and puts 30 on the page;
- `npm test` and `npm run check` pass.

After step 3:

- `rosso`, `rot` and `red` give the same precise rows, the rows whose `colours` hold red first,
  among them 17.01, 17.16 and 16.19;
- `Hochetsch` gives 1.05 first, with `on it: “die Königin des Hochetsch”` as its reason;
- `caricature invalids` gives 3.04, precise;
- `vescovo` stands nowhere: no precise row, and 5.03 as a possible link through the glossary;
- `aquila` gives 3.16 alone, precise (a pharmacy "Aquila Nera" advertised on that page, read
  when the hidden terms were written), and 5.05 as a possible link that names its road;
- `funivia` gives 1.12 as a possible link (a cable car in its picture, the word nowhere in its
  record);
- `Bozen` gives every row that says Bolzano, and `Siegesdenkmal` every row with the keyword
  Monumento alla Vittoria, precise;
- every row with a picture has a `find` entry, and `npm run check` warns of none.
