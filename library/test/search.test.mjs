import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, words, parseQuery, prepare, search, family, near } from '../web/search.js';
import { INDEX } from './search-index.mjs';

// Folding and the query.

test('fold: case, accents and ß do not matter', () => {
  assert.equal(fold('Teßmann'), 'tessmann');
  assert.equal(fold('Romanità FÜHRER'), 'romanita fuhrer');
});

test('words keeps the place of each word', () => {
  assert.deepEqual(words('die Königin des Hochetsch').map((x) => [x.w, x.from, x.to]),
    [['die', 0, 3], ['konigin', 4, 11], ['des', 12, 15], ['hochetsch', 16, 25]]);
  assert.deepEqual(words('cable-car').map((x) => x.w), ['cable', 'car']);
});

test('parseQuery: small words go, unless they are all there is', () => {
  assert.deepEqual(parseQuery('Königin des Hochetsch', INDEX).map((t) => t.parts), [['konigin'], ['hochetsch']]);
  assert.deepEqual(parseQuery('the', INDEX).map((t) => t.parts), [['the']]);
});

test('parseQuery: nothing typed, only punctuation, markup', () => {
  for (const text of ['', '   ', '…', '""', '"']) assert.deepEqual(parseQuery(text, INDEX), [], JSON.stringify(text));
  assert.deepEqual(parseQuery('<b>&', INDEX).map((t) => t.parts), [['b']]);
});

test('parseQuery: a quoted phrase is one exact term; an open quote runs to the end', () => {
  const [term] = parseQuery('"Heim ins Reich"', INDEX);
  assert.deepEqual([term.parts, term.exact], [['heim', 'ins', 'reich'], true]);
  assert.deepEqual(parseQuery('"heim ins', INDEX).map((t) => t.parts), [['heim', 'ins']]);
});

test('parseQuery: punctuation inside a word keeps its parts together', () => {
  assert.deepEqual(parseQuery('5.02 Lana-Meran dell\'Alto', INDEX).map((t) => t.parts), [['5', '02'], ['lana', 'meran'], ['dell', 'alto']]);
});

test('parseQuery: a name brings the other names of its set, exact', () => {
  const [term] = parseQuery('monumento alla vittoria', INDEX);
  assert.equal(term.exact, true);
  assert.deepEqual(term.alts.map((a) => a.says), ['Monumento alla Vittoria', 'Siegesdenkmal', 'Victory Monument']);
  assert.deepEqual(parseQuery('Bozen', INDEX)[0].alts.map((a) => a.parts), [['bozen'], ['bolzano']]);
});

test('parseQuery: a colour in any language is that colour', () => {
  for (const typed of ['rosso', 'ROT', 'red']) assert.equal(parseQuery(typed, INDEX)[0].colour, 'red', typed);
  assert.equal(parseQuery('rosso', INDEX)[0].exact, true);
});

test('parseQuery: a glossary word brings the others as a possible road', () => {
  const [term] = parseQuery('funivia', INDEX);
  assert.equal(term.exact, false);
  assert.deepEqual(term.alts.map((a) => [a.says, a.road]), [['funivia', ''], ['cable car', 'glossary'], ['Seilbahn', 'glossary']]);
});

test('parseQuery: ae, oe, ue also stand as a, o, u', () => {
  assert.deepEqual(parseQuery('Fuehrer', INDEX)[0].alts.map((a) => a.parts), [['fuehrer'], ['fuhrer']]);
});

// Precise hits.

const e = prepare(INDEX);
const nos = (hits) => hits.map((hit) => hit.no);

test('a word in the hidden terms finds its row', () => {
  assert.deepEqual(nos(search(e, 'Hochetsch').precise), ['1.05']);
  assert.deepEqual(nos(search(e, 'Königin des Hochetsch').precise), ['1.05']);
});

test('case, accents, ß and ue do not matter', () => {
  for (const typed of ['Führer ruft', 'FUHRER RUFT', 'fuehrer ruft']) assert.deepEqual(nos(search(e, typed).precise), ['16.19'], typed);
});

