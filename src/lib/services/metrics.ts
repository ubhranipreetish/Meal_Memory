/**
 * Coach metrics layer (Sprint 5) — deterministic SQL only (RULES.md #9).
 * The LLM receives these computed numbers and explains them; it never
 * calculates anything itself.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getTodayTotals } from "@/lib/services/foodMemory";
import type { Targets } from "@/lib/services/targets";

export interface CoachContext {
  profile: {
    name: string | null;
    goal: string | null;
    dietType: string | null;
    targets: Targets | null;
  };
  today: {
    kcal: number;
    proteinG: number;
    waterMl: number;
    kcalRemaining: number | null;
    proteinRemaining: number | null;
    workoutDone: boolean;
  };
  last7d: {
    daysWithLogs: number;
    avgKcal: number;
    avgProteinG: number;
    proteinTargetHitDays: number | null; // of daysWithLogs
  };
  weight: {
    latestKg: number | null;
    changeLast14dKg: number | null; // 7d MA now vs 7d MA 14 days ago
    daysTracked: number;
  };
  training: {
    sessionsLast7d: number;
    daysSinceByMuscleGroup: Record<string, number>; // trained groups only
    neverTrainedRecently: string[]; // core groups with no session in 30d
    prsLast7d: number;
  };
  facts: string[];
}

const CORE_GROUPS = ["chest", "back", "legs", "shoulders"];

/**
 * Deterministic, code-phrased signals the coach MUST address (RULES.md #9:
 * SQL computes, code phrases, the LLM explains). Problems first, then wins.
 */
export function deriveSignals(ctx: CoachContext): string[] {
  const s: string[] = [];
  const { last7d, weight, training, today, profile } = ctx;

  if (last7d.proteinTargetHitDays != null && last7d.daysWithLogs >= 3) {
    const missed = last7d.daysWithLogs - last7d.proteinTargetHitDays;
    if (missed >= 2) {
      s.push(
        `PROBLEM: protein target (${profile.targets?.proteinG}g) missed on ${missed} of the last ${last7d.daysWithLogs} logged days (7-day avg ${last7d.avgProteinG}g)`,
      );
    }
  }
  for (const [grp, days] of Object.entries(training.daysSinceByMuscleGroup)) {
    if (CORE_GROUPS.includes(grp) && days >= 7) {
      s.push(`PROBLEM: ${grp} not trained in ${days} days`);
    }
  }
  for (const grp of training.neverTrainedRecently) {
    s.push(`PROBLEM: ${grp} not trained at all in the last 30 days`);
  }
  if (weight.daysTracked >= 14 && weight.changeLast14dKg != null && Math.abs(weight.changeLast14dKg) < 0.3) {
    s.push(
      `PROBLEM: weight unchanged over the last 2 weeks (7-day avg moved ${weight.changeLast14dKg}kg) despite goal "${profile.goal}"`,
    );
  }
  if (training.sessionsLast7d < 2) {
    s.push(`PROBLEM: only ${training.sessionsLast7d} workout(s) in the last 7 days`);
  }
  if (training.prsLast7d > 0) {
    s.push(`WIN: ${training.prsLast7d} personal record(s) this week`);
  }
  if (today.proteinRemaining === 0 && today.proteinG > 0) {
    s.push(`WIN: today's protein target already hit (${today.proteinG}g)`);
  }
  return s;
}

