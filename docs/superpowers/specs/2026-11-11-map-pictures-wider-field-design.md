# The map: pictures, entries in the panel, a wider field — design

2026-11-11 · status: **approved by the author on 2026-11-11**, the four parts after trying them and
this write-up as it stands · midterm: Tuesday 17 November 2026

A change to the Map page of the research library
(`docs/superpowers/specs/2026-11-10-research-library-design.md`). It replaces that document's
"Map" section where the two differ, and its line "No change to BolzanoDot … The library takes a
copy of the dot data": the library now makes its own dot data. BolzanoDot itself is still not
touched.

Everything here was tried as a throwaway on 11 November and approved from use. The trial is the
reference for look and behaviour, and is kept, outside git, in
`.superpowers/spikes/2026-11-11-map/` (its README says what each file is; `shots/` has three
pictures). Its code is not to be kept as it is.

Lines marked **(M)** are the author's decisions, in the author's words where quoted. Lines marked
**(call)** are the designer's calls: tried in the spike and not rejected, or sensible defaults,
free to overturn.

## Intent

The map is "another place where we can geolocalize the entries" (design of 10 November). As
built, it shows a place as a name and a number, and a click leads away to the Library. The
material itself, the pictures, is not on it, and nine of the fourteen places with rows are at its
edge or off it.

After this change the map shows the research: the pictures stand on their places, an entry can be
read without leaving the map, every place with rows is on the field, and the buildings the
research is about are drawn finer and darker than the city around them.

## Goals

1. **Pictures on the map.** **(M)** "small images inside a pointy towards down frame"; "many
   pictures, ideally one item from far and many as you zoom in".
2. **The entry in the side panel.** **(M)** "when you click on one reference it opens the side
   tab. the side tap then sends you to the entry in the main database. no. the entry should be in
   the side tab."
3. **A wider field.** **(M)** "expand the map further the current edges, many monuments and
   stuff are cut."
4. **Higher resolution where the research is.** **(M)** "increase the resolution of the
   monuments that have entries."

"Reference" in these quotations means any row that has a place, not the row type "Reference"
(those rows have no place and stay off the map).

## Non-goals

- No change to the Library page, the read pages or the table pages, beyond code they share with
  the map being moved to where both can use it, and the way back described under "The panel".
- No position of its own for a picture. A place is one point; its pictures spread out on the
  screen above that point and all lead back to it.
- No change to BolzanoDot, its data or its deployment. Its two data scripts are copied and
  changed here; nothing is written there.
- No phone design. It is shown on a laptop; on a narrow screen it must not break.
- Nothing new for the rows without a place.

## Anti-goals

It has failed, even if it works, when:

- a click on a picture leaves the map;
- anything is drawn where it was not measured: a picture at a spot of its own, or ground where
  the survey has none;
- the map moves worse on the author's laptop than the approved trial did (7.8 million dots);
- the pictures look like map-app pins: colour, shadows, rounded corners, icons. They are small
  pictures in a hairline frame, black on white like the rest of the site;
- the field is round. **(M)** A disc was tried and turned down: "no back to square map".

## What the visitor sees

### The field

- A rectangle of 4.4 × 3.9 km, EPSG:25832 `[677300, 5149300, 681700, 5153200]` (was 1.65 × 1.41
  km). **(M)** approved from the trial; it is the first trial rectangle with 200 m more on every
  side, after "would expand the map slightly more". All fourteen places with rows are inside, so
  "Beyond this map" is empty today. It stays in the page for a place that may one day lie outside.
- Drawn as before: the same layers, spacings, greys and opening view.
- The south-east corner is empty. The Province's half-metre survey has no data on that mountain
  flank (roughly south-east of a line from E 680000, N 5148500 to E 681500, N 5151000), and no
  dot is drawn where nothing was measured. **(call)**
- The camera can back off far enough to see the whole field; how far follows from the field's
  size, not from a fixed number. **(call)**

### The places with rows, at full resolution

- For each place with rows, the OpenStreetMap object its record names (`osm` in
  `library/content/places.json`) marks the ground it stands for: the object's outline and 8 m
  around it; 15 m either side of a line (Corso Libertà); 45 m around a point (the Semirurali
  house, Oltrisarco). **(call)**