test('a row number finds its row first; rows with one title stand together', () => {
  assert.equal(search(e, '1.10').precise[0].no, '1.10');
  assert.deepEqual(nos(search(e, 'Merano').precise), ['1.10', '1.11']);
});

test('a colour finds the same rows in three languages, the rows that hold it first', () => {
  for (const typed of ['rosso', 'rot', 'red']) assert.deepEqual(nos(search(e, typed).precise), ['1.05', '16.19', '0.01'], typed);
});

test('another name of the same thing is precise', () => {
  assert.deepEqual(nos(search(e, 'Bozen').precise), ['0.01', '1.05', '15.01']);
  assert.deepEqual(nos(search(e, 'Siegesdenkmal').precise), ['3.04', '5.03']);
});

test('a record of a table finds the table row', () => {
  assert.deepEqual(nos(search(e, 'teschio').precise), ['15.01']);
  assert.deepEqual(nos(search(e, 'teschio sciatori').precise), [], 'two records, not one');
});

test('every word must stand: together in the row, or in one paragraph of its read', () => {
  assert.deepEqual(nos(search(e, 'caricature invalids').precise), ['3.04']);
  assert.deepEqual(nos(search(e, 'red poster caricature').precise), ['0.01']);
});

test('a quoted phrase stands in that order or not at all', () => {
  assert.deepEqual(nos(search(e, '"heim ins reich"').precise), ['16.19']);
  assert.deepEqual(nos(search(e, '"ins heim"').precise), []);
});

test('nothing typed, nothing found', () => {
  assert.deepEqual(search(e, ''), { terms: 0, precise: [], possible: [] });
  assert.deepEqual(search(e, 'xyzzy'), { terms: 1, precise: [], possible: [] });
});

// Possible links.

test('family: a shared stem and short endings', () => {
  assert.equal(family('eagle', 'eagles'), true);
  assert.equal(family('meran', 'merano'), true);
  assert.equal(family('aquila', 'aquile'), true);
  assert.equal(family('post', 'posters'), false);
  assert.equal(family('1928', '19280'), false);
  assert.equal(family('eagle', 'eagle'), false);
  assert.equal(family('spinne', 'spinta'), false, 'four shared letters are a family only when they are the whole shorter word');
  assert.equal(family('rosso', 'rossi'), false);
  assert.equal(family('film', 'films'), true);
  assert.equal(family('film', 'filmato'), false);
});

test('near: one letter off in five to seven, two in eight or more', () => {
  assert.equal(near('furer', 'fuhrer'), true);
  assert.equal(near('fure', 'fuhre'), false);
  assert.equal(near('siegesdenkmahl', 'siegesdenkmal'), true);
  assert.equal(near('19281', '19282'), false);
});

test('the same word family is a possible link', () => {
  const found = search(e, 'Merano');
  assert.deepEqual(nos(found.possible), ['1.01']);
  assert.deepEqual(nos(search(e, 'eagle').precise), []);
  assert.deepEqual(nos(search(e, 'eagle').possible), ['5.05', '0.01'], 'the same road: the stronger source first');
});

test('another language is a possible link, through the glossary', () => {
  assert.deepEqual(search(e, 'vescovo').precise, []);
  assert.deepEqual(nos(search(e, 'vescovo').possible), ['5.03']);
  assert.deepEqual(nos(search(e, 'funivia').possible), ['1.12']);
  assert.deepEqual(nos(search(e, 'aquila').possible), ['5.05', '0.01'], 'the word family before the glossary');
});

test('a near spelling is a possible link', () => {
  assert.deepEqual(search(e, 'Furer').precise, []);
  assert.deepEqual(nos(search(e, 'Furer').possible), ['16.19']);
});

test('only some of the words: at least half, the fuller first', () => {
  assert.deepEqual(nos(search(e, 'caricature invalids').possible), ['0.01', '1.05']);
  assert.deepEqual(nos(search(e, 'caricature invalids xyzzy qwert').possible), ['3.04', '0.01']);
  assert.deepEqual(nos(search(e, 'caricature xyzzy qwert').possible), []);
});

