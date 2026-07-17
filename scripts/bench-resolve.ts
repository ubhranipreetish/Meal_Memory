/**
 * Sprint 1 benchmark: repeat-food resolution must use zero AI calls and
 * resolve in <200ms (DB round trip only). Run: npx tsx scripts/bench-resolve.ts <userId>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { resolveUtterance } from "../src/lib/services/foodMemory";

const userId = process.argv[2];
if (!userId) {
  console.error("usage: npx tsx scripts/bench-resolve.ts <userId>");
  process.exit(1);
}

async function main() {
  // Warm the DB connection pool (first query pays TLS/session setup).
  await resolveUtterance(userId, "2 aloo parathas");

  const cases = ["2 aloo parathas", "aloo paratha", "2 aloo parathas and 1 glass milk", "drank 1l water"];
  let worst = 0;
  for (const u of cases) {
    const t0 = Date.now();
    const r = await resolveUtterance(userId, u);
    const ms = Date.now() - t0;
    worst = Math.max(worst, r.zeroAi ? ms : worst);
    console.log(`${ms}ms zeroAi=${r.zeroAi} items=${r.items.length} water=${r.waterMl ?? "-"} "${u}"`);
  }
  console.log(`\nworst zero-AI resolution: ${worst}ms (benchmark: <200ms)`);
  process.exit(worst < 200 ? 0 : 1);
}

main();
