// Deletes what Vercel's edge holds under a tag, from inside a function. @vercel/functions does it
// through the request's context, and when that context has no purge API it resolves as if it had
// done it (purge/index.js: `return Promise.resolve()`): a publish would then answer 200 while the
// old pages, a row hidden a minute ago among them, stayed at the edge for a year. Here it is a
// failure instead, which the author reads as "Published, but the public site may still show the
// old version." The context is found where @vercel/functions finds it (its get-context.js, which
// the package does not export); should that ever move, every purge fails and says so, never the
// other way round.
import { dangerouslyDeleteByTag } from '@vercel/functions';

const CONTEXT = Symbol.for('@vercel/request-context');
const requestContext = () => globalThis[CONTEXT]?.get?.() ?? {};

export async function deleteTag(tag, { context = requestContext, remove = dangerouslyDeleteByTag } = {}) {
  if (!context().purge) throw new Error(`no purge API in this request's context, so the edge still holds "${tag}"`);
  await remove(tag);
}
