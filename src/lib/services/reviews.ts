/**
 * Weekly/monthly reviews (Sprint 6): stats are SQL; narrative is LLM over
 * those stats only.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { aiClient } from "@/lib/ai/client";
import { getDb, schema } from "@/lib/db";
import type { Targets } from "@/lib/services/targets";
import { appTimeZone, dateKey } from "@/lib/time";

export interface PeriodStats {
  periodStart: string;
  periodEnd: string;
  daysWithLogs: number;
  avgKcal: number;
  avgProteinG: number;
  proteinHitDays: number | null;
  workouts: number;
  prs: number;
  weightStartKg: number | null;
  weightEndKg: number | null;
  bestDay: { date: string; proteinG: number } | null;
  worstDay: { date: string; proteinG: number } | null;
}

export async function computePeriodStats(userId: string, days: number): Promise<PeriodStats> {
  const db = getDb();
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const s = start.toISOString();
  const timeZone = appTimeZone();

  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, userId)).limit(1);
  const targets = (profile?.targets as Targets | null) ?? null;

  const daily = (await db.execute(sql`
    select date_trunc('day', ml.logged_at at time zone ${timeZone})::date as day,
           sum(i.kcal)::float as kcal, sum(i.protein_g)::float as protein
    from meal_logs ml join meal_log_items i on i.meal_log_id = ml.id
    where ml.user_id=${userId} and ml.logged_at >= ${s}
    group by 1 order by 1
  `)) as unknown as Array<{ day: string; kcal: number; protein: number }>;

  const [tr] = (await db.execute(sql`
    select (select count(*)::int from workout_sessions where user_id=${userId} and started_at >= ${s}) as workouts,
           (select count(*)::int from session_sets where user_id=${userId} and is_pr and created_at >= ${s}) as prs
  `)) as unknown as Array<{ workouts: number; prs: number }>;

  const weights = (await db.execute(sql`
    select date, weight_kg::float as kg from weight_logs
    where user_id=${userId} and date >= ${s.slice(0, 10)} order by date
  `)) as unknown as Array<{ date: string; kg: number }>;

  const byProtein = [...daily].sort((a, b) => b.protein - a.protein);
  return {
    periodStart: dateKey(start, timeZone),
    periodEnd: dateKey(end, timeZone),
    daysWithLogs: daily.length,
    avgKcal: daily.length ? Math.round(daily.reduce((x, d) => x + d.kcal, 0) / daily.length) : 0,
    avgProteinG: daily.length ? Math.round(daily.reduce((x, d) => x + d.protein, 0) / daily.length) : 0,
    proteinHitDays: targets ? daily.filter((d) => d.protein >= targets.proteinG).length : null,
    workouts: tr?.workouts ?? 0,
    prs: tr?.prs ?? 0,
    weightStartKg: weights[0]?.kg ?? null,
    weightEndKg: weights.at(-1)?.kg ?? null,
    bestDay: byProtein[0] ? { date: String(byProtein[0].day).slice(0, 10), proteinG: Math.round(byProtein[0].protein) } : null,
    worstDay: byProtein.at(-1) ? { date: String(byProtein.at(-1)!.day).slice(0, 10), proteinG: Math.round(byProtein.at(-1)!.protein) } : null,
  };
}

export async function generateReview(userId: string, periodType: "weekly" | "monthly") {
  const stats = await computePeriodStats(userId, periodType === "weekly" ? 7 : 30);
  const narrative = await aiClient.generateText({
    system: `You write ${periodType} fitness reviews. Use ONLY the provided stats — never invent or recompute numbers. Cover: consistency, nutrition (avg kcal + protein vs target-hit days), training + PRs, weight change, best/worst day, and 2 concrete suggestions for next ${periodType === "weekly" ? "week" : "month"}. 100-170 words, plain text, warm but direct.`,
    prompt: `Stats JSON:\n${JSON.stringify(stats)}`,
    temperature: 0.4,
  });

  const db = getDb();
  const row = await db.transaction(async (tx) => {
    await tx
      .delete(schema.reviews)
      .where(
        and(
          eq(schema.reviews.userId, userId),
          eq(schema.reviews.periodType, periodType),
          eq(schema.reviews.periodStart, stats.periodStart),
          eq(schema.reviews.periodEnd, stats.periodEnd),
        ),
      );
    const [inserted] = await tx
      .insert(schema.reviews)
      .values({
        userId,
        periodType,
        periodStart: stats.periodStart,
        periodEnd: stats.periodEnd,
        stats,
        narrative: narrative.trim(),
      })
      .returning({ id: schema.reviews.id });
    return inserted;
  });
  return { id: row.id, stats, narrative: narrative.trim() };
}

export async function listReviews(userId: string, limit = 12) {
  const db = getDb();
  return db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.userId, userId))
    .orderBy(desc(schema.reviews.createdAt))
    .limit(limit);
}
