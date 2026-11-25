// The About page, out/about.html, made by aboutPage (lib/pages.mjs) from the library and
// library/content/about.md, read here. Without about.md the counts stand alone.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderMarkdown } from '../lib/longread.mjs';
import { aboutPage } from '../lib/pages.mjs';

export default async function about(ctx) {
  let aboutHtml = '';
  try {
    const file = path.join(ctx.root, 'library', 'content', 'about.md');
    aboutHtml = renderMarkdown(await readFile(file, 'utf8'), { linkBase: path.dirname(file), root: ctx.root });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await ctx.write('about.html', aboutPage(ctx.lib, { aboutHtml }));
}
