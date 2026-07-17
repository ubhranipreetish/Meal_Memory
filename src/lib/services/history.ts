/**
 * Meal history + food detail services (Sprint 2).
 * Editing a food's nutrition NEVER rewrites past meal_log_items — those are
 * denormalized snapshots (RULES.md #12).
 */
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const num = (v: string | null) => (v == null ? 0 : Number(v));

export interface HistoryFilter {
  q?: string;
  mealType?: string;
  limit?: number;
}

/**
 * Search meal logs by text (raw utterance or food name) and meal type.
 * Single round trip (CTE + join) — cloud DB latency makes sequential queries
 * blow the <500ms budget.
 */
export async function searchHistory(userId: string, f: HistoryFilter = {}) {
  const db = getDb();
  const limit = Math.min(f.limit ?? 50, 200);
  const q = f.q?.trim() ? `%${f.q.trim()}%` : null;

  const rows = (await db.execute(sql`
    with logs as (
      select ml.id, ml.logged_at, ml.meal_type, ml.raw_input
      from meal_logs ml
      where ml.user_id = ${userId}
        ${f.mealType ? sql`and ml.meal_type = ${f.mealType}` : sql``}
        ${
          q
            ? sql`and (ml.raw_input ilike ${q} or exists (
                 select 1 from meal_log_items i2
                 join food_memory f2 on f2.id = i2.food_memory_id
                 where i2.meal_log_id = ml.id and f2.canonical_name ilike ${q}))`
            : sql``
        }
      order by ml.logged_at desc
      limit ${limit}
    )
    select l.id as log_id, l.logged_at, l.meal_type, l.raw_input,
           i.id as item_id, i.food_memory_id, i.qty, i.unit, i.kcal, i.protein_g,
           fm.canonical_name
    from logs l
    left join meal_log_items i on i.meal_log_id = l.id
    left join food_memory fm on fm.id = i.food_memory_id
    order by l.logged_at desc
  `)) as unknown as Array<Record<string, unknown>>;

  const byLog = new Map<
    string,
    {
      id: string;
      loggedAt: Date;
      mealType: string | null;
      rawInput: string;
      totalKcal: number;
      items: { id: string; name: string; foodMemoryId: string | null; qty: number; unit: string | null; kcal: number; proteinG: number }[];
    }
  >();

  for (const r of rows) {
    const logId = String(r.log_id);
    if (!byLog.has(logId)) {
      byLog.set(logId, {
        id: logId,
        loggedAt: new Date(String(r.logged_at)),
        mealType: (r.meal_type as string | null) ?? null,
        rawInput: String(r.raw_input),
        totalKcal: 0,
        items: [],
      });
    }
    if (r.item_id != null) {
      const entry = byLog.get(logId)!;
      const kcal = Math.round(Number(r.kcal ?? 0));
      entry.totalKcal += kcal;
      entry.items.push({
        id: String(r.item_id),
        name: (r.canonical_name as string | null) ?? "Food",
        foodMemoryId: (r.food_memory_id as string | null) ?? null,
        qty: Number(r.qty ?? 0),
        unit: (r.unit as string | null) ?? null,
        kcal,
        proteinG: Math.round(Number(r.protein_g ?? 0)),
      });
    }
  }
  return [...byLog.values()];
}

/** Food lists for tabs + quick-pick chips. */
export async function listFoods(
  userId: string,
  kind: "recent" | "frequent" | "favorites",
  limit = 12,
) {
  const db = getDb();
  const base = db.select().from(schema.foodMemory);
  const rows =
    kind === "favorites"
      ? await base
          .where(and(eq(schema.foodMemory.userId, userId), eq(schema.foodMemory.isFavorite, true)))
          .orderBy(desc(schema.foodMemory.lastLoggedAt))
          .limit(limit)
      : kind === "frequent"
        ? await base
            .where(eq(schema.foodMemory.userId, userId))
            .orderBy(desc(schema.foodMemory.timesLogged))
            .limit(limit)
        : await base
            .where(eq(schema.foodMemory.userId, userId))
            .orderBy(desc(schema.foodMemory.lastLoggedAt))
            .limit(limit);

  return rows.map((m) => ({
    id: m.id,
    name: m.canonicalName,
    unit: m.servingUnit,
    kcal: Math.round(num(m.kcal)),
    proteinG: Math.round(num(m.proteinG)),
    timesLogged: m.timesLogged,
    isFavorite: m.isFavorite,
    source: m.source,
  }));
}

