// Turns a Markdown file or a Word report into the HTML body of a long read.
// Nothing here trusts its input: raw HTML in Markdown is shown as text, and a link is kept only
// when it is an http(s) address, a #fragment or a path inside the repository.
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import mammoth from 'mammoth';
import { esc } from './shell.mjs';
import { sourceUrl } from './records.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const CACHE = path.resolve(HERE, '..', '.cache');
const CACHE_VERSION = 1;

// renderMarkdown(text, {linkBase, root, rowLink}) -> HTML.
// linkBase: absolute folder of the Markdown file, against which relative links resolve.
// root: the repository the /source/ addresses are relative to (default: this repository).
// rowLink: (address) -> {no, href, rec?} when the address is a row of the library ("row:5.01", or
// the address a row or a record of a held table has as its source), else nothing. Such a link
// leads to the library, and carries the row's number for the page's panel.
// For the web, where the originals under /source/ are not: held: (absPath) -> {no, href} when a
// row holds that file, else nothing, so the link leads to the row or is words; published:
// (absPath) -> the address a picture of the text is published at, or nothing: then it is its alt text.
export function renderMarkdown(text, options = {}) {
  const md = reader(options);
  const tokens = md.lexer(String(text));
  const first = tokens.findIndex((t) => t.type !== 'space');
  if (first >= 0 && tokens[first].type === 'heading' && tokens[first].depth === 1) tokens.splice(first, 1);
  return sheets(md.parser(tokens));
}

// renderParts(text, options) -> [{title, html}]. A text with two or more headings of the first
// level is in parts, each from its heading to the next, and the heading is the part's title.
// Any other text is one part with no title, rendered as renderMarkdown renders it.
export function renderParts(text, options = {}) {
  const md = reader(options);
  const tokens = md.lexer(String(text));
  const heads = tokens.flatMap((t, i) => (t.type === 'heading' && t.depth === 1 ? [i] : []));
  if (heads.length < 2) return [{ title: null, html: renderMarkdown(text, options) }];
  return heads.map((at, n) => {
    const body = tokens.slice(at + 1, heads[n + 1] ?? tokens.length);
    body.links = tokens.links; // what the lexer gathered for the whole text
    return { title: tokens[at].text.trim(), html: sheets(md.parser(body)) };
  });
}

function reader({ linkBase = REPO, root = REPO, rowLink, held, published } = {}) {
  return new Marked({
    gfm: true,
    renderer: {
      html: ({ text: raw }) => esc(raw),
      heading({ tokens, depth }) {
        const level = Math.max(2, depth); // the page's own title is the only h1
        return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const row = rowLink?.(String(href ?? '').trim());
        if (row) return `<a href="${esc(row.href)}" data-row="${esc(row.no)}"${row.rec == null ? '' : ` data-rec="${esc(row.rec)}"`}>${inner}</a>`;
        const to = resolveLink(href, linkBase, root);
        if (to?.abs && held) {
          const hit = held(to.abs);
          return hit ? `<a href="${esc(hit.href)}" data-row="${esc(hit.no)}">${inner}</a>` : inner;
        }
        if (!to) return inner;
        const attrs = `href="${esc(to.href)}"${title ? ` title="${esc(title)}"` : ''}${to.external ? ' target="_blank" rel="noopener"' : ''}`;
        return `<a ${attrs}>${inner}</a>`;
      },
      // A paragraph that opens with a held picture is a figure; what follows the picture in the
      // same paragraph is its caption.
      paragraph({ tokens }) {
        const [first, ...rest] = tokens;
        const picture = first?.type === 'image' ? this.parser.parseInline([first]) : '';
        if (!picture.startsWith('<img ')) return `<p>${this.parser.parseInline(tokens)}</p>\n`;
        const caption = this.parser.parseInline(rest).trim();
        return `<figure>${picture}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>\n`;
      },
      image({ href, title, text: alt }) {
        const to = resolveLink(href, linkBase, root);
        if (!to?.abs) return esc(alt); // nothing is fetched from the network
        const src = published ? published(to.abs) : to.href;
        if (!src) return esc(alt);
        return `<img src="${esc(src)}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ''}>`;
      },
    },
  });
}

// Each table goes in a strip of its own, <div class="sheet">: read.css lets the strip run wider
// than the text and scroll sideways where the table is wider than the page. A table inside a
// table stays in the outer one's strip.
export function sheets(html) {
  let depth = 0;
  return html.replace(/<(\/?)table\b[^>]*>/g, (tag, closing) => {
    if (!closing) return depth++ ? tag : `<div class="sheet">${tag}`;
    if (!depth) return tag;
    return --depth ? tag : `${tag}</div>`;
  });
}

