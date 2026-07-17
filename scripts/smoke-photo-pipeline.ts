/**
 * Sprint 4 plumbing check: vision request/response/schema path, using a
 * non-food image that must yield an empty items array.
 * Run: npx tsx scripts/smoke-photo-pipeline.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { analyzeMealPhoto } from "../src/lib/ai/photoAnalyzer";

async function main() {
  // 1x1 red pixel PNG — definitively not food
  const png1x1 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const t0 = Date.now();
  const r = await analyzeMealPhoto(png1x1, "image/png");
  console.log(`took ${Date.now() - t0}ms; items: ${JSON.stringify(r.items)}`);
  if (r.items.length === 0) {
    console.log("PASS — non-food image → empty items (request/schema/parse plumbing verified)");
    process.exit(0);
  }
  console.log("UNEXPECTED items for a blank image");
  process.exit(1);
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message.slice(0, 200) : e);
  process.exit(1);
});
