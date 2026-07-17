/**
 * Sprint 2 benchmarks (docs/SPRINTS.md):
 *  A. Paraphrase eval — ≥8/10 paraphrases resolve to an existing food WITHOUT re-estimation
 *  B. Snapshot invariance — editing a food's macros does NOT change past logged meals
 *  C. History search over 100+ logs returns in <500ms
 *
 * Run: npx tsx scripts/eval-sprint2.ts <userId>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { confirmAndLog, resolveUtterance } from "../src/lib/services/foodMemory";
import { searchHistory, updateFoodNutrition, quickLogFood } from "../src/lib/services/history";

const userId = process.argv[2];
if (!userId) {
  console.error("usage: npx tsx scripts/eval-sprint2.ts <userId>");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function seedFood(name: string, unit: string, kcal: number, proteinG: number) {
  await confirmAndLog(userId, {
    raw: `seed: 1 ${unit} ${name}`,
    mealType: "other",
    inputMode: "text",
    items: [
      {
        name,
        typedName: name,
        qty: 1,
        unit,
        status: "new",
        perUnit: { kcal, proteinG, carbsG: 20, fatG: 8 },
        confidence: 0.9,
        assumptions: "seeded for eval",
      },
    ],
  });
}

async function main() {
  const db = getDb();
  let failures = 0;

  // ── Seed distinctive foods (with embeddings) ─────────────────────────────
  console.log("— seeding foods…");
  await seedFood("Mom's Paneer Paratha", "piece", 320, 12);
  await sleep(1500);
  await seedFood("Chicken Biryani", "plate", 550, 28);
  await sleep(1500);
  await seedFood("Masala Dosa", "piece", 380, 8);
  await sleep(1500);

  // ── A. Paraphrase eval ───────────────────────────────────────────────────
  const paraphrases: { text: string; expectFood: string }[] = [
    { text: "paneer paratha", expectFood: "Mom's Paneer Paratha" },
    { text: "2 paneer parathas", expectFood: "Mom's Paneer Paratha" },
    { text: "mom's paneer paratha", expectFood: "Mom's Paneer Paratha" },
    { text: "aloo parathas", expectFood: "Aloo Paratha" },
    { text: "1 aloo prantha", expectFood: "Aloo Paratha" }, // typo
    { text: "chicken biriyani", expectFood: "Chicken Biryani" }, // spelling variant
    { text: "a plate of biryani", expectFood: "Chicken Biryani" },
    { text: "glass of milk", expectFood: "Milk" },
    { text: "masala dosa", expectFood: "Masala Dosa" },
    { text: "1 dosa", expectFood: "Masala Dosa" },
  ];

  let passA = 0;
  for (const p of paraphrases) {
    try {
      const r = await resolveUtterance(userId, p.text);
      const item = r.items[0];
      const ok =
        !!item &&
        item.status === "known" &&
        item.name.toLowerCase().includes(p.expectFood.toLowerCase().split(" ").pop()!);
      console.log(
        `${ok ? "PASS" : "FAIL"} "${p.text}" → ${item ? `${item.name} (${item.status}${r.zeroAi ? ", zero-AI" : ""})` : "no item"}`,
      );
      if (ok) passA++;
    } catch (e) {
      console.log(`FAIL "${p.text}" — ${e instanceof Error ? e.message.slice(0, 100) : e}`);
    }
    await sleep(6500);
  }
  console.log(`A) Paraphrases: ${passA}/10 (benchmark ≥8) ${passA >= 8 ? "✅" : "❌"}`);
  if (passA < 8) failures++;

  // ── B. Snapshot invariance ───────────────────────────────────────────────
  const [food] = await db
    .select()
    .from(schema.foodMemory)
    .where(and(eq(schema.foodMemory.userId, userId), eq(schema.foodMemory.canonicalName, "Masala Dosa")))
    .limit(1);
  await quickLogFood(userId, food.id, 2); // logs 2 × 380 = 760 kcal snapshot
  const before = await db
    .select()
    .from(schema.mealLogItems)
    .where(and(eq(schema.mealLogItems.userId, userId), eq(schema.mealLogItems.foodMemoryId, food.id)));
  const beforeVals = before.map((i) => i.kcal).sort();

  await updateFoodNutrition(userId, food.id, { kcal: 999, proteinG: 99, carbsG: 9, fatG: 9 });

  const after = await db
    .select()
    .from(schema.mealLogItems)
    .where(and(eq(schema.mealLogItems.userId, userId), eq(schema.mealLogItems.foodMemoryId, food.id)));
  const afterVals = after.map((i) => i.kcal).sort();
  const unchanged = JSON.stringify(beforeVals) === JSON.stringify(afterVals);

  // and a NEW log must use the new value
  await quickLogFood(userId, food.id, 1);
  const newest = await db
    .select()
    .from(schema.mealLogItems)
    .where(and(eq(schema.mealLogItems.userId, userId), eq(schema.mealLogItems.foodMemoryId, food.id)));
  const usesNew = newest.some((i) => Number(i.kcal) === 999);

  console.log(`B) Snapshot invariance: past items unchanged=${unchanged}, new log uses edited value=${usesNew} ${unchanged && usesNew ? "✅" : "❌"}`);
  if (!(unchanged && usesNew)) failures++;

  // ── C. History search speed over 100+ logs ───────────────────────────────
  console.log("— seeding 120 meal logs…");
  const foodRow = food;
  for (let batch = 0; batch < 4; batch++) {
    const logs = await db
      .insert(schema.mealLogs)
      .values(
        Array.from({ length: 30 }, (_, i) => ({
          userId,
          loggedAt: new Date(Date.now() - (batch * 30 + i + 1) * 3600_000),
          mealType: (["breakfast", "lunch", "snack", "dinner"] as const)[i % 4],
          rawInput: `seeded meal ${batch * 30 + i} with dosa`,
          inputMode: "text",
        })),
      )
      .returning({ id: schema.mealLogs.id });
    await db.insert(schema.mealLogItems).values(
      logs.map((l) => ({
        userId,
        mealLogId: l.id,
        foodMemoryId: foodRow.id,
        qty: "1",
        unit: "piece",
        kcal: "380",
        proteinG: "8",
        carbsG: "20",
        fatG: "8",
      })),
    );
  }

  // warm connection, then time three searches
  await searchHistory(userId, { limit: 10 });
  const timings: number[] = [];
  for (const f of [{ q: "dosa" }, { q: "paratha" }, { mealType: "dinner" }]) {
    const t0 = Date.now();
    const res = await searchHistory(userId, { ...f, limit: 50 });
    const ms = Date.now() - t0;
    timings.push(ms);
    console.log(`   search ${JSON.stringify(f)} → ${res.length} results in ${ms}ms`);
  }
  const worst = Math.max(...timings);
  console.log(`C) Search speed: worst ${worst}ms (benchmark <500ms) ${worst < 500 ? "✅" : "❌"}`);
  if (worst >= 500) failures++;

  console.log(`\n=== SPRINT 2 EVAL: ${failures === 0 ? "ALL PASS ✅" : `${failures} section(s) failed ❌`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
