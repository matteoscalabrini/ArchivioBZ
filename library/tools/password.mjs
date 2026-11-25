// Sets the edit mode's password. The author types it twice in the terminal, where nothing is
// shown; its hash, never the password, goes into Vercel's environment as EDIT_PASSWORD_HASH for
// production and preview (or is printed with --print). Run as `! npm run password`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../cloud/auth.mjs';

export const MIN_LENGTH = 12;
const ENVIRONMENTS = ['production', 'preview'];
const DEPLOY = 'library/.deploy';

// One line read from `input` in raw mode, so nothing is echoed. Enter ends it, Backspace takes
// back a character, Ctrl-C and Ctrl-D refuse. `output` only gets the question and a line break.
export function readHidden(input, output, question) {
  return new Promise((resolve, reject) => {
    let typed = '';
    const wasRaw = input.isRaw;
    output.write(question);
    if (input.setRawMode) input.setRawMode(true);
    input.resume();
    const finish = () => {
      input.off('data', onData);
      if (input.setRawMode) input.setRawMode(Boolean(wasRaw));
      input.pause();
      output.write('\n');
    };
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

const vercel = (args, input) => spawnSync('vercel', args, { input, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });

async function main() {
  const password = await askPassword(process.stdin, process.stdout);
  const hash = await hashPassword(password);
  if (process.argv.includes('--print')) { console.log(hash); return; }
  for (const env of ENVIRONMENTS) {
    // The variable may not exist yet; then removing it fails and that is fine.
    vercel(['env', 'rm', 'EDIT_PASSWORD_HASH', env, '--yes', '--cwd', DEPLOY]);
    const added = vercel(['env', 'add', 'EDIT_PASSWORD_HASH', env, '--cwd', DEPLOY], hash);
    if (added.status !== 0) throw new Error(`vercel env add failed for ${env}.`);
    console.log(`EDIT_PASSWORD_HASH set for ${env}.`);
  }
  console.log('Deploy for it to take effect.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
