# Brief: the hidden terms of a row (`find.json`)

2026-11-17 · for whoever describes rows for the search: a subagent drafting a folder, or anyone
adding material later. Design: `docs/superpowers/specs/2026-11-17-search-design.md`.

## What this is for

The library has a search. A visitor types what they remember: a word they saw on a poster, what a
newspaper page says, the colour of a thing. The row's title and text rarely hold those words. So
every row has terms that no page shows and that the search reads. You write them.

The terms do become visible in one place: under a found row the page says why it was found, for
example `on it: “die Königin des Hochetsch”` or `shows: a bishop in mitre and vestments`. Write
every term so that it can stand there: plain, true, no brackets, no tags, no full stop.

## The file

One `find.json` beside the folder's `entries.json`, an object from row number to terms. Every row
of the folder gets an entry. Two-space indent, UTF-8, rows in the order of `entries.json`.

```json
{
  "1.05": {
    "on": ["Bürger!", "Vom Rathause Bolzano, 19. Mai 1925", "Der Präfekturskommissär STEFFANINI", "die Königin des Hochetsch"],
    "shows": ["a bilingual public notice on a wall", "tricolour flags ordered for the visit of Italian war invalids", "a border of red fruit and green leaves", "part of a blue-framed tourist poster at the left edge"],
    "colours": ["red", "green", "blue"]
  }
}
```

The four fields. All are optional; leave a field out when it would be empty.

### `on`: the words on the thing

- What stands on the thing itself, word for word, in its language and spelling, capitals as
  printed: titles, headlines, slogans, mastheads, date lines, signatures, imprints, stamps,
  captions, inscriptions, shop signs in a photograph.
- One string for each piece of wording. Up to about twelve for a row. Not the running text of an
  article; its headline.
- **Only what you read with certainty** in the picture, or what the record's `facts` quote from
  it. Fraktur and small print that you cannot read for sure are left out. Nothing is completed
  from memory, nothing guessed. A wrong word here is shown to a reader as a quotation.
- For a film or a sound recording: titles and intertitles the notes quote.
- A thing with no words on it has no `on`.

### `shows`: what it shows or says

- Short English phrases, not sentences: what is in the picture (people, objects, buildings,
  animals, landscape, how it is drawn or set), and what the thing is about (the subject of an
  article, a law, a book, a table, a film).
- Three to eight for a row with a picture, two to five for a row without one.
- Use the plain words a visitor would type: `a winged Victory with laurel and fasces`,
  `a cable car above a ridge`, `the unveiling of the Victory Monument`, `a ban on German place
  names`. Lower case except proper names.
- Only what is seen or what the record supports. No judgement and no interpretation of your own.
- Lift from the record's `facts` where they say it (many have a line "Seen in the image: …"), but
  look at the picture yourself and trust the picture.

### `colours`

- Only from this list: `red orange yellow green blue purple pink brown black white grey gold
  silver monochrome`.
- The colours that mark the thing as printed, painted or made, the main one first, at most five.
  A poster printed in black and red is `["red", "black"]`.
- A black-and-white or sepia photograph, print, film still or drawing is `["monochrome"]`.
- A page of plain black text on paper (a newspaper page, a law, a book page) has none, unless it
  is printed in colour.
- A colour photograph of a place or an object: the colours that mark what is shown (a red banner,
  a green door), at most three; none when nothing in it is marked by colour.

### `names`

- Other names, in real use, of the thing, its maker or what it is about, that belong to this row:
  a newspaper's other title, a person's other spelling, what an abbreviation stands for, a film's
  other title, the German or Italian name of a village, a street or a building.
- Not needed, because a shared list holds them for every row: Bolzano/Bozen, Merano/Meran, Alto
  Adige/Südtirol/South Tyrol, Monumento alla Vittoria/Siegesdenkmal/Victory Monument, Ponte
  Druso/Drususbrücke, Casa del Fascio.
- None made up. If you are not sure a name is in use, leave it out.

## How to work

1. Read the folder's `entries.json` and `manifest.md`. For each row read its `title`, `text` and
   `facts`.
2. Look at every file a row names in `images` (paths are relative to the folder; a few point into
   another folder). Look at the original, not at a copy elsewhere. Where print is small, cut an
   enlargement into a temporary folder of your own (`sips -c` or `sips --cropOffset`, into a
   folder made with `mktemp -d`), never into the repository.
3. Write the entry. A row without a picture is described from its record: what it is about, and
   the words its `facts` quote from it.
4. Check that the file is valid JSON and that every row of the folder has an entry.

## Rules

- You write `find.json` (or the one file you were told to write) and nothing else. No other file
  in the repository is changed, created or deleted.
- No browser and no web: only the files on disk.
- Never run `npm run build`, `npm run serve` or `npm run deploy`. To check your file run
  `node library/build.mjs --check` from the repository's top and mind only the lines that name
  your file; others may be working on other folders at the same time.
- When you report back: the rows you wrote, how many pictures you looked at, the rows where you
  left `on` out because the print could not be read, and anything you were unsure of and left out.