test('a quoted phrase, a name and a colour take no loose road', () => {
  assert.deepEqual(search(e, '"Furer"').possible, []);
});

// Reasons.

const reasons = (typed, no, group = 'precise') => search(e, typed)[group].find((hit) => hit.no === no).reasons;

test('words on the thing: the phrase, the typed words marked', () => {
  assert.deepEqual(reasons('Königin des Hochetsch', '1.05'),
    [{ label: 'on it', text: 'die Königin des Hochetsch', marks: [[4, 11], [16, 25]], road: '' }]);
});

test('no reason when the words stand in the row\'s own line', () => {
  assert.deepEqual(reasons('Führer ruft', '16.19'), []);
});

test('a colour, a table record, a read paragraph', () => {
  assert.deepEqual(reasons('rosso', '1.05'), [{ label: 'colour', text: 'red', marks: [[0, 3]], road: '' }]);
  assert.deepEqual(reasons('teschio', '15.01'), [{ label: 'in its table', text: 'B0912 · Il teschio di Ötzi · 1936', marks: [[11, 18]], road: '' }]);
  assert.deepEqual(reasons('rot', '0.01'), [{ label: 'in the long read', text: 'A red poster and the caricature of 1926.', marks: [[2, 5]], road: '' }]);
});

test('another name: the typed one, even when the row\'s line holds the other', () => {
  assert.deepEqual(reasons('Bozen', '1.05'), [{ label: 'also called', text: 'Bozen', marks: [[0, 5]], road: '' }]);
});

test('the notes are never quoted: the word alone', () => {
  assert.deepEqual(reasons('aquila', '5.05', 'possible'), [{ label: 'in the notes', text: 'aquile', marks: [[0, 6]], road: 'same word family' }]);
});

test('loose roads are named', () => {
  assert.deepEqual(reasons('vescovo', '5.03', 'possible'), [{ label: 'shows', text: 'a bishop in mitre and vestments', marks: [[2, 8]], road: 'vescovo = bishop' }]);
  assert.deepEqual(reasons('funivia', '1.12', 'possible'), [{ label: 'shows', text: 'an orange cable-car cabin', marks: [[10, 19]], road: 'funivia = cable car' }]);
  assert.deepEqual(reasons('Furer', '16.19', 'possible'), [{ label: '', text: 'Führer', marks: [[0, 6]], road: 'near “Furer”' }]);
  assert.deepEqual(reasons('Merano', '1.01', 'possible'), [{ label: '', text: 'Meran', marks: [[0, 5]], road: 'same word family' }]);
});

test('a long string is cut to 90 characters around the word', () => {
  const long = { ...INDEX, rows: [{ no: '9.01', line: ['9.01', 'x'], text: [`${'lorem ipsum '.repeat(20)}Hochetsch ${'dolor sit '.repeat(20)}`] }] };
  const [reason] = search(prepare(long), 'hochetsch').precise[0].reasons;
  assert.ok(reason.text.length <= 92, reason.text);
  assert.match(reason.text, /^….*Hochetsch.*…$/);
  assert.equal(reason.text.slice(...reason.marks[0]), 'Hochetsch');
});

// Order among the rows whose own line holds what was typed.

test('a row whose number or whole title was typed stands before rows that merely hold the words', () => {
  const index = { v: 1, colours: {}, names: [], glossary: [], rows: [
    { no: '2.01', line: ['2.01', 'Views of Merano and Bolzano', 'Postcard', '1930', 'Merano'] },
    { no: '2.02', line: ['2.02', 'Merano', 'Poster', '1934'] },
    { no: '2.03', line: ['2.03', 'Merano', 'Poster', '1935'] },
    { no: '2.04', line: ['2.04', 'Bolzano from the 2.02 series', 'Poster', '1936'] },
  ] };
  const engine = prepare(index);
  assert.deepEqual(nos(search(engine, 'Merano').precise), ['2.02', '2.03', '2.01'], 'the keyword Merano on 2.01 is not its title');
  assert.deepEqual(nos(search(engine, 'merano').precise), ['2.02', '2.03', '2.01']);
  assert.deepEqual(nos(search(engine, '2.02').precise), ['2.02', '2.04']);
  assert.deepEqual(nos(search(engine, 'Views of Merano and Bolzano').precise), ['2.01']);
});

