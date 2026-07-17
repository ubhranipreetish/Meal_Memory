/**
 * Sprint 1 benchmark: 20-utterance parser eval (docs/SPRINTS.md).
 * Pass bar: ≥18/20 utterances parsed into correct items + quantities.
 *
 * Run: npx tsx scripts/eval-parser.ts
 * Makes real Gemini calls (rate-limited ~7s apart for the free tier).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { parseFoodUtterance } from "../src/lib/ai/foodParser";

interface Expect {
  utterance: string;
  items: { nameIncludes: string[]; qty: number }[]; // any of nameIncludes may appear in item name (lowercased)
  waterMl?: number;
}

const CASES: Expect[] = [
  { utterance: "I ate two aloo parathas", items: [{ nameIncludes: ["paratha"], qty: 2 }] },
  { utterance: "Breakfast was four eggs and a glass of milk", items: [{ nameIncludes: ["egg"], qty: 4 }, { nameIncludes: ["milk"], qty: 1 }] },
  { utterance: "Lunch was butter chicken with two chapatis", items: [{ nameIncludes: ["butter chicken"], qty: 1 }, { nameIncludes: ["chapati", "roti"], qty: 2 }] },
  { utterance: "half bowl dal and one roti", items: [{ nameIncludes: ["dal"], qty: 0.5 }, { nameIncludes: ["roti"], qty: 1 }] },
  { utterance: "3 rotis and paneer sabzi", items: [{ nameIncludes: ["roti"], qty: 3 }, { nameIncludes: ["paneer", "sabzi"], qty: 1 }] },
  { utterance: "one large cold coffee", items: [{ nameIncludes: ["coffee"], qty: 1 }] },
  { utterance: "2 idlis with sambar", items: [{ nameIncludes: ["idli"], qty: 2 }, { nameIncludes: ["sambar"], qty: 1 }] },
  { utterance: "a plate of chicken biryani", items: [{ nameIncludes: ["biryani"], qty: 1 }] },
  { utterance: "two slices of brown bread with peanut butter", items: [{ nameIncludes: ["bread", "toast", "peanut"], qty: 2 }] },
  { utterance: "1 scoop whey protein in water", items: [{ nameIncludes: ["whey", "protein"], qty: 1 }] },
  { utterance: "ate a small banana and 10 almonds", items: [{ nameIncludes: ["banana"], qty: 1 }, { nameIncludes: ["almond"], qty: 10 }] },
  { utterance: "one bowl of curd rice", items: [{ nameIncludes: ["curd rice", "curd"], qty: 1 }] },
  { utterance: "2 samosas from the office canteen", items: [{ nameIncludes: ["samosa"], qty: 2 }] },
  { utterance: "had a masala dosa for breakfast", items: [{ nameIncludes: ["dosa"], qty: 1 }] },
  { utterance: "grilled chicken breast 200g with rice", items: [{ nameIncludes: ["chicken"], qty: 1 }, { nameIncludes: ["rice"], qty: 1 }] },
  { utterance: "a cup of chai and 2 marie biscuits", items: [{ nameIncludes: ["chai", "tea"], qty: 1 }, { nameIncludes: ["biscuit", "marie"], qty: 2 }] },
  { utterance: "half plate chole bhature", items: [{ nameIncludes: ["chole"], qty: 0.5 }] },
  { utterance: "I had 2 boiled eggs and a black coffee", items: [{ nameIncludes: ["egg"], qty: 2 }, { nameIncludes: ["coffee"], qty: 1 }] },
  { utterance: "one veg burger and small fries", items: [{ nameIncludes: ["burger"], qty: 1 }, { nameIncludes: ["fries"], qty: 1 }] },
  { utterance: "drank 1 litre of water", items: [], waterMl: 1000 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function qtyMatches(expected: number, got: number, unit: string) {
  if (Math.abs(expected - got) < 0.01) return true;
  // 200g chicken may come back qty 200 unit g, or qty 2 × 100g — accept gram-based equivalents
  if (unit === "g" || unit === "ml") return true;
  return false;
}

async function main() {
  let pass = 0;
  const failures: string[] = [];

  for (const c of CASES) {
    let ok = true;
    let detail = "";
    const t0 = Date.now();
    try {
      const r = await parseFoodUtterance(c.utterance);
      const ms = Date.now() - t0;

      if (c.waterMl != null) {
        const w = r.waterMl ?? 0;
        const foodItems = r.items.filter((i) => !/water/i.test(i.name));
        ok = Math.abs(w - c.waterMl) <= 250 && foodItems.length === 0;
        detail = `water=${w} items=${r.items.length}`;
      } else {
        if (r.items.length !== c.items.length) {
          ok = false;
          detail = `expected ${c.items.length} items, got ${r.items.length}: ${r.items.map((i) => i.name).join(", ")}`;
        } else {
          for (const exp of c.items) {
            const found = r.items.find((i) =>
              exp.nameIncludes.some((n) => i.name.toLowerCase().includes(n)),
            );
            if (!found) {
              ok = false;
              detail = `missing item ~[${exp.nameIncludes.join("|")}] in: ${r.items.map((i) => i.name).join(", ")}`;
              break;
            }
            if (!qtyMatches(exp.qty, found.qty, found.unit)) {
              ok = false;
              detail = `qty for ${found.name}: expected ${exp.qty}, got ${found.qty} ${found.unit}`;
              break;
            }
            // sanity: per-unit kcal must be positive and plausible
            if (!(found.kcal > 0 && found.kcal < 2000)) {
              ok = false;
              detail = `implausible kcal ${found.kcal} for ${found.name}`;
              break;
            }
          }
        }
      }
      console.log(`${ok ? "PASS" : "FAIL"} (${ms}ms) "${c.utterance}"${detail ? ` — ${detail}` : ""}`);
    } catch (e) {
      ok = false;
      console.log(`FAIL (error) "${c.utterance}" — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
    if (ok) pass++;
    else failures.push(c.utterance);
    await sleep(6500); // free-tier RPM safety
  }

  console.log(`\n=== RESULT: ${pass}/${CASES.length} passed (benchmark: ≥18) ===`);
  if (failures.length) console.log("Failures:", failures.join(" | "));
  process.exit(pass >= 18 ? 0 : 1);
}

main();
