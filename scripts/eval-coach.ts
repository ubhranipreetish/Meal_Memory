/**
 * Sprint 5 benchmark: seed a FRESH user with 3 planted patterns —
 *  (1) protein misses on 3 of last 7 days, (2) legs not trained in 9+ days,
 *  (3) weight flat for 2 weeks — then verify the daily brief surfaces all 3
 * without being told, and coach Q&A answers with exact SQL-computed numbers.
 * Run: npx tsx scripts/eval-coach.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { generateDailyBrief, coachChat } from "../src/lib/ai/coach";
import { getCoachContext } from "../src/lib/services/metrics";

const EMAIL = "pg.coach.eval@gmail.com";

async function main() {
  const db = getDb();

  // ── fresh user ─────────────────────────────────────────────────────────
  await db.execute(`
    do $$
    declare uid uuid;
    begin
      select id into uid from auth.users where email='${EMAIL}';
      if uid is null then
        uid := gen_random_uuid();
        insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,raw_app_meta_data,raw_user_meta_data)
        values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated','${EMAIL}',crypt('evalpass123',gen_salt('bf')),now(),now(),now(),'','','','','{"provider":"email","providers":["email"]}','{}');
      end if;
    end $$;
  `);
  const users = (await db.execute(`select id from auth.users where email='${EMAIL}'`)) as unknown as { id: string }[];
  const uid = users[0].id;

  // wipe prior eval data
  for (const t of ["coach_notes", "meal_log_items", "meal_logs", "session_sets", "workout_sessions", "weight_logs", "food_memory", "user_facts"]) {
    await db.execute(`delete from ${t} where user_id='${uid}'`);
  }
  const targets = { bmr: 1700, tdee: 2600, kcal: 2900, proteinG: 150, carbsG: 390, fatG: 80, waterMl: 2600, steps: 8000 };
  await db.execute(
    `insert into profiles (id,name,gender,goal,activity_level,targets) values ('${uid}','EvalUser','male','build_muscle','moderate','${JSON.stringify(targets)}')
     on conflict (id) do update set targets='${JSON.stringify(targets)}'`,
  );

  // ── plant patterns ─────────────────────────────────────────────────────
  // (1) nutrition: 7 days of logs; days 1,3,5 (ago) protein LOW (~70g), others ~160g
  const [food] = await db
    .insert(schema.foodMemory)
    .values({ userId: uid, canonicalName: "Eval Meal", servingUnit: "plate", servingQty: "1", kcal: "700", proteinG: "40", carbsG: "80", fatG: "20", source: "user_entered" })
    .returning({ id: schema.foodMemory.id });
  for (let ago = 0; ago < 7; ago++) {
    const lowProtein = [1, 3, 5].includes(ago);
    const meals = lowProtein ? 2 : 4; // 2 meals→80g protein (miss), 4→160g (hit)
    for (let m = 0; m < meals; m++) {
      const at = new Date(Date.now() - ago * 86400_000 - (m + 2) * 3600_000);
      const [log] = await db
        .insert(schema.mealLogs)
        .values({ userId: uid, loggedAt: at, mealType: "other", rawInput: "eval seed", inputMode: "text" })
        .returning({ id: schema.mealLogs.id });
      await db.insert(schema.mealLogItems).values({
        userId: uid, mealLogId: log.id, foodMemoryId: food.id, qty: "1", unit: "plate",
        kcal: "700", proteinG: "40", carbsG: "80", fatG: "20",
      });
    }
  }
  // (2) training: chest 2d ago, back 5d ago; legs LAST trained 9 days ago
  const [chest] = await db.select().from(schema.exercises).where(and(eq(schema.exercises.name, "Barbell Bench Press"), isNull(schema.exercises.userId))).limit(1);
  const [back] = await db.select().from(schema.exercises).where(and(eq(schema.exercises.name, "Barbell Row"), isNull(schema.exercises.userId))).limit(1);
  const [legs] = await db.select().from(schema.exercises).where(and(eq(schema.exercises.name, "Back Squat"), isNull(schema.exercises.userId))).limit(1);
  for (const [ex, ago] of [[chest, 2], [back, 5], [legs, 9]] as const) {
    const at = new Date(Date.now() - ago * 86400_000);
    const [s] = await db.insert(schema.workoutSessions).values({ userId: uid, startedAt: at, endedAt: at }).returning({ id: schema.workoutSessions.id });
    await db.insert(schema.sessionSets).values({ userId: uid, sessionId: s.id, exerciseId: ex.id, setNumber: 1, weightKg: "60", reps: 8, createdAt: at });
  }
  // (3) weight: flat 75.0 for 21 days
  for (let ago = 0; ago < 21; ago++) {
    await db.insert(schema.weightLogs).values({
      userId: uid, date: new Date(Date.now() - ago * 86400_000).toISOString().slice(0, 10), weightKg: "75.0",
    });
  }

  // ── verify metrics ground truth first ─────────────────────────────────
  const ctx = await getCoachContext(uid);
  console.log("metrics:", JSON.stringify({
    hitDays: ctx.last7d.proteinTargetHitDays, days: ctx.last7d.daysWithLogs,
    legsGap: ctx.training.daysSinceByMuscleGroup["legs"],
    weightChange: ctx.weight.changeLast14dKg,
    proteinRemaining: ctx.today.proteinRemaining,
  }));
  const groundOk =
    ctx.last7d.daysWithLogs === 7 && ctx.last7d.proteinTargetHitDays === 4 &&
    (ctx.training.daysSinceByMuscleGroup["legs"] ?? 0) >= 8 &&
    Math.abs(ctx.weight.changeLast14dKg ?? 9) < 0.05;
  console.log(`metrics ground truth: ${groundOk ? "✅" : "❌"}`);

  // ── the brief must surface all 3 planted issues ────────────────────────
  const brief = await generateDailyBrief(uid);
  console.log(`\n--- BRIEF ---\n${brief}\n-------------`);
  const mentionsProtein = /protein/i.test(brief);
  const mentionsLegs = /leg/i.test(brief);
  const mentionsWeight = /(weight|plateau|stall|hasn'?t (changed|moved)|flat|same)/i.test(brief);
  console.log(`surfaces: protein=${mentionsProtein} legs=${mentionsLegs} weight-plateau=${mentionsWeight}`);
  const briefOk = mentionsProtein && mentionsLegs && mentionsWeight;

  // ── Q&A with exact numbers ─────────────────────────────────────────────
  const q1 = await coachChat(uid, "How much protein do I have left today?", []);
  const expectProtein = String(ctx.today.proteinRemaining);
  const q1ok = q1.reply.includes(expectProtein);
  console.log(`\nQ1 protein-left (expect ${expectProtein}): ${q1ok ? "✅" : "❌"} — "${q1.reply.slice(0, 120)}"`);

  const q2 = await coachChat(uid, "When did I last train chest?", []);
  const q2ok = /2\s*day/i.test(q2.reply);
  console.log(`Q2 chest 2 days ago: ${q2ok ? "✅" : "❌"} — "${q2.reply.slice(0, 120)}"`);

  const allOk = groundOk && briefOk && q1ok && q2ok;
  console.log(`\n=== COACH EVAL: ${allOk ? "ALL PASS ✅" : "SOME FAILED ❌"} ===`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
