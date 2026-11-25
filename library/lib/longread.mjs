// Turns a Markdown file or a Word report into the HTML body of a long read. The Markdown half is
// markdown.mjs, re-exported here; this file adds Word, through mammoth, which only the build loads.
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { esc } from './shell.mjs';
import { sheets } from './markdown.mjs';

export { renderMarkdown, renderParts, sheets } from './markdown.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.resolve(HERE, '..', '.cache');
const CACHE_VERSION = 1;

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
