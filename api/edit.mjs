// The edit mode's function. vercel.json rewrites /edit/ and /edit/<route> here as ?route=…;
// library/cloud/handlers.mjs answers the login, the Library drawn from the draft, and the requests
// the page sends. A publish deletes everything Vercel's edge holds under the tag `site`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dangerouslyDeleteByTag } from '@vercel/functions';
import { makeStore } from '../library/cloud/store.mjs';
import { neonDb } from '../library/cloud/db.mjs';
import { loadLists } from '../library/cloud/render.mjs';
import { makeHandlers } from '../library/cloud/handlers.mjs';

// The repository as the function holds it: library/content/*.json and library/map-data/dots.json
// reach it through vercel.json's includeFiles.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Made once per instance and kept between its requests; the lists are read once.
const handlers = loadLists(ROOT).then((lists) => {
  for (const { level, where, message } of lists.problems) console.warn(`${level}: ${where}: ${message}`);
  return makeHandlers({
    store: makeStore(neonDb(process.env.DATABASE_URL)),
    env: { EDIT_PASSWORD_HASH: process.env.EDIT_PASSWORD_HASH, SESSION_SECRET: process.env.SESSION_SECRET },
    lists,
    purge: () => dangerouslyDeleteByTag('site'),
  });
});

export async function GET(request) {
  return (await handlers).edit(request);
}

export async function POST(request) {
  return (await handlers).edit(request);
}
