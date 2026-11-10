// Long reads. For every row whose more.kind is 'read' and whose target is a Markdown or Word
// file: a page of its own, out/read/<no>.html, with the title, the whole text and, for a Story,
// the rows it rests on. A file that cannot be rendered is a warning, and that row gets no page.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { esc, page } from '../lib/shell.mjs';
import { renderDocx, renderMarkdown } from '../lib/longread.mjs';

export default async function longreads(ctx) {
  const byNo = new Map(ctx.lib.entries.map((entry) => [entry.no, entry]));
  for (const entry of ctx.lib.entries) {
    const target = entry.more?.kind === 'read' ? entry.more.target : undefined;
    if (typeof target !== 'string' || !/\.(md|docx)$/i.test(target)) continue;
    const file = path.resolve(entry.dir, target);
    const where = path.relative(ctx.root, path.join(entry.dir, 'entries.json')).split(path.sep).join('/');
    const name = path.relative(ctx.root, file).split(path.sep).join('/');
    let body;
    try {
      if (/\.docx$/i.test(file)) {
        body = await renderDocx(file, {
          imageDir: path.join(ctx.out, 'read', 'img', entry.no),
          imageUrl: `img/${encodeURIComponent(entry.no)}/`,
        });
      } else {
        body = renderMarkdown(await readFile(file, 'utf8'), { linkBase: path.dirname(file), root: ctx.root });
      }
    } catch (err) {
      ctx.problems.push({ level: 'warn', where, message: `row ${entry.no}: ${name} cannot be rendered (${err.code ?? err.message}), so it has no page` });
      continue;
    }
    await ctx.write(`read/${entry.no}.html`, readPage(entry, body, byNo));
  }
}

function readPage(entry, body, byNo) {
  const sources = (entry.type === 'Story' ? entry.sources ?? [] : []).map((no) => byNo.get(no)).filter(Boolean);
  const closing = sources.length
    ? `\n<section class="sources"><h2>Sources</h2>\n<ul>\n${sources
      .map((row) => `<li><a href="../index.html#o=${esc(encodeURIComponent(row.no))}">${esc(row.no)} ${esc(row.title)}</a></li>`)
      .join('\n')}\n</ul></section>`
    : '';
  return page({
    title: entry.title,
    tab: 'library',
    depth: 1,
    css: ['web/read.css'],
    body: `<a class="back" href="../index.html#o=${esc(encodeURIComponent(entry.no))}">← Library</a>
<h1>${esc(entry.title)}</h1>
<article class="read">
${body}${closing}
</article>`,
  });
}