test('a colour: the rows that hold it stand before rows that only say the word', () => {
  const index = { v: 1, colours: { red: ['red', 'rosso'] }, names: [], glossary: [], rows: [
    { no: '3.01', line: ['3.01', 'A form'], shows: ['a yellow-red form'] },
    { no: '3.02', line: ['3.02', 'A poster'], colours: ['red'] },
    { no: '3.03', line: ['3.03', 'A wall'], facts: ['painted in rosso pompeiano'] },
  ] };
  const engine = prepare(index);
  assert.deepEqual(nos(search(engine, 'red').precise), ['3.02', '3.01', '3.03']);
  assert.deepEqual(nos(search(engine, 'rosso').precise), ['3.02', '3.03', '3.01'], 'after the colour, the word as typed');
});

test('a name as typed stands before rows that hold only its other names', () => {
  const index = { v: 1, colours: {}, names: [['Alto Adige', 'Hochetsch']], glossary: [], rows: [
    { no: '4.01', line: ['4.01', 'Guide to the Alto Adige'], facts: ['the Hochetsch of the German papers'] },
    { no: '4.02', line: ['4.02', 'A notice'], on: ['die Königin des Hochetsch'] },
    { no: '4.03', line: ['4.03', 'A map of the Alto Adige'] },
  ] };
  const engine = prepare(index);
  assert.deepEqual(nos(search(engine, 'Hochetsch').precise), ['4.02', '4.01', '4.03']);
  assert.deepEqual(search(engine, 'Hochetsch').precise[1].reasons, [{ label: 'in the notes', text: 'Hochetsch', marks: [[0, 9]], road: '' }], 'where the typed name stands, not the other one');
  assert.deepEqual(search(engine, 'Hochetsch').precise[2].reasons, [{ label: 'also called', text: 'Hochetsch', marks: [[0, 9]], road: '' }]);
  assert.deepEqual(nos(search(engine, 'Alto Adige').precise), ['4.01', '4.03', '4.02']);
});

// Found by the review of the whole change.

test('a glossary item of several words takes the glossary road too', () => {
  const index = { v: 1, colours: {}, names: [], glossary: [['blackshirt', 'camicia nera'], ['cable car', 'funivia']], rows: [
    { no: '6.01', line: ['6.01', 'A cover'], shows: ['a blackshirt in white breeches'] },
    { no: '6.02', line: ['6.02', 'A card'], facts: ['the funivia of the Colle'] },
  ] };
  const engine = prepare(index);
  assert.deepEqual(nos(search(engine, 'camicia nera').possible), ['6.01']);
  assert.equal(search(engine, 'camicia nera').possible[0].reasons[0].road, 'camicia nera = blackshirt');
  assert.deepEqual(nos(search(engine, 'cable car').possible), ['6.02']);
});

test('a hit through the place, the maker or the holder says so: the closed row does not show them', () => {
  const index = { v: 1, colours: {}, names: [], glossary: [], rows: [
    { no: '7.01', line: ['7.01', 'Elektrische Bahn', 'Poster', '1906'], place: ['Ponte Druso'], maker: ['Anton Reckziegel'], holder: ['Touriseum, Merano'],
      facts: ['by Anton Reckziegel, 1906'] },
  ] };
  const engine = prepare(index);
  assert.deepEqual(search(engine, 'Reckziegel').precise[0].reasons, [{ label: 'made by', text: 'Anton Reckziegel', marks: [[6, 16]], road: '' }]);
  assert.deepEqual(search(engine, 'touriseum').precise[0].reasons, [{ label: 'held by', text: 'Touriseum, Merano', marks: [[0, 9]], road: '' }]);
  assert.deepEqual(search(engine, 'druso').precise[0].reasons, [{ label: 'place', text: 'Ponte Druso', marks: [[6, 11]], road: '' }]);
});
