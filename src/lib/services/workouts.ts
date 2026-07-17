/**
 * Workout tracking: sessions, sets, PR detection, exercise history (Sprint 3).
 * PR logic is a pure function (unit-tested) — SQL feeds it history, the LLM is
 * never involved (RULES.md #9).
 */
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export interface SetRecord {
  weightKg: number;
  reps: number;
}

/**
 * A set is a PR when it beats all history for the exercise:
 *  - heavier than any previous set, OR
 *  - more reps than ever achieved at this weight or heavier.
 * The first-ever weighted set of an exercise counts as a PR.
 */
export function isPersonalRecord(history: SetRecord[], next: SetRecord): boolean {
  if (!(next.weightKg > 0) || !(next.reps > 0)) return false;
  if (history.length === 0) return true;
  const maxWeight = Math.max(...history.map((s) => s.weightKg));
  if (next.weightKg > maxWeight) return true;
  const repsAtOrAbove = history.filter((s) => s.weightKg >= next.weightKg).map((s) => s.reps);
  if (repsAtOrAbove.length === 0) return true;
  return next.reps > Math.max(...repsAtOrAbove);
}

const num = (v: string | null) => (v == null ? 0 : Number(v));

// ── Exercises ────────────────────────────────────────────────────────────────
export async function listExercises(userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.name,
      muscleGroup: schema.exercises.muscleGroup,
      equipment: schema.exercises.equipment,
    })
    .from(schema.exercises)
    .where(or(isNull(schema.exercises.userId), eq(schema.exercises.userId, userId)))
    .orderBy(schema.exercises.name);
  return rows;
}

// ── Sessions ─────────────────────────────────────────────────────────────────
export async function startSession(userId: string, planId?: string) {
  const db = getDb();
  const [s] = await db
    .insert(schema.workoutSessions)
    .values({ userId, planId: planId ?? null, startedAt: new Date() })
    .returning({ id: schema.workoutSessions.id });
  return s.id;
}

export async function finishSession(userId: string, sessionId: string, notes?: string) {
  const db = getDb();
  await db
    .update(schema.workoutSessions)
    .set({ endedAt: new Date(), notes: notes ?? null })
    .where(and(eq(schema.workoutSessions.id, sessionId), eq(schema.workoutSessions.userId, userId)));
}

/** Log one set; PR status computed against all prior history for the exercise. */
export async function logSet(
  userId: string,
  input: { sessionId: string; exerciseId: string; setNumber: number; weightKg: number; reps: number },
) {
  const db = getDb();
  const history = await db
    .select({ weightKg: schema.sessionSets.weightKg, reps: schema.sessionSets.reps })
    .from(schema.sessionSets)
    .where(and(eq(schema.sessionSets.userId, userId), eq(schema.sessionSets.exerciseId, input.exerciseId)));

  const pr = isPersonalRecord(
    history.map((h) => ({ weightKg: num(h.weightKg), reps: h.reps ?? 0 })),
    { weightKg: input.weightKg, reps: input.reps },
  );

  await db.insert(schema.sessionSets).values({
    userId,
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    setNumber: input.setNumber,
    weightKg: String(input.weightKg),
    reps: input.reps,
    isPr: pr,
  });
  return { isPr: pr };
}

/** Active (unfinished) session with its sets, if any. */
export async function getActiveSession(userId: string) {
  const db = getDb();
  const [s] = await db
    .select()
    .from(schema.workoutSessions)
    .where(and(eq(schema.workoutSessions.userId, userId), isNull(schema.workoutSessions.endedAt)))
    .orderBy(desc(schema.workoutSessions.startedAt))
    .limit(1);
  if (!s) return null;

  const sets = await db
    .select({ set: schema.sessionSets, exerciseName: schema.exercises.name })
    .from(schema.sessionSets)
    .leftJoin(schema.exercises, eq(schema.sessionSets.exerciseId, schema.exercises.id))
    .where(eq(schema.sessionSets.sessionId, s.id))
    .orderBy(schema.sessionSets.createdAt);

  return {
    id: s.id,
    startedAt: s.startedAt,
    sets: sets.map((r) => ({
      id: r.set.id,
      exerciseId: r.set.exerciseId,
      exerciseName: r.exerciseName ?? "Exercise",
      setNumber: r.set.setNumber ?? 0,
      weightKg: num(r.set.weightKg),
      reps: r.set.reps ?? 0,
      isPr: r.set.isPr,
    })),
  };
}

/** Recent finished sessions with volume + PR count. */
export async function recentSessions(userId: string, limit = 10) {
  const db = getDb();
  const rows = (await db.execute(sql`
    select ws.id, ws.started_at, ws.ended_at,
           count(ss.id)::int as set_count,
           coalesce(sum(ss.weight_kg * ss.reps), 0)::float as volume,
           count(*) filter (where ss.is_pr)::int as prs,
           count(distinct ss.exercise_id)::int as exercise_count
    from workout_sessions ws
    left join session_sets ss on ss.session_id = ws.id
    where ws.user_id = ${userId} and ws.ended_at is not null
    group by ws.id
    order by ws.started_at desc
    limit ${limit}
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    startedAt: new Date(String(r.started_at)),
    endedAt: r.ended_at ? new Date(String(r.ended_at)) : null,
    setCount: Number(r.set_count),
    volume: Math.round(Number(r.volume)),
    prs: Number(r.prs),
    exerciseCount: Number(r.exercise_count),
  }));
}

/** Did the user finish (or start) a session today? For the dashboard tile. */
export async function workoutDoneToday(userId: string) {
  const db = getDb();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ id: schema.workoutSessions.id })
    .from(schema.workoutSessions)
    .where(
      and(
        eq(schema.workoutSessions.userId, userId),
        sql`${schema.workoutSessions.startedAt} >= ${start.toISOString()}`,
      ),
    )
    .limit(1);
  return !!row;
}

/** Per-session best set for an exercise → chart series + PR list. */
export async function exerciseHistory(userId: string, exerciseId: string) {
  const db = getDb();
  const [ex] = await db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.id, exerciseId))
    .limit(1);
  if (!ex) return null;

  const rows = (await db.execute(sql`
    select ws.started_at::date as day,
           max(ss.weight_kg)::float as top_weight,
           max(ss.weight_kg * ss.reps)::float as top_set_volume,
           bool_or(ss.is_pr) as had_pr
    from session_sets ss
    join workout_sessions ws on ws.id = ss.session_id
    where ss.user_id = ${userId} and ss.exercise_id = ${exerciseId}
    group by day
    order by day
  `)) as unknown as Array<Record<string, unknown>>;

  const series = rows.map((r) => ({
    day: String(r.day),
    topWeight: Number(r.top_weight),
    hadPr: Boolean(r.had_pr),
  }));

  const best = series.reduce((m, p) => Math.max(m, p.topWeight), 0);
  return { exercise: { id: ex.id, name: ex.name, muscleGroup: ex.muscleGroup }, series, bestWeight: best };
}
