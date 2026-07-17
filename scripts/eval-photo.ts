/**
 * Sprint 4 smoke eval: photo → items pipeline.
 * Generates synthetic Indian-meal photos (Gemini image model) with KNOWN
 * contents, then runs them through the real analyzeMealPhoto pipeline.
 * (Full 10-real-photo benchmark awaits the owner's actual meal photos.)
 * Run: npx tsx scripts/eval-photo.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";
import { analyzeMealPhoto } from "../src/lib/ai/photoAnalyzer";

const KEY = process.env.GOOGLE_API_KEY!;
const GEN_MODEL = "gemini-2.5-flash-image";

async function generateImage(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent?key=${KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok) throw new Error(`image gen ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
  };
  const img = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!img) throw new Error("no image in response");
  return img.data;
}

const CASES = [
  {
    prompt:
      "Overhead photo of a simple Indian home meal on a steel plate: exactly 3 rotis (chapatis) and one steel bowl of yellow dal. Realistic, natural light.",
    expect: ["roti", "dal"],
  },
  {
    prompt:
      "Photo of a breakfast plate with exactly 2 idlis and a small bowl of sambar on a banana leaf. Realistic South Indian style.",
    expect: ["idli", "sambar"],
  },
];

async function main() {
  let pass = 0;
  for (const [i, c] of CASES.entries()) {
    try {
      console.log(`— generating test image ${i + 1}…`);
      const b64 = await generateImage(c.prompt);
      writeFileSync(`/tmp/pg-test-meal-${i + 1}.jpg`, Buffer.from(b64, "base64"));
      const t0 = Date.now();
      const r = await analyzeMealPhoto(b64, "image/jpeg");
      const ms = Date.now() - t0;
      const names = r.items.map((x) => x.name.toLowerCase());
      const ok =
        c.expect.every((e) => names.some((n) => n.includes(e))) &&
        r.items.every((x) => x.kcal > 0 && x.confidence > 0);
      console.log(
        `${ok ? "PASS" : "FAIL"} (${ms}ms) detected: ${r.items
          .map((x) => `${x.name} ×${x.qty} ${x.unit} (${x.kcal}kcal, conf ${x.confidence})`)
          .join("; ")}`,
      );
      if (ok) pass++;
    } catch (e) {
      console.log(`FAIL — ${e instanceof Error ? e.message.slice(0, 150) : e}`);
    }
  }
  console.log(`\n=== PHOTO SMOKE EVAL: ${pass}/${CASES.length} ===`);
  process.exit(pass >= 1 ? 0 : 1);
}

main();
