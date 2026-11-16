# SDD ledger — plan: docs/superpowers/plans/2026-11-10-research-library.md

Spec: docs/superpowers/specs/2026-11-10-research-library-design.md (approved by the author 2026-11-10, map amended)
Branch: `library` (from main 28011f2). No worktree. Subagents: Opus at most. Texts: main session only.

## Rulings before execution

- Ruling: created a local git repository in Studio1 (main = starting state, work on branch `library`) — the review process needs diffs and commits; the folder had none — costs nothing to undo (`rm -rf .git`), nothing pushed.
- Ruling: no git worktree — downloads (859 MB) are untracked and a worktree would not contain them, so the build could not see the material — cost: work happens in the live folder; code tasks only add files under `library/`.
- Ruling: heavy downloads are git-ignored (pdf, jpg, png, html, txt, xlsx, docx); records, manifests, notes, tables are tracked — cost: git does not back up the downloads.
- Ruling: proceeded from plan to implementation without a separate plan review by the author — he said "All approved. implement with subagents" — cost: plan-level choices (file layout, map greys, labels) reach him only in the result.
- Ruling: data tasks (9, 10, 11) run in parallel and are not committed by their subagents; the controller commits each folder when its agent reports. Their review is the build check plus the main session reading every record while writing its text — cost: no independent reviewer per data folder.
- Ruling: implementers stage explicit paths only, never `git add -A` — data agents write in the same tree at the same time.
- Ruling: no attribution lines in commit messages — the session's attribution rule covers pull requests only.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ T4 | loadLibrary `keywords` (canonical only) vs parseIdea needing folds | Conflict. Ruling: loadLibrary also returns `aliases`; parseIdea takes `{keywords, aliases}`. Plan patched. |
| T1 ↔ T2 | fixture rows vs T2 tests needing a Table row and an empty Reference | Conflict. Ruling: fixture has six rows incl. `5.03` Table and `12.01` Reference; expected order updated. Plan patched. |
| T1 (self) | build "empties out" with a free `--out` | Defect: could delete a wrong folder. Ruling: only empties a folder that is empty, absent or carries `.library-dist`; test added. Plan patched. |
| T1 ↔ T3 | `images[].abs`, `abs` vs pictures step | agree |
| T2 ↔ T3 | `entry.pictures` shape | agree |
| T2 ↔ T5 | `entry.preview {columns, rows, total}` | agree |
| T2 ↔ T7 | `place.inside`, `map.html#p=`, `#k=`; step 50 runs before 60 | agree |
| T6 ↔ T8 | `renderMarkdown` | agree; T8 after T6 |
| T1 ↔ T7 | `out/web/` copy incl. vendor; map-data copied by step 50 | agree |
| T2..T8 (each) | tests vs code named in the same task | agree |
| T9/T10 ↔ T1 | entries.json shape in brief vs loader | agree (brief copies the shape) |

## Progress

