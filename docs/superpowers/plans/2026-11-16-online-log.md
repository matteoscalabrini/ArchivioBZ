# Log — 16 November 2026: the library online, the repository public, media and database

The day before the midterm, the library went from a private site on one laptop to a public site, a
public repository and a backed-up archive. What was decided (by the author unless marked "call"),
what was built, how it was checked, what went wrong, and what is open.

## Decisions

- **The site is open to anyone** at https://archiviobz.vercel.app (Vercel project `archiviobz`).
  This overturns the design doc's "No public deployment now" (note added there). The author chose
  "open to everyone" over a password or a no-index header, after the rights of the held material
  were set out.
- **The originals stay off the site.** 1.2 GB of PDFs, full scans and saved pages cannot go in a
  Vercel deployment and are not republished; the site shows study copies at screen size. About's
  Rights paragraph was rewritten to say so. (call, forced by size; the author did not object)
- **The idea text shows online.** First deployed with `--present`, which hid it; the author:
  "the main statement is gone - wrong". The web build no longer uses `--present`.
- **The repository is public**, as a new repository rather than a rename of the old private one,
  with an MIT licence for the code and the project's own texts (`LICENSE`); `NOTICE` says the
  gathered material is not covered. (New repository: call — GitHub keeps overwritten commits
  reachable by their ids, so a rename would have carried the unpurged history into public.)
- **"Purge my personal data"** before going public: commit emails, the author's name, home paths
  and photo metadata out of everything published, history included (below).
- **Media and database on Vercel** after the team moved to Pro: all media in a private Blob store,
  the records mirrored in Postgres. Private store, Frankfurt, free database plan, records in git
  kept as the source: calls, stated before building.
- **A row's picture opens full screen** over the dimmed, blurred page; a click beside it closes
  it. (The author's specification.)

## Built

- `build.mjs --web`: no links to originals (`ctx.sourceUrl` gives null). A row loses its "Open the
  file" link and keeps its Source line; in a read, a link to a held file opens its row in the
  panel, any other file is words, and pictures are copied in at 1600 px under `img/read/`.
- `npm run deploy` (`library/deploy.mjs`): web build into `library/.deploy/.vercel/output/static`,
  uploaded as it is with `vercel deploy --prebuilt --prod`. Vercel builds nothing.
- `steps/90-metadata.mjs` + `lib/metadata.mjs`: every JPEG the build writes loses Exif, XMP, IPTC
  and comments (camera, time, GPS); a turned picture keeps only its orientation.
- `npm run db:sync` (`library/db/`): the 730 files git does not keep (1,383 MB) to the private Blob
  store `archiviobz-media`; the Neon database `archiviobz-db` rebuilt from the records (entries,
  media, entry_media, keywords, places, kinds). Uploads only what Blob lacks or holds older; never
  deletes from Blob; checks every blob's size against the disk before writing the database.
- `web/lightbox.js`: full-screen picture on the Library, the Map and the read pages; Escape closes
  only the picture; off the web it links the original.
- Pictures measured upright: a JPEG whose orientation turns it a quarter has width and height
  exchanged (29 phone photographs), in rows, full screen and the map's frames.

## Checked

- Tests: 166 at the start of the day, 178 at the end, all passing.
- Web build: 0 addresses of originals in any page; 3,940 local links and pictures all resolve.
- Live site: pages, pictures, tables and map data answer 200; the map data is served as plain gzip
  with no Content-Encoding, as `map.js` expects.
- Metadata: before, 43 published pictures carried GPS and 52 a camera model; after, the only
  metadata left is 39 orientation-only blocks.
- History rewrite (git-filter-repo): every commit carries a no-reply address; 0 matches for the
  personal email, surname or home path anywhere in history; the remaining first-name matches are
  third-party host names in the InsideAirbnb table, untouched.
- Blob: all 730 sizes match the disk; five downloaded back (the largest PDF, a Word report, a
  photograph, an OCR text, a random scan) are byte-identical; a dry run uploads nothing.
- Full screen tested in Chrome on all three pages; a portrait photograph (row 5.01, picture 2)
  fits a 957 px window with 24 px to spare.

## Went wrong, and fixed

- For about ten minutes the live site served 43 pictures with GPS and camera data, before the
  metadata step existed. That deployment was then removed; the first `vercel remove` printed a
  plan and deleted nothing (CLI 65 needs `--confirm-name`), which was caught only later.
- The first two media uploads stored the 16-byte text "[object Promise]" for every file
  (`openAsBlob` not awaited). Fixed; the size check now stops a sync before the database is written.
- The map's "yellow hue" was the screen's Night Shift, not the site.

## Open

- Whether pictures inside the reads' own text should also open full screen.
- `npm run db:restore`, to bring the 730 files back from Blob onto a new machine.
- The old private repository still holds the unpurged history; delete it when nothing there is needed.
- The idea text is still the stand-in; the author's own text replaces it.
