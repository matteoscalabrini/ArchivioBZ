import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteTag } from '../cloud/purge.mjs';

// @vercel/functions resolves a purge as done when the request's context has no purge API; a
// publish would then say Published while the edge kept the old pages for a year.
test('a purge without the runtime\'s purge API fails, and one with it goes through @vercel/functions', async () => {
  let removed = 0;
  await assert.rejects(deleteTag('site', { context: () => ({}), remove: async () => { removed++; } }), /no purge API/);
  assert.equal(removed, 0);
  await assert.rejects(deleteTag('site'), /no purge API/, 'outside a Vercel request there is none');

  const key = Symbol.for('@vercel/request-context');
  const asked = [];
  globalThis[key] = { get: () => ({ purge: { dangerouslyDeleteByTag: async (tag) => { asked.push(tag); } } }) };
  try {
    await deleteTag('site');
  } finally {
    delete globalThis[key];
  }
  assert.deepEqual(asked, ['site']);
});
