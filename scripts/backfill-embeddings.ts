/**
 * Backfill embeddings for food_memory rows that are missing them (e.g. the
 * embedding call failed at confirm time). Safe to re-run anytime.
 * Run: npx tsx scripts/backfill-embeddings.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { embedText } from "../src/lib/ai/embeddings";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = getDb();
  const rows = await db
    .select({ id: schema.foodMemory.id, name: schema.foodMemory.canonicalName })
    .from(schema.foodMemory)
    .where(isNull(schema.foodMemory.embedding));

  console.log(`${rows.length} foods missing embeddings`);
  let ok = 0;
  for (const r of rows) {
    try {
      const vec = await embedText(r.name);
      await db.update(schema.foodMemory).set({ embedding: vec }).where(eq(schema.foodMemory.id, r.id));
      ok++;
      console.log(`  ✓ ${r.name}`);
    } catch (e) {
      console.log(`  ✗ ${r.name}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
    await sleep(700);
  }
  console.log(`backfilled ${ok}/${rows.length}`);
  process.exit(0);
}

main();
