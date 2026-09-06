/**
 * Drizzle database client (server-only). Uses postgres.js against the Supabase
 * Postgres connection string (the session-mode pooler, port 5432).
 *
 * The client is cached on `globalThis` — not just in module scope — because
 * Turbopack re-evaluates this module on every server hot-reload in dev; a
 * module-level cache leaked one 10-connection pool per reload and hit the
 * pooler's 15-session cap ("max clients reached in session mode"). Pool size
 * is kept small and idle connections are released quickly for the same reason.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;
const g = globalThis as unknown as { __pgDb?: Db };

export function getDb(): Db {
  if (!g.__pgDb) {
    const client = postgres(env.databaseUrl(), {
      prepare: false,
      max: 5,
      idle_timeout: 20, // seconds; free pooler sessions while the app is idle
      connect_timeout: 15,
    });
    g.__pgDb = drizzle(client, { schema });
  }
  return g.__pgDb;
}

export { schema };
