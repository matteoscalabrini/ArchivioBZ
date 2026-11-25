// The public site's function. vercel.json rewrites /, /index.html, /map.html, /about.html and
// /search.json here as ?path=…; library/cloud/handlers.mjs answers each from the files stored at
// the latest publish, and Vercel's edge keeps the answer until the next publish deletes it.
import { makeStore } from '../library/cloud/store.mjs';
import { neonDb } from '../library/cloud/db.mjs';
import { makeHandlers } from '../library/cloud/handlers.mjs';

// Made once per instance and kept between its requests. The public files need no lists.
const { site } = makeHandlers({ store: makeStore(neonDb(process.env.DATABASE_URL)), lists: null });

export async function GET(request) {
  return site(request);
}

// curl -I and link checkers ask with HEAD; the answer is GET's without its body.
export const HEAD = GET;
