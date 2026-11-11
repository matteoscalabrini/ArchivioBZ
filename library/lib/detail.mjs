// What an open row shows: its pictures or the first records of its table, its text, its facts and
// the one link at the bottom. Made here once, for the Library page (an open row) and for the Map
// page (a row in the panel), so that the two cannot drift apart.
import path from 'node:path';
import { esc } from './shell.mjs';

const CONFIDENCE = { read: 'Read in the source', secondary: 'From a secondary source', lead: 'Lead, not yet a fact' };
const NO_CONFIDENCE = new Set(['Report', 'Notes', 'Map']);
const READ = { Story: 'Read the full story →', Report: 'Read the report →', Notes: 'Read the notes →' };
const WEB = /^https?:\/\//i;

// The <div class="detail …"> of a row. `onMap`: for the Map page's panel, where the Place line is
// left out and a link to another row leads to the Library. What earlier steps add is optional:
// entry.pictures, entry.preview, entry.page; a place's `inside`.
export function rowDetail(entry, { ctx, places, onMap = false }) {
  const pictures = (Array.isArray(entry.pictures) ? entry.pictures : []).filter((p) => p?.src);
  const preview = !pictures.length && entry.preview?.rows?.length ? entry.preview : null;
  const text = entry.text.filter((p) => String(p).trim()).map((p) => `<p>${esc(p)}</p>`).join('');
  const txt = `<div class="txt">${text}${meta(entry, places, onMap)}${more(entry, ctx)}</div>`;
  return pictures.length ? `<div class="detail">${pictureBlock(pictures)}${txt}</div>`
    : preview ? `<div class="detail table">${previewTable(preview)}${txt}</div>`
    : `<div class="detail wide">${txt}</div>`;
}

// The first picture shows. With several, each picture has under it, above its caption, a line
// "← 2 / 6 →" whose arrows step to the picture before and after (web/pictures.js), the first's "←"
// and the last's "→" disabled. No `src` until the row opens: the page's script copies `data-src` across then.
function pictureBlock(pictures) {
  const count = pictures.length;
  const figures = pictures.map((picture, n) => {
    const size = Number.isInteger(picture.w) && Number.isInteger(picture.h) ? ` width="${picture.w}" height="${picture.h}"` : '';
    let image = `<img data-src="${esc(encodePath(picture.src))}" alt=""${size}>`;
    if (picture.original) image = `<a href="${esc(picture.original)}">${image}</a>`;
    const nav = count < 2 ? '' : '<p class="pic-nav">'
      + `<button type="button" data-step="-1" aria-label="Previous picture"${n === 0 ? ' disabled' : ''}>←</button>`
      + `<span class="pic-n">${n + 1} / ${count}</span>`
      + `<button type="button" data-step="1" aria-label="Next picture"${n === count - 1 ? ' disabled' : ''}>→</button>`
      + '</p>';
    const caption = picture.caption ? `<figcaption>${esc(picture.caption)}</figcaption>` : '';
    return `<figure${n ? ' hidden' : ''}>${image}${nav}${caption}</figure>`;
  });
  return `<div class="pics">${figures.join('')}</div>`;
}

function previewTable({ columns = [], rows, total }) {
  const head = columns.length ? `<thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : '';
  const body = rows.map((cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="recs"><caption>First ${rows.length} of ${total ?? rows.length} records</caption>${head}<tbody>${body}</tbody></table>`;
}

function meta(entry, places, onMap) {
  const lines = [];
  if (entry.holder) lines.push(['Holder', esc(entry.holder)]);
  if (entry.creator) lines.push(['Creator', esc(entry.creator)]);
  if (entry.rights) lines.push(['Rights', esc(entry.rights)]);
  if (entry.confidence && CONFIDENCE[entry.confidence.level] && !NO_CONFIDENCE.has(entry.type)) {
    lines.push(['Confidence', esc(confidence(entry.confidence))]);
  }
  const source = entry.source;
  if (source?.label || source?.url) {
    const words = esc(source.label || source.url);
    lines.push(['Source', WEB.test(source.url ?? '') ? external(source.url, words) : words]);
  }
  if (entry.place && !onMap) { // on the map the reader is at the place already
    const place = places?.[entry.place];
    const name = esc(place?.name ?? entry.place);
    const where = place?.inside === false ? 'beyond the map' : 'on the map';
    lines.push(['Place', `<a href="map.html#p=${esc(encodeURIComponent(entry.place))}">${name}, ${where} →</a>`]);
  }
  if (Array.isArray(entry.sources) && entry.sources.length) {
    const n = entry.sources.length;
    const links = entry.sources.map((no) => (onMap
      ? `<a href="index.html#o=${esc(encodeURIComponent(no))}">${esc(no)}</a>` // another row: in the Library
      : `<a href="#o=${esc(encodeURIComponent(no))}" data-jump="${esc(no)}">${esc(no)}</a>`));
    lines.push(['Sources', `${n} ${n === 1 ? 'row' : 'rows'}: ${links.join(', ')}`]);
  }
  if (!lines.length) return '';
  return `<dl class="meta">${lines.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join('')}</dl>`;
}

// "Read in the source; photographer unclear", or ". " before a note written as a sentence.
function confidence({ level, note }) {
  const words = CONFIDENCE[level];
  if (!note) return words;
  return `${words}${/^\p{Lu}/u.test(note) ? '. ' : '; '}${note}`;
}

// The one link at the bottom of an open row, by more.kind; more.label overrides the wording. A
// read or table row whose page was not written links the file it holds instead, or nothing.
function more(entry, ctx) {
  const kind = entry.more?.kind;
  const target = entry.more?.target;
  let href;
  let words;
  let away = false;
  if ((kind === 'read' || kind === 'table') && !entry.page) {
    return entry.abs ? link(ctx.sourceUrl(entry.abs), openWords(entry.abs)) : '';
  }
  if (kind === 'read') {
    href = encodePath(entry.page);
    words = READ[entry.type] ?? READ.Story;
  } else if (kind === 'file') {
    const file = typeof target === 'string' && target && !WEB.test(target) ? path.resolve(entry.dir, target) : entry.abs;
    if (!file) return '';
    href = ctx.sourceUrl(file);
    words = openWords(file);
  } else if (kind === 'table') {
    href = encodePath(entry.page);
    words = 'Open the full table →';
  } else if (kind === 'map') {
    href = 'map.html';
    words = 'Open the map →';
  } else if (kind === 'source') {
    href = [target, entry.source?.url].find((url) => typeof url === 'string' && WEB.test(url));
    if (!href) return '';
    words = 'Open the source →';
    away = true;
  } else {
    return '';
  }
  if (entry.more.label) words = entry.more.label;
  return link(href, words, away);
}

const link = (href, words, away = false) => `<a class="more" href="${esc(href)}"${away ? ' target="_blank" rel="noopener"' : ''}>${esc(words)}</a>`;
const openWords = (file) => (path.extname(file).toLowerCase() === '.pdf' ? 'Open the PDF →' : 'Open the file →');

const external = (url, words) => `<a href="${esc(url)}" target="_blank" rel="noopener">${words}</a>`;
export const encodePath = (relPath) => String(relPath).split('/').map(encodeURIComponent).join('/');
