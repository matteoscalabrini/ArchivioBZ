// How a session changes the archive: through the draft in the database, with the same version
// check edit mode uses, instead of editing records in files.
//   npm run draft -- status | pull [file] | push [file] | publish | discard | restore <id> | publishes
//                     | rerender | unlock | compare <folder>  [--dev]
// `pull` writes { version, doc } (default library/.cache/draft.json); change `doc`, then `push`
// sends it back if the draft is still at that version. `publish` does what the Publish button does
// and then deletes the edge's copies. `rerender` draws the public files again from the latest
// publish (after a deploy of new page code), the draft untouched, and deletes the edge's copies.
// `unlock` forgets the failed logins, when more than ten in fifteen minutes refuse every login.
// `compare` draws the draft as the public site and compares its rows with the Library page of a
// static build in <folder> (the site online until the first Publish), row by row (tools/compare.mjs),
// and fails when any differs: the check before the first Publish (design §10).
// --dev works on the local draft (library/.cache/dev-db), and has nothing to purge.
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDoc, raiseCounters } from '../cloud/doc.mjs';
import { loadLists, renderSite, renderEditPage, summaryOf, publishLine } from '../cloud/render.mjs';
import { ConflictError } from '../cloud/store.mjs';
import { compareRows } from './compare.mjs';

const LIBRARY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_FILE = path.join(LIBRARY, '.cache', 'draft.json');
const USAGE = 'usage: npm run draft -- status | pull [file] | push [file] | publish | discard | restore <publish id> | publishes | rerender | unlock | compare <static folder>  [--dev]';
// The commands that work without a draft.
const NO_DRAFT = ['publishes', 'rerender', 'unlock'];
const conflictLine = (version) => `The draft changed since it was pulled (now version ${version}). Pull again.`;

export async function runDraft(args, { store, root, purge, out = console }) {
  const [command, arg] = args;
  const draft = NO_DRAFT.includes(command) ? null : await store.getDraft();
  if (!draft && !NO_DRAFT.includes(command)) { out.error('There is no draft yet.'); return 1; }
  const published = async () => (await store.latestPublish())?.doc ?? null;
  const summary = async (doc) => summaryOf(await published(), doc);
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
        const pulled = JSON.parse(await readFile(file, 'utf8'));
        const { version } = pulled;
        const problems = checkDoc(pulled.doc);
        if (problems.length) {
          for (const problem of problems) out.error(`  ${problem}`);
          out.error('Not pushed: the document has faults.');
          return 1;
        }
        // The draft's counters where they are higher: a push never gives an id again.
        const doc = raiseCounters(pulled.doc, draft.doc);
        // Drawn once as edit mode and as a publish would draw it, so that nothing is pushed that
        // would stop the edit page or the Publish button.
        const refusal = drawn(doc, await published(), await loadLists(root));
        if (refusal) {
          out.error(`Not pushed: ${refusal}.`);
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
        const line = publishLine(await published(), draft.doc);
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
      case 'rerender': {
        const latest = await store.latestPublish();
        if (!latest) { out.error('Nothing has been published yet.'); return 1; }
        const { files, problems } = renderSite(latest.doc, await loadLists(root));
        const errors = problems.filter((problem) => problem.level === 'error');
        if (errors.length) {
          out.error(`Not drawn: ${errors.map(({ where, message }) => `${where}: ${message}`).join('; ')}.`);
          return 1;
        }
        await store.rewriteSite(latest.id, files);
        out.log(`Drawn again from publish ${latest.id}; the draft is as it was.`);
        try {
          await purge();
        } catch (error) {
          out.error(`Drawn again, but the edge's copies were not deleted: ${error.message}`);
          return 1;
        }
        return 0;
      }
      case 'compare': {
        if (!arg) { out.error(USAGE); return 1; }
        const where = path.join(path.resolve(arg), 'index.html');
        let there;
        try {
          there = await readFile(where, 'utf8');
        } catch {
          out.error(`There is no index.html in ${path.resolve(arg)}.`);
          return 1;
        }
        const here = renderSite(draft.doc, await loadLists(root)).files.get('index.html').body;
        const { lines, differ } = compareRows(there, here, { where });
        for (const line of lines) out.log(line);
        return differ ? 1 : 0;
      }
      case 'unlock':
        out.log(`Logins unlocked: ${await store.clearLoginFailures()} failed tries cleared.`);
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

// Why the pages cannot be drawn from `doc`, or null when both can: the edit page, and the public
// files without an error.
function drawn(doc, published, lists) {
  try {
    renderEditPage(doc, { version: 0, published, lists });
    const errors = renderSite(doc, lists).problems.filter((problem) => problem.level === 'error');
    return errors.length ? errors.map(({ where, message }) => `${where}: ${message}`).join('; ') : null;
  } catch (error) {
    return `the pages cannot be drawn from it (${error.message})`;
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
