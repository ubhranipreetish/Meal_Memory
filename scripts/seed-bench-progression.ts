/**
 * Sprint 3 benchmark seed: 12 weekly bench-press sessions, 20kg → 45kg.
 * Goes through the REAL logSet path so PR detection is exercised end-to-end.
 * Prints the PR flags so the result doubles as a benchmark check.
 * Run: npx tsx scripts/seed-bench-progression.ts <userId>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, isNull, and } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { logSet } from "../src/lib/services/workouts";

const userId = process.argv[2]!;

async function main() {
  const db = getDb();
  const [bench] = await db
    .select()
    .from(schema.exercises)
    .where(and(eq(schema.exercises.name, "Barbell Bench Press"), isNull(schema.exercises.userId)))
    .limit(1);
  if (!bench) throw new Error("Barbell Bench Press not found — run seed-exercises first");

  const weeks = [20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45, 45];
  const prFlags: boolean[] = [];

  for (let w = 0; w < weeks.length; w++) {
    const startedAt = new Date(Date.now() - (weeks.length - w) * 7 * 24 * 3600_000);
    const [session] = await db
      .insert(schema.workoutSessions)
      .values({ userId, startedAt, endedAt: new Date(startedAt.getTime() + 3600_000) })
      .returning({ id: schema.workoutSessions.id });

    // 3 sets; the top set carries the week's working weight
    let weekHadPr = false;
    for (let s = 1; s <= 3; s++) {
      const weight = s === 1 ? weeks[w] - 2.5 : weeks[w];
      const { isPr } = await logSet(userId, {
        sessionId: session.id,
        exerciseId: bench.id,
        setNumber: s,
        weightKg: Math.max(weight, 20),
        reps: 8,
      });
      weekHadPr ||= isPr;
    }
    // backdate the sets so the chart buckets by session date
    await db
      .update(schema.sessionSets)
      .set({ createdAt: startedAt })
      .where(eq(schema.sessionSets.sessionId, session.id));
    prFlags.push(weekHadPr);
    console.log(`week ${w + 1}: top ${weeks[w]}kg → PR=${weekHadPr}`);
  }

  const expected = [true, true, true, true, true, true, true, true, true, true, true, false];
  const match = JSON.stringify(prFlags) === JSON.stringify(expected);
  console.log(`\nPR pattern matches expectation (11 PR weeks, final repeat week no PR): ${match ? "✅" : "❌ " + JSON.stringify(prFlags)}`);
  console.log(`bench exercise id: ${bench.id}`);
  process.exit(match ? 0 : 1);
}

main();
