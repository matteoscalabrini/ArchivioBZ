// A small index in the format of search.json (lib/searchindex.mjs), shared by the tests of the
// search (web/search.js) and of what the page makes of its answer (web/results.js).
export const INDEX = {
  v: 1,
  colours: { red: ['red', 'rosso', 'rossa', 'rot'], blue: ['blue', 'blu', 'azzurro', 'blau'] },
  names: [['Bolzano', 'Bozen'], ['Monumento alla Vittoria', 'Siegesdenkmal', 'Victory Monument']],
  glossary: [['eagle', 'aquila', 'Adler'], ['cable car', 'funivia', 'Seilbahn'], ['bishop', 'vescovo', 'Bischof']],
  rows: [
    { no: '0.01', line: ['0.01', 'Fascist Bolzano: media and migration', 'Report', '2026'],
      read: ['The eagles of Ponte Druso and the invalids of 1925.', 'A red poster and the caricature of 1926.'] },
    { no: '1.01', line: ['1.01', 'Elektrische Bahn Lana–Meran', 'Poster', '1906', 'Posters'], shows: ['a castle on a cliff'] },
    { no: '1.05', line: ['1.05', 'Municipio di Bolzano – Cittadini! / Bürger!', 'Poster', '19 May 1925', 'Posters', 'Language'],
      on: ['die Königin des Hochetsch', 'Der Präfekturskommissär STEFFANINI'],
      shows: ['tricolour flags ordered for the visit of Italian war invalids'], colours: ['red', 'blue'],
      text: ['A bilingual notice of the municipality.'], facts: ['The notice calls the town die Königin des Hochetsch'] },
    { no: '1.10', line: ['1.10', 'Merano', 'Poster', '1934', 'Posters', 'Tourism'], on: ['MERANO', 'ENIT'], colours: ['blue'] },
    { no: '1.11', line: ['1.11', 'Merano', 'Poster', '1935', 'Posters', 'Tourism'], shows: ['an arched stone bridge'] },
    { no: '1.12', line: ['1.12', 'Ortisei – Val Gardena', 'Poster', '1935'], shows: ['an orange cable-car cabin', 'skiers'] },
    { no: '3.04', line: ['3.04', 'Alpenzeitung, 13 July 1926, page 1', 'Newspaper page', '13 July 1926', 'Press', 'Monumento alla Vittoria'],
      shows: ['a large caricature drawing', 'the blind president of the Italian war invalids'] },
    { no: '5.03', line: ['5.03', 'First stone of the Victory Monument', 'Photograph', '12 July 1926'], shows: ['a bishop in mitre and vestments'] },
    { no: '5.05', line: ['5.05', 'Ponte Druso with its eagles', 'Photograph', '1932–35', 'Ponte Druso'], facts: ['Le aquile were taken down in 1945'] },
    { no: '15.01', line: ['15.01', 'Luce newsreels on Bolzano, catalogue export', 'Table', '1928–43'],
      table: ['B0912 · Il teschio di Ötzi · 1936', 'B1004 · Sciatori a Ortisei · 1937'] },
    { no: '16.19', line: ['16.19', 'Klause, Der Führer ruft! Heim ins Reich!', 'Poster', '1939–40'], colours: ['red'] },
  ],
};
