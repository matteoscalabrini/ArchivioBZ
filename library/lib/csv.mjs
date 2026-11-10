// CSV as RFC 4180 writes it: commas, quoted cells holding commas, doubled quotes and line breaks,
// CRLF or LF. A leading BOM is dropped, a missing final line break accepted, blank lines at the
// end ignored. The first record gives the column names.
export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');
  const records = [];
  let record = [];
  let cell = '';
  let quoted = false; // inside a quoted cell
  let fresh = true; // nothing read yet for this cell

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (s[i + 1] === '"') cell += s[++i];
      else quoted = false;
    } else if (c === '"' && fresh) {
      quoted = true;
      fresh = false;
    } else if (c === ',') {
      record.push(cell);
      cell = '';
      fresh = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
      fresh = true;
    } else {
      cell += c;
      fresh = false;
    }
  }
  if (!fresh || record.length) {
    record.push(cell);
    records.push(record);
  }
  while (records.length && records.at(-1).length === 1 && records.at(-1)[0] === '') records.pop();

  const [columns = [], ...rows] = records;
  return { columns, rows };
}
