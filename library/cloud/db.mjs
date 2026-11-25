// The two ways the store reaches Postgres: Neon over its pooled WebSocket connection (the cloud
// and the command line), and PGlite (the tests and local work). Both give the same small `Db`:
//   query(text, params) -> rows
//   transaction(fn) -> fn gets a `q` like query that runs inside one transaction; it commits when
//                      fn returns and rolls back when fn throws
//   end() -> close
import { Pool } from '@neondatabase/serverless';

export function neonDb(url) {
  const pool = new Pool({ connectionString: url });
  return {
    async query(text, params = []) {
      return (await pool.query(text, params)).rows;
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(async (text, params = []) => (await client.query(text, params)).rows);
        await client.query('commit');
        return result;
      } catch (error) {
        try { await client.query('rollback'); } catch { /* the connection is gone; the error that matters is the first */ }
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

export function pgliteDb(pg) {
  return {
    async query(text, params = []) {
      return (await pg.query(text, params)).rows;
    },
    transaction: (fn) => pg.transaction((tx) => fn(async (text, params = []) => (await tx.query(text, params)).rows)),
    end: () => pg.close(),
  };
}
