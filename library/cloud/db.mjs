// The two ways the store reaches Postgres: Neon over its pooled WebSocket connection (the cloud
// and the command line), and PGlite (the tests and local work). Both give the same small `Db`:
//   query(text, params) -> rows
//   transaction(fn) -> fn gets a `q` like query that runs inside one transaction; it commits when
//                      fn returns and rolls back when fn throws
//   end() -> close
import { Pool } from '@neondatabase/serverless';
import { attachDatabasePool } from '@vercel/functions';

export function neonDb(url) {
  // idleTimeoutMillis is set so that attachDatabasePool can close idle connections before the
  // function is suspended; the error listener keeps a connection that dies while idle from
  // throwing an uncaught exception out of the pool.
  const pool = new Pool({ connectionString: url, idleTimeoutMillis: 5000 });
  pool.on('error', (error) => console.error('database pool:', error));
  attachDatabasePool(pool);
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