function resolveLink(href, linkBase, root) {
  const url = String(href ?? '').trim();
  const bare = url.replace(/[\u0000- ]/g, '');
  if (/^https?:\/\/\S/i.test(bare)) return { href: url, external: true };
  if (bare.startsWith('#')) return { href: bare };
  if (!bare || /^[a-z][a-z\d+.-]*:/i.test(bare) || bare.startsWith('/') || bare.startsWith('\\')) return null;
  const cut = url.search(/[?#]/);
  const file = cut < 0 ? url : url.slice(0, cut);
  const tail = cut < 0 ? '' : url.slice(cut);
  let decoded = file;
  try {
    decoded = decodeURIComponent(file);
  } catch {}
  const abs = path.resolve(linkBase, decoded);
  const rel = path.relative(path.resolve(root), abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return { abs, href: sourceUrl(root, abs) + tail.replace(/[^\w\-.~!$&'()*+,;=:@/?#%]/g, encodeURIComponent) };
}

// renderDocx(absPath, {imageDir, imageUrl, cacheDir}) -> HTML.
// Each embedded image is written to imageDir as fig-<n>.<ext> and shown from imageUrl + name.
// The conversion (mammoth's output and the images) is cached in cacheDir, keyed on the file's path, size and modification time.
export async function renderDocx(absPath, { imageDir, imageUrl, cacheDir = CACHE }) {
  const { size, mtimeMs } = await stat(absPath);
  const key = createHash('sha256').update(JSON.stringify([CACHE_VERSION, path.resolve(absPath), size, mtimeMs])).digest('hex').slice(0, 24);
  const folder = path.join(cacheDir, `docx-${key}`);

  let cached = await readCache(folder);
  if (!cached) {
    const staging = `${folder}.${process.pid}.tmp`;
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    const names = [];
    const { value } = await mammoth.convertToHtml({ path: absPath }, {
      convertImage: mammoth.images.imgElement(async (image) => {
        const name = `fig-${names.length + 1}.${extension(image.contentType)}`;
        names.push(name);
        await writeFile(path.join(staging, name), await image.read());
        return { src: name, alt: image.altText ?? '' };
      }),
    });
    await writeFile(path.join(staging, 'body.html'), value);
    await writeFile(path.join(staging, 'images.json'), JSON.stringify(names));
    await rm(folder, { recursive: true, force: true });
    await rename(staging, folder);
    cached = await readCache(folder);
  }

  await mkdir(imageDir, { recursive: true });
  for (const name of cached.names) await cp(path.join(folder, name), path.join(imageDir, name));
  return tidyWord(cached.html).replace(/(<img [^>]*src=")(fig-\d+\.\w+)"/g, (_, head, name) => `${head}${esc(imageUrl)}${name}"`);
}

// The cached conversion, or null when the folder lacks its html or any figure it lists: then it is
// converted again and the folder replaced.
async function readCache(folder) {
  try {
    const names = JSON.parse(await readFile(path.join(folder, 'images.json'), 'utf8'));
    const html = await readFile(path.join(folder, 'body.html'), 'utf8');
    const figures = await Promise.all(names.map((name) => stat(path.join(folder, name))));
    return figures.every((figure) => figure.isFile()) ? { names, html } : null;
  } catch {
    return null;
  }
}

function extension(contentType = '') {
  const kind = contentType.split('/')[1]?.split('+')[0].replace(/^x-/, '') || 'bin';
  return kind === 'jpeg' ? 'jpg' : kind;
}

const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

// What a Word report needs to read well on a page: no contents block (its page numbers mean
// nothing here), no empty headings, figures in a single column with their captions, no title
// repeated as the first heading, no h1 below, each table in its strip.
export function tidyWord(html) {
  let out = html;
  // Figure grids are laid out as tables; the page shows each figure on its own.
  out = out.replace(/<table>[\s\S]*?<\/table>/g, (table) => {
    if (!table.includes('<img')) return table;
    return [...table.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]).join('');
  });
  out = out.replace(/<a id="[^"]*"><\/a>/g, '');
  // A heading that held only a bookmark, or nothing, is left with no text: it goes.
  out = out.replace(/<(h[1-6])>((?:(?!<\/\1>)[\s\S])*)<\/\1>/g, (whole, _tag, inner) => (textOf(inner) || /<img\b/i.test(inner) ? whole : ''));
  out = dropContents(out);
  // A report opens with a cover and then its own title as the first heading: the page has that.
  if (/^(?:(?!<h[1-6]>)[\s\S])*?<h1>/.test(out)) out = out.replace(/<h1>[\s\S]*?<\/h1>/, '');
  out = figures(out);
  return sheets(out.replace(/<(\/?)h1>/g, '<$1h2>'));
}

// "Figure 12. ..." in a paragraph of its own is the caption of the nearest image: the one just
// above it or, where the file puts the caption first, the one just below.
const CAPTION = '<p>((?:<em>)?Figure \\d+\\b[\\s\\S]*?)<\\/p>';
function figures(html) {
  const caption = (inner) => {
    const text = inner.trim();
    return /^<em>[\s\S]*<\/em>$/.test(text) && !text.slice(4, -5).includes('</em>') ? text.slice(4, -5).trim() : text;
  };
  return html
    .replace(new RegExp(`<p>(<img [^>]*>)</p>(?:${CAPTION})?`, 'g'),
      (_, img, inner) => `<figure>${img}${inner ? `<figcaption>${caption(inner)}</figcaption>` : ''}</figure>`)
    .replace(new RegExp(`${CAPTION}<figure>(<img [^>]*>)</figure>`, 'g'),
      (_, inner, img) => `<figure>${img}<figcaption>${caption(inner)}</figcaption></figure>`);
}

// A "Contents" heading or paragraph, and the link-only lines straight after it (or nothing at
// all), removed once. Everything else is returned byte for byte.
function dropContents(html) {
  let done = false;
  return html.replace(/<(p|h[1-6])>((?:(?!<\/\1>)[\s\S])*)<\/\1>((?:<p>(?:<a href="#[^"]*">(?:(?!<\/a>)[\s\S])*<\/a>)?<\/p>)*)/g, (whole, _tag, inner) => {
    if (done || !/^contents$/i.test(textOf(inner))) return whole;
    done = true;
    return '';
  });
}
