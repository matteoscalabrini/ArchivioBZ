// From what the search found (search.js) to what the Library page shows: the rows in their two
// groups, the words of the status line, and a reason as HTML. Pure functions, shared by
// library.js and the tests.
import { matches, compare } from './state.js';

export const POSSIBLE_SHOWN = 30; // possible links shown before the line that offers the rest

// What the list holds, in order. `rows` = [{ no, type, year, kw, kind }]; `found` = what search()
// answered, or null when nothing is searched. Items: { row, reasons }, { group, n }, { more }.
// A keyword and a kind narrow a search as they narrow the list; inside a group the rows stand as
// found, the strongest first, unless a column head was clicked. `searched` says whether a search
// was applied: what was typed may hold no word at all (a lone quotation mark), and that is none.
export function layout(rows, state, found, { allPossible = false } = {}) {
  const passing = rows.filter((row) => matches(row, state));
  if (!found?.terms) {
    const ordered = [...passing].sort((a, b) => compare(a, b, state.s));
    return { items: ordered.map((row) => ({ row: row.no, reasons: [] })), shown: ordered.length, precise: 0, possible: 0, searched: false };
  }
  const byNo = new Map(passing.map((row) => [row.no, row]));
  const group = (hits) => {
    const kept = hits.filter((hit) => byNo.has(hit.no));
    if (state.s && state.s !== 'no') kept.sort((a, b) => compare(byNo.get(a.no), byNo.get(b.no), state.s));
    return kept.map((hit) => ({ row: hit.no, reasons: hit.reasons }));
  };
  const precise = group(found.precise);
  const possible = group(found.possible);
  const showing = allPossible ? possible : possible.slice(0, POSSIBLE_SHOWN);
  const items = [];
  if (precise.length) items.push({ group: 'precise', n: precise.length }, ...precise);
  if (possible.length) items.push({ group: 'possible', n: possible.length }, ...showing);
  if (showing.length < possible.length) items.push({ more: possible.length - showing.length });
  return { items, shown: precise.length + showing.length, precise: precise.length, possible: possible.length, searched: true };
}

// The status line: what narrows the list, and how many rows that leaves. `narrowed` = the labels
// of the kind and the keyword chosen; `ready` = the index is there; `failed` = it could not be had.
export function summary({ total, shown, precise = 0, possible = 0, narrowed = [], q = '', ready = false, failed = false }) {
  const typed = String(q).trim();
  const what = [...narrowed, ...(typed ? [`“${typed}”`] : [])].join(' · ') || 'All entries';
  const all = `${total} ${total === 1 ? 'entry' : 'entries'}`;
  if (!typed) return { what, n: narrowed.length ? `${shown} of ${all}` : all };
  if (failed) return { what, n: 'the search is not available' };
  if (!ready) return { what, n: 'searching…' };
  return { what, n: [`${precise} precise`, possible ? `${possible} possible` : '', `of ${all}`].filter(Boolean).join(' · ') };
}

// One reason: 'on it: “die <b>Königin</b> des <b>Hochetsch</b>”', the road after it in brackets.
export function reasonHtml({ label, text, marks = [], road }) {
  let body = '';
  let at = 0;
  for (const [from, to] of marks) {
    body += `${esc(text.slice(at, from))}<b>${esc(text.slice(from, to))}</b>`;
    at = to;
  }
  body += esc(text.slice(at));
  if (label === 'on it') body = `“${body}”`;
  return `<span>${label ? `${esc(label)}: ` : ''}${body}${road ? ` (${esc(road)})` : ''}</span>`;
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
