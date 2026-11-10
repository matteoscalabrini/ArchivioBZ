# Bolzano/Alto Adige in Italian print media and propaganda, 1919–1943: what is digitized, where, and a first article harvest

Notes written 2026-10-22 for the Studio1 project "translocalities in/on Bolzano" (fascist period).

**Verification tags used throughout:**
- **[V]** I verified it myself in this session: I opened the page or image, queried the platform's own API, or read the OCR.
- **[V-img]** I read it off a downloaded page image.
- **[U]** It comes from a third-party summary or search snippet that I did not open.
- **[I]** It is my own inference.

**Downloaded material:** about 109 MB of scans and OCR text, saved in `files/03_press_print/`. Every file is listed in `files/03_press_print/manifest.md` with its source URL, date, page and rights note.

**Method caveats:**
- **Teßmann portal blocked to me.** digital.tessmann.it sits behind a Bunny Shield proof-of-work bot challenge (HTTP 403 for curl and WebFetch) [V]. The Chrome extension was not connected, and I did not try to get around the challenge. So all Teßmann content below comes through **Europeana**, which republishes Teßmann's scans and full text from a 2019 snapshot under the Public Domain Mark [V]. A student with a normal browser can use digital.tessmann.it directly.
- **Web search budget exhausted.** The session's web-search quota ran out partway through. After that I worked only through the platforms' own APIs and catalogues (Europeana, Internet Archive, La Stampa, Digitouring, Braidense, the Biblioteca Provinciale Claudia Augusta gallery). Anything that needed open web search is listed under Gaps.

## 1. Teßmann digital library: titles and years, how full-text search works, a ≥20-article harvest, and a comparison of La Provincia di Bolzano with the Alpenzeitung

### Takeaway
The whole German-language daily press of the period is online and full-text searchable through Teßmann/Europeana: the fascist Alpenzeitung (1926–43), Dolomiten, Volksbote and the pre-1926 titles. The fascist Italian-language daily *La Provincia di Bolzano* is **not** on Teßmann. It is, however, online as a browsable page-image gallery (no OCR) at the Biblioteca Provinciale Italiana Claudia Augusta, covering 21 Apr 1927 – 27 Apr 1941. The same gallery holds *Il Piccolo Posto* (1922–26), *Atesia Augusta* (1939–43, incomplete) and Tolomei's *Archivio per l'Alto Adige* (1906–1919).

Full-text search works best in German and needs the Alpenzeitung's own calques. For example, "semirurali" returns 0 hits, while "halbländlichen" returns 50 hits in the AZ and 30 in Dolomiten. The harvest below gives 48 dated Alpenzeitung and Dolomiten items with URLs, 31 of them pinned to a page and downloaded.

### Cited Findings

**A. What is digitized: Teßmann titles as republished on Europeana (issue counts per year from the Europeana API)**

Every item is a Teßmann scan with OCR full text under the Public Domain Mark. Each record's `dcSource` gives the Teßmann title ID [V].

- **Alpenzeitung** (Teßmann ID 26). 4,830 issues: 1926: 251, 1927: 303, 1928: 310, 1929: 314, 1930: 310, 1931: 310, 1932: 312, 1933: 310, 1934: 310, 1935: 311, 1936: 311, 1937: 312, 1938: 278, 1939: 209, 1940: 206, 1941: 300, 1942: 101, 1943: 72. So 1938–40 and especially 1942–43 have gaps in the Europeana copy [V]. Example records: https://www.europeana.eu/item/9200333/BibliographicResource_3000059910006 (title record) and https://www.europeana.eu/item/9200333/BibliographicResource_3000059043940 (issue of 13.07.1926) [V].
- **Dolomiten** (ID 4). 2,925 issues: 1923: 17, 1924: 42, 1925: 9, 1926: 23, then about 155 a year (three times a week) for 1927–1941, 1942: 203, 1943: 107, 1945: 184 [V]. "Dolomiten Landausgabe" (ID 4): 1942–43 [V].
- **Volksbote** (ID 48). Weekly, 1919–1941, about 52 issues a year, plus 7 issues in 1945 [V].
- **Bozner Nachrichten** (ID 37): 1919–1925, about 290 a year [V].
- **Der Tiroler** (ID 5): 1919–1925, about 290 a year [V]. I believe this run includes the 1923–25 "Der Landsmann" phase before the merger into Dolomiten [I].
- **Other titles:**
  - Meraner Zeitung (ID 1): 1919–1920, 1923–1926 [V]
  - Südtiroler Landeszeitung (ID 18): 1920–1922 [V]
  - Burggräfler (ID 7): 1919–1926 [V]
  - Pustertaler Bote (ID 8): 1919–1927 [V]
  - Südtiroler Heimat (ID 6): 1923–1938 [V]
  - Volksrecht (ID 29): 1920–1923 [V]
  - Überetscher Gemeindeblatt (ID 55): 1919–1935 [V]
  - Der Nornenbrunnen: 1927–1937 [V]
  - Bozner Tagblatt (ID 28): 1943–1945 [V]
