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

// `! npm run password` in a session may have no terminal behind it: raw mode would not exist and
// the password would be echoed into the transcript. Run with a terminal, the tool sets the hash
// and a new session secret (so every session open ends with the old password) as Secrets.
test('the password tool refuses without a terminal, and sets the hash and a new session secret as secrets', async () => {
  const { setPassword } = await import('../tools/password.mjs');
  const { PassThrough } = await import('node:stream');
  const lines = [];
  const calls = [];
  const vercel = (args, input) => { calls.push({ args, input }); return { status: 0 }; };
  const piped = new PassThrough();
  await assert.rejects(setPassword({ input: piped, output: { write: () => {} }, log: (l) => lines.push(l), vercel }),
    /^Error: There is no terminal to type the password in: run npm run password in a Terminal window\.$/);
  assert.deepEqual(calls, []);

  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode() {} });
  const done = setPassword({ input, output: { write: () => {} }, log: (l) => lines.push(l), vercel });
  for (const line of ['correct horse battery', 'correct horse battery']) { await new Promise((r) => setImmediate(r)); input.write(`${line}\r`); }
  await done;
  // Each call answers every question the CLI (65.16.0) would otherwise ask on stdin, which the value
  // has used up: --yes skips "Git branch?" for preview (and so sets it for every preview branch),
  // --force replaces a value already there, so no `env rm` goes before it.
  const flags = (name, env) => ['env', 'add', name, '--environment', env, '--sensitive', '--yes', '--force', '--cwd', 'library/.deploy'];
  assert.deepEqual(calls.map((c) => c.args), [
    flags('EDIT_PASSWORD_HASH', 'production'), flags('EDIT_PASSWORD_HASH', 'preview'),
    flags('SESSION_SECRET', 'production'), flags('SESSION_SECRET', 'preview'),
  ]);
  const added = calls;
  const [hash] = added.map((c) => c.input);
  assert.ok(await verifyPassword('correct horse battery', hash));
  const secrets = added.filter((c) => c.args[2] === 'SESSION_SECRET').map((c) => c.input);
  assert.equal(secrets[0], secrets[1], 'one secret for both');
  assert.equal(Buffer.from(secrets[0], 'base64').length, 32);
  assert.ok(!lines.join('\n').includes(secrets[0]) && !lines.join('\n').includes('correct horse'), 'neither is printed');
});

test('the password tool stops when its input ends', async () => {
  const { askPassword } = await import('../tools/password.mjs');
  const { PassThrough } = await import('node:stream');
  const input = new PassThrough();
  const done = askPassword(input, { write: () => {} });
  input.end('half typ');
  await assert.rejects(done, /Stopped/);
});
