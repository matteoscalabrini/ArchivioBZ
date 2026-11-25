// Sets the edit mode's password. The author types it twice in a Terminal window, where nothing is
// shown; its hash, never the password, goes into Vercel's environment as EDIT_PASSWORD_HASH for
// production and preview, with a new SESSION_SECRET beside it, so that every session opened with
// the old password ends; both as Secrets, which no one can read back (or the hash alone is printed,
// with --print). Run as `npm run password` in the author's own Terminal: without a terminal there
// is no way to keep what is typed from being shown, and it refuses.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../cloud/auth.mjs';

export const MIN_LENGTH = 12;
const ENVIRONMENTS = ['production', 'preview'];
const DEPLOY = 'library/.deploy';

// One line read from `input` in raw mode, so nothing is echoed. Enter ends it, Backspace takes
// back a character, Ctrl-C and Ctrl-D refuse, and so does the end of the input. `output` only gets
// the question and a line break.
export function readHidden(input, output, question) {
  return new Promise((resolve, reject) => {
    let typed = '';
    const wasRaw = input.isRaw;
    output.write(question);
    if (input.setRawMode) input.setRawMode(true);
    input.resume();
    const finish = () => {
      input.off('data', onData);
      input.off('end', onEnd);
      if (input.setRawMode) input.setRawMode(Boolean(wasRaw));
      input.pause();
      output.write('\n');
    };
    const onEnd = () => { finish(); reject(new Error('Stopped.')); };
    input.on('end', onEnd);
    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === '\r' || char === '\n') { finish(); resolve(typed); return; }
        if (char === '\u0003' || char === '\u0004') { finish(); reject(new Error('Stopped.')); return; }
        if (char === '\u007f' || char === '\b') typed = typed.slice(0, -1);
        else typed += char;
      }
    };
    input.on('data', onData);
  });
}

// The password typed twice, or an Error saying what is wrong with it.
export async function askPassword(input, output) {
  const first = await readHidden(input, output, `New password (at least ${MIN_LENGTH} characters): `);
  if (first.length < MIN_LENGTH) throw new Error(`A password needs at least ${MIN_LENGTH} characters.`);
  const second = await readHidden(input, output, 'Again: ');
  if (first !== second) throw new Error('The two entries differ.');
  return first;
}

const runVercel = (args, input) => spawnSync('vercel', args, { input, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });

// Sets one variable anew in an environment, as a Secret; the value goes on stdin, never in argv.
function setVariable(vercel, name, env, value) {
  // The variable may not exist yet; then removing it fails and that is fine.
  vercel(['env', 'rm', name, env, '--yes', '--cwd', DEPLOY]);
  const added = vercel(['env', 'add', name, env, '--sensitive', '--cwd', DEPLOY], value);
  if (added.status !== 0) throw new Error(`vercel env add ${name} failed for ${env}.`);
}

// The tool, given its terminal and its way to Vercel, so that the tests run it without either.
export async function setPassword({ input = process.stdin, output = process.stdout, log = console.log, vercel = runVercel, print = false } = {}) {
  if (!input.isTTY) throw new Error('There is no terminal to type the password in: run npm run password in a Terminal window.');
  const password = await askPassword(input, output);
  const hash = await hashPassword(password);
  if (print) { log(hash); return; }
  const secret = randomBytes(32).toString('base64');
  for (const env of ENVIRONMENTS) {
    setVariable(vercel, 'EDIT_PASSWORD_HASH', env, hash);
    log(`EDIT_PASSWORD_HASH set for ${env}.`);
  }
  for (const env of ENVIRONMENTS) {
    setVariable(vercel, 'SESSION_SECRET', env, secret);
    log(`SESSION_SECRET set anew for ${env}: the sessions opened with the old password end.`);
  }
  log('Deploy for it to take effect.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setPassword({ print: process.argv.includes('--print') }).catch((error) => { console.error(error.message); process.exit(1); });
}
