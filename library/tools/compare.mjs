// The check before the first Publish (design §10): the draft, drawn as the public site, against the
// site online as a static build left it (npm run draft -- compare <folder>). Both Library pages are
// read row by row, by what a reader sees of a row apart from its number and its chapter, which the
// move means to change, and its pictures' addresses, which it moves: the id (data-no), the title,
// the text, how many pictures, the keywords and the place. Both pages are drawn by lib/pages.mjs,
// so the same row reads the same on both sides; the words are compared as the page escapes them
// and shown unescaped. It compares the draft with any static build folder, and npm run draft, the README and the draft CLI test depend on it, so it stays.

const ARTICLE = /<article class="row" data-no="([^"]+)"([^>]*)>([\s\S]*?)<\/article>/g;
const UNESCAPE = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unescape = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (e) => UNESCAPE[e]);

// The rows of a Library page, in its order: id -> { title, text: [paragraphs], pictures, keywords, place }.
export function rowsOf(html) {
  const rows = new Map();
  for (const [, id, attrs, body] of html.matchAll(ARTICLE)) {
    const txt = /<div class="txt">([\s\S]*?)(?:<dl class="meta">|<a class="more"|<\/div>)/.exec(body)?.[1] ?? '';
    rows.set(unescape(id), {
      title: unescape(/<h2 class="c-title"><button [^>]*>([^<]*)<\/button>/.exec(body)?.[1] ?? ''),
      text: [...txt.matchAll(/<p>([^<]*)<\/p>/g)].map((m) => unescape(m[1])),
      pictures: (body.match(/<figure[ >]/g) ?? []).length,
      keywords: unescape(/ data-kw="([^"]*)"/.exec(attrs)?.[1] ?? ''),
      place: decodeURIComponent(/<dt>Place<\/dt><dd><a href="[^"#]*#p=([^"]+)"/.exec(body)?.[1] ?? ''),
    });
  }
  return rows;
}

const shown = (value) => {
  const words = JSON.stringify(value);
  return words.length > 72 ? `${words.slice(0, 70)}…"` : words;
};

// What differs between a row there (online) and here (the draft), as phrases, none when alike.
function differences(there, here) {
  const said = [];
  const pair = (what, a, b) => `${what}: ${a} there, ${b} in the draft`;
  if (there.title !== here.title) said.push(pair('title', shown(there.title), shown(here.title)));
  const at = Array.from({ length: Math.max(there.text.length, here.text.length) }, (_, i) => i).find((i) => there.text[i] !== here.text[i]);
  if (at !== undefined) {
    const paragraph = (text) => (at < text.length ? shown(text[at]) : 'none');
    said.push(pair(`text, paragraph ${at + 1}`, paragraph(there.text), paragraph(here.text)));
  }
  if (there.pictures !== here.pictures) said.push(pair('pictures', there.pictures, here.pictures));
  if (there.keywords !== here.keywords) said.push(pair('keywords', shown(there.keywords), shown(here.keywords)));
  if (there.place !== here.place) said.push(pair('place', there.place ? shown(there.place) : 'none', here.place ? shown(here.place) : 'none'));
  return said;
}

// The lines that say how the Library page online (`thereHtml`) and the draft's (`hereHtml`) differ,
// with the count last, and how many rows differ.
export function compareRows(thereHtml, hereHtml, { where }) {
  const there = rowsOf(thereHtml);
  const here = rowsOf(hereHtml);
  const both = (rows, other) => [...rows.keys()].filter((id) => other.has(id));
  const sameOrder = both(there, here).join('\n') === both(here, there).join('\n');
  const lines = [`Compared with ${where}: ${there.size} rows there, ${here.size} in the draft drawn as the public site, in ${sameOrder ? 'the same' : 'another'} order.`];
  let differ = 0;
  const say = (id, words) => { differ += 1; lines.push(`  ${id}  ${words}`); };
  for (const [id, row] of there) {
    if (!here.has(id)) say(id, 'only there: hidden or removed in the draft');
    else {
      const said = differences(row, here.get(id));
      if (said.length) say(id, said.join('; '));
    }
  }
  for (const id of here.keys()) if (!there.has(id)) say(id, 'only in the draft');
  lines.push(differ ? `${differ} ${differ === 1 ? 'row differs' : 'rows differ'}.` : 'No row differs.');
  return { lines, differ };
}