export async function getCoachContext(userId: string): Promise<CoachContext> {
  const db = getDb();
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [profileRow] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, userId)).limit(1);
  const targets = (profileRow?.targets as Targets | null) ?? null;

  const today = await getTodayTotals(userId);

  const [workout] = (await db.execute(sql`
    select exists(
      select 1 from workout_sessions
      where user_id=${userId} and started_at >= date_trunc('day', now())
    ) as done
  `)) as unknown as Array<{ done: boolean }>;

  // last-7-day nutrition per day, then aggregate
  const [nut] = (await db.execute(sql`
    with daily as (
      select date_trunc('day', ml.logged_at) as day,
             sum(i.kcal)::float as kcal, sum(i.protein_g)::float as protein
      from meal_logs ml join meal_log_items i on i.meal_log_id = ml.id
      where ml.user_id=${userId} and ml.logged_at >= ${d7}
      group by 1
    )
    select count(*)::int as days,
           coalesce(avg(kcal),0)::float as avg_kcal,
           coalesce(avg(protein),0)::float as avg_protein,
           ${targets ? sql`count(*) filter (where protein >= ${targets.proteinG})::int` : sql`null`} as hit_days
    from daily
  `)) as unknown as Array<Record<string, unknown>>;

  const [w] = (await db.execute(sql`
    with ordered as (
      select date, weight_kg::float as kg from weight_logs
      where user_id=${userId} order by date desc limit 60
    ),
    ma_now as (select avg(kg) as v from (select kg from ordered limit 7) t),
    ma_then as (select avg(kg) as v from (select kg from ordered offset 14 limit 7) t)
    select (select kg from ordered limit 1) as latest,
           (select count(*)::int from ordered) as days,
           (select v from ma_now) as manow,
           (select v from ma_then) as mathen
  `)) as unknown as Array<Record<string, unknown>>;

  const groups = (await db.execute(sql`
    select e.muscle_group as grp,
           extract(day from now() - max(ws.started_at))::int as days_since
    from session_sets ss
    join workout_sessions ws on ws.id = ss.session_id
    join exercises e on e.id = ss.exercise_id
    where ss.user_id=${userId} and ws.started_at >= ${d30} and e.muscle_group is not null
    group by e.muscle_group
  `)) as unknown as Array<{ grp: string; days_since: number }>;

  const [tr] = (await db.execute(sql`
    select
      (select count(*)::int from workout_sessions where user_id=${userId} and started_at >= ${d7}) as sessions7,
      (select count(*)::int from session_sets where user_id=${userId} and is_pr and created_at >= ${d7}) as prs7
  `)) as unknown as Array<Record<string, unknown>>;

  const factsRows = await db
    .select({ fact: schema.userFacts.fact })
    .from(schema.userFacts)
    .where(eq(schema.userFacts.userId, userId))
    .limit(20);

  const daysSince: Record<string, number> = {};
  for (const g of groups) daysSince[g.grp] = g.days_since;

  return {
    profile: {
      name: profileRow?.name ?? null,
      goal: profileRow?.goal ?? null,
      dietType: profileRow?.dietType ?? null,
      targets,
    },
    today: {
      kcal: today.kcal,
      proteinG: today.proteinG,
      waterMl: today.waterMl,
      kcalRemaining: targets ? Math.max(0, targets.kcal - today.kcal) : null,
      proteinRemaining: targets ? Math.max(0, targets.proteinG - today.proteinG) : null,
      workoutDone: workout?.done ?? false,
    },
    last7d: {
      daysWithLogs: Number(nut?.days ?? 0),
      avgKcal: Math.round(Number(nut?.avg_kcal ?? 0)),
      avgProteinG: Math.round(Number(nut?.avg_protein ?? 0)),
      proteinTargetHitDays: nut?.hit_days == null ? null : Number(nut.hit_days),
    },
    weight: {
      latestKg: w?.latest == null ? null : Number(w.latest),
      changeLast14dKg:
        w?.manow == null || w?.mathen == null
          ? null
          : Math.round((Number(w.manow) - Number(w.mathen)) * 10) / 10,
      daysTracked: Number(w?.days ?? 0),
    },
    training: {
      sessionsLast7d: Number(tr?.sessions7 ?? 0),
      daysSinceByMuscleGroup: daysSince,
      neverTrainedRecently: CORE_GROUPS.filter((g) => !(g in daysSince)),
      prsLast7d: Number(tr?.prs7 ?? 0),
    },
    facts: factsRows.map((f) => f.fact),
  };
}
