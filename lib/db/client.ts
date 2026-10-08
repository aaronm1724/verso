import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

// Dev HMR re-evaluates modules without exiting the process. A module-level
// client would open a new pool on every reload; keeping it on globalThis
// reuses the existing one. Runtime queries use the transaction pooler, which
// rejects prepared statements, so `prepare` stays off. `max: 1` keeps a
// serverless instance from holding more than one pooler connection.
const globalForDb = globalThis as typeof globalThis & {
  __versoSql?: postgres.Sql;
  __versoDb?: Database;
};

export function getDb(): Database | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }

  if (!globalForDb.__versoSql || !globalForDb.__versoDb) {
    const sql = postgres(url, {
      prepare: false,
      max: 1,
      connect_timeout: 3,
    });
    globalForDb.__versoSql = sql;
    globalForDb.__versoDb = drizzle(sql, { schema });
  }

  return globalForDb.__versoDb;
}
