// The store: every statement the edit mode sends to the database, in one place. Documents go in
// as JSON text cast to json and come back parsed, their keys in the order they went in. A write
// that depends on the draft's version says which version it expects; if the draft has moved on it
// is refused with a ConflictError that carries the current version, and nothing has changed.
import { readFileSync } from 'node:fs';
import { raiseCounters } from './doc.mjs';

export class ConflictError extends Error {
  constructor(version) {
    super('The draft changed since it was read');
    this.name = 'ConflictError';
    this.version = version;
  }
}

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const json = (doc) => JSON.stringify(doc);

export function makeStore(db) {
  const currentVersion = async (q) => (await q('select version from draft where id = 1'))[0]?.version ?? null;
  // A draft that does not exist counts as version 0, so any expected version is refused.
  const conflict = async (q) => new ConflictError((await currentVersion(q)) ?? 0);

  return {
    async init() {
      for (const statement of SCHEMA.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean)) {
        await db.query(statement);
      }
    },

    async getDraft() {
      const [row] = await db.query('select version, doc, saved_at from draft where id = 1');
      return row ? { version: row.version, doc: row.doc, savedAt: row.saved_at } : null;
    },

    // With `replace`, a draft that exists is kept as a 'set-aside' and the new document is written
    // at the next version, so a window holding the old version is refused rather than overwriting it.
    // Here, at a discard and at a restore, the document put in place keeps the draft's counters
    // where they are higher (raiseCounters): an id once given is never given again.
    async createDraft(doc, { replace = false } = {}) {
      return db.transaction(async (q) => {
        const [old] = await q('select doc from draft where id = 1 for update');
        if (old && !replace) throw new Error('There is a draft already; --replace to overwrite it');
        if (!old) {
          await q('insert into draft (id, version, doc) values (1, 1, $1::json)', [json(doc)]);
          return 1;
        }
        await q("insert into publishes (kind, doc, summary) values ('set-aside', $1::json, 'Set aside before a replace')", [json(old.doc)]);
        const rows = await q('update draft set doc = $1::json, version = version + 1, saved_at = now() where id = 1 returning version', [json(raiseCounters(doc, old.doc))]);
        return rows[0].version;
      });
    },

    async saveDraft(doc, expected) {
      const rows = await db.query(
        'update draft set doc = $1::json, version = version + 1, saved_at = now() where id = 1 and version = $2 returning version',
        [json(doc), expected],
      );
      if (!rows.length) throw await conflict(db.query);
      return rows[0].version;
    },

    async latestPublish() {
      const [row] = await db.query("select id, at, doc from publishes where kind = 'publish' order by id desc limit 1");
      return row ?? null;
    },

    // One transaction. The update locks the draft row, so two publishes cannot interleave.
    async publish(expected, files, summary) {
      return db.transaction(async (q) => {
        const held = await q('update draft set saved_at = saved_at where id = 1 and version = $1 returning doc', [expected]);
        if (!held.length) throw await conflict(q);
        const [{ id }] = await q(
          "insert into publishes (kind, doc, summary) values ('publish', $1::json, $2) returning id",
          [json(held[0].doc), summary ?? null],
        );
        await q('delete from site_files');
        for (const [path, { body, type }] of files) {
          await q('insert into site_files (path, body, content_type, publish_id) values ($1, $2, $3, $4)', [path, body, type, id]);
        }
        return { id };
      });
    },

    // The public files drawn again for publish `publishId`, which must still be the latest; the
    // draft's row is locked as a publish locks it, so the two cannot interleave. The draft and the
    // publishes are not changed.
    async rewriteSite(publishId, files) {
      return db.transaction(async (q) => {
        await q('select version from draft where id = 1 for update');
        const [latest] = await q("select max(id) as id from publishes where kind = 'publish'");
        if (latest?.id !== publishId) throw new Error(`Publish ${publishId} is no longer the latest; run it again.`);
        await q('delete from site_files');
        for (const [path, { body, type }] of files) {
          await q('insert into site_files (path, body, content_type, publish_id) values ($1, $2, $3, $4)', [path, body, type, publishId]);
        }
      });
    },

    // The draft is kept as a 'set-aside' entry before the latest publish replaces it: publishes are
    // rare, and one confirmed click would otherwise lose everything since the last.
    async discard(expected) {
      return db.transaction(async (q) => {
        const [latest] = await q("select doc from publishes where kind = 'publish' order by id desc limit 1");
        if (!latest) throw new Error('Nothing has been published yet');
        const [draft] = await q('select doc from draft where id = 1 and version = $1 for update', [expected]);
        if (!draft) throw await conflict(q);
        await q("insert into publishes (kind, doc, summary) values ('set-aside', $1::json, 'Set aside before a discard')", [json(draft.doc)]);
        const rows = await q('update draft set doc = $1::json, version = version + 1, saved_at = now() where id = 1 returning version', [json(raiseCounters(latest.doc, draft.doc))]);
        return rows[0].version;
      });
    },

    // The draft is kept as a 'set-aside' entry before it is replaced, so a restore loses nothing.
    async restore(publishId, expected) {
      return db.transaction(async (q) => {
        const [target] = await q('select doc from publishes where id = $1', [publishId]);
        if (!target) throw new Error(`There is no publish ${publishId}`);
        const [draft] = await q('select doc from draft where id = 1 and version = $1 for update', [expected]);
        if (!draft) throw await conflict(q);
        await q("insert into publishes (kind, doc, summary) values ('set-aside', $1::json, $2)", [json(draft.doc), `Set aside before restoring publish ${publishId}`]);
        const rows = await q(
          'update draft set doc = $1::json, version = version + 1, saved_at = now() where id = 1 returning version',
          [json(raiseCounters(target.doc, draft.doc))],
        );
        return rows[0].version;
      });
    },

    listPublishes() {
      return db.query('select id, at, kind, summary from publishes order by id desc');
    },

    async siteFile(path) {
      const [row] = await db.query('select body, content_type from site_files where path = $1', [path]);
      return row ? { body: row.body, type: row.content_type } : null;
    },

    async recentLoginFailures(minutes) {
      const [row] = await db.query("select count(*)::int as n from login_failures where at > now() - $1 * interval '1 minute'", [minutes]);
      return row.n;
    },

    // A login try counts as a failure from the moment it arrives, before its password is checked:
    // the row is written and committed on its own, and only then are the tries counted, so tries
    // sent at once each see every one written before them. Returns the row's id, for
    // forgetLoginFailure when the try proves right or is refused, as text so that Neon and PGlite
    // give it alike.
    async recordLoginFailure() {
      const [row] = await db.query('insert into login_failures default values returning id::text as id');
      return row.id;
    },

    async forgetLoginFailure(id) {
      await db.query('delete from login_failures where id = $1::bigint', [id]);
    },

    // Every failed login forgotten, so that the cap no longer refuses: how many there were.
    async clearLoginFailures() {
      const [row] = await db.query('with gone as (delete from login_failures returning 1) select count(*)::int as n from gone');
      return row.n;
    },
  };
}