- **Italian official gazettes on Teßmann:** *Fogli Annunzi Legali della Prefettura di Bolzano* (ID 49), 1928–1945; *Bollettino Ufficiale della Prefettura di Bolzano* (ID 52), 1927–1945 [V]. These are the only Italian-language items in the Europeana/Teßmann set. All 115,179 Teßmann records on Europeana carry the language tag "de" [V].
- **Teßmann URL patterns:**
  - Issue: `https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/{ID}/{DD.MM.YYYY}`. Verified by the 301 redirect from the old `dza.tessmann.it/tessmannPortal/...` links that Europeana stores [V].
  - Title detail page: `.../Zeitungsarchiv/Details/Zeitung/48/VBS` (Volksbote), as cited by Ennemoser 2025 — [historia.scribere 17](https://historia-scribere-journal.uibk.ac.at/historia_scribere/article/download/4192/3052/9361) [V].
- **Italian-language local papers (not on Teßmann):**
  - The Biblioteca Civica "Cesare Battisti" of Bolzano offers, on DVD, PDF with OCR, readable on site only [V]:
    - *Alto Adige: quindicinale per gli interessi atesini* (1919–1921)
    - *Rivista dell'Alto Adige* (1922–25)
    - *Rivista della Venezia tridentina* (1926–1935)
    - *Il Piccolo Posto* (20/03/1922–10/11/1926)
    - *La Provincia di Bolzano* (21/04/1927–04/09/1943, Per 85, DVD 5–10)
    - Source: [Periodici digitalizzati Civica 2023 (PDF)](https://biblioteche.comune.bolzano.it/content/download/802/13623/file/Periodici_digitalizzati_Civica_IT_2023.pdf)
  - The **Biblioteca Provinciale Italiana Claudia Augusta** has an open web gallery ([index](https://webaleph.bpi.claudiaugusta.it/index.html)) [V]:
    - *La Provincia di Bolzano*: 21,198 page images, one album per issue, 1927–1941, with 1930 missing. My index found 3,764 issues, from 21.04.1927 to 27.04.1941. ([LPB](https://webaleph.bpi.claudiaugusta.it/La_Provincia_di_Bolzano_001.html))
    - *Il Piccolo Posto*: 1922–1926, 2,261 images ([PiccoloPosto](https://webaleph.bpi.claudiaugusta.it/PiccoloPosto.html))
    - *Atesia Augusta*: 24 albums: 1939 nos. 1 and 10; 1940 no. 12; 1941 nos. 1–10 and 12 (no. 11 missing); 1942 in 7 albums (1, 2, 3–4, 5–6, 7–8, 9–10, 11–12); 1943 nos. 1–6 in 3 double issues ([Atesia-Augusta](https://webaleph.bpi.claudiaugusta.it/Atesia-Augusta.html))
    - *Archivio per l'Alto Adige*: 1906–1919, 4,057 images ([ArchivioAltoAdige](https://webaleph.bpi.claudiaugusta.it/ArchivioAltoAdige.html))
    - *La Voce del Sella*: 1923–1927 ([la-voce-del-sella](https://webaleph.bpi.claudiaugusta.it/la-voce-del-sella.html))
    - "Periodici": single issues of *Domenica del Corriere* (1919, 1920, 1921, 1922, 1923, 1924, two in 1939), *Illustrazione Italiana* no. 47/1918 and *La Tribuna Illustrata* no. 22/1935 ([Periodici](https://webaleph.bpi.claudiaugusta.it/Periodici.html))
  - **LPB deep links:**
    - Issue album: `https://webaleph.bpi.claudiaugusta.it/La_Provincia_di_Bolzano_001-{YYYY}-{YYYY_MM_DD}_Nr_{n}.html`
    - Page image: `https://webaleph.bpi.claudiaugusta.it/media/large/La_Provincia_di_Bolzano_001/{YYYY}/{YYYY_MM_DD_Nr_n}/{8-digit}.jpg`
    - Example: [10.10.1939 album](https://webaleph.bpi.claudiaugusta.it/La_Provincia_di_Bolzano_001-1939-1939_10_10_Nr_240.html) [V]
    - Many LPB pages carry a stamp of the "Biblioteca Comunale" of Trento [V-img]. So the scans probably come from Trento's copy, not a Bolzano one [I].
- **Il Brennero** (the Trento fascist daily): only isolated issues are online. One 1935 issue is in the Biblioteca Digitale Trentina via Europeana ([item](https://www.europeana.eu/item/267/7431), source http://bdt.bibcom.trento.it/archive/bdt/7431, PDM). Another, the issue of 12 May 1935, is on the Internet Archive ([brennero-il-1935-05-12-images](https://archive.org/details/brennero-il-1935-05-12-images), CC BY 4.0) [V].

**B. How full-text search works, with search tips**

- **Teßmann portal.** Use it in a normal browser. Scripts are blocked by the bot challenge [V]. The Zeit.shift project (Teßmann, ULB Tirol and Eurac, Interreg) added OCR and named-entity recognition across Tyrolean papers. I could not check the current portal features myself — [Eurac Zeit.shift](https://www.eurac.edu/en/projects/zeitshift) [U].
- **Europeana search (scriptable, same Teßmann scans).**
  - Endpoint: `https://newspapers.eanadev.org/api/v2/search.json?wskey=api2demo&query=TERM&profile=hits&qf=proxy_dcterms_isPartOf:"http://data.europeana.eu/item/9200333/BibliographicResource_3000059910006"&qf=proxy_dcterms_issued:1939*`. It returns issue IDs plus prefix/exact/suffix hit snippets. The ID ending 3000059910006 is the Alpenzeitung; Dolomiten is BibliographicResource_3000115203550; Volksbote is BibliographicResource_3000115206570 [V].
  - Page-level text: each issue's IIIF manifest is at `https://iiif.europeana.eu/presentation/9200333/{id}/manifest?format=3`. Each canvas links to a per-page full-text resource at `https://api.europeana.eu/fulltext/9200333/{id}/{hash}`. This is how I pinned hits to page numbers [V].
  - Full-size images (about 1952×2851 px, 1.5–3 MB) come from `iiif.europeana.eu/image/...` [V].
- **Pitfalls I measured (full-text hit counts in the Alpenzeitung):**
  1. **Use the Alpenzeitung's German calques.**
     - "semirurali" gives 0 hits, but "halbländlichen" gives 50 (AZ) and 30 (Dolomiten).
     - "Rione Dux" gives 41 (AZ) and 0 (Dolomiten).
     - "zona industriale" gives 20 hits, mostly small ads; "Industriezone" gives 173 for 1934–43 (AZ) and 140 (Dolomiten).
     - "Drususbrücke" gives 29 for 1928–32. "Ponte Druso" gives 80, but these are mostly the street and later the GIL house.
     - "Siegesdenkmal" gives 82 for 1926–28.
     - "treno popolare" gives 0, but "Volkszug" gives 297 and "Volkszüge" 250.
     - "Optanten" gives 56 for 1939–43 (AZ) and 198 (Dolomiten); "Umsiedlung" gives 52 (AZ) and 95 (Dolomiten); "Option" gives 19 for 1939–40 (AZ) [V].
  2. **Do not use AND-combinations with "Bolzano".** "Bolzano" is in every masthead, so the filter does nothing ("Mustermesse AND Bolzano" = "Mustermesse" = 528) [V].
  3. **Allow for OCR noise.** Typical errors are ä→à, ü→ii and I→J (for example "Jndustriezone"). Search variant spellings [V].
  4. **"Augusteo" is a false friend.** All 35 AZ hits are Rome's concert hall [V].
  5. **"Kino Marconi" is in Merano.** The AZ masthead gives its Merano office as "Corso Principe Umberto 34 (Eingang Kino Marconi)" [V].
  6. **Bolzano cinemas that do appear in the AZ:**
     - "Cinema Roma, Via dei Cappuccini 30" (1935–36 listings) [V]
     - "Central-Kino" and "Cine Luce" [V]
     - "Kino Littorio" in Rione Dux, opened July 1941 [V]
     - Screenings at the GIL house at Ponte Druso (1938) [V]
  7. **"Cinema Corso" / "Kino Corso" give 0 hits.** "Corso IX Maggio" gives 33 hits from 1936, for the new monumental axis. "Corso Littorio" gives only 2 [V].
- **Fiera.**
  - "Fiera di Bolzano" gives 0 hits in the AZ. The "Mustermesse" hits are about the fairs of Milan, Padua, Verona, Bari and Tripoli. The Bolzano Chamber of Commerce advertises the Tripoli fair (AZ 30.07.1926, 25.12.1926, 13.01.1928) [V].
  - Bolzano's own exhibition events were:
    - the *1ª Esposizione Nazionale dell'Alto Adige*, Aug–Sept 1929 (see La Stampa below; Vie d'Italia, Apr 1929, p. 112) [V]
    - the *Esposizione Dopolavoristica*, June 1930 [V]
    - the *Weinausstellung im Rathauskeller*, AZ 23.04.1926 [V]
    - the *Traubenfest* of 1931 [V]
  - The postwar Fiera di Bolzano/Mustermesse dates from 1948 [I, from general knowledge, not checked].

**C. Article harvest: Alpenzeitung and Dolomiten (Teßmann scans via Europeana)**

Headlines and passages are OCR-derived and normalised, so check them on the image. Items 1–31 were pinned to a page and downloaded. Items 32–48 are verified hits that I did not pin to a page.

| # | Date | Paper | Page (of) | Headline / key passage (OCR-derived, original German; verify on image) | Topic | Europeana record (full text + IIIF) | Teßmann issue (live portal) | Verified |
|---|---|---|---|---|---|---|---|---|
| 1 | 1926-07-03 | Alpenzeitung | 4 (8) | "Grundsteinlegung zum Siegesdenkmal" (preparations of the festival committee) | Victory Monument | https://www.europeana.eu/item/9200333/BibliographicResource_3000059044028 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/03.07.1926 | [V] page located by full-text match; image + OCR saved as `AZ_1926-07-03_p4` |
| 2 | 1926-07-13 | Alpenzeitung | 1 (6) | "S. M. König Viktor Emanuel III. in Bolzano. Das Volk unserer Bergwelt schart sich im hehren Friedensfeste des Sieges ... um seinen König" ("today the first stone of the Siegesdenkmal ... sprinkled with holy water of the Piave") | Victory Monument | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043940 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/13.07.1926 | [V] page located by full-text match; image + OCR saved as `AZ_1926-07-13_p1` |
| 3 | 1928-07-09 | Dolomiten | 1 (6) | "Hohe Gäste bei der Enthüllung des Siegesdenkmals in Bolzano" | Victory Monument | https://www.europeana.eu/item/9200333/BibliographicResource_3000115203776 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/09.07.1928 | [V] page located by full-text match; image + OCR saved as `DOL_1928-07-09_p1` |
| 4 | 1928-07-12 | Alpenzeitung | 2 (8) | "Die Überführung der Erde aus dem Grabe der Märtyrer zum Siegesdenkmal" (+ "Der Kranz des Königs am Siegesdenkmal") | Victory Monument | https://www.europeana.eu/item/9200333/BibliographicResource_3000059045555 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/12.07.1928 | [V] page located by full-text match; image + OCR saved as `AZ_1928-07-12_p2` |
| 5 | 1928-07-13 | Alpenzeitung | 3 (6) | Unveiling report: delegations from across Italy, e.g. a message from the Podestà of Bari; "Besichtigung des Denkmals" | Victory Monument | https://www.europeana.eu/item/9200333/BibliographicResource_3000059045590 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/13.07.1928 | [V] page located by full-text match; image + OCR saved as `AZ_1928-07-13_p3` |
| 6 | 1928-07-14 | Dolomiten | 2 (12) | Report on the veterans' congress and unveiling: "Angesichts der glanzvollen Feier am Siegesdenkmal möge man auswärts endlich auf die hartnäckige Anfeindung der faschistischen Regierung verzichten" | Victory Monument | https://www.europeana.eu/item/9200333/BibliographicResource_3000115203723 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/14.07.1928 | [V] page located by full-text match; image + OCR saved as `DOL_1928-07-14_p2` |
| 7 | 1928-07-15 | Alpenzeitung | 1 (8) | "Die Enthüllung des Siegesdenkmales in der Meldung der Funkstation von Nauen" (how German radio reported it) | Victory Monument | https://www.europeana.eu/item/9200333/BibliographicResource_3000059045372 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/15.07.1928 | [V] page located by full-text match; image + OCR saved as `AZ_1928-07-15_p1` |
| 8 | 1930-04-11 | Alpenzeitung | 2 (8) | "Ausstellung der Bauregulierungsprojekte: Das Stadtbild von Neu-Bolzano im Plane des Architekten Galimberti" | Master plan / Neu-Bolzano | https://www.europeana.eu/item/9200333/BibliographicResource_3000059045951 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/11.04.1930 | [V] page located by full-text match; image + OCR saved as `AZ_1930-04-11_p2` |
| 9 | 1931-08-25 | Alpenzeitung | 2 (8) | Planning of the Traubenfest (grape festival): "mehrere Volkszüge aus den alten Provinzen nach Bolzano" | Treni popolari / Traubenfest | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046705 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/25.08.1931 | [V] page located by full-text match; image + OCR saved as `AZ_1931-08-25_p2` |
| 10 | 1931-09-01 | Alpenzeitung | 2 (8) | "Volkszug Torino-Bolzano": on the previous Sunday a popular train from Turin arrived in Bolzano | Treni popolari | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046780 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/01.09.1931 | [V] page located by full-text match; image + OCR saved as `AZ_1931-09-01_p2` |
| 11 | 1931-10-29 | Alpenzeitung | 3 (8) | "Eröffnung von Bauwerken des Regimes: Drususbrücke, städt. ..." (28 Oct. 1931 inaugurations; OCR garbled) | Ponte Druso | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046675 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/29.10.1931 | [V] page located by full-text match; image + OCR saved as `AZ_1931-10-29_p3` |
| 12 | 1931-11-13 | Alpenzeitung | 2 (8) | "Die Beleuchtung der Drususbrücke": "Allgemein wurde der geradezu zyklopische Neubau der Drususbrücke und deren einwandfreier Stil bewundert" | Ponte Druso | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046820 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/13.11.1931 | [V] page located by full-text match; image + OCR saved as `AZ_1931-11-13_p2` |
| 13 | 1935-02-21 | Alpenzeitung | 1 (6) | "Mussolini für die Schaffung von Groß-Bolzano. Der Duce verfügt in einer bedeutsamen Sitzung über die Errichtung der Industriezone" | Industrial zone | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046469 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/21.02.1935 | [V] page located by full-text match; image + OCR saved as `AZ_1935-02-21_p1` |
| 14 | 1936-10-23 | Alpenzeitung | 5 (6) | New city centre budget: "780.000 Lire für die Freilegung des Corso IX Maggio", the INA buildings near the Siegesdenkmal, the Army Corps HQ | New centre / Corso IX Maggio | https://www.europeana.eu/item/9200333/BibliographicResource_3000059047189 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/23.10.1936 | [V] page located by full-text match; image + OCR saved as `AZ_1936-10-23_p5` |
| 15 | 1936-12-14 | Dolomiten | 3 (6) | "Die Eröffnung der Industriezone" (announcement of the 20 Dec. ceremony) | Industrial zone | https://www.europeana.eu/item/9200333/BibliographicResource_3000115204914 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/14.12.1936 | [V] page located by full-text match; image + OCR saved as `DOL_1936-12-14_p3` |
| 16 | 1936-12-20 | Alpenzeitung | 3 (8) | "Das Regime für die Provinzhauptstadt. Heute feierliche Inauguration der Industriezone" ("Der Aufstieg Bolzanos wurde an dem Tage entschieden, als es im Jahre 1927 zur Provinzhauptstadt erhoben wurde") | Industrial zone | https://www.europeana.eu/item/9200333/BibliographicResource_3000059047183 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/20.12.1936 | [V] page located by full-text match; image + OCR saved as `AZ_1936-12-20_p3` |
| 17 | 1936-12-22 | Alpenzeitung | 5 (8) | Inauguration tour: Montecatini aluminium works ("7000 Tonnen Aluminium ... 700 Arbeiter"), Masonite-Feltrinelli, then "zu der Arbeiterstadt am rechten Ufer des Isarco" | Industrial zone | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046906 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/22.12.1936 | [V] page located by full-text match; image + OCR saved as `AZ_1936-12-22_p5` |
| 18 | 1937-05-25 | Alpenzeitung | 3 (8) | Starace in Bolzano: "In der Halle des Lanciawerkes hatten sich die Hierarchen der Provinz ... versammelt" | Lancia | https://www.europeana.eu/item/9200333/BibliographicResource_3000059047564 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/25.05.1937 | [V] page located by full-text match; image + OCR saved as `AZ_1937-05-25_p3` |
| 19 | 1938-07-26 | Alpenzeitung | 5 (6) | Carro di Tespi performs "Aida" on "die Piazza dell'Impero, der schöne, weitgreifende Platz ... im aufstrebenden Neu-Bolzano" | Piazza dell'Impero / mass culture | https://www.europeana.eu/item/9200333/BibliographicResource_3000059048078 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/26.07.1938 | [V] page located by full-text match; image + OCR saved as `AZ_1938-07-26_p5` |
| 20 | 1939-10-08 | Alpenzeitung | 5 (8) | Programme of Starace's visit: "Im Stadtviertel Dux, längs der Straße, welche die halbländlichen Häuser, die nach dem Willen des Duce für die Arbeiter des Oberetsch errichtet wurden, umsäumen ..." | Semirurali / Rione Dux | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043421 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/08.10.1939 | [V] page located by full-text match; image + OCR saved as `AZ_1939-10-08_p5` |
| 21 | 1939-10-10 | Alpenzeitung | 5 (6) | Report on Starace's visit: Rione Dux, "fast dreihundert Häuser mit zirka tausend Wohnungen" | Semirurali / Rione Dux | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043496 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/10.10.1939 | [V] page located by full-text match; image + OCR saved as `AZ_1939-10-10_p5` |
| 22 | 1939-10-26 | Alpenzeitung | 2 (6) | "Durchführungsbestimmungen für die Option der Staatsbürgerschaft", signed by Prefect Mastromattei and Consul General Otto Bene, 21 Oct. 1939 | Option | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043498 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/26.10.1939 | [V] page located by full-text match; image + OCR saved as `AZ_1939-10-26_p2` |
| 23 | 1939-10-27 | Dolomiten | 5 (11) | "Ausführungsbestimmungen für die Option der Staatsbürgerschaft" (same text, in Dolomiten) | Option | https://www.europeana.eu/item/9200333/BibliographicResource_3000115205717 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/27.10.1939 | [V] page located by full-text match; image + OCR saved as `DOL_1939-10-27_p5` |
| 24 | 1939-10-30 | Dolomiten | 4 (6) | Prefect's speech: "Die Option (Entscheidung, D. Sch.) ist nicht nur eine elementare Gewissenspflicht, sondern für alle ein kategorischer Imperativ"; "nach zwanzig Jahren hat niemand mehr das Recht, am Fenster zu stehen" | Option | https://www.europeana.eu/item/9200333/BibliographicResource_3000115205581 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/30.10.1939 | [V] page located by full-text match; image + OCR saved as `DOL_1939-10-30_p4` |
| 25 | 1939-11-07 | Alpenzeitung | 2 (4) | Speech: "es gibt keine Volksabstimmung ... es gibt die weißen Zettel, welche für die Option derjenigen dienen werden, die italienische Staatsbürger bleiben wollen, und es gibt die gelblichroten Zettel ..." | Option | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043492 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/07.11.1939 | [V] page located by full-text match; image + OCR saved as `AZ_1939-11-07_p2` |
| 26 | 1939-11-23 | Alpenzeitung | 5 (6) | Recurring box "Die Option der Atesiner: Wer sich für die Beibehaltung der italienischen Staatsbürgerschaft entschließt und dadurch beweist, daß er sich als Italiener fühlt ... wird in seiner Heimat bleiben können" | Option | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043441 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/23.11.1939 | [V] page located by full-text match; image + OCR saved as `AZ_1939-11-23_p5` |
| 27 | 1940-01-05 | Dolomiten | 3 (8) | "Gesamtzahl der Optionen für die Umsiedlung ins Reich", relaying the Stefani agency communiqué of 3 Jan. 1940 | Option | https://www.europeana.eu/item/9200333/BibliographicResource_3000115206211 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/05.01.1940 | [V] page located by full-text match; image + OCR saved as `DOL_1940-01-05_p3` |
| 28 | 1940-05-15 | Alpenzeitung | 5 (6) | Contents of the "Atesia Augusta" issue: "Rione Dux der halbländlichen Häuser", P. Pedrotti on the Dante Alighieri in Bolzano, "Preiswerter Tourismus", etc. | Semirurali / Atesia Augusta | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043696 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/15.05.1940 | [V] page located by full-text match; image + OCR saved as `AZ_1940-05-15_p5` |
| 29 | 1941-03-21 | Alpenzeitung | 3 (4) | "Zwei Volkswohnviertel sind ... aus dem Nichts entstanden: Rione Dux und Rione Littoria ... das Entstehen dieses Teiles Neu-Bolzanos" | Semirurali / Neu-Bolzano | https://www.europeana.eu/item/9200333/BibliographicResource_3000059044975 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/21.03.1941 | [V] page located by full-text match; image + OCR saved as `AZ_1941-03-21_p3` |
| 30 | 1941-04-27 | Alpenzeitung | 5 (6) | "Arbeiterwohnungen zwischen dem Rione Littorio und Rione Dux. Ein Wohnbau am Brennero. Weitere Projekte" | Workers' housing | https://www.europeana.eu/item/9200333/BibliographicResource_3000059044878 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/27.04.1941 | [V] page located by full-text match; image + OCR saved as `AZ_1941-04-27_p5` |
| 31 | 1941-07-22 | Alpenzeitung | 3 (4) | "Eröffnung des neuen Kinos Littorio im Rione Dux": "das Kino ... befindet sich im volkreichen Viertel Dux" | Cinemas | https://www.europeana.eu/item/9200333/BibliographicResource_3000059044700 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/22.07.1941 | [V] page located by full-text match; image + OCR saved as `AZ_1941-07-22_p3` |
| 32 | 1928-07-14 | Alpenzeitung | not located | "Ein Kranz des Frontkämpferverbandes am Siegesdenkmal"; Val Venosta delegations "bei der Einweihung des Siegesdenkmales" | Victory Monument | https://www.europeana.eu/item/9200333/BibliographicResource_3000059045516 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/14.07.1928 | [V] full-text hit snippet (API); page not located; not downloaded |
| 33 | 1931-08-12 | Alpenzeitung | not located | Readers rejoice that "ein billiger Volkszug von Bolzano nach Venezia bewilligt worden ist" | Treni popolari | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046632 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/12.08.1931 | [V] full-text hit snippet (API); page not located; not downloaded |
| 34 | 1931-09-16 | Alpenzeitung | not located | "Nach dem Erfolge des Volkszuges nach Venezia" a train Merano-Firenze is added | Treni popolari | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046754 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/16.09.1931 | [V] full-text hit snippet (API); page not located; not downloaded |
| 35 | 1935-09-11 | Alpenzeitung | not located | Population growth from the transfer of the Army Corps HQ and "aus der Schaffung der Industriezone" | Industrial zone / migration | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046326 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/11.09.1935 | [V] full-text hit snippet (API); page not located; not downloaded |
| 36 | 1935-12-29 | Alpenzeitung | not located | Cinema listings: "Cinema Roma, Via dei Cappuccini 30", "Central-Kino", "Cine Luce" | Cinemas | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046447 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/29.12.1935 | [V] full-text hit snippet (API); page not located; not downloaded |
| 37 | 1936-07-29 | Alpenzeitung | not located | "... die viertausend Arbeiter, die gegenwärtig in unserer Stadt beschäftigt sind ..." (building boom) | Workers / migration | https://www.europeana.eu/item/9200333/BibliographicResource_3000059046931 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/29.07.1936 | [V] full-text hit snippet (API); page not located; not downloaded |
| 38 | 1937-05-17 | Alpenzeitung | not located | "Vortrag über die Sozialreform": assembly "auf dem Platze der Lanciawerke" | Lancia | https://www.europeana.eu/item/9200333/BibliographicResource_3000059047696 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/17.05.1937 | [V] full-text hit snippet (API); page not located; not downloaded |
| 39 | 1938-08-28 | Alpenzeitung | not located | Ministerial tour of "die Stahlwerke von Bolzano, die Lanciawerke, die Populitwerke, Montecatini ... Magnesio ... Masonite"; "zum Viertel der halbländlichen Bauten" | Industrial zone / semirurali | https://www.europeana.eu/item/9200333/BibliographicResource_3000059048088 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/28.08.1938 | [V] full-text hit snippet (API); page not located; not downloaded |
| 40 | 1938-12-03 | Alpenzeitung | not located | Film listings incl. screenings at the GIL house at Ponte Druso ("Scarpe al sole") and "Kino Marconi" | Cinemas | https://www.europeana.eu/item/9200333/BibliographicResource_3000059047980 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/03.12.1938 | [V] full-text hit snippet (API); page not located; not downloaded |
| 41 | 1939-10-17 | Alpenzeitung | not located | "... als die dreihundert halbländlichen Wohnbauten inauguriert wurden" | Semirurali | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043571 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/17.10.1939 | [V] full-text hit snippet (API); page not located; not downloaded |
| 42 | 1939-12-22 | Alpenzeitung | not located | "Ablauf der Frist für die Option am 31. Dezember" | Option | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043582 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/22.12.1939 | [V] full-text hit snippet (API); page not located; not downloaded |
| 43 | 1940-08-18 | Alpenzeitung | not located | "Die Gärten der halbländlichen Wohnbauten im Rione Dux stehen in der schönsten Üppigkeit ..." | Semirurali | https://www.europeana.eu/item/9200333/BibliographicResource_3000059043597 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/18.08.1940 | [V] full-text hit snippet (API); page not located; not downloaded |
| 44 | 1941-07-26 | Alpenzeitung | not located | Foundation stone of the new church "im Rione Dux" | Semirurali | https://www.europeana.eu/item/9200333/BibliographicResource_3000059044932 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/26/26.07.1941 | [V] full-text hit snippet (API); page not located; not downloaded |
| 45 | 1935-02-25 | Dolomiten | not located | "Die für die Schaffung der Industriezone notwendigen Arbeiten werden als öffentlich nützlich erklärt" | Industrial zone | https://www.europeana.eu/item/9200333/BibliographicResource_3000115205292 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/25.02.1935 | [V] full-text hit snippet (API); page not located; not downloaded |
| 46 | 1937-05-01 | Dolomiten | not located | Opening of the aluminium factory, "der größten unter den dortigen neuen Werksanlagen", in the Industriezone | Industrial zone | https://www.europeana.eu/item/9200333/BibliographicResource_3000115204252 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/01.05.1937 | [V] full-text hit snippet (API); page not located; not downloaded |
| 47 | 1939-10-07 | Dolomiten | not located | Starace programme: "Im Stadtviertel Dux ... die halbländlichen Häuser" | Semirurali | https://www.europeana.eu/item/9200333/BibliographicResource_3000115205721 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/07.10.1939 | [V] full-text hit snippet (API); page not located; not downloaded |
| 48 | 1940-03-23 | Dolomiten | not located | Report of the Duce's audience: the Option "abgeschlossen" in December 1939 | Option | https://www.europeana.eu/item/9200333/BibliographicResource_3000115206315 | https://digital.tessmann.it/tessmannDigital/Zeitungsarchiv/Tagesausgabe/Zeitung/4/23.03.1940 | [V] full-text hit snippet (API); page not located; not downloaded |

**D. La Provincia di Bolzano front pages I read directly [V-img]** (files `LPB_*_p1.jpg`)

- **13.07.1928, p. 1** (masthead: *Quotidiano della Federazione Provinciale Fascista*). Headline: "IL GRANDIOSO RITO DI IERI IN BOLZANO FASCISTA – Il Sovrano consacra nel Monumento alla Vittoria il segno antico e nuovo del diritto immortale d'Italia". Also on the page: "Il discorso di Giuriati". [album](https://webaleph.bpi.claudiaugusta.it/La_Provincia_di_Bolzano_001-1928-1928_07_13_Nr_166.html)
- **21.02.1935, p. 1** (masthead: *Quotidiano del Partito Nazionale Fascista*).
  - Headline: "LE DIRETTIVE DEL CAPO PER L'IMMEDIATA REALIZZAZIONE DELLA ZONA INDUSTRIALE – Il Duce per la più grande Bolzano".
  - The subhead lists the chemical, automobile, steel and clothing industries. The official communiqué names Falck, Donegani, Lancia, Rivetti and Goisis. [album](https://webaleph.bpi.claudiaugusta.it/La_Provincia_di_Bolzano_001-1935-1935_02_21_Nr_45.html)
- **22.12.1936, p. 1.** The front page is entirely Ethiopia ("Il tricolore sventola sull'intero territorio dell'Impero"). The industrial-zone inauguration of 20 Dec. is on inner pages, which I did not read. No issue is listed for 21.12.1936. [album](https://webaleph.bpi.claudiaugusta.it/La_Provincia_di_Bolzano_001-1936-1936_12_22_Nr_304.html)
- **10.10.1939, p. 1** (masthead: *Quotidiano della Federazione dei Fasci di Combattimento*).
  - The lead story is Hitler's speech.
  - A large photo carries the caption "La vibrante giornata del Segretario del Partito a Bolzano: l'ingresso al rione Dux dopo il rito inaugurale (Foto Walsa)". It shows the giant "M" gateway.
  - No issue is listed for 09.10.1939. [album](https://webaleph.bpi.claudiaugusta.it/La_Provincia_di_Bolzano_001-1939-1939_10_10_Nr_240.html)
- **26.10.1939, p. 1.** Headline: "L'APPLICAZIONE DEGLI ACCORDI ITALO-TEDESCHI – Le norme per il rimpatrio dei cittadini germanici e per l'emigrazione di allogeni tedeschi dall'Alto Adige in Germania". Then "Il testo delle 'norme'", signed "Giuseppe Mastromattei, Prefetto di Bolzano – Otto Bene, Console Generale di Germania a Milano". [album](https://webaleph.bpi.claudiaugusta.it/La_Provincia_di_Bolzano_001-1939-1939_10_26_Nr_254.html)
- **11.01.1940, p. 1** (masthead now: *Quotidiano fascista dell'Alto Adige*).
  - Headline: "I RISULTATI UFFICIALI delle opzioni in Alto Adige comunicati al Duce e al Führer".
  - For the province of Bolzano: "166.488 hanno optato per la cittadinanza germanica … 27.712 hanno [optato per la] cittadinanza italiana e 35.300, non avendo sottoscritto alcuna [dichiarazione], restano … cittadini italiani".
  - For the Trento mixed-language zone: 24,453 eligible; 13,015 for Germany, 3,802 for Italy, 7,636 no declaration. [album](https://webaleph.bpi.claudiaugusta.it/La_Provincia_di_Bolzano_001-1940-1940_01_11_Nr_9.html)

**E. Comparison: the same events in La Provincia di Bolzano (LPB), the Alpenzeitung (AZ), Dolomiten (DOL) and La Stampa**

- **Industrial zone, 21.02.1935.** The three papers ran the same story with different headlines:
  - LPB: "Il Duce per la più grande Bolzano" [V-img]
  - AZ: "Mussolini für die Schaffung von Groß-Bolzano" [V]
  - La Stampa: "Una zona industriale a Bolzano sorgerà per volontà del Duce" [V]
- **Victory Monument, 12–15.07.1928.**
  - LPB speaks of the King's consecration and "il diritto immortale d'Italia" [V-img].
  - La Stampa headlines "LA CONSACRAZIONE EROICA DI BOLZANO ITALIANA" [V].
  - DOL (14.07) carries the appeasing line that "abroad" should now drop its hostility to the fascist government [V].
  - AZ (15.07) reports how German radio (Nauen) covered the ceremony, next to a polemic about "Südtirol" in German politics [V].
- **Option, 21–31.10.1939.** All three papers printed the same Mastromattei–Bene implementing rules, but framed them differently:
  - LPB put them on p. 1 as "rimpatrio dei cittadini germanici" and "emigrazione di allogeni tedeschi" [V-img].
  - AZ (26.10, p. 2) and DOL (27.10, p. 5) titled them "Durchführungs-/Ausführungsbestimmungen für die Option der Staatsbürgerschaft" [V].
- **Option, Nov–Dec 1939.** The AZ ran a recurring propaganda box, "Die Option der Atesiner", on 23.11, 26.11, 01.12, 12.12, 13.12, 14.12, 15.12, 17.12 and 21.12.1939. It equated staying with "feeling Italian" [V]. DOL printed the prefect's speech calling the option "a categorical imperative" and forbidding anyone to "stand at the window" (30.10.1939) [V].
- **Option results, Jan. 1940.**
  - LPB (11.01.1940, p. 1) and La Stampa (11.01.1940, p. 1) carry the identical headline "I risultati ufficiali delle opzioni in Alto Adige comunicati al Duce e al Führer" [V-img][V].
  - DOL (05.01.1940) relays the Stefani communiqué of 3 Jan. [V].
  - So a single Stefani/ministry text was syndicated to all three papers [I].
- **Who is speaking to whom.** In general LPB addresses Italian readers ("allogeni", "rimpatrio"), while AZ and DOL address German speakers in the legal vocabulary of "Option" and "Umsiedlung" [I, from the headlines above].

**F. Secondary literature on the local press**

- Lara Ennemoser, "Die Legitimierung der italienischen Invasion Abessiniens in den Zeitungen 'Dolomiten' und 'La Provincia di Bolzano', 1935–1936", *historia.scribere* 17 (2025), DOI 10.15203/historia.scribere.17.711 — [PDF](https://historia-scribere-journal.uibk.ac.at/historia_scribere/article/download/4192/3052/9361) [V]. It states that:
  - LPB first appeared on 22 Apr 1927 as the official organ of the fascist party in South Tyrol, and appeared daily until 1941. Ennemoser cites Steininger 2003 and the Claudia Augusta page.
  - Dolomiten had about 30,000 copies around 1927, was published three times a week by the Catholic Vogelweider-Verlag, and was heavily censored.
- **Conflicting dates for LPB:**
  - First issue: the BPI gallery starts on 21.04.1927 and the Civica list says 21/04/1927, against "22 April 1927" in Ennemoser/Steininger [V].
  - End date: the Civica holdings run to 04/09/1943, while the BPI gallery ends on 27.04.1941 and Ennemoser says "daily until 1941" [V]. The gallery may simply stop in 1941; LPB itself continued [I].
- **Alpenzeitung profile.** A German Wikipedia mirror says the AZ consisted largely of German translations of LPB articles from the same publisher, with about 7,000 copies in 1937 — [de-academic](https://de-academic.com/dic.nsf/dewiki/60958) [U]. The 21.02.1935 calque ("più grande Bolzano" → "Groß-Bolzano") is consistent with this [I].
  - The AZ's 1926 masthead reads "wirtschaftspolitisches Tagblatt", edition Bolzano-Merano [V OCR].
  - From 1928 it reads "politisches Tagblatt der Provinz Bolzano" [V OCR].
  - A 1926 OCR snippet names "Schriftleitung: Rupert Steger, Bolzano" [V OCR, spelling uncertain].

### Inferences
- **The Alpenzeitung is the searchable stand-in for La Provincia di Bolzano.** For 1927–1941 the practical workflow is:
  1. Find dates and stories by full-text search in the Alpenzeitung (via Teßmann or Europeana).
  2. Open the same date in the LPB image gallery to see the Italian original and its framing.

  LPB has no OCR, but its issue albums are addressable by date [I].
- **Corrections to the brief:** "Il Piccolo Posto" is a real Bolzano Italian-language paper (1922–1926). The search engines did not know it, but the Civica list and the BPI gallery both confirm it [V]. "Il Brennero" is a Trento paper and is not digitized as a run [V].
- **The Alpenzeitung documents migration and the new city as a story in its own right, not only as event coverage:**
  - population growth explained by the Army Corps HQ and the industrial zone (1935)
  - "4,000 workers" on Bolzano building sites (1936)
  - the Rione Dux gardens, the Mutterhaus and the cinema (1940–41)
  - Neu-Bolzano as "aus dem Nichts entstanden" (1941)
  - Volkszüge bringing Italians from Turin and the "old provinces" to the 1931 grape festival

  This is directly usable as the "translocality" material [I].

### Gaps
- I could not open digital.tessmann.it itself because of the bot challenge. I therefore could not confirm:
  - whether Teßmann has added titles since the 2019 Europeana snapshot (for example *Der Schlern*, more AZ issues for 1942–43, or any Italian titles)
  - Teßmann's own page-level deep-link syntax
- La Provincia di Bolzano has no OCR, so I could not run text searches in it. I read only 6 of the 8 front pages I downloaded (1931-10-29 and 1939-11-23 are untranscribed), and no inside pages. The LPB coverage of the Ponte Druso inauguration (Oct. 1931), the industrial-zone ceremony (inside pages, 22.12.1936) and the 1941 Kino Littorio still has to be read in the gallery.
- The May 1940 *Atesia Augusta* issue with "Rione Dux delle case semirurali" is not among the BPI albums I listed (only 1940 no. 12 is there).
- "Cinema Corso" / "Cinema Augusteo" on Corso Italia: no evidence in the AZ OCR. They may have opened after 1943, or the names may be wrong. Check the La Stampa / LPB cinema listings or the municipal archive.

## 2. Touring Club Italiano: Le Vie d'Italia articles 1919–1943, the Guida d'Italia volumes, "Attraverso l'Italia", and access to the TCI digital archive

### Takeaway
Three routes cover the TCI material:
1. **Internet Archive.** Nearly the full run of *Le Vie d'Italia* for 1919–1943 is online (177 monthly items match the title query). It is full-text searchable issue by issue via "search inside" [V].
2. **Digitouring.** The TCI's own portal (digitouring.it) catalogues selected *Vie d'Italia* and *Rivista Mensile* articles and the TCI photo archive. It includes a 1936 photographic series on Bolzano's industrial zone [V].
3. **Guidebooks.** I did not find the Guida "Venezia Tridentina" (1920, 1932 3rd ed., 1939 "Venezia Tridentina e Cadore") freely online. The "Attraverso l'Italia" volume on Venezia Tridentina is from 1952, outside the period [U].

### Cited Findings

**Access**
- **Digitouring** ([https://www.digitouring.it/it](https://www.digitouring.it/it)) is live and free; its search is at `/it/cerca?s=…` [V]. A Bibliographic Units filter returns article-level records. Searches for "Alto Adige", "Venezia Tridentina", "Dolomiti" and similar returned 22 records [V]. The TCI says magazines can be "browsed page by page" there — [touringclub.it news](https://www.touringclub.it/notizie/archivi-touring/anche-la-bellezza-ci-salvera-come-e-perche-scoprire-larchivio-digitale-del-touring-club-italiano) [U].
- **digitale.touringclub.it** did not resolve (connection failed) [V].
- **Internet Archive** ([title search](https://archive.org/search?query=title%3A%28%22vie+d%27italia%22%29)) [V]:
  - *Le vie d'Italia* has 177 items dated 1919–1943 (190 in total), plus *Le vie d'Italia e del mondo* (1930s).
  - The identifiers are opaque upload codes (e.g. `2022-12-06-02-43` = Feb. 1937).
  - To search inside an issue, open `https://archive.org/details/{id}?q=Bolzano`. Page numbers below are the IA "search inside" page indices, not printed page numbers.

**Le Vie d'Italia: articles and notices on Bolzano / Alto Adige** (headings read from the IA OCR [V]; authors only where the OCR shows them)

| Issue | IA item | Item (original title) | Author | Page (IA index) | Verified |
|---|---|---|---|---|---|
| Jul 1921 | [2022-02-20-15-48](https://archive.org/details/2022-02-20-15-48?q=Bolzano) | "Il turismo popolare nei monti dell'Alto Adige" (photo: Schlernhaus "costruito dalla Sezione di Bolzano dell'Alpenverein") | n/a | ~76–80 | [V] |
| Jan 1922 | [2022-05-26-21-59](https://archive.org/details/2022-05-26-21-59?q=Bolzano) | Programme of the "V carovana invernale nell'Alto Adige" (Merano–Brennero, 7–13 Feb. 1922) | TCI | 86–87 | [V] |
| Mar 1922 | [2023-02-27-02-08](https://archive.org/details/2023-02-27-02-08?q=Bolzano) | "Dati statistici del movimento di forestieri a Bolzano nel 1921": 77,143 visitors in 1921, vs 76,713 in 1920 and 123,191 in 1913 | n/a | 108 | [V] |
| Jul 1924 | [2022-01-01-17-05](https://archive.org/details/2022-01-01-17-05?q=Bolzano) | "I «Bagni» dell'Alto Adige" | n/a | ~64–78 | [V] |
| Sep 1924 | [2021-11-13-22-25](https://archive.org/details/2021-11-13-22-25?q=Bolzano) | Article on Alto Adige vineyards (captions: Santa Maddalena, Merano pergolas, "Il Saltner") | photos W. Müller, Bolzano | 90–91 | [V] |
| Apr 1929 | [2022-08-23-18-08](https://archive.org/details/2022-08-23-18-08?q=Bolzano) | Photo "Stazione di Bolzano – lo sfacelo. Migliaia di fuggiaschi austriaci…" (Nov. 1918); notice of rail discounts for the "Esposizione Nazionale Alto Adige", Bolzano, Aug–Sept 1929 | n/a | 26; 112 | [V] |
| Nov 1930 | [2022-11-24-02-30](https://archive.org/details/2022-11-24-02-30?q=Bolzano) | Report on the XIX Riunione SIPS in Bolzano, with a historical sketch of "germanizzazione"; also "Da rifugio a rifugio nelle Dolomiti occidentali" | n/a; a footnote cites "Ten. Colonnello G. Pellegrini" | 68–71 | [V] |
| Jul 1932 | [2021-11-03-22-15](https://archive.org/details/2021-11-03-22-15?q=Druso) | Photo "Il Ponte Druso a Bolzano" | n/a | 47 | [V] |
| Aug 1932 | [2022-04-03-02-44](https://archive.org/details/2022-04-03-02-44?q=Bolzano) | Announcement of the 3rd ed. of the Guida "Venezia Tridentina" (first issued in 1920 "all'indomani della Vittoria"); photo "La grandiosa centrale idroelettrica di Cardano, presso Bolzano, la più potente del mondo" | TCI | 36–38 | [V] |
| Mar 1934 | [2023-05-21-17-46](https://archive.org/details/2023-05-21-17-46?q=Prontuario) | Review of "Prontuario delle località dell'Alto Adige. Guida per l'avviamento delle corrispondenze postali", Bolzano 1933-XI, 28 pp. | n/a | 137 | [V] |
| Jun 1934 | [2023-04-21-01-14](https://archive.org/details/2023-04-21-01-14?q=Battisti) | Review of Carlo Battisti, "I nomi locali d'Oltradige Bolzanino" | n/a | 146 | [V] |
| Aug 1934 | [2023-04-13-02-37](https://archive.org/details/2023-04-13-02-37?q=Museo) | "Squarci di vita alto-atesina nel Museo di Bolzano" | G. Massano | ~66 | [V] |
| Feb 1935 | [2022-06-15-20-07](https://archive.org/details/2022-06-15-20-07?q=Siusi) | "La funivia da Ortisei all'Alpe di Siusi" | n/a | ~44–105 | [V] |
| Jul 1935 | [interne_202211](https://archive.org/details/interne_202211?q=Bolzano) | Notice: removal of the Walther von der Vogelweide statue from Piazza Vittorio Emanuele III, Bolzano | n/a | 8 | [V] |
| Aug 1935 | [2022-10-31-18-19](https://archive.org/details/2022-10-31-18-19?q=Merano) | "Merano che rinasce" | O. Ferrari | ~41 | [V] |
| **Feb 1937** | [2022-12-06-02-43](https://archive.org/details/2022-12-06-02-43?q=%22zona+industriale%22) | **"Opere del Regime – Bolzano e la nuova Zona Industriale"**, with photos by Giacomelli (zona industriale from Castel Flavon, Acciaierie water tower, etc.) | **Emilio Emmer** | 31 ff. | [V] |
| Sep 1937 | [2022-07-18-17-30](https://archive.org/details/2022-07-18-17-30?q=funivia) | "La funivia Bolzano–S. Genesio" | n/a | 12 | [V] |
| Oct 1938 | [2022-06-14-18-53](https://archive.org/details/2022-06-14-18-53?q=Sarentino) | "La nuova strada Bolzano–Sarentino–Vipiteno" (with photo "Il Monumento della Vittoria") | n/a | 95–96 | [V] |
| Jan 1939 | [2021-06-02-09-50](https://archive.org/details/2021-06-02-09-50?q=Siusi) | "Dalla Val d'Isarco all'Alpe di Siusi" | photos G. Pellini | ~95 | [V] |
| Mar 1939 | [2022-10-15-01-58](https://archive.org/details/2022-10-15-01-58?q=Gardena) | "In Val Gardena, oggi" | G. Pellini | ~61 | [V] |
| Apr 1939 | [2023-01-26-22-21](https://archive.org/details/2023-01-26-22-21?q=Bolzano) | "Orme di Roma in Pusteria"; text on Bolzano "alla confluenza dell'Isarco e della Talvera" | n/a | 9–10 | [V] |
| Jul 1939 | [2023-08-08-17-52](https://archive.org/details/2023-08-08-17-52?q=Renon) | "L'Altopiano del Renon"; TCI catalogue lists Guida "Venezia Tridentina e Cadore", 600 pp., 19 maps | G. Pellini | ~43 | [V] |
| Dec 1940 | [2023-03-28-02-05](https://archive.org/details/2023-03-28-02-05?q=magnesio) | Note on the magnesium plants in Bolzano | n/a | 126 | [V] |

**Digitouring article-level records** (year only; [V])
- 1919, *Le Vie d'Italia*:
  - "Trentino ed Alto Adige nei futuri rapporti dell'industria dei forestieri" ([record](https://www.digitouring.it/it/cerca/42328-trentino-ed-alto-adige-nei-futuri-rapporti-dellindustria-dei-forestieri))
  - "Le ferrovie di montagna nei dintorni di Bolzano" ([record](https://www.digitouring.it/it/cerca/42330-le-ferrovie-di-montagna-nei-dintorni-di-bolzano))
- 1919, *Rivista Mensile*: "La grande escursione nazionale nella Venezia Tridentina … 14–19 luglio" ([record](https://www.digitouring.it/it/cerca/41845-la-grande-escursione-nazionale-nella-venezia-tridentina-organizzata-dal-touring-col-))
- 1920, *Le Vie d'Italia*: "Merano" ([record](https://www.digitouring.it/it/cerca/41978-merano))
- 1921, *Le Vie d'Italia*:
  - "Le foreste dell'Alto Adige e del Trentino" ([record](https://www.digitouring.it/it/cerca/42419-le-foreste-dell-alto-adige-e-del-trentino))
  - "La politica alberghiera italiana sul Garda e nell'Alto Adige" ([record](https://www.digitouring.it/it/cerca/42488-la-politica-alberghiera-italiana-sul-garda-e-nell-alto-adige))
- 1922, *Le Vie d'Italia*: "V carovana invernale nell'Alto Adige: Merano-Brennero 7–13 febbraio 1922" ([record](https://www.digitouring.it/it/cerca/42575-v-carovana-invernale-nell-alto-adige-merano-brennero-7-13-febbraio-1922))
- 1927, *Le Vie d'Italia*: "Grande escursione nelle Dolomiti 26–29 giugno" ([record](https://www.digitouring.it/it/cerca/41856-grande-escursione-nelle-dolomiti-26-29-giugno))

**Digitouring photo series** "Paesaggio industriale", 1936. Gelatin silver prints by the Giacomelli studio of Venice (Giacomo and Pietro Giacomelli). TCI box "Scatola22", old IDs FOT6851–FOT6868 [V]. Items include:
- "Veduta della zona industriale di Bolzano da Castel Flavone" ([33298](https://www.digitouring.it/it/cerca/33298-veduta-della-zona-industriale-di-bolzano-da-castel-flavone))
- "I terreni della zona industriale di Bolzano all'inizio dei lavori" ([33299](https://www.digitouring.it/it/cerca/33299-i-terreni-della-zona-industriale-di-bolzano-allinizio-dei-lavori))
- "Il nuovo sottovia alla ferrovia … per l'accesso alla zona industriale" ([33301](https://www.digitouring.it/it/cerca/33301-il-nuovo-sottovia-alla-ferrovia-a-bolzano-per-laccesso-alla-zona-industriale-dalla-strada-statale-del-brennero))
- "Il primo capannone delle acciaierie di Bolzano" ([33305](https://www.digitouring.it/it/cerca/33305-il-primo-capannone-delle-acciaierie-di-bolzano))
- "Un fabbricato ultimato del quartiere case operaie per la zona industriale a S. Quirino" (FOT6864)
- "Il grande capannone ad uso fonderia dello stabilimento Lancia" (FOT6866)
- "Il salone modellisti e l'officina meccanica dello stabilimento Lancia" (FOT6868)
- Industria Nazionale Alluminio views

The same Giacomelli photos are printed, credited "(Fot. Giacomelli)", in Emmer's Feb. 1937 *Vie d'Italia* article [V]. Other Bolzano tourism photos on Digitouring: "Il Palazzo del Turismo a Bolzano" (33293), "Garage centrale e concessionaria FIAT a Bolzano" (33294), "Il Lido di Bolzano" (33295) [V].

**Guidebooks**
- TCI, *Guida pratica ai luoghi di soggiorno e di cura d'Italia, 2: Le stazioni della Venezia tridentina, del Cadore e della Carnia* (Milano 1935). Full PDF on IA: [StazioniVeneziaTridentina](https://archive.org/details/StazioniVeneziaTridentina) [V]. Not downloaded, because its rights are unverified.
- The 1932 IA item "Guida delle Tre Venezie – Venezia Tridentina" ([trevenezieveneziatridentina](https://archive.org/details/trevenezieveneziatridentina)) is a **commercial-industrial directory** (Trieste, Società editoriale pubblicitaria), not the TCI guide [V].
- "Attraverso l'Italia – Venezia Tridentina" is TCI 1952, series vol. 17, 235 pp. The 1930s series (1930–1941) had no such volume — [catalog record via search](https://find.library.upenn.edu/catalog/99893623503681) [U].

### Inferences
- Emmer's article and the Digitouring prints are one visual campaign. The TCI commissioned or acquired the Giacomelli series in 1936 and used it in its magazine in 1937 [I]. That makes a strong case study of how the industrial zone was "shown to Italians".
- Le Vie d'Italia moves from postwar tourism-economics framing (1919–22: visitor statistics, the hotel "politica", popular tourism in Alto Adige) to regime-works framing (1932–1940: Ponte Druso, Cardano, the industrial zone, magnesium) [I].

### Gaps
- I did not find the TCI Guida "Venezia Tridentina" (1920 1st ed.; 2nd ed. presumably 1925, unverified; 3rd ed. 1932; 1939 "Venezia Tridentina e Cadore") freely online. HathiTrust was blocked by a Cloudflare challenge, Google Books returned HTTP 429, and the web-search budget was exhausted.
- I did not confirm whether Digitouring offers full-page browsing of the magazines, or only article metadata and photos.
- The Vie d'Italia author attributions are incomplete, because the OCR'd tables of contents are noisy. A systematic pass over each issue's sommario is still needed.
- I did not search *Le Vie d'Italia e del mondo*.

## 3. National press: La Stampa, Corriere della Sera, Il Popolo d'Italia, L'Illustrazione Italiana and the Rivista Illustrata del Popolo d'Italia

### Takeaway
- **La Stampa** is the best free national source: its archive (archiviolastampa.it) is open, its search backend can be scripted, and every article has a stable viewer URL. I harvested 56 key articles from 1919–1940 below [V].
- **Corriere della Sera's** archive is a paywalled, metered service [V].
- **Il Popolo d'Italia:** I found no free online run.
- **Rivista Illustrata del Popolo d'Italia:** the full run for 1923–1943 is on the Internet Archive [V].
- **L'Illustrazione Italiana:** online only for 1916–1923 (IA uploads) [V].

### Cited Findings
- **La Stampa archive mechanics** [V]:
  - Site: http://www.archiviolastampa.it (plain http works; https failed).
  - The search box hits a Solr backend: `http://www.archiviolastampa.it/load.php?s={token from the homepage form field "t"}&url=/search/free?` + URL-encoded `q=…&fq=date:[1919-01-01T00:00:00Z TO 1943-12-31T23:59:59Z]&rows=…&wt=json&sort=date asc`.
  - Useful fields: `title:` (headline), plain text (full text), `date`, `pageNum`, `articleID`, `headboard` (LaStampa or StampaSera).
  - Viewer URL pattern: `http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,{pageNum}/articleid,{articleID}/`. I checked it on the 21.12.1936 article, which loaded "LA ZONA INDUSTRIALE solennemente inaugurata a Bolzano" [V].
- **Hit counts, 1919–1943** [V]:

| Query | Hits |
|---|---|
| "zona industriale di Bolzano" | 18 |
| "monumento alla Vittoria" AND Bolzano | 115 |
| "Ponte Druso" | 4 |
| semirurali AND Bolzano | 7 |
| "Rione Dux" | 3 |
| opzione AND allogeni | 11 |
| "treno popolare" AND Bolzano | 139 |
| title:Bolzano | 92 |
| title:"Alto Adige" | 61 |

- **La Stampa / Stampa Sera articles** (headlines are the archive's own index titles, OCR verbatim; viewer links built from the verified pattern) [V]:

| Date | Paper | Page | Headline as indexed (OCR, verbatim) | Opening text (OCR snippet) | Viewer URL |
|---|---|---|---|---|---|
| 1919-12-16 | La Stampa | 2 | Il problema dell'Alto Adige nelle richieste d'autonomia tedesche | Il problema dell'Alto Adige nelle richieste d'autonomia tedesche - Un memoriale al Governo c alla Camera j. faotiSdO, li. f Vi ho già date un breve cenno delio  | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1178_01_1919_0345_0002_24858749/ |
| 1921-04-26 | La Stampa | 1 | Manifestazione tedesca a Bolzano conchiusasi tragicamente per l'intervento fascista | Scoppio di due bombe e rivoltellate durante un pittoresco corteo: 1 morto e 8 feriti gravi - L'indignazione cittadina - Dimostrazioni e sciopero. (Dal nostro in | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1173_01_1921_0099_0001_17124196/ |
| 1921-05-02 | La Stampa | 2 | Il pugno teso | Dalla Venezia Tridentina Il pugno teso (Dal nostro inviato speciale) BOLZANO, 30. il Deufsefter VerìmnA. 3ega tedesca, deria quale fanno parie il Partilo libera | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1173_01_1921_0103A_0002_24860329/ |
| 1922-10-03 | La Stampa | 5 | I fascisti a Bolzano | I fascisti a Bolzano Allo .scopo di eludere la vigilanza dell'Au-1 torità, sabato sera il Comitato centrale del IPartito nazionale fascista aveva simulato Iuna  | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,5/articleid,0026_01_1922_0234_0005_24864050/ |
| 1922-10-06 | La Stampa | 1 | Il Governatore dell'Alto Adige cede i poteri all'autorità militare | Il Governatore dell'Alto Adige cede i poteri all'autorità militare La momentanea occupazione fascista dal Palazzo Provinciale — Credaro rifiuta di dimettersi e  | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,0026_01_1922_0237_0001_17169364/ |
| 1923-10-17 | La Stampa | 2 | Nomi tedeschi e nomi italiani | Nomi tedeschi e nomi italiani Nelle lotte nazionali che caratterizzano la viia politica d'Europa del secolo scorso e presente, la toponomastica — cioè la scienz | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1171_01_1923_0247_0002_24867919/ |
| 1923-11-08 | La Stampa | 3 | Come insegneremo l'italiano nelle scuole dell'Alto Adige e della Venezia Giulia | Come insegneremo l'italiano nelle scuole dell'Alto Adige e della Venezia Giulia L'art. 17 del R. Decreto l.o ottobre 1923 sull'ordinamento dell'istruzione elmen | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,3/articleid,1171_01_1923_0266_0003_24867999/ |
| 1926-02-07 | La Stampa | 1 | Mussolini risponde alla campagna tedesca per l'Alto Adige con "una presa di posizione politica e diplomatica,, | Mussolini risponde alla campagna tedesca per l'Alto Adige con "una presa di posizione politica e diplomatica,, " Mi auguro che il mio discorso sia inteso da chi | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1162_01_1926_0033_0001_24349776/ |
| 1926-07-13 | La Stampa | 1 | L'Alto Adige acclama al Re | L'Alto Adige acclama al Re Gli ex-combattenti austriaci In fraterna comunione con i combattenti italiani Un caratteristico e imponente corteo di popolo (Dal nos | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1163_01_1926_0165_0001_17291562/ |
| 1927-06-16 | La Stampa | 5 | L'Alto Adige a portata di mano | L'Alto Adige a portata di mano Il quadro panoramico è quello che èLe montagne dell'Alto Adige, steslungo le pareti della sala, dalle rosseggi ami Dolomiti, alle | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,5/articleid,1160_01_1927_0142_0005_24877318/ |
| 1927-10-14 | La Stampa | 3 | Bacco in Alto Adige | LA VITA FACILE Bacco in Alto Adige L'ho lasciato nel 1915, a Milano, volontario di guerra ed artigliere. Lo 'ritrovo in Val d'Iaarco, dodici anni dopo, macabro  | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,3/articleid,1161_01_1927_0245_0003_24878706/ |
| 1928-06-28 | La Stampa | 1 | (untitled in index) Il Re a Bolzano per il monumento della Vittoria nell'anniversario ili Battisti Roma, 27 no | Il Re a Bolzano per il monumento della Vittoria nell'anniversario ili Battisti Roma, 27 notte. L'Associazione nazionale Combattenti comunica: « Il 12 luglio, an | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,0027_01_1928_0153_0001_16773681/ |
| 1928-07-12 | La Stampa | 1 | Tutta l'Italia oggi in Bolzano italiana | Tutta l'Italia oggi in Bolzano italiana Il monumenti della Vittoria che il Re inaugura stamani -(DAL MOSTRO INVIATO)- Bolzano 11 notte. Ho-provato scritto teina | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,0027_01_1928_0165_0001_16774629/ |
| 1928-07-13 | La Stampa | 1 | II Monumento alla Vittoria inaugurato dal Re in un tripudio di devozine nazionale | LA CONSACRAZIONE EROICA DI BOLZANO ITALIANA II Monumento alla Vittoria inaugurato dal Re in un tripudio di devozine nazionale I Principi, i Gerarchi, i Mutilati | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,0027_01_1928_0166_0001_24358966/ |
| 1928-07-28 | La Stampa | 1 | Il rinnovamento italiano dell'Alto Adige | Il rinnovamento italiano dell'Alto Adige BOLZANO, Luglio. Sono oramai abbastanza note agli Italiani, almeno di fama, le bellezze naturali della regione dell'Alt | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,0027_01_1928_0179_0001_16776122/ |
| 1928-07-31 | La Stampa | 3 | Provvidenza e grandiosità di opere | Il rinnovamento italiano dell'Alto Adige Provvidenza e grandiosità di opere BOLZANO, luglio. Riassumevo, nella mia lettera dell'altro ieri, quanto è stato fatto | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,3/articleid,0027_01_1928_0181_0003_24881194/ |
| 1928-08-07 | La Stampa | 5 | Il rinnovamento italiano dell'Alto Adige | Il rinnovamento italiano dell'Alto Adige Rinascita di Bolzano BOLZANO, Agosto. r J) rinnovamento italiano dell'Alto •Adige, che documentavo nelle mie lettere de | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,5/articleid,0027_01_1928_0187_0005_24880109/ |
| 1928-08-18 | La Stampa | 2 | Bimbi d'Italia in Alto Adige | Bimbi d'Italia in Alto Adige L'on. Turati visita le Colonie di Balilla e Piccole Italiane » Grazioso apologo del Segretario del Partito -- Una scuola di maestri | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,0027_01_1928_0196_0002_24880370/ |
| 1928-11-20 | La Stampa | 1 | I primi giorni di Bolzano italiana | I primi giorni di Bolzano italiana La sera, del 7 novembre 1918 un telegramma del Comando Supremo mi toglieva dal quasi riposo di Asolo, ordinando di recarmi su | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1158_01_1928_0276_0001_17337299/ |
| 1929-07-19 | La Stampa | 5 | La 1° Esposizione Nazionale in Alto Adige | La 1° Esposizione Nazionale in Alto Adige Fervore di preparativi a Bolzano Bolzano, 18 notte. Bolzano assumerà quest'estate una speciale fisionomia contrastante | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,5/articleid,1155_01_1929_0172_0005_24884796/ |
| 1929-08-11 | La Stampa | 4 | L' Esposizione dell' Alto Adige inaugurata alla presenza della Duchessa d'Aosta e del Duca di Bergamo | L' Esposizione dell' Alto Adige inaugurata alla presenza della Duchessa d'Aosta e del Duca di Bergamo Bolzano, 10 notte. Stamane, alle 10, con una austera e sig | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,4/articleid,1155_01_1929_0192_0004_24883830/ |
| 1930-06-02 | La Stampa | 2 | L'Esposizione Dopolavoristica di Bolzano Inaugurata alla presenza dei Duchi di Pistoia | L'Esposizione Dopolavoristica di Bolzano Inaugurata alla presenza dei Duchi di Pistoia Un discorso di S. E. Balbino Giuliano Bolzano, 2, mattino. ILe molteplici | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1152_01_1930_0130A_0002_24887546/ |
| 1930-09-08 | La Stampa | 3 | Cinquecento scienziati a Bolzano per il XIX Ciongresso nazionale | Cinquecento scienziati a Bolzano per il XIX Ciongresso nazionale i Bolzano,,m. Gli scienziati italiani, qui convenuti per il loro XIX congresso, sono stati acco | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,3/articleid,1153_01_1930_0213A_0003_24888725/ |
| 1931-05-15 | La Stampa | 1 | Età di Bolzano | Panorami provinciali Età di Bolzano BOLZANO, maggio. A ritornar quassù, a Bolzano, dopo alcuni anni d'assenza, ci s'accorge d'essere in mondo nuovo; il colore d | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1149_01_1931_0115_0001_16872583/ |
| 1931-09-25 | La Stampa | 3 | L'Alto Adige da un finestrino | l-i -A. -VITA. FACILE L'Alto Adige da un finestrino MERANO, settembre. Gli alberghi del paesino dove, in piena season, .tono capitalo, appaio- no au grand coinp | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,3/articleid,1150_01_1931_0228_0003_24895056/ |
| 1931-10-19 | Stampa Sera | 1 | L'imponente complesso di lavori iniziati e in via di esecuzione | L'imponente complesso di lavori iniziati e in via di esecuzione La nuova grandiosa strada Trento, 19 sera.  ,L'interessamento del Regime per l'Alto Adige si con | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1628_02_1931_0248_0001_22377207/ |
| 1934-08-27 | La Stampa | 3 | Incanto di Bolzano | B E I_j Ij E z zie d'italia Incanto di Bolzano i — — a a e e o o o e , ì ù o . . BOLZANO, agosto. Per chi vuol veramente godere intero l'incanto di Bolzano deve | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,3/articleid,0028_01_1934_0202A_0003_24910177/ |
| 1935-01-18 | La Stampa | 6 | Bolzano di domani | Bellezze cT Italia Bolzano di domani BOLZANO, gennaio. A non volere assolutamente tenere conto della storia, e neppure della configurazione naturale, basterebbe | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,6/articleid,1137_01_1935_0016_0006_24910420/ |
| 1935-02-20 | Stampa Sera | 1 | Il Duce presiede un adunanza | Il Duce presiede un adunanza per il potenziamento industriale di Bolzano Roma, mercoledì sera. H Capo del Governo ha presieduto din'adunanza alla quale hanno pa | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1624_02_1935_0044_0001_22449030/ |
| 1935-02-21 | La Stampa | 2 | Una zona industriale a Bolzano sorgerà per volontà del Duce | Una zona industriale a Bolzano sorgerà per volontà del Duce Il Capo del Governo Ini presieduo un'adunanza alla quale hanno partecipato i Ministri per li Finane, | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1137_01_1935_0045_0002_24911363/ |
| 1935-08-27 | La Stampa | 1 | Il Duce accollo a Bolzano da imponenti manifesiazioni di popolo | La Nazione in armi è pronta a tutte le prove Il Duce accollo a Bolzano da imponenti manifesiazioni di popolo L'irrevocabile volontà dell'Italia nelle dichiarazi | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1138_01_1935_0204_0001_16669015/ |
| 1936-11-10 | Stampa Sera | 4 | Prospettive turistiche in Alto Adige | Prospettive turistiche in Alto Adige Bolzano, martedì sera. In questi ultimi tre anni, per il diuturno, affettuoso interessamento di S. E. 11 Prefetto Mastromat | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,4/articleid,1623_02_1936_0268_0004_22478590/ |
| 1936-11-28 | Stampa Sera | 1 | sarà inaugurata il 10 dicembre | sarà inaugurata il 10 dicembre , Bolzano, sabato sera. Per. disposizione del Duce, la zona industriale di Bolzano sarà inaugurata il 10 dicembre prossimo .con l | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1623_02_1936_0284_0001_22479440/ |
| 1936-12-15 | La Stampa | 4 | BOLZANO INDUSTRIALE | BOLZANO INDUSTRIALE Case operaie e palazzi; un isolotto romantico conservato davanti alla cintura delle nuove caserme e al cospetto delle colline ridenti di San | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,4/articleid,1136_01_1936_0298_0004_24917548/ |
| 1936-12-21 | La Stampa | 1 | LA ZONA INDUSTRIALE solennemente inaugurata a Bolzano | LA ZONA INDUSTRIALE solennemente inaugurata a Bolzano Imponenti masse di popolo acclamano il Duce - Il mini" stro Benni reca la parola incitatrice del Governo f | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1136_01_1936_0303A_0001_16693854/ |
| 1937-02-17 | La Stampa | 7 | QUARANTAMILA PERSONE seguono la salma di Vincenzo Lancia | QUARANTAMILA PERSONE seguono la salma di Vincenzo Lancia Le condoglianze di S. E. Starace, dei Ministri Alfieri e Lessona e del Maresciallo Balbo - L'omaggio di | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,7/articleid,1132_01_1937_0041_0007_24920881/ |
| 1937-05-25 | La Stampa | 2 | VIBRANTE GIORNATA a Bolzano e a Merano per la visita di S. E. Starace | VIBRANTE GIORNATA a Bolzano e a Merano per la visita di S. E. Starace ,11 . vissuto, con la venuta del Segre- tario del Partito, una grande, lumlnosa giornata.  | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1133_01_1937_0123_0002_24924428/ |
| 1938-06-14 | La Stampa | 5 | BOLZANO NUOVA | Sai piano autarchico BOLZANO NUOVA Il piano mussoliniano del '24 - Attività creatrice -- Masonìte, alluminio e magnesio (DAL NOSTRO INVIATO SPECIALE) BOLZANO, g | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,5/articleid,1130_01_1938_0140_0005_24928361/ |
| 1938-06-17 | La Stampa | 2 | La vita dell'Alto Adige e i suoi problemi turistici | La vita dell'Alto Adige e i suoi problemi turistici Una visita di S. E. Alfieri a Bolzano e a Merano - Una manifestazione al Duce degli intellettuali altoatesin | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1130_01_1938_0143_0002_24928725/ |
| 1938-08-29 | La Stampa | 1 | IL VOLTO DI BOLZANO INDUSTRIALE | Una grande realizzazione fascista IL VOLTO DI BOLZANO INDUSTRIALE La fervida giornata del Ministro Alfieri - La visita alle industrie e il rapporto dei professi | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1130_01_1938_0204A_0001_19913043/ |
| 1938-08-29 | Stampa Sera | 6 | nuovo | nuovo Una grande realizzazione fascista è quella della zona industriale di Bolzano, creataper volontà del Duce, i cui lavori sono stati ieri ispezionati da S. E | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,6/articleid,1619_02_1938_0204_0006_23805341/ |
| 1938-11-02 | La Stampa | 2 | Galeazzo Ciano a Bolzano | Galeazzo Ciano a Bolzano La registrazione del matrimonio del Duca d'Ancona La visita a numerose opere pubbliche tra calorose manifestazioni fasciste - La parten | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1131_01_1938_0260_0002_24929733/ |
| 1939-01-16 | La Stampa | 6 | (untitled in index) A Cospicua elargizione del Duce per il dizionario toponomastico dell'Alto Adige Roma, 16 g | A Cospicua elargizione del Duce per il dizionario toponomastico dell'Alto Adige Roma, 16 gennaio. Il senatore conte Ettore Tolomei e il professor Carlo Battisti | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,6/articleid,1127_01_1939_0013A_0006_22638370/ |
| 1939-07-13 | La Stampa | 2 | TUTTI GLI STRANIERI lasceranno l'Alto Adige | TUTTI GLI STRANIERI lasceranno l'Alto Adige // provvedimento dettato da ragioni di carattere politico-militare in base a rapporti dell10.V.R.A. ROMA, 12 luglio. | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1128_01_1939_0165_0002_24253200/ |
| 1939-08-08 | La Stampa | 2 | Il trasferimento nel Reich dei tedeschi dell'Alto Adige | Il trasferimento nel Reich dei tedeschi dell'Alto Adige Il disegno di legge all'esame della Commissione legislativa degli Affari Interni Roma, 7 agosto. La Comm | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1128_01_1939_0187_0002_24254900/ |
| 1939-10-07 | Stampa Sera | 3 | Bolzano attende la visita del Segretario del Partito | Bolzano attende la visita del Segretario del Partito L'inaugurazione dei Rione Dux Bolzano, sabato sera. Il Fascismo bolzanese si appresta a fervidamente saluta | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,3/articleid,1617_02_1939_0238_0003_22218618/ |
| 1939-10-09 | La Stampa | 1 | Il Segretario del Partito a Bolzano e a Merano | Il Segretario del Partito a Bolzano e a Merano U inaugurazione di un rione di 300 casette rurali -- Visite alle Case Littorie Appassionate invocazioni di folla  | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,0030_01_1939_0239A_0001_16426902/ |
| 1939-10-22 | La Stampa | 1 | Il conte Ciano firma gli accordi per i tedeschi dell'Alto Adige | Il conte Ciano firma gli accordi per i tedeschi dell'Alto Adige La convenzione risolve pacificamente e definitivamente un complicato problema - I cittadini germ | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,0030_01_1939_0251_0001_24257705/ |
| 1939-10-26 | La Stampa | 2 | Gli accordi italo-tedeschi per le popolazioni dell'Alto Adige | Gli accordi italo-tedeschi per le popolazioni dell'Alto Adige Una nota alle norme del Prefetto di Bolzano e del Console del Reich a Milano Bolzano, 25 ottobre.  | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,0030_01_1939_0254_0002_16428903/ |
| 1939-12-16 | La Stampa | 3 | LA GRANDE BOLZANO | LA GRANDE BOLZANO Una delle più brillanti e solide interpretazioni .della massima: "fondare città „ (dal nostro inviato) BOLZANO, dicembre. Sono tornato, dopo u | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,3/articleid,0030_01_1939_0298_0003_24256021/ |
| 1939-12-19 | La Stampa | 2 | II Sottosegretario agli Interni impartisce a Bolzano le direttive circa l'opzione degli allogeni | II Sottosegretario agli Interni impartisce a Bolzano le direttive circa l'opzione degli allogeni  applicazione  " Bolzano,'18 dicembre. Il Sottosegretario all'i | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,0030_01_1939_0300_0002_24256559/ |
| 1939-12-22 | La Stampa | 2 | L'opzione degli allogeni dell'Alto Adige | L'opzione degli allogeni dell'Alto Adige Libera e spontanea scelta della cittadi nanza -- L'accordo firmato a Roma dalJSottosegretario Buffarmi e da Himmler Rom | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,0030_01_1939_0303_0002_24256161/ |
| 1940-01-10 | Stampa Sera | 5 | Le opzioni in Alto Adige | Le opzioni in Alto Adige . Bolzano, mercoledì sera. Ultimati gli spogli delle opzioni nelle province di Bolzano, Udine, Belluno, Trento, il Sottosegretario agli | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,5/articleid,1614_02_1940_0009_0005_22260761/ |
| 1940-01-11 | La Stampa | 1 | I risultati ufficiali delle opzioni in Alto Adige comunicati al Duce e al Fuhrer | I risultati ufficiali delle opzioni in Alto Adige comunicati al Duce e al Fuhrer Roma, 10 gennaio. IUltimati gli spogli delle opzioni-elle Provincie di Bolzano. | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,1/articleid,1125_01_1940_0010_0001_16081399/ |
| 1940-01-11 | Stampa Sera | 4 | Sei campioni altoatesini | Sei campioni altoatesini hanno optato per la Germania Milano, giovedì sera. ' Il Popolo d'Italia ha da Roma: « Da notizie assunte da fonte bene informata siamo  | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,4/articleid,1614_02_1940_0010_0004_22260863/ |
| 1940-09-30 | La Stampa | 2 | Gli impianti per il magnesio a Bolzano | Gli impianti per il magnesio a Bolzano II raddoppio della produzione raggiunto con l'anticipo di un anno Il Duce ha ricevuto il consigliere nazionale Ilario Mon | http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/Itemid,3,/action,viewer/page,2/articleid,1126_01_1940_0234A_0002_22547340/ |

- **Corriere della Sera.** The archive (https://archivio.corriere.it/Archivio/interface/landing.html) loads [V]. The landing page shows subscription prompts ("ABBONATI") and a metering message: "hai superato il limite massimo di articoli da visualizzare nelle ultime ore" [V]. So the full archive needs a subscription, with limited free viewing [I].
- **Braidense digital newspaper library** (http://emeroteca.braidense.it, 960 titles) [V]:
  - No *Il Popolo d'Italia* and no *L'Illustrazione Italiana* in title searches.
  - It does hold *La Lettura: rivista mensile del Corriere della Sera* (1901–1952).
- **Internet Archive** [V]:
  - *La Rivista Illustrata del Popolo d'Italia*: 39 volumes, 1923–1943 ([larivista-1926-vol2](https://archive.org/details/larivista-1926-vol2) etc.).
  - *L'Illustrazione Italiana*: 274 user uploads. By title or date they cover 1916–1923 (1916: 51, 1917: 67, 1918: 19, 1919: 13, 1920: 3, 1921: 28, 1922: 44, 1923: 3) plus 46 undated. None from 1926–1943 identified.
  - *Il Popolo d'Italia* daily: none found.
- **Rivista Illustrata del Popolo d'Italia: Bolzano items** (search-inside page indices) [V]:
  - 1926 vol. 2, p. 229, "Il Monumento della Vittoria a Bolzano" (and p. 130) — [link](https://archive.org/details/larivista-1926-vol2?q=Bolzano)
  - 1928 vol. 2, p. 11, "S. M. il Re inaugura il monumento della Vittoria a Bolzano" — [link](https://archive.org/details/larivista-1928-vol2?q=Bolzano)
  - 1928 vol. 1, p. 226, a polemic against "la campagna antitaliana per la Provincia di Bolzano" — [link](https://archive.org/details/larivista-1928-vol1?q=Bolzano)
  - 1931 vol. 2, pp. 100–101, a historical piece on Alto Adige (Drusus towers, "immigrazioni teutoniche") — [link](https://archive.org/details/larivista-1931-vol2?q=Bolzano)
  - 1932 vol. 2, p. 460, "Saltiamo a Bolzano … questi tedeschi che popolano abusivamente il territorio italiano" — [link](https://archive.org/details/larivista-1932-vol2?q=Bolzano)
  - 1933 vol. 1, pp. 378–379, the Alto Adige pavilion (Val Gardena woodcarving) at the artisan exhibition — [link](https://archive.org/details/larivista-1933-vol1?q=Bolzano)
  - 1935 vol. 2, pp. 180, 226, the 1935 Alto Adige manoeuvres ("… giunge a Bolzano") — [link](https://archive.org/details/larivista-1935-vol2?q=Bolzano)
  - 1937 vol. 1, pp. 264–265, "Per chi ha conosciuto Bolzano e l'Alto Adige nell'immediato dopoguerra e li rivede oggi, parlare di prodigi non è …", on public works — [link](https://archive.org/details/larivista-1937-vol1?q=Bolzano)
  - 1937 vol. 2, p. 532, the new aluminium plant — [link](https://archive.org/details/larivista-1937-vol2?q=Bolzano)
  - 1940 vol. 2, pp. 492–494, the second INA aluminium plant in Bolzano, photo spread — [link](https://archive.org/details/larivista-1940-vol2?q=Bolzano)
- **Istituto Luce** newsreel records on Europeana, e.g. "Adunata of the Bersaglieri in Bolzano …" — [Europeana](https://www.europeana.eu/item/08602/IL3000052097) [V].

### Inferences
- **La Stampa as a parallel channel.** Its correspondents' series ("Il rinnovamento italiano dell'Alto Adige", Jul–Aug 1928; "Bolzano di domani", 1935; "BOLZANO INDUSTRIALE", 1936; "BOLZANO NUOVA", 1938; "IL VOLTO DI BOLZANO INDUSTRIALE", 1938; "LA GRANDE BOLZANO", 1939) show the city narrated to readers in Turin, Lancia's home city. This is a direct translocal axis. Two examples: the 17.02.1937 Turin coverage of Vincenzo Lancia's funeral, and the 1939–40 Option news [I].
- **The Rivista Illustrata** gives the regime's glossy national image, from the Victory Monument (1926/28) to aluminium (1937/40). It pairs naturally with *Vie d'Italia* [I].

### Gaps
- *Il Popolo d'Italia*: I found no free digitized run. Candidates are microfilm and the Biblioteca nazionale centrale; this needs checking once search is available.
- *L'Illustrazione Italiana* for 1926–1943: I located no free online run.
- Corriere della Sera: I did not run topic searches (paywall).

## 4. Propaganda volumes and official publications

### Takeaway
- **Online:** Tolomei's *Archivio per l'Alto Adige* is online only for 1906–1919, on the BPI gallery [V]. The 1916 Prontuario survives online only as a private digitization [U].
- **Not found:** the celebratory municipal and party volumes ("Bolzano fascista", decennial volumes, industrial-zone brochures).
- **Downloaded and public domain:** several period books presenting Alto Adige to Italians are on the Internet Archive, and the two most relevant ones are out of copyright and downloaded: Toniolo 1919 and Borgese 1921 [V].

### Cited Findings
- **Archivio per l'Alto Adige** (Tolomei):
  - BPI gallery: [ArchivioAltoAdige](https://webaleph.bpi.claudiaugusta.it/ArchivioAltoAdige.html), 1906–1919, about 4,000 page images [V].
  - Europeana has a single item, "Bolzano, Dicembre 1918 / Archivio per l'Alto Adige", from the Biblioteca Universitaria Alessandrina ([item](https://www.europeana.eu/item/18/RML0353053)) [V].
  - I found no 1920–1943 volumes online. The reference monograph is G. Framke, *Im Kampf um Südtirol: Ettore Tolomei (1865–1952) und das "Archivio per l'Alto Adige"* (Tübingen 1987) — [CiNii](https://cir.nii.ac.jp/crid/1130000793952688128) [U].
- **Prontuario dei nomi locali dell'Alto Adige** (1916):
  - Published in June 1916 by the Reale Società Geografica Italiana (Memorie vol. XV, part II) and the Archivio per l'Alto Adige.
  - The only digital copy listed is Edoardo Mori's PDF, archived at [web.archive.org snapshot](https://web.archive.org/web/20050903155600/http://xoomer.virgilio.it/tribunale/) — [Wikipedia](https://en.wikipedia.org/wiki/Prontuario_dei_nomi_locali_dell%27Alto_Adige) [V page; PDF not opened].
  - I found no 1923 or 1935 edition online [V; IA and Europeana queries returned nothing].
  - Le Vie d'Italia (Mar 1934, p. 137) reviews a distinct postal gazetteer, "Prontuario delle località dell'Alto Adige. Guida per l'avviamento delle corrispondenze postali" (Bolzano 1933) [V].
  - La Stampa (16.01.1939, p. 6) reports "Cospicua elargizione del Duce per il dizionario toponomastico dell'Alto Adige" to Senator Ettore Tolomei [V].
- **Tolomei's other writings:**
  - *L'Alto Adige* (Torino, L'ora presente, 1915; "I problemi attuali" 8–9): on IA, [fp-0127](https://archive.org/details/fp-0127) [V].
  - *Memorie di vita* (1948): not found on IA or Europeana [V]. It is outside the period. Tolomei died in 1952, so the book is public domain in Italy since 2023 [I].
- **Presentations of the province to Italians** (Internet Archive) [V]:
  - A. R. Toniolo, *Alto Adige: cenni geografici e statistici* (Novara, De Agostini, 1919): [altoadigecennige00toni](https://archive.org/details/altoadigecennige00toni). Downloaded.
  - G. A. Borgese, *L'Alto Adige contro l'Italia: quattro lettere da Bolzano…* (Treves, 1921): [borgese-alto-adige-contro-italia](https://archive.org/details/borgese-alto-adige-contro-italia). Downloaded.
  - L. Giannitrapani, *Le terre redente* (Bemporad, 1919): [GiannitrapaniLeTerreRedente](https://archive.org/details/GiannitrapaniLeTerreRedente)
  - E. Salvi, *Venezia Tridentina* (Vallardi, 1921, for schools): [SalviVeneziaTridentina](https://archive.org/details/SalviVeneziaTridentina)
  - ISTAT, *Censimento della popolazione … 1921: Venezia tridentina* (1925): [CensimentoDellaPopolazioneVeneziaTridentina](https://archive.org/details/CensimentoDellaPopolazioneVeneziaTridentina)
  - A. Marpicati, *Opere del Regime* (INCF, 1934): [OpereDelRegime](https://archive.org/details/OpereDelRegime)
  - E. Arslan, *Il Museo dell'Alto Adige a Bolzano* (1942): [ilmuseodellaltoa00arsl](https://archive.org/details/ilmuseodellaltoa00arsl)
  - *Questioni e vita dell'Alto Adige. Notiziario, giugno 1942 – marzo 1943*: [questioni-vita-dell-alto-adige](https://archive.org/details/questioni-vita-dell-alto-adige)
  - Catalogues of the *Sindacale d'arte* (Bolzano 1938, 1940, 1942; Mart Archivio del '900, stream only): [VII 1938](https://archive.org/details/vii-sindacale-darte-bolzano-1938), [IX 1940](https://archive.org/details/ix-sindacale-darte-bolzano-1940), [XI 1942](https://archive.org/details/xi-sindacale-darte-bolzano-1942)
- **German and English counter-presentations** (IA) [V]:
  - K. von Grabmayr (ed.), *Süd-Tirol: Land und Leute vom Brenner bis zur Salurner Klause* (1919): [sdtirollandund00grabuoft](https://archive.org/details/sdtirollandund00grabuoft)
  - H. Fingeller, *The lost home: South Tyrol* (1938): [TheLostHomeSouthTyrol](https://archive.org/details/TheLostHomeSouthTyrol)
- **Atesia Augusta** (the regime's monthly for Alto Adige, 1939–1943):
  - Run in the BPI gallery (see section 1) [V].
  - The AZ describes it as "Monatsschrift des Alto Adige, geleitet von S. Exz. Mastromattei" (AZ 21.12.1939, 29.12.1939) and summarises its issues.
  - In January 1941 a change of direction is reported; the OCR reads "Antonio Baldint Rualis", so the name is uncertain (AZ 29.01.1941) [V OCR].
  - The October 1939 issue carried a declaration by Prefect Mastromattei on the Option (AZ 08.10.1939) [V].
  - The May 1940 issue ran "Rione Dux der halbländlichen Häuser" (AZ 15.05.1940, p. 5) [V].

### Inferences
- The BPI gallery is the key Italian-language repository. It holds the *Archivio per l'Alto Adige* (1906–1919), *Atesia Augusta* (1939–1943), *Il Piccolo Posto* (1922–1926) and *La Provincia di Bolzano* (1927–1941) [I].

### Gaps
- I did not find any of these online: "Bolzano fascista", "dieci anni di regime" volumes, industrial-zone brochures, Comune or Federazione yearbooks, or *La Provincia di Bolzano* almanacs. OPAC SBN and the Civica/Claudia Augusta OPACs were not queried (search budget exhausted, no time for their APIs).
- The 1923 and 1935 Prontuario editions, and later *Archivio per l'Alto Adige* volumes (1920–1943), were not located online.

## 5. Photographic archives in print

### Takeaway
What is online is scattered:
- **TCI/Digitouring:** a 1936 Giacomelli industrial-zone series [V].
- **Credits in the press:** the Bolzano press photographer "Foto Walsa" is credited in both the AZ and LPB, for example for the Rione Dux inauguration photo [V].
- **Europeana:** thin coverage (116 images of Bolzano/Bozen dated 1919–1943) [V].
- **Not verified this session:** Pedrotti, Foto Excelsior and the Archivio Storico Città di Bolzano photo collections.

### Cited Findings
- **"Foto Walsa" credits** [V]:
  - LPB 10.10.1939, p. 1: the Rione Dux gateway photo.
  - AZ 30.10.1939: the semirurali in Rione Dux.
  - AZ 25.12.1937: the traffic guard at Ponte Druso receiving Christmas gift parcels.
- **Europeana** (Bolzano/Bozen images dated 1919–1943: 116 items) [V]. Providers:
  - Biblioteca Digitale Trentina: 72, mostly Trentino postcards
  - Turin Civic Museums photo archive: 22
  - Deutsche Fotothek: e.g. "Bozen. Virgilbahn", 1943
  - Vorarlberg State Library
  - Istituto Luce: 2
- **"Pedrotti" images on Europeana** are almost all Biblioteca Digitale Trentina postcards of the Brenta and Fassa Dolomites (354). They are not Bolzano city views [V].
- **Digitouring 1936 Giacomelli series** (see section 2) [V].

### Inferences
- For "how Bolzano was pictured", the most efficient route is press photography as printed. Candidates are the LPB and AZ photo pages (credits Walsa), the Rivista Illustrata spreads (1928, 1937, 1940), and the Vie d'Italia Giacomelli plates. Searching standalone photo archives is less efficient [I].

### Gaps
- The Archivio Storico della Città di Bolzano photo collection, the Fratelli Pedrotti archive (Trento; probably at the Provincia autonoma di Trento or the Fondazione Museo storico), Foto Excelsior, and the Südtiroler Landesarchiv / Amt für Film und Medien photo database were not verified. The web-search budget was exhausted before these could be checked.
