/**
 * Sprint 6 benchmarks:
 *  A. Report extraction — synthetic InBody-style PDF with KNOWN values; ≥90%
 *     of key metrics must extract correctly (real InBody sheet → owner notes).
 *  B. Weekly review — stats must equal SQL ground truth for the seeded user;
 *     narrative must quote the computed averages.
 * Run: npx tsx scripts/eval-sprint6.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { analyzeReport } from "../src/lib/ai/reportReader";
import { computePeriodStats, generateReview } from "../src/lib/services/reviews";
import { getDb } from "../src/lib/db";

/** Minimal valid one-page PDF with the given lines of text. */
function makePdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 50 750 Td 16 TL ${lines
    .map((l) => `(${l.replace(/[()\\]/g, "")}) Tj T*`)
    .join(" ")} ET`;
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

const TRUTH = {
  weight: 75.4,
  smm: 34.2,
  bodyFatPct: 18.5,
  visceral: 7,
  bmr: 1712,
  bmi: 24.6,
};

async function main() {
  let failures = 0;

  // ── A. report extraction ────────────────────────────────────────────────
  const pdf = makePdf([
    "InBody Body Composition Analysis Report",
    "Test Date: 2026-07-17    ID: EVAL",
    `Weight: ${TRUTH.weight} kg`,
    `Skeletal Muscle Mass (SMM): ${TRUTH.smm} kg`,
    `Percent Body Fat (PBF): ${TRUTH.bodyFatPct} %`,
    `Visceral Fat Level: ${TRUTH.visceral}`,
    `Basal Metabolic Rate (BMR): ${TRUTH.bmr} kcal`,
    `BMI: ${TRUTH.bmi} kg/m2`,
  ]);
  const analysis = await analyzeReport(pdf.toString("base64"), "application/pdf");
  const vals = Object.values(analysis.metrics);
  const found = (v: number) => vals.some((x) => Math.abs(x - v) < 0.01);
  const checks = Object.entries(TRUTH).map(([k, v]) => [k, found(v)] as const);
  const okCount = checks.filter(([, ok]) => ok).length;
  console.log(`A) extracted metrics: ${JSON.stringify(analysis.metrics)}`);
  console.log(`   type=${analysis.reportType} | ${checks.map(([k, ok]) => `${k}:${ok ? "✓" : "✗"}`).join(" ")}`);
  console.log(`   summary: "${analysis.summary.slice(0, 100)}…"`);
  const aOk = okCount / checks.length >= 0.9 && /inbody/i.test(analysis.reportType);
  console.log(`A) Report extraction: ${okCount}/${checks.length} (≥90% req) ${aOk ? "✅" : "❌"}`);
  if (!aOk) failures++;

  // ── B. weekly review vs SQL ground truth ────────────────────────────────
  const db = getDb();
  const users = (await db.execute(
    `select id from auth.users where email='pg.coach.eval@gmail.com'`,
  )) as unknown as { id: string }[];
  const uid = users[0].id;

  const stats = await computePeriodStats(uid, 7);
  // seeded ground truth: 4 days × 2800 kcal/160g + 3 days × 1400/80 → avg 2200 kcal / 126 g; hits 4; 2 workouts in 7d; weight 75 flat
  const bOkStats =
    stats.daysWithLogs === 7 &&
    stats.avgKcal === 2200 &&
    Math.abs(stats.avgProteinG - 126) <= 1 &&
    stats.proteinHitDays === 4 &&
    stats.workouts === 2 &&
    stats.weightStartKg === 75 &&
    stats.weightEndKg === 75;
  console.log(`\nB) stats: ${JSON.stringify(stats)}`);
  console.log(`B) stats match SQL ground truth: ${bOkStats ? "✅" : "❌"}`);

  const review = await generateReview(uid, "weekly");
  const quotes = review.narrative.includes(String(stats.avgKcal)) && review.narrative.includes(String(stats.avgProteinG));
  console.log(`B) narrative quotes avgKcal(${stats.avgKcal}) & avgProtein(${stats.avgProteinG}): ${quotes ? "✅" : "❌"}`);
  console.log(`   "${review.narrative.slice(0, 140)}…"`);
  if (!(bOkStats && quotes)) failures++;

  console.log(`\n=== SPRINT 6 EVAL: ${failures === 0 ? "ALL PASS ✅" : "FAILED ❌"} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e.message?.slice(0, 250)); process.exit(1); });
