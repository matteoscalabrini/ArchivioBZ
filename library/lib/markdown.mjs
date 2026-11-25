// Turns Markdown into HTML: About, and the text of a long read. Nothing here trusts its input:
// raw HTML in Markdown is shown as text, and a link is kept only when it is an http(s) address, a
// #fragment or a path inside the repository. Apart from longread.mjs, which adds Word reports,
// because the cloud's functions draw About with this and must not load mammoth (a devDependency,
// which a function's install may leave out).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { esc } from './shell.mjs';
import { sourceUrl } from './records.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
