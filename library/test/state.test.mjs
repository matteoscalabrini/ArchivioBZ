import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseState, formatState, matches, compare } from '../web/state.js';

const known = { keywords: new Set(['press', 'typeface']), rows: new Set(['5.01', '5.02', '5.21']) };

test('parseState drops an unknown keyword and unknown rows', () => {
  const state = parseState('#k=gone&o=5.01,77.77&s=date', { keywords: new Set(['press']), rows: new Set(['5.01']) });
  assert.deepEqual(state, { k: null, o: ['5.01'], s: 'date' });
});

test('parseState survives garbage', () => {
  for (const hash of ['#%%%', '', '#k', '#k=%E0%A4%A', '#o=&s=sideways', '#=&&=x', undefined]) {
    assert.deepEqual(parseState(hash, known), { k: null, o: [], s: 'no' }, String(hash));
  }
});

test('parseState reads a known keyword, keeps the order of open rows and drops repeats', () => {
  assert.deepEqual(parseState('#o=5.21,5.01,5.21&k=typeface', known), { k: 'typeface', o: ['5.21', '5.01'], s: 'no' });
  assert.deepEqual(parseState('k=press', known).k, 'press');
});

test('formatState round-trips', () => {
  const state = { k: 'typeface', o: ['5.21'], s: 'no' };
  assert.equal(formatState(state), '#k=typeface&o=5.21');
  assert.deepEqual(parseState(formatState(state), known), state);
  const sorted = { k: null, o: ['5.01', '5.02'], s: 'type' };
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
