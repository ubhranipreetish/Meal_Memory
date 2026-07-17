/**
 * Drizzle database client (server-only). Uses postgres.js against the Supabase
 * Postgres connection string. Lazily initialized so importing this module
 * doesn't require DATABASE_URL until a query actually runs.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const client = postgres(env.databaseUrl(), { prepare: false });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export { schema };
