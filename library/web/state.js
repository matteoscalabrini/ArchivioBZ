// The Library's state as it lives in the address: #k=<keyword id>&t=<kind id>&o=<no,no>&s=<no|type|date>,
// and which of a row's pictures a step leads to. Pure functions, shared by library.js and the tests.

const SORTS = ['no', 'type', 'date'];

// `known` = {keywords: Set, kinds: Set, rows: Set}. Anything unknown or unreadable is dropped; never
// throws. A page without kinds leaves `known.kinds` out.
export function parseState(hash, known) {
  const state = { k: null, t: null, o: [], s: 'no' };
  const values = new Map();
  for (const part of String(hash ?? '').replace(/^#/, '').split('&')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const value = decode(part.slice(at + 1));
    if (value !== null) values.set(part.slice(0, at), value);
  }
  const k = values.get('k');
  if (k && known.keywords.has(k)) state.k = k;
  const t = values.get('t');
  if (t && known.kinds?.has(t)) state.t = t;
  const o = values.get('o');
  if (o) state.o = [...new Set(o.split(','))].filter((no) => known.rows.has(no));
  const s = values.get('s');
  if (SORTS.includes(s)) state.s = s;
  return state;
}

// '#k=…&t=…&o=…&s=…', leaving out what is at its default; '' for the default state.
export function formatState(state) {
  const parts = [];
  if (state.k) parts.push(`k=${encodeURIComponent(state.k)}`);
  if (state.t) parts.push(`t=${encodeURIComponent(state.t)}`);
  if (state.o?.length) parts.push(`o=${state.o.map(encodeURIComponent).join(',')}`);
  if (state.s && state.s !== 'no') parts.push(`s=${encodeURIComponent(state.s)}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

// row = {kw: [keyword ids], kind: kind id or undefined}. A keyword and a kind narrow together.
export function matches(row, state) {
  return (!state.k || row.kw.includes(state.k)) && (!state.t || row.kind === state.t);
}

// rows = {no, type, year}; key 'no', 'type' or 'date'. Ties fall back to number order.
export function compare(a, b, key) {
  if (key === 'type') return a.type.localeCompare(b.type, 'en') || byNumber(a, b);
  if (key === 'date') return a.year - b.year || byNumber(a, b);
  return byNumber(a, b);
}

// The picture `step` places on from `index` among `count`, held at the first and the last.
export function pictureAt(index, step, count) {
  return Math.min(count - 1, Math.max(0, index + step));
}

function byNumber(a, b) {
  const [aSection, aRunning] = a.no.split('.').map(Number);
  const [bSection, bRunning] = b.no.split('.').map(Number);
  return aSection - bSection || aRunning - bRunning;
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
