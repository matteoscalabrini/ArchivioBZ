import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, makeSession, readSession, sessionCookie, clearedCookie, SESSION_MS } from '../cloud/auth.mjs';

test('the right password passes, a wrong one does not', async () => { const h = await hashPassword('correct horse battery'); assert.ok(await verifyPassword('correct horse battery', h)); assert.ok(!(await verifyPassword('correct horse batterY', h))); assert.match(h, /^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/); });
test('a session lasts 30 days and no longer', () => { const v = makeSession('s', 0); assert.ok(readSession(`archivio_edit=${v}`, 's', SESSION_MS - 1)); assert.ok(!readSession(`archivio_edit=${v}`, 's', SESSION_MS + 1)); });
test('a session signed with another secret, or altered, fails', () => { const v = makeSession('s', 0); assert.ok(!readSession(`archivio_edit=${v}`, 't', 1)); assert.ok(!readSession(`archivio_edit=9${v}`, 's', 1)); });
test('the cookie is locked down', () => assert.equal(sessionCookie('v'), 'archivio_edit=v; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000'));
test('a malformed stored hash is simply wrong', async () => assert.equal(await verifyPassword('x', 'nonsense'), false));

test('the local server leaves Secure out, and logging out clears the cookie', () => {
  assert.equal(sessionCookie('v', { secure: false }), 'archivio_edit=v; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000');
  assert.equal(clearedCookie(), 'archivio_edit=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  assert.equal(clearedCookie({ secure: false }), 'archivio_edit=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
});

test('the session is found among other cookies, and no header or secret is simply no session', () => {
  const v = makeSession('s', 0);
  assert.ok(readSession(`a=1; archivio_edit=${v}; b=2`, 's', 1));
  assert.ok(!readSession(null, 's', 1));
  assert.ok(!readSession('a=1', 's', 1));
  assert.ok(!readSession(`archivio_edit=${v}`, '', 1));
  assert.ok(!readSession('archivio_edit=garbage', 's', 1));
});

test('a stored hash with other costs or a wrong length is wrong, not a crash', async () => {
  const h = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', h.replace('$16384$', '$8$')), false);
  assert.equal(await verifyPassword('correct horse battery', h.replace(/\$[^$]+$/, '$AAAA')), false);
  assert.equal(await verifyPassword('correct horse battery', undefined), false);
});

test('two hashes of one password differ by their salt', async () => {
  assert.notEqual(await hashPassword('same'), await hashPassword('same'));
});

test('the password tool reads without echo, refuses a short or differing pair, and never prints the password', async () => {
  const { askPassword } = await import('../tools/password.mjs');
  const { PassThrough } = await import('node:stream');
  const run = async (lines) => {
    const input = new PassThrough();
    const chunks = [];
    const done = askPassword(input, { write: (s) => chunks.push(s) });
    done.catch(() => {});
    for (const line of lines) { await new Promise((r) => setImmediate(r)); input.write(`${line}\r`); }
    return { done, shown: () => chunks.join('') };
  };
  const ok = await run(['correct horse battery', 'correct horse battery']);
  assert.equal(await ok.done, 'correct horse battery');
  assert.ok(!ok.shown().includes('correct horse'));
  await assert.rejects((await run(['short'])).done, /at least 12/);
  await assert.rejects((await run(['correct horse battery', 'correct horse batterY'])).done, /differ/);
});
