/**
 * Seed the global exercise table (user_id null = visible to everyone via RLS).
 * Idempotent: skips names that already exist. Run: npx tsx scripts/seed-exercises.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { isNull } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { EXERCISES } from "./exercises-data";

async function main() {
  const db = getDb();
  const existing = await db
    .select({ name: schema.exercises.name })
    .from(schema.exercises)
    .where(isNull(schema.exercises.userId));
  const have = new Set(existing.map((e) => e.name));

  const rows = EXERCISES.filter(([name]) => !have.has(name)).map(([name, muscleGroup, equipment]) => ({
    name,
    muscleGroup,
    equipment,
    isCustom: false,
    userId: null,
  }));

  if (rows.length > 0) {
    // insert in chunks to keep statements reasonable
    for (let i = 0; i < rows.length; i += 50) {
      await db.insert(schema.exercises).values(rows.slice(i, i + 50));
    }
  }
  const total = await db
    .select({ name: schema.exercises.name })
    .from(schema.exercises)
    .where(isNull(schema.exercises.userId));
  console.log(`seeded ${rows.length} new; total global exercises: ${total.length}`);
  process.exit(0);
}

main();