/** Re-log a past meal as a fresh log right now (snapshot values copied). */
export async function relogMeal(userId: string, mealLogId: string) {
  const db = getDb();
  const now = new Date();

  const [orig] = await db
    .select()
    .from(schema.mealLogs)
    .where(and(eq(schema.mealLogs.id, mealLogId), eq(schema.mealLogs.userId, userId)))
    .limit(1);
  if (!orig) throw new Error("Meal not found");

  const items = await db
    .select()
    .from(schema.mealLogItems)
    .where(eq(schema.mealLogItems.mealLogId, mealLogId));

  const [log] = await db
    .insert(schema.mealLogs)
    .values({
      userId,
      loggedAt: now,
      mealType: orig.mealType,
      rawInput: `${orig.rawInput} (re-logged)`,
      inputMode: "quick_pick",
    })
    .returning({ id: schema.mealLogs.id });

  for (const it of items) {
    await db.insert(schema.mealLogItems).values({
      userId,
      mealLogId: log.id,
      foodMemoryId: it.foodMemoryId,
      qty: it.qty,
      unit: it.unit,
      kcal: it.kcal,
      proteinG: it.proteinG,
      carbsG: it.carbsG,
      fatG: it.fatG,
    });
    if (it.foodMemoryId) {
      await db
        .update(schema.foodMemory)
        .set({ timesLogged: sql`${schema.foodMemory.timesLogged} + 1`, lastLoggedAt: now })
        .where(eq(schema.foodMemory.id, it.foodMemoryId));
    }
  }
  return { mealLogId: log.id };
}

/** Log a single known food right now (quick-pick chip → one tap). */
export async function quickLogFood(userId: string, foodMemoryId: string, qty = 1) {
  const db = getDb();
  const now = new Date();
  const [m] = await db
    .select()
    .from(schema.foodMemory)
    .where(and(eq(schema.foodMemory.id, foodMemoryId), eq(schema.foodMemory.userId, userId)))
    .limit(1);
  if (!m) throw new Error("Food not found");

  const { inferMealType } = await import("./foodMemory");
  const [log] = await db
    .insert(schema.mealLogs)
    .values({
      userId,
      loggedAt: now,
      mealType: inferMealType(now),
      rawInput: `${qty} ${m.servingUnit} ${m.canonicalName}`,
      inputMode: "quick_pick",
    })
    .returning({ id: schema.mealLogs.id });

  await db.insert(schema.mealLogItems).values({
    userId,
    mealLogId: log.id,
    foodMemoryId: m.id,
    qty: String(qty),
    unit: m.servingUnit,
    kcal: String(num(m.kcal) * qty),
    proteinG: String(num(m.proteinG) * qty),
    carbsG: String(num(m.carbsG) * qty),
    fatG: String(num(m.fatG) * qty),
  });
  await db
    .update(schema.foodMemory)
    .set({ timesLogged: sql`${schema.foodMemory.timesLogged} + 1`, lastLoggedAt: now })
    .where(eq(schema.foodMemory.id, m.id));

  return { mealLogId: log.id };
}

/** Food detail with aliases + recent log stats. */
export async function getFood(userId: string, foodId: string) {
  const db = getDb();
  const [m] = await db
    .select()
    .from(schema.foodMemory)
    .where(and(eq(schema.foodMemory.id, foodId), eq(schema.foodMemory.userId, userId)))
    .limit(1);
  if (!m) return null;
  const aliases = await db
    .select({ alias: schema.foodAliases.alias })
    .from(schema.foodAliases)
    .where(eq(schema.foodAliases.foodMemoryId, foodId));
  return {
    id: m.id,
    name: m.canonicalName,
    unit: m.servingUnit,
    kcal: num(m.kcal),
    proteinG: num(m.proteinG),
    carbsG: num(m.carbsG),
    fatG: num(m.fatG),
    source: m.source,
    confidence: m.confidence ? Number(m.confidence) : null,
    assumptions: m.assumptions,
    timesLogged: m.timesLogged,
    lastLoggedAt: m.lastLoggedAt,
    isFavorite: m.isFavorite,
    aliases: aliases.map((a) => a.alias),
  };
}

/** Update per-unit nutrition (user is the authority — source becomes user_entered). */
export async function updateFoodNutrition(
  userId: string,
  foodId: string,
  values: { kcal: number; proteinG: number; carbsG: number; fatG: number },
) {
  const db = getDb();
  await db
    .update(schema.foodMemory)
    .set({
      kcal: String(values.kcal),
      proteinG: String(values.proteinG),
      carbsG: String(values.carbsG),
      fatG: String(values.fatG),
      source: "user_entered",
      confidence: "1",
      updatedAt: new Date(),
    })
    .where(and(eq(schema.foodMemory.id, foodId), eq(schema.foodMemory.userId, userId)));
}

export async function toggleFavorite(userId: string, foodId: string) {
  const db = getDb();
  await db
    .update(schema.foodMemory)
    .set({ isFavorite: sql`not ${schema.foodMemory.isFavorite}` })
    .where(and(eq(schema.foodMemory.id, foodId), eq(schema.foodMemory.userId, userId)));
}
