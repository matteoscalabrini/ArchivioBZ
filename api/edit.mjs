// The edit mode's function. vercel.json rewrites /edit/ and /edit/<route> here as ?route=…;
// library/cloud/handlers.mjs answers the login, the Library drawn from the draft, and the requests
// the page sends. A publish deletes everything Vercel's edge holds under the tag `site`, at once
// and again five seconds later. A picture added goes from the browser to the private Blob store
// (BLOB_READ_WRITE_TOKEN) and is made into the site's two JPEGs in the public one
// (PICTURES_READ_WRITE_TOKEN): library/cloud/pictures.mjs, which loads sharp only when it makes them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitUntil } from '@vercel/functions';
import { makeStore } from '../library/cloud/store.mjs';
import { neonDb } from '../library/cloud/db.mjs';
import { loadLists } from '../library/cloud/render.mjs';
import { makeHandlers } from '../library/cloud/handlers.mjs';
import { deleteTag } from '../library/cloud/purge.mjs';
import { cloudStores } from '../library/cloud/pictures.mjs';

// The repository as the function holds it: library/content/*.json and library/map-data/dots.json
// reach it through vercel.json's includeFiles.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// What runs after the answer (the second purge of a publish), five seconds on; waitUntil keeps the
// function alive until it is done.
const LATER_MS = 5000;
const later = (task) => waitUntil(new Promise((resolve) => setTimeout(resolve, LATER_MS)).then(task));

// The two Blob stores of the pictures added. Without either token the edit page's ＋ picture is off
// and says "Adding pictures is off on this server.", its routes answer with what is missing, and
// the function's log says so once.
const { BLOB_READ_WRITE_TOKEN: ORIGINALS, PICTURES_READ_WRITE_TOKEN: PICTURES } = process.env;
if (!ORIGINALS || !PICTURES) console.warn('BLOB_READ_WRITE_TOKEN or PICTURES_READ_WRITE_TOKEN is not set: pictures cannot be added.');
const pictures = ORIGINALS && PICTURES ? cloudStores({ originals: ORIGINALS, pictures: PICTURES }) : null;

// Made once per instance and kept between its requests; the lists are read once.
const handlers = loadLists(ROOT).then((lists) => {
  for (const { level, where, message } of lists.problems) console.warn(`${level}: ${where}: ${message}`);
  return makeHandlers({
    store: makeStore(neonDb(process.env.DATABASE_URL)),
    env: { EDIT_PASSWORD_HASH: process.env.EDIT_PASSWORD_HASH, SESSION_SECRET: process.env.SESSION_SECRET },
    lists,
    pictures,
    purge: () => deleteTag('site'), // fails, rather than doing nothing, without the runtime's purge API
    later,
  });
});

export async function GET(request) {
  return (await handlers).edit(request);
}

export async function POST(request) {
  return (await handlers).edit(request);
}
