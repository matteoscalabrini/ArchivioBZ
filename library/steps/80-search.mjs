// The search index, out/search.json: for every row its own line, the hidden terms of its
// find.json, its text, its notes, the records of its table and the paragraphs of its read, with
// the colours' names, the sets of names and the glossary (lib/searchindex.mjs). web/library.js
// fetches it when the search field is first used; web/search.js searches it.
//
// Runs after the tables (entry.records) and the long reads (entry.pages).
import { searchIndex } from '../lib/searchindex.mjs';

export default async function search(ctx) {
  await ctx.write('search.json', JSON.stringify(searchIndex(ctx.lib)));
}
