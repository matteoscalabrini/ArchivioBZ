// The idea, from library/content/idea.md: ctx.idea = {html, keywords, standin}, or null when there
// is no such file. An unknown keyword is an error; a marked keyword that no row carries, a warning;
// a stand-in, a warning too unless the build is for presenting (--present), which leaves it out.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseIdea } from '../lib/idea.mjs';

export default async function idea(ctx) {
  const file = path.join(ctx.root, 'library', 'content', 'idea.md');
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    ctx.idea = null;
    return;
  }

  const where = path.relative(ctx.root, file).split(path.sep).join('/');
  const { html, keywords, standin, problems } = parseIdea(text, ctx.lib);
  for (const { level, message } of problems) ctx.problems.push({ level, where, message });
  const carried = new Set(ctx.lib.entries.flatMap((entry) => entry.keywords));
  for (const id of keywords) {
    if (!carried.has(id)) ctx.problems.push({ level: 'warn', where, message: `marked keyword "${id}" is on no row` });
  }
  if (standin && !ctx.options?.present) {
    ctx.problems.push({ level: 'warn', where, message: 'the idea is a stand-in; build with --present for a showing' });
  }
  ctx.idea = { html, keywords, standin };
}
