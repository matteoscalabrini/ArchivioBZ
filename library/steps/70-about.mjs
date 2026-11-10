// The About page, out/about.html: library/content/about.md in the long-read column, then the
// entries counted by type and a line of totals. Without about.md the counts stand alone.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { esc, page } from '../lib/shell.mjs';
import { renderMarkdown } from '../lib/longread.mjs';

export default async function about(ctx) {
  const { entries } = ctx.lib;
  let text = '';
  try {
    const file = path.join(ctx.root, 'library', 'content', 'about.md');
    text = renderMarkdown(await readFile(file, 'utf8'), { linkBase: path.dirname(file), root: ctx.root });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const byType = new Map();
  for (const entry of entries) byType.set(entry.type, (byType.get(entry.type) ?? 0) + 1);
  const types = [...byType].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const places = new Set(entries.map((entry) => entry.place).filter(Boolean)).size;
  const keywords = new Set(entries.flatMap((entry) => entry.keywords)).size;
  const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  const totals = [n(entries.length, 'entry', 'entries'), n(places, 'place', 'places'), n(keywords, 'keyword', 'keywords')].join(' · ');

  const body = `<article class="read about">
${text}
<h2>Entries by type</h2>
<table>
<thead><tr><th scope="col">Type</th><th scope="col">Entries</th></tr></thead>
<tbody>
${types.map(([type, count]) => `<tr><td>${esc(type)}</td><td>${count}</td></tr>`).join('\n')}
</tbody>
</table>
<p class="totals">${totals}</p>
</article>`;
  await ctx.write('about.html', page({ title: 'About', tab: 'about', body, css: ['web/read.css'] }));
}
