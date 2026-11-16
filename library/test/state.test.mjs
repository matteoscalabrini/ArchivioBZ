import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseState, formatState, matches, compare, pictureAt } from '../web/state.js';

const known = { keywords: new Set(['press', 'typeface']), kinds: new Set(['press', 'pictures']), rows: new Set(['5.01', '5.02', '5.21']) };

test('parseState drops an unknown keyword and unknown rows', () => {
  const state = parseState('#k=gone&o=5.01,77.77&s=date', { keywords: new Set(['press']), rows: new Set(['5.01']) });
  assert.deepEqual(state, { k: null, t: null, o: ['5.01'], s: 'date' });
});

test('parseState survives garbage', () => {
  for (const hash of ['#%%%', '', '#k', '#k=%E0%A4%A', '#o=&s=sideways', '#=&&=x', undefined]) {
    assert.deepEqual(parseState(hash, known), { k: null, t: null, o: [], s: 'no' }, String(hash));
  }
});

test('parseState reads a known keyword, keeps the order of open rows and drops repeats', () => {
  assert.deepEqual(parseState('#o=5.21,5.01,5.21&k=typeface', known), { k: 'typeface', t: null, o: ['5.21', '5.01'], s: 'no' });
  assert.deepEqual(parseState('k=press', known).k, 'press');
});

test('formatState round-trips', () => {
  const state = { k: 'typeface', t: null, o: ['5.21'], s: 'no' };
  assert.equal(formatState(state), '#k=typeface&o=5.21');
  assert.deepEqual(parseState(formatState(state), known), state);
  const sorted = { k: null, t: null, o: ['5.01', '5.02'], s: 'type' };
  assert.equal(formatState(sorted), '#o=5.01,5.02&s=type');
  assert.deepEqual(parseState(formatState(sorted), known), sorted);
  assert.equal(formatState({ k: null, o: [], s: 'no' }), '');
});

test('matches keeps every row without a keyword, and only rows carrying it with one', () => {
  const row = { kw: ['press', 'typeface'] };
  assert.equal(matches(row, { k: null, o: [], s: 'no' }), true);
  assert.equal(matches(row, { k: 'typeface', o: [], s: 'no' }), true);
  assert.equal(matches(row, { k: 'removal', o: [], s: 'no' }), false);
  assert.equal(matches({ kw: [] }, { k: 'press', o: [], s: 'no' }), false);
});

test('parseState reads a known kind beside a keyword and drops an unknown kind', () => {
  assert.deepEqual(parseState('#t=pictures&k=press', known), { k: 'press', t: 'pictures', o: [], s: 'no' });
  assert.equal(parseState('#t=gone', known).t, null);
  assert.equal(parseState('#t=press', { keywords: new Set(), rows: new Set() }).t, null, 'a page without kinds knows none');
});

test('formatState writes the kind after the keyword and round-trips', () => {
  const state = { k: 'typeface', t: 'press', o: ['5.21'], s: 'date' };
  assert.equal(formatState(state), '#k=typeface&t=press&o=5.21&s=date');
  assert.deepEqual(parseState(formatState(state), known), state);
  assert.equal(formatState({ k: null, t: 'pictures', o: [], s: 'no' }), '#t=pictures');
});

test('matches asks for the kind when one is set, and for keyword and kind together when both are', () => {
  const row = { kw: ['press', 'typeface'], kind: 'press' };
  assert.equal(matches(row, { k: null, t: 'press', o: [], s: 'no' }), true);
  assert.equal(matches(row, { k: null, t: 'pictures', o: [], s: 'no' }), false);
  assert.equal(matches(row, { k: 'typeface', t: 'press', o: [], s: 'no' }), true);
  assert.equal(matches(row, { k: 'removal', t: 'press', o: [], s: 'no' }), false);
  assert.equal(matches(row, { k: 'typeface', t: 'pictures', o: [], s: 'no' }), false);
  assert.equal(matches({ kw: [] }, { k: null, t: 'press', o: [], s: 'no' }), false, 'a row without a kind');
});

test('pictureAt steps one picture either way and stops at the first and the last', () => {
  assert.equal(pictureAt(0, 1, 6), 1);
  assert.equal(pictureAt(3, -1, 6), 2);
  assert.equal(pictureAt(0, -1, 6), 0, 'no step back from the first');
  assert.equal(pictureAt(5, 1, 6), 5, 'no step on from the last');
  assert.equal(pictureAt(5, -1, 6), 4);
  assert.equal(pictureAt(0, 1, 1), 0);
});

test('compare sorts 12.01 after 5.02 by number, and by year with number as tie-break', () => {
  const rows = [
    { no: '12.01', type: 'Reference', year: 1931 },
    { no: '5.02', type: 'Newspaper page', year: 1931 },
    { no: '5.10', type: 'Booklet', year: 2015 },
    { no: '5.03', type: 'Table', year: 1928 },
  ];
  const order = (key) => [...rows].sort((a, b) => compare(a, b, key)).map((r) => r.no);
  assert.deepEqual(order('no'), ['5.02', '5.03', '5.10', '12.01']);
  assert.deepEqual(order('date'), ['5.03', '5.02', '12.01', '5.10']);
  assert.deepEqual(order('type'), ['5.10', '5.02', '12.01', '5.03']);
  const sameType = [{ no: '12.01', type: 'Table', year: 1 }, { no: '5.02', type: 'Table', year: 1 }];
  assert.deepEqual(sameType.sort((a, b) => compare(a, b, 'type')).map((r) => r.no), ['5.02', '12.01']);
});
