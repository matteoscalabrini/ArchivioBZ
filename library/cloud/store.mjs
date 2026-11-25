// The store: every statement the edit mode sends to the database, in one place. Documents go in
// as JSON text cast to jsonb and come back parsed. A write that depends on the draft's version
// says which version it expects; if the draft has moved on it is refused with a ConflictError
// that carries the current version, and nothing has changed.
import { readFileSync } from 'node:fs';

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

    async createDraft(doc, { replace = false } = {}) {
      return db.transaction(async (q) => {
        if (!replace && (await currentVersion(q)) !== null) throw new Error('There is a draft already; --replace to overwrite it');
        await q(
          `insert into draft (id, version, doc) values (1, 1, $1::jsonb)
           on conflict (id) do update set version = 1, doc = excluded.doc, saved_at = now()`,
          [json(doc)],
        );
        return 1;
      });
    },

    async saveDraft(doc, expected) {
      const rows = await db.query(
        'update draft set doc = $1::jsonb, version = version + 1, saved_at = now() where id = 1 and version = $2 returning version',
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
          "insert into publishes (kind, doc, summary) values ('publish', $1::jsonb, $2) returning id",
          [json(held[0].doc), summary ?? null],
        );
        await q('delete from site_files');
        for (const [path, { body, type }] of files) {
          await q('insert into site_files (path, body, content_type, publish_id) values ($1, $2, $3, $4)', [path, body, type, id]);
        }
        return { id };
      });
    },

    async discard(expected) {
      return db.transaction(async (q) => {
        const [latest] = await q("select doc from publishes where kind = 'publish' order by id desc limit 1");
        if (!latest) throw new Error('Nothing has been published yet');
        const rows = await q(
          'update draft set doc = $1::jsonb, version = version + 1, saved_at = now() where id = 1 and version = $2 returning version',
          [json(latest.doc), expected],
        );
        if (!rows.length) throw await conflict(q);
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
        await q("insert into publishes (kind, doc, summary) values ('set-aside', $1::jsonb, $2)", [json(draft.doc), `Set aside before restoring publish ${publishId}`]);
        const rows = await q(
          'update draft set doc = $1::jsonb, version = version + 1, saved_at = now() where id = 1 returning version',
          [json(target.doc)],
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

    async recordLoginFailure() {
      await db.query('insert into login_failures default values');
    },
  };
}