- Every building footprint that touches that ground is drawn at the survey's own grid: a roof dot
  every 0.5 m (elsewhere 1.6 m), wall dots every 0.5 m along and 0.7 m up (elsewhere 1.6 and
  2.2 m). The open ground inside it is drawn every 1 m (elsewhere 2.6 m). Bridge decks crossing it
  every 0.45 m along and 0.65 m across (elsewhere 0.9 and 1.3 m). On 11 November that is 79
  buildings and 1.3 million of the 7.8 million dots.
- These dots are smaller than the others, since they stand closer, and a little darker, so the
  buildings read as the dark, fine objects in a grey city. Dot diameters in metres, as approved
  in the trial: ground 0.5, roofs 0.38, walls 0.34 (greys `#6a6a6a` to `#101010`), bridges 0.4;
  roofs, ground and bridges keep the greys of their coarse layers.

### The pictures

- Every row with a place and a picture stands on the map as a small picture in a frame of its
  own: the picture 60 px high, its width following its shape between 40 and 90 px, cropped from
  the top where it does not fit; 2 px of white around it, a black hairline, and a point 6 px deep
  under the middle of the bottom edge. **(M)** "I like the separate frames" (one shared frame for
  a place's pictures was tried and turned down).
- A row with a place and no picture gets the same frame, 46 px wide, holding its type word in
  grey 9 px. **(M)** approved as a stated guess.
- **From far, one picture per place**: the place's first row by number. **(M)** approved as a
  stated guess. Its point stands on the place.
- **Closer, more.** How many of a place's n pictures show depends on the camera's distance d to
  that place: one at 0.6 of the whole-field viewing distance and beyond, all of them from 900 m
  (opening a place flies to 700 m, so an open place shows all), and in between
  `1 + round((n − 1) · t^1.3)` with t running from 0 to 1 across that range. **(call)**
- Several pictures of a place stand side by side in rows of up to seven, 6 px apart, centred over
  the place, the first row lifted between 22 and 70 px (0.16 of its width) and further rows
  above it. A hairline runs from each frame's point down to the place. Pictures that are not
  showing wait behind the first one and slide out from it. **(call)**
- Above its pictures each place carries its name and count in 12 px sans on white (the 22 px
  serif label goes). The open place's name is white on black. Over a picture (pointer or
  keyboard focus), the name gives way to that row's number and title. **(call)**
- **Crowding.** Where two places' pictures would cover each other, the open place and then the
  place with more rows keeps its spot; the other rises above it on a hairline stem. One that
  would have to rise more than 150 px, or past the top of the map, is not shown until the camera
  is closer. **(call)**
- With a keyword (`#k=`), only the rows carrying it have pictures, and the counts follow, as now.
- A wheel or pinch over a picture zooms the map, as over a label now. A drag that starts on a
  picture does not move the map. **(call)**

### The panel

- **A click on a picture** opens its place (the camera flies there as now) and shows that row in
  the panel. The picture is outlined on the map while its row is shown.
- **A click on a place's name** opens the list of its rows, as now. **A click on a row in the
  list** shows that row in the panel; it no longer leaves for the Library.
- **A row in the panel** is, top to bottom:
  - "← Place name", back to the list;
  - number · type · date, grey 12 px;
  - the title, serif 22 px;
  - what the Library shows in that row when open, in one column: its pictures with "← 2 / 6 →"
    where there are several, the caption, the text, the facts (holder, creator, rights,
    confidence, source, sources) and the link at the bottom ("Read the full story →", "Open the
    PDF →" and the like). The "Place" line is left out: the reader is on the map at that place.
    A link to another row ("Sources: 5.02") opens the Library at that row. A link to the
    source on the web works as in the Library, in a new tab. **(call)**
  - "Open in the Library →", to this row, open, in the Library;
  - "← Previous · 3 / 18 · Next →" through the place's rows in number order (with a keyword,
    through the rows that carry it), the ends disabled.
- The address keeps what is shown, `#p=<place>&e=<row number>&k=<keyword>`, so a reload or a
  copied address restores it. **(call)**
- Escape goes back one step: from a row to the list, from the list to the closed map. Focus goes
  to the row's title when it opens and back to where it came from when it closes. **(call)**
- **The way back.** A story, report, notes or table page opened from the panel says "← Map" where
  it says "← Library" when opened from the Library, and returns to the map as it was left: the
  place, the row, the keyword. Opened any other way it says "← Library" as now. Without this,
  presenting a story from the map ends in the Library. **(call)**
- Without WebGL the page is the plain list it is now, and a row there links to the Library as
  now. **(call)**

