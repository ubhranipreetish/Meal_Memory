/** Read-only deployment readiness check for the connected Supabase database. */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const expectedTables = [
  "profiles",
  "food_memory",
  "food_aliases",
  "meal_logs",
  "meal_log_items",
  "exercises",
  "workout_plans",
  "plan_exercises",
  "workout_sessions",
  "session_sets",
  "weight_logs",
  "water_logs",
  "sleep_logs",
  "steps_logs",
  "body_reports",
  "measurements",
  "progress_photos",
  "reviews",
  "coach_notes",
  "user_facts",
] as const;

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DIRECT_URL or DATABASE_URL in .env.local");

const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });

async function main() {
  try {
  const tables = await sql<{ table_name: string; relrowsecurity: boolean }[]>`
    select t.table_name, c.relrowsecurity
    from information_schema.tables t
    join pg_catalog.pg_class c on c.relname = t.table_name
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = t.table_schema
    where t.table_schema = 'public' and t.table_name = any(${[...expectedTables]}::text[])
  `;
  const found = new Map(tables.map((row) => [row.table_name, row.relrowsecurity]));
  const missing = expectedTables.filter((name) => !found.has(name));
  const rlsDisabled = expectedTables.filter((name) => found.has(name) && !found.get(name));

  const [vector] = await sql<{ installed: boolean }[]>`
    select exists(select 1 from pg_extension where extname = 'vector') as installed
  `;
  const buckets = await sql<{ id: string }[]>`
    select id from storage.buckets where id = any(${["meal-photos", "reports"]}::text[])
  `;
  const foundBuckets = new Set(buckets.map((bucket) => bucket.id));
  const missingBuckets = ["meal-photos", "reports"].filter((id) => !foundBuckets.has(id));

  if (missing.length || rlsDisabled.length || !vector.installed || missingBuckets.length) {
    if (missing.length) console.error(`Missing tables: ${missing.join(", ")}`);
    if (rlsDisabled.length) console.error(`RLS disabled: ${rlsDisabled.join(", ")}`);
    if (!vector.installed) console.error("Missing extension: vector");
    if (missingBuckets.length) console.error(`Missing storage buckets: ${missingBuckets.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Database ready: ${expectedTables.length} tables, RLS enabled, vector installed, private buckets present.`);
  }
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Database readiness check failed");
  process.exitCode = 1;
});
