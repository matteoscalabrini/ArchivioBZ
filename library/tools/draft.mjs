// How a session changes the archive: through the draft in the database, with the same version
// check edit mode uses, instead of editing records in files.
//   npm run draft -- status | pull [file] | push [file] | publish | discard | restore <id> | publishes  [--dev]
// `pull` writes { version, doc } (default library/.cache/draft.json); change `doc`, then `push`
// sends it back if the draft is still at that version. `publish` does what the Publish button does
// and then deletes the edge's copies. --dev works on the local draft (library/.cache/dev-db), and
// has nothing to purge.
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDoc, diffDocs } from '../cloud/doc.mjs';
import { loadLists, renderSite, summaryLine } from '../cloud/render.mjs';
import { ConflictError } from '../cloud/store.mjs';

const LIBRARY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_FILE = path.join(LIBRARY, '.cache', 'draft.json');
const USAGE = 'usage: npm run draft -- status | pull [file] | push [file] | publish | discard | restore <publish id> | publishes  [--dev]';
const conflictLine = (version) => `The draft changed since it was pulled (now version ${version}). Pull again.`;

export async function runDraft(args, { store, root, purge, out = console }) {
  const [command, arg] = args;
  const draft = await store.getDraft();
  if (!draft) { out.error('There is no draft yet.'); return 1; }
  const published = async () => (await store.latestPublish())?.doc ?? null;
  const summary = async (doc) => summaryLine(diffDocs(await published(), doc));
  try {
    switch (command) {
      case 'status':
        out.log(`Draft version ${draft.version}, saved ${new Date(draft.savedAt).toISOString()}`);
        out.log(await summary(draft.doc));
        return 0;
      case 'pull': {
        const file = path.resolve(arg ?? DEFAULT_FILE);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, `${JSON.stringify({ version: draft.version, doc: draft.doc }, null, 2)}\n`);
        out.log(`Pulled version ${draft.version} to ${file}`);
        return 0;
      }
      case 'push': {
        const file = path.resolve(arg ?? DEFAULT_FILE);
        const { version, doc } = JSON.parse(await readFile(file, 'utf8'));
        const problems = checkDoc(doc);
        if (problems.length) {
          for (const problem of problems) out.error(`  ${problem}`);
          out.error('Not pushed: the document has faults.');
          return 1;
        }
        const next = await store.saveDraft(doc, version);
        await writeFile(file, `${JSON.stringify({ version: next, doc }, null, 2)}\n`);
        out.log(`Pushed: the draft is now version ${next}`);
        out.log(await summary(doc));
        return 0;
      }
      case 'publish': {
        const { files, problems } = renderSite(draft.doc, await loadLists(root));
        const errors = problems.filter((problem) => problem.level === 'error');
        if (errors.length) {
          out.error(`Not published: ${errors.map(({ where, message }) => `${where}: ${message}`).join('; ')}.`);
          return 1;
        }
        for (const { where, message } of problems) out.error(`warning: ${where}: ${message}`);
        const line = await summary(draft.doc);
        const { id } = await store.publish(draft.version, files, line);
        out.log(`Published (publish ${id}): ${line}`);
        try {
          await purge();
        } catch (error) {
          out.error(`Published, but the edge's copies were not deleted: ${error.message}`);
          return 1;
        }
        return 0;
      }
      case 'discard':
        out.log(`Discarded: the draft is now version ${await store.discard(draft.version)}`);
        return 0;
      case 'restore':
        if (!arg) { out.error(USAGE); return 1; }
        out.log(`Restored publish ${arg}: the draft is now version ${await store.restore(Number(arg), draft.version)}`);
        return 0;
      case 'publishes':
        for (const row of await store.listPublishes()) out.log(`${row.id}\t${new Date(row.at).toISOString()}\t${row.kind}\t${row.summary ?? ''}`);
        return 0;
      default:
        out.error(USAGE);
        return 1;
    }
  } catch (error) {
    if (error instanceof ConflictError) { out.error(conflictLine(error.version)); return 1; }
    out.error(error.message);
    return 1;
  }
}

function startedAsScript() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dev = args.includes('--dev');
  const rest = args.filter((a) => a !== '--dev');
  let db;
  if (dev) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { pgliteDb } = await import('../cloud/db.mjs');
    db = pgliteDb(new PGlite(path.join(LIBRARY, '.cache', 'dev-db')));
  } else {
    if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (library/.deploy/.env.local); nothing done'); return 1; }
    const { neonDb } = await import('../cloud/db.mjs');
    db = neonDb(process.env.DATABASE_URL);
  }
  const { makeStore } = await import('../cloud/store.mjs');
  const store = makeStore(db);
  const purge = dev ? async () => {} : async () => {
    const result = spawnSync('vercel', ['cache', 'dangerously-delete', '--tag', 'site', '--yes', '--cwd', 'library/.deploy'], { stdio: 'inherit', cwd: path.dirname(LIBRARY) });
    if (result.status !== 0) throw new Error('vercel cache dangerously-delete failed');
  };
  try {
    return await runDraft(rest, { store, root: path.dirname(LIBRARY), purge });
  } finally {
    await db.end();
  }
}

if (startedAsScript()) process.exitCode = await main();