BASE for Task 1: 28011f2
Dispatched 17:16 (all Opus):
- Task 1 implementer: afd70e9582ca2bac3
- Task 9 A a8fd2163b51229930 · B a5ec60999996a52e0 · C a912e3b0a2d972b18 · D a7c96bf5518204439 · E a5b5722ed12261ae8 · F ad03b7b941e1f4f17 · G a2bb3e5eee9651e9b · H acc9bdb93c1bd6f8c
- Task 10 a a7b7a09fa24b60c69 · b a853dd8c6af479db6 · c ae9ebcd4463881905
- Ruling: data agents started before Task 1 finished (they self-check JSON if the checker is not there yet; controller runs the checker afterwards) — saves an hour of wall-clock — cost: a second pass on any folder the checker rejects.
- Task 9 E: reported DONE_WITH_CONCERNS 21 rows (6.00–6.20), checker clean; judgement calls accepted (Article for journal full text; table dates = source date; Airbnb neighbourhoods folded)
- Task 9 G: reported DONE_WITH_CONCERNS 26 rows (10.00–10.25), checker clean; choices accepted (GU issue own row; Pergher index + intro two rows; AS Latina dated 2006–08 with note)
- Task 12: texts written for sections 6 (21 rows) and 10 (26 rows)
- Task 1: implementer DONE_WITH_CONCERNS, commit 2fdafdb (23 tests pass). Concerns are observations (test script uses a glob; fixtures must be copied without bad/; loader also rejects non-integer year, >5 keywords, unknown confidence level). To review.
- Task 9 H: reported DONE_WITH_CONCERNS 23 rows (11.00–11.22), checker clean. Open for texts: Luce B0803/B0804 issue mismatch; date of the Viale Mussolini photograph (11.05) needs a hand check.
- Task 12: texts written for section 11 (23 rows)
- Task 9 F: reported DONE_WITH_CONCERNS 27 rows (8.00–8.13, 9.00–9.12), checker clean. Open: Grosselli 2023 rights/authorship conflict; two doubtful photo dates (in confidence notes). Proposed keywords so far: architecture (F), planning (H), military (A).
- Task 12: texts written for sections 8 (14 rows) and 9 (13 rows)
- Task 9 A: reported DONE_WITH_CONCERNS 25 rows (1.00–1.13, 2.00–2.10), checker clean. Newsreel count settled: 172 rows = 162 Giornale Luce + 10 Combat film reels; README's 163 = rows dated 1928–43.
- Task 12: texts written for sections 1 (14 rows) and 2 (11 rows)
- Task 9 C: reported DONE_WITH_CONCERNS 37 rows (4.00–4.36), checker clean. Open: Antenati table covers 9 of 21 saved pages; name lists 4.03 and 4.31 typed Table but open as PDF (first-page picture of 4.31 would show names).
- Task 12: texts written for section 4 (37 rows)
- Task 9 B: reported DONE_WITH_CONCERNS 42 rows (3.00–3.41) + 2 (7.00–7.01), checker clean. Open: wrong scans on Dolomiten 14 Jul 1928 and 27 Oct 1939 (re-download by hand); typeface keyword on 38 rows to prune; rows inside a year not in date order.
- Ruling: renumber every section in true date order (year, month, day) before the first commit of records — the brief's 'year, then title' rule put pages of one year out of order; no number has been cited yet — cost: row references already written into texts must be remapped (script, 'row N.NN' patterns only).
- Task 1: complete (commits 28011f2..2fdafdb, review clean: no Critical, no Important)
- Task 1: minor (deferred): base.css headings keep browser sizes, code/pre fall back to monospace — handed to Task 2 to fix
- Task 1: minor (deferred): engines says >=24 but import.meta.main needs 24.2
- Task 1: minor (deferred): rebuild test never plants a stale file to prove emptying
- Task 1: minor (deferred): loader accepts file/target outside research_notes/ and reports/ (silently broken link)
- Task 1: minor (deferred): serve.mjs serves dir/index.html without redirecting /dir to /dir/
- Task 1: minor (deferred): ctx.copyFile shadows the imported copyFile name
- Ruling: Task 3's "file named with spaces and ß converts" test calls the converter directly on the fixture file; fixture rows stay frozen — reviewer's ⚠️ — cost: none.
- Ruling: later code tasks build fixtures through a shared helper library/test/helpers.mjs (fixtures without bad/), created in Task 2 — reviewer's ⚠️.
- Ruling: the Confidence line is not shown on rows of type Report, Notes or Map — "Read in the source" is meaningless for the project's own outputs — cost: one line of logic in Task 2.
- Task 9 D: reported DONE_WITH_CONCERNS 39 rows (5.00, 5.02–5.39), checker clean. Findings: Ladin Arendt line read from the facade; explanatory plaques 2004 not 2005; Gabinio inscription appears to read MCMXV. Proposed places: lido, noi-techpark, sparkasse-sede.
BASE for Task 2: d85651e
- Task 12: texts written for sections 3 (42 rows) and 7 (2 rows); typeface keyword pruned to 6 press rows
- Task 12: texts written for section 5 (39 rows). All eleven download folders now have texts (248 rows incl. project rows).
- Task 10 a: reported DONE 11 rows (12.01–12.11), all with a picture, 8 confirmed in the source, 3 left as leads (Musikarat 'ironic', Manifesto 'affectionate', Haacke 'one word changed'). Six pictures without a stated licence.
- Task 12: texts for 12.00–12.11 (12 rows)
- Ruling applied: all sections renumbered in date order (85 rows moved, 14 text lines remapped); section 12 will be renumbered once more when parts b and c arrive.
- Vocabulary: added architecture ('Architecture and planning'), military, autonomy; planning folded into architecture. Places: added oltrisarco, lido, noi-techpark, sparkasse-sede. Story 5.01 linked to its 10 source rows.
- Task 11 (places) dispatched: a3703cb76e7f3fc5a
- Task 2 implementer: af0d4adeb3a3196a9 (running)
- Task 10 b: reported DONE 11 rows (12.21–12.31), 10 with a picture (none for Debord/Wolman 1956), 9 fully confirmed. Rights need care on several pictures (Zimmerli forbids reproduction; Milov fair use only).
- Task 12: texts for part b of the references (11 rows)
- Task 10 c: reported DONE 11 rows (12.41–12.51), all with a picture, 9 confirmed, 2 leads (Daily Stormer 'keep the tone light'; Laibach 1993). Conflicts kept: Somuncu figures; Wunsiedel €10 per km vs per metre. Pictures to consider dropping: 12.47 (meme edit with masked figure), 12.48 (page screenshot with the guide's first lines).
- Task 12: texts for part c of the references (11 rows). Every row of the library now has a text. Section 12 renumbered in date order.
- Task 2: implementer DONE_WITH_CONCERNS, commit c099eb6 (42/42 tests). Concerns are observations (headless Chrome floor of 500 px; punctuation attached to idea buttons; small label calls). To review.
- Data committed at the task boundary (after packaging d85651e..c099eb6).
- Ruling: Tasks 3, 4 and 5 (pictures, idea, tables) go to one implementer and one review — three small independent steps with complete briefs; saves two dispatch-and-review cycles — cost: a larger diff for one reviewer.
- Task 2: review at c099eb6: spec ❌ on one point (Important): table rows emit text+meta+link before the preview, so on narrow screens "Open the full table →" sits above the table.
- Ruling: on table rows the DOM order becomes preview, text, meta, bottom link (fixes narrow screens), while at 800 px and wider the text stays left and the table right, as in the sketch the author approved — the reviewer's proposed desktop placement (table left) contradicts the approved sketch; the spec names the sketches as the visual reference — cost: none on desktop.
- Task 2: minor (deferred): pictures are wrapped in a link to the original with alt="" (tab stop without a name)
- Task 2: minor (deferred): "Show all" hides itself on activation and drops keyboard focus to body
- Task 2: minor (deferred): scroll-padding-top fixed at 48px while the sticky status line can wrap
- Task 2: minor (deferred): no test pins HTML escaping of free text
- Task 2: minor (deferred): browser behaviour (lazy pictures, stale address, hashchange, Sources jump) checked only by scratch scripts; cdp.mjs for 390 px emulation not in the repo
- Task 2: minor (deferred): a long unbroken cell (a URL) in a table preview can overflow at 390 px and be clipped silently; real-table-390.png predates the wrap fix
- Task 2: minor (deferred): `total` interpolated without esc in the preview caption (a number)
- Carry to Task 4: ctx.idea.html must wrap paragraphs in <p> and each marked word must be a <button> with plain text (the Library step attaches following punctuation to it).
- Task 2: fix round 1 dispatched (resumed implementer af0d4adeb3a3196a9); FIX_BASE c099eb6; re-review diff must be path-filtered to library/ code because data commit 99703f7 sits in the range
- Task 2: fix round 1/5 dispatched and reported: commit 4aeaef2 (43/43 tests). Scoped re-review running (acfc6ef74ff67174d).
- Ruling: Tasks 3-5 batch dispatched while the Task 2 re-review runs (implementer a511eb50eeac956d1, BASE 4aeaef2) — the fix is reported with test evidence and touches files the batch may not edit — cost if the re-review fails: a second Task 2 fix commit lands inside the batch's commit range and its review diff must be path-filtered.
- Task 2: fix round 1/5 (1 addressed, 0 open — table row order; commits c099eb6..4aeaef2)
- Task 2: complete (commits d85651e..4aeaef2, review clean after one fix round; 7 minors deferred)
- Task 11: reported DONE, 17 of 17 places located from OpenStreetMap; both bridges within 0.5 m of the dot data's labels (UTM). Ten inside the dot field.
- Ruling: moved two points onto the part of the site the dot field covers (Palazzo di Giustizia 25 m east of its centre; Lido 70 m north), each noted in its `source` — the centre of each lay just outside (11 m, 54 m) while part of the building is on the map — cost: the marker stands on the building's edge, not its centre.
- Open for the author: Oltrisarco's OSM place node lies inside the industrial zone; the Lager point is a wall beside the Passaggio della Memoria (no memorial object in OSM); the industrial-zone point is the former Lancia works.
- Ruling: Task 7 (map) dispatched in parallel with the Tasks 3-5 batch (implementer a7aa2a3bc80e5242e, BASE 573d673) — disjoint files, both told to commit with explicit pathspecs and to leave helpers.mjs and the shared fixtures alone; the map is the longest task and nothing in it depends on 3-5 — cost: interleaved commits, so every review diff from here on is path-filtered by hand.
- Task 7 files for its review diff: library/steps/50-map.mjs library/lib/geo.mjs library/web/map* library/test/geo.test.mjs library/test/map.test.mjs library/serve.mjs library/test/serve.test.mjs (vendor and map-data are copies: stat only)
- Tasks 3-5 files for their review diff: library/steps/10-pictures.mjs 20-idea.mjs 30-tables.mjs library/lib/idea.mjs library/lib/csv.mjs library/web/table* library/test/pictures.test.mjs idea.test.mjs tables.test.mjs (+ any new helper/fixture files)
- Interruption: both running implementers stopped on the account's usage limit (not a task failure). State then: Tasks 3-5 all committed (10e6757 pictures, 8c8b8c1 idea, a270021 tables), report and final captures pending; Task 7 uncommitted and mid-work (map.css missing). Both resumed by message after the limit reset; same agents: a511eb50eeac956d1 (3-5), a7aa2a3bc80e5242e (7).
- Ruling: from here on no more than two subagents at a time, and Sonnet for reviewers and for the long-reads/About implementer — the parallel Opus burst is what exhausted the usage window — cost: slower finish.
- Tasks 3-5: implementer DONE_WITH_CONCERNS: commits 10e6757, 8c8b8c1, a270021; 74/74 of its and earlier tests; real build 2.2 s cold, 0.1 s warm, 249 pictures, 0 failures. To review (diff path-filtered: library/ code, without content and fixtures).
- Ruling: the Inside Airbnb row (10,237 records x 19 columns, kept only as a comparator) opens its CSV file instead of getting a table page — a 5.3 MB page that scrolls sideways serves nobody — cost: no preview on that one row.
- Tasks 3, 4, 5: complete (commits 4aeaef2..a270021, review clean: no Critical, no Important)
- Tasks 3-5: minor (deferred): picture w/h ignore EXIF orientation 5-8
- Tasks 3-5: minor (deferred): picture cache never pruned; key includes the absolute path
- Tasks 3-5: minor (deferred): preview cut at 160 chars can drop a long token after an early space
- Tasks 3-5: minor (deferred): more.columns with duplicated names uses the first match
- Tasks 3-5: minor (deferred): table.js date detection matches coordinates; mixed-column comparison not guaranteed transitive
- Tasks 3-5: minor (deferred): an interior blank CSV line counts as a record
- Tasks 3-5: minor (deferred): sticky table header lost at <=800 px because of the inner scroll
- Tasks 3-5: minor (deferred): two keywords sharing a label resolve to the last; null keyword value throws in idea.mjs
- Tasks 3-5: minor (deferred): CSV error paths and a 400+ row table page are untested
- Tasks 3-5: to check at the end: the Library page must not link to table/<no>.html when the tables step reported an error for that row
- Ruling: Tasks 6 and 8 (long reads, About) go to one implementer on Sonnet and one review — About is a dozen lines on top of the long-read renderer — cost: none foreseen.
- Tasks 6+8 dispatched (Sonnet implementer a63bcf0c14a26366d, BASE 507595e). Its files for the review diff: library/steps/40-longreads.mjs 70-about.mjs library/lib/longread.mjs library/web/read.css library/test/longreads.test.mjs about.test.mjs package.json package-lock.json (+ new fixtures).
- Task 7: implementer DONE_WITH_CONCERNS, commit 2dc79f1 (geo+map 14/14). Looked at the captures: dots black on white, nine places drawn with names and counts, five listed beyond the map, panel lists rows. To review (diff: step, geo, map.js, map.css, tests; vendor and map-data are copies).
- Data: place names shortened for the map labels (Sparkasse, Lido, Casa del Fascio, NOI Techpark, Lager, Oltrisarco, Station); row 0.03 shows library/content/map.png, which must be re-captured with the short names.
- Task 7: complete (commit 2dc79f1, review clean: no Critical, no Important)
- Task 7: minor (deferred): if the three import fails (404, no import-map support) the module dies before the flat-list fallback; without JS the place list is invisible
- Task 7: minor (deferred): renderer not released if draw() throws after creation; no teardown or context-loss handling
- Task 7: minor (deferred): pin() forces a layout per place per frame
- Task 7: minor (deferred): a place panned off screen is not reachable by keyboard until panned back
- Task 7: minor (deferred): map.js behaviour (state, filter, focus, fallback) covered only by screenshots
- Task 7: minor (deferred): the white "Beyond this map" block cuts a rectangle out of the dot field; labels crowd at 390 px
- Tasks 6+8: implementer DONE_WITH_CONCERNS: commits db2a061, c07cd45; npm test 101/101; cold build 2.78 s, warm 0.27 s; 15 read pages; 50 and 25 figures. To review.
- Tasks 6+8: review at c07cd45: spec ❌ on two points (Important): (1) Word tidy step rebuilds the document from regex matches and mangles nested lists, blockquotes, pre, br, bare img; (2) About totals print zero counts and "1 entry".
- Ruling: the reviewer's Minor "a Markdown image with an https source is kept" is confirmed as a real gap against the no-network constraint and enters the fix round.
- Ruling: the Word tidy step may only remove one clearly identified contents block and must otherwise return the HTML unchanged; a populated contents block is still removed (its links are dead in the page) — the reviewer accepted that reading.
- Tasks 6+8: fix round 1 dispatched (resumed a63bcf0c14a26366d); FIX_BASE c07cd45.
- Tasks 6+8: minor (deferred): Word h1 drop removes the first h1 even when paragraphs precede it (heuristic that fits the real reports)
- Tasks 6+8: minor (deferred): caption pairing is greedy; a table containing an image is flattened
- Tasks 6+8: minor (deferred): old docx cache folders never pruned; a missing cached figure warns on every build until the file changes
- Tasks 6+8: minor (deferred): About page has no h1
- Tasks 6+8: minor (deferred): no test for cache invalidation; tidy logic tested only through the real reports
- Task 13 (controller): npm test 101/101; real build 280 rows, 0 without text, 48 without picture; --present build drops the stand-in idea and shows the keyword index; map picture retaken with short names (7a5cb0f).
- Task 13 (controller): seven pages captured through the CDP driver (scratchpad/t13-shots.mjs): Library top (280 rows), filtered state #k=typeface&o=5.29 (22 rows, row open, picture loaded, scrolled to it), story row, table page 2.02, story page, notes page 4.00, About. No page scrolls sideways. A plain --screenshot of a state that scrolls itself comes out blank: capture artifact, not a page fault.
- Tasks 6+8: fix round 1 reported: commit 5a27233 (104/104 tests); report text lengths before/after tidy differ only by title and contents block. Scoped re-review dispatched.
- Tasks 6+8: fix round 1/5 (3 addressed, 0 open — Word tidy, About totals, network image; commits c07cd45..5a27233)
- Tasks 6, 8: complete (commits 507595e..5a27233, review clean after one fix round)
- Tasks 6+8: minor (deferred): a paragraph or heading whose whole text is "Contents" but is not a contents block would be removed
- All plan tasks complete: 1, 2, 3, 4, 5, 6, 7, 8 (code), 9, 10, 11 (data), 12 (texts), 13 (whole-site check). Final whole-branch review next.
- Final whole-branch review dispatched (Opus, ad785b978c21947b7): package review-final-28011f2..5a27233.diff, 37 deferred minors handed over for triage.
- Final review at 5a27233: "ready with fixes". No Critical. Important: (1) row 0.03's picture links to /source/library/content/map.png, which the server refuses (403); (2) the Library links to read/table pages whether or not they were written, and a damaged docx cache makes a report page vanish. Clean-checkout build at a path with a space, apostrophe and ß passed; 4,793 local links checked, one broken (item 1); all 12 real CSV counts match.
- Ruling: one fix wave (final-fix-brief.md) takes Important 1 and 2 plus the cheap visible minors: back link keeps the reader's place, "On the map" only when it leads somewhere, beyond-the-map places linked, About h1, stand-in warning and a "present" script, CSV served as text, sandbox header on saved HTML, older Node 24 entry check, empty Word headings dropped, and a link-crawl test — all are things a person presenting will meet — cost: a wider fix diff for one re-review.
- Ruling: stay as they are — `npm run check` not running the steps; duplicated small helpers and two cache roots; and every deferred minor the final review triaged as "can stay" — none is visible on the day or blocks adding records — cost: some tidying debt, listed in deferred-minors.md.
- Ruling on "declined to judge": 93 rows whose bottom link is the external source although a copy is held stay as catalogued (the held copy opens from the picture; "Open the source" is honestly external and needs the network) — cost: those links fail offline; the --present keyword index at 44 px with 49 keywords stays (the author's idea text replaces it); picture rights for 12.x rows are the author's call; the .djvu file stays a held file without a viewer.
- Final fix wave dispatched (Opus, a3c606ef3cea273c6), brief final-fix-brief.md; item E added by message (picture switcher with arrows, from the author).
- The author's feedback while looking at the site (2026-11-10 evening): (1) "The zoom in the map is not working smoothly, it does not move smoothly with the scroll and only works on release" — sent to the map implementer (a7aa2a3bc80e5242e) as a defect to diagnose and fix in map.js. (2) "Many items are duplicate (like this, and this at night, or this on another look.) these can be compacted on the same element and just have more images inside that you scroll with small arrows" — controller merges rows that show the same thing into one row with several pictures; the switcher becomes arrows (item E).
- Data (the author's feedback): fourteen rows merged away into eight multi-picture rows (LED ring day/night; Arendt sentence night/detail/facade before/bench plus the reference-chat row for the same work; Ponte Druso photographs x3; Palazzo di Giustizia front + Justitia relief; D'Annunzio air/road; Asmara album x2; two Stilves postcards; three laws held both as Gazzetta Ufficiale and as consolidated text). 280 rows -> 266. Sections renumbered once more to close the gaps, references and story sources remapped. Texts for the merged rows rewritten by the controller.
- Ruling: renumbered a second time on the same day — merging left gaps and no number had been cited outside the library itself — cost: none known; from here numbers are fixed.
- Map zoom fix: commit 2501ce3. Cause: the on-demand loop drew only when its own controls.update() reported a change, but OrbitControls moves the camera inside its wheel handler, so 0 frames were drawn during a gesture (measured: 44 wheel events, distance 2035 -> 1418, 0 frames). Now one frame per event; wheel over labels reaches the map; Safari pinch handled. Not tested on a real trackpad or real Safari. dist rebuilt.
- Final fix wave reported DONE_WITH_CONCERNS: commits 312b860, e7c7c16, 5a1456b, 1518698, e43bdbf; npm test 131/131; real build 266 rows, exit 0; link check on real dist 0 broken of 1115; picture switcher is now "← n / N →".
- Owner's server on 5199 restarted by the controller so the new serve.mjs is live; dist rebuilt at e43bdbf.
- Open design call for the author: the switcher sits under the picture and moves when consecutive pictures differ in height.
- Next: ONE scoped re-review of the fix wave plus the map zoom fix (2501ce3), package review-finalfix-5a27233..e43bdbf.diff; then adjudicate, list every "Ruling:" line for the author, delete this workspace, and use superpowers:finishing-a-development-branch.
- Final fix wave: scoped re-review clean — all items A1–D, E (picture switcher) and F (map zoom) addressed, no new Critical or Important breakage.
- Parked minors from the re-review: back.js counts forward history entries (rare dead click on "← Library"); a Safari pinch whose gestureend never arrives leaves Ctrl+wheel ignored, and iOS may double the zoom (untested without a device); more.label ignored on the fall-back link; all of library/content/ is readable under /source/ on 127.0.0.1; saved .svg files are served without the sandbox header.
- Ruling: these five stay as they are — none is reachable in a showing from the owner's laptop — cost: listed here for a later pass.
- Plan complete at e43bdbf (code) + data commits. Branch `library`, 131 tests, 266 rows.