## Where things live

- `library/mapgen/` — new: what makes the dot data. `area.json` (the rectangle), a fetch script
  and a build script in Python, run through `uv` as in BolzanoDot, both adapted from
  `BolzanoDot/scripts/fetch_data.py` and `build_points.py` and saying so. One command
  (`npm run map-data`) fetches what is missing and rebuilds. **(call)**
- `library/.cache/map-raw/` — the downloads (OpenStreetMap as JSON, 220 survey tiles, 376 MB),
  already outside git. The trial's downloads can be copied there to save fetching them again.
- `library/map-data/` — the result, in git as now: `dots.json`, `dots.bin.gz` (27 MB, was
  4.5 MB), `height.bin.gz`. The height grid is only read by the build, to stand each place on
  the ground; at a 2 m step it is about a quarter of the 10.6 MB it would be at 1 m. **(call)**

## How it gets made **(call)**

- The generator needs the network (OpenStreetMap's Overpass, the Province's elevation service)
  and Python with `uv`. The site's build and the site itself still need neither. Requests go out
  under a plain client name, with no project or personal name in them.
- "Places with rows" must mean in the generator what it means on the site, so the list comes
  from the site's own loader, not from a second reading of the records. `dots.json` records
  which places the data was made for. The site build warns, naming the places, when a place has
  rows and the data was made without it: the map still works, that place is just not drawn fine
  until the data is made again.
- `dots.json` also records the spacing of each fine layer, so the page's dot sizes can be checked
  against the data.
- The small pictures are made by the build's pictures step with the tools it already uses, cached
  like the others: at most 220 px on the longer side, for the first picture of every row that has
  a place.
- What the Library shows in an open row is made in one place and used by both pages. The same
  holds for the rules that style it and for the picture switcher.
- The trial took a row's detail from the Library page at run time. The real page carries it
  itself; nothing on it is fetched from another page.
- Built with subagents on Opus at most; every text a reader sees is written by the main session
  (the rule of 10 November).

## What else changes with it

- **Tests.** The map tests read the real dot data, and their fixture has the Semirurali as the
  place outside the field; it is inside now, so the fixture needs a place that is truly outside.
  New tests cover: the pictures and frames the map page carries for a fixture place, with and
  without a picture; the small pictures exist as files; a row's detail on the map page matches
  the Library's; the address with `e`; the warning for a place the data was made without.
  The check that every link, picture and script leads to a file keeps passing. The check that
  no remote address appears on the map page is narrowed to what it protects, "nothing on it needs
  the network": nothing is loaded from elsewhere (no script, style, picture, import or request),
  while a link the reader may follow to a source is allowed, as on the Library page. The credit
  stays text. **(call)**
- **Two places go back to their centres.** Palazzo di Giustizia and the Lido were moved 25 m east
  and 70 m north of their centres only so that they fell on the old, narrower field; their
  records say so. The wider field covers both, so each returns to the centre of the object its
  record names and the "Moved …" sentence leaves its note. **(call)**
- **A look in a browser before it is called done:** the whole field, a place opening, an entry
  from a picture and from the list, Previous and Next, a keyword carried over from the Library,
  the page without WebGL, and a narrow window.
- **About.** Its line on the map says "the centre of Bolzano". Proposed, for the author to accept or
  reword: "The map is Bolzano from Gries to the industrial zone as a field of dots, drawn from
  the Province's laser survey at half-metre resolution and from OpenStreetMap. Places that have
  entries in the library stand on it with their pictures, and their buildings are drawn at the
  survey's full resolution."
- **README.** A short section: how to make the map data again, and when (a place gets its first
  row, a place is added or moved, the rectangle changes).
- **The Map row in the Library** shows a picture of the map; it is taken again once the map is
  done.

## Order of work

1. The generator in the repository and the new data, with the fine layers drawn: the map is wider
   and the places are fine, still with the old labels.
2. The pictures.
3. The entry in the panel.
4. Tests brought up to date throughout; About, README and the Map row's picture at the end.

Each step leaves something that can be shown.

## Left to the builder

- File names and the split into files; how the page's markup is produced; how the small pictures
  are named and cached.
- Easing and timing of the pictures sliding out (the trial: 0.28 s), and the exact greys of the
  fine layers within what is described above.
- How the generator and the site build share the list of places with rows.
- The narrow-screen layout of the panel.
