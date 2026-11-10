// Long reads. For every row whose more.kind is 'read' and whose target is a Markdown or Word
// file: a page of its own, out/read/<no>.html, with the title, the whole text and, for a Story,
// the rows it rests on; entry.page names the page once it is written. A target that is missing,
// cannot be rendered or is neither Markdown nor Word is a warning, and that row gets no page.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { esc, page } from '../lib/shell.mjs';
import { renderDocx, renderMarkdown } from '../lib/longread.mjs';

const URL_LIKE = /^[a-z][a-z\d+.-]*:/i;

export default async function longreads(ctx) {
  const byNo = new Map(ctx.lib.entries.map((entry) => [entry.no, entry]));
  for (const entry of ctx.lib.entries) {
    if (entry.more?.kind !== 'read') continue;
    const target = entry.more.target;
    const where = path.relative(ctx.root, path.join(entry.dir, 'entries.json')).split(path.sep).join('/');
    const noPage = (message) => ctx.problems.push({ level: 'warn', where, message: `row ${entry.no}: ${message}, so it has no page` });
    if (typeof target !== 'string' || !target || URL_LIKE.test(target)) {
      noPage('no Markdown or Word file in more.target');
      continue;
    }
    const file = path.resolve(entry.dir, target);
    const name = path.relative(ctx.root, file).split(path.sep).join('/');
    if (!/\.(md|docx)$/i.test(file)) {
      noPage(`${name} is not Markdown or Word`);
      continue;
    }
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
      noPage(`${name} cannot be rendered (${err.code ?? err.message})`);
      continue;
    }
    const written = `read/${entry.no}.html`;
    await ctx.write(written, readPage(entry, body, byNo));
    entry.page = written;
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
    js: ['web/back.js'],
    body: `<a class="back" href="../index.html#o=${esc(encodeURIComponent(entry.no))}">← Library</a>
<h1>${esc(entry.title)}</h1>
<article class="read">
${body}${closing}
</article>`,
  });
}
