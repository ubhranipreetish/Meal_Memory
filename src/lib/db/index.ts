/**
 * Drizzle database client (server-only). Uses postgres.js against the Supabase
 * Postgres connection string (the transaction pooler is recommended in
 * serverless production). Schema commands use DIRECT_URL in drizzle.config.
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
      ssl: "require",
      // Each serverless instance can create its own pool. One connection per
      // instance avoids exhausting Supabase while still allowing transactions.
      max: process.env.NODE_ENV === "production" ? 1 : 5,
      idle_timeout: 20, // seconds; free pooler sessions while the app is idle
      connect_timeout: 15,
    });
    g.__pgDb = drizzle(client, { schema });
  }
  return g.__pgDb;
}

export { schema };
