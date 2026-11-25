// The Library page, out/index.html, made by libraryPage (lib/pages.mjs) from the library, the
// idea (ctx.idea, from the idea step) and the kinds of entry, read here from
// library/content/kinds.json. A build for presenting (--present) leaves a stand-in idea out.
import { libraryPage } from '../lib/pages.mjs';
import { readKinds } from '../lib/kinds.mjs';

export default async function library(ctx) {
  const { kinds, problems } = await readKinds(ctx.root);
  ctx.problems.push(...problems);
  const made = libraryPage(ctx.lib, { idea: ctx.idea, kinds, present: Boolean(ctx.options?.present), sourceUrl: ctx.sourceUrl });
  ctx.problems.push(...made.problems);
  await ctx.write('index.html', made.html);
}
