/**
 * Sprint 2 re-run: sections A (paraphrases) and C (search speed) — B passed.
 * Foods + 120 meal logs already seeded by eval-sprint2.ts.
 * Run: npx tsx scripts/eval-sprint2-rerun.ts <userId>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { resolveUtterance } from "../src/lib/services/foodMemory";
import { searchHistory } from "../src/lib/services/history";

const userId = process.argv[2]!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let failures = 0;

  const paraphrases: { text: string; expectFood: string }[] = [
    { text: "paneer paratha", expectFood: "Mom's Paneer Paratha" },
    { text: "2 paneer parathas", expectFood: "Mom's Paneer Paratha" },
    { text: "mom's paneer paratha", expectFood: "Mom's Paneer Paratha" },
    { text: "aloo parathas", expectFood: "Aloo Paratha" },
    { text: "1 aloo prantha", expectFood: "Aloo Paratha" },
    { text: "chicken biriyani", expectFood: "Chicken Biryani" },
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
      console.log(`FAIL "${p.text}" — ${e instanceof Error ? e.message.slice(0, 90) : e}`);
    }
    await sleep(5000);
  }
  console.log(`A) Paraphrases: ${passA}/10 (benchmark ≥8) ${passA >= 8 ? "✅" : "❌"}`);
  if (passA < 8) failures++;

  await searchHistory(userId, { limit: 10 }); // warm
  const timings: number[] = [];
  for (const f of [{ q: "dosa" }, { q: "paratha" }, { mealType: "dinner" }]) {
    const t0 = Date.now();
    const res = await searchHistory(userId, { ...f, limit: 50 });
    timings.push(Date.now() - t0);
    console.log(`   search ${JSON.stringify(f)} → ${res.length} results in ${timings.at(-1)}ms`);
  }
  const worst = Math.max(...timings);
  console.log(`C) Search speed: worst ${worst}ms (<500ms) ${worst < 500 ? "✅" : "❌"}`);
  if (worst >= 500) failures++;

  console.log(`\n=== RERUN: ${failures === 0 ? "ALL PASS ✅" : "FAILED ❌"} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
