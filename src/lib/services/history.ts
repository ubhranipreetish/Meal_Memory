/**
 * Meal history + food detail services (Sprint 2).
 * Editing a food's nutrition NEVER rewrites past meal_log_items — those are
 * denormalized snapshots (RULES.md #12).
 */
import { normalizeAlooParatha } from "./quickParse";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { MealType } from "@/types/food";

const num = (v: string | null) => (v == null ? 0 : Number(v));

export interface HistoryFilter {
  q?: string;
  mealType?: string;
  limit?: number;
}

export function searchHistory(userId: string, filter: HistoryFilter = {}) {
  return readMealLogs(userId, { ...filter, limit: Math.min(filter.limit ?? 50, 200) });
}

/** Read every meal snapshot in the selected date window. */
export function readMealWindow(userId: string, start: Date, end: Date) {
  return readMealLogs(userId, { start, end });
}

async function readMealLogs(userId: string, filter: HistoryFilter & { start?: Date; end?: Date }) {
  const db = getDb();
  const q = filter.q?.trim() ? `%${filter.q.trim()}%` : null;
  const rows = (await db.execute(sql`
    with logs as (
      select ml.id, ml.logged_at, ml.meal_type, ml.raw_input
      from meal_logs ml
      where ml.user_id = ${userId}
        ${filter.start ? sql`and ml.logged_at >= ${filter.start.toISOString()}` : sql``}
        ${filter.end ? sql`and ml.logged_at < ${filter.end.toISOString()}` : sql``}
        ${filter.mealType ? sql`and ml.meal_type = ${filter.mealType}` : sql``}
        ${q ? sql`and (ml.raw_input ilike ${q} or exists (
          select 1 from meal_log_items item
          left join food_memory food on food.id = item.food_memory_id and food.user_id = ml.user_id
          where item.meal_log_id = ml.id
            and (item.name ilike ${q} or food.canonical_name ilike ${q})
        ))` : sql``}
      order by ml.logged_at desc
      ${filter.limit !== undefined ? sql`limit ${filter.limit}` : sql``}
    )
    select l.id as log_id, l.logged_at, l.meal_type, l.raw_input,
           i.id as item_id, i.food_memory_id, i.qty, i.unit, i.kcal, i.protein_g,
           coalesce(i.name, fm.canonical_name) as canonical_name
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
      const kcal = num(r.kcal as string | null);
      entry.totalKcal += kcal;
      entry.items.push({
        id: String(r.item_id),
        name: (r.canonical_name as string | null) ?? "Food",
        foodMemoryId: (r.food_memory_id as string | null) ?? null,
        qty: Number(r.qty ?? 0),
        unit: (r.unit as string | null) ?? null,
        kcal,
        proteinG: num(r.protein_g as string | null),
      });
    }
  }
  return [...byLog.values()];
}

/** All saved foods, grouped by the meal where each was last logged. */
export async function listSavedFoods(userId: string) {
  const db = getDb();
  const rows = await db.execute<{
    id: string; name: string; unit: string; serving_qty: string; kcal: string | null;
    is_favorite: boolean; meal_type: string | null;
  }>(sql`
    select f.id, f.canonical_name as name, f.serving_unit as unit, f.serving_qty,
           f.kcal, f.is_favorite, latest.meal_type
    from food_memory f
    left join lateral (
      select m.meal_type
      from meal_log_items i
      join meal_logs m on m.id = i.meal_log_id and m.user_id = f.user_id
      where i.food_memory_id = f.id and i.user_id = f.user_id
      order by m.logged_at desc, m.id desc
      limit 1
    ) latest on true
    where f.user_id = ${userId}
    order by f.is_favorite desc, lower(f.canonical_name), f.id
  `);
  return rows.map((food) => ({
    id: food.id,
    name: normalizeAlooParatha(food.name),
    unit: food.unit,
    servingQty: Number(food.serving_qty) || 1,
    kcal: Math.round(num(food.kcal)),
    isFavorite: food.is_favorite,
    mealType: food.meal_type,
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
      name: it.name,
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

/**
 * Log a single known food right now (quick-pick chip → one tap).
 * Default qty is one serving of the food: 1 piece/bowl…, or 100 for g/ml foods.
 */
export async function quickLogFood(userId: string, foodMemoryId: string, qty?: number, mealType?: MealType) {
  const db = getDb();
  const now = new Date();
  const [m] = await db
    .select()
    .from(schema.foodMemory)
    .where(and(eq(schema.foodMemory.id, foodMemoryId), eq(schema.foodMemory.userId, userId)))
    .limit(1);
  if (!m) throw new Error("Food not found");

  const perQty = Number(m.servingQty) || 1;
  const q = qty ?? perQty;
  const f = q / perQty;
  const { inferMealType } = await import("./foodMemory");
  return db.transaction(async (tx) => {
    const [log] = await tx
      .insert(schema.mealLogs)
      .values({
        userId,
        loggedAt: now,
        mealType: mealType ?? inferMealType(now),
        rawInput: `${q} ${m.servingUnit} ${m.canonicalName}`,
        inputMode: "quick_pick",
      })
      .returning({ id: schema.mealLogs.id });

    await tx.insert(schema.mealLogItems).values({
      userId,
      mealLogId: log.id,
      foodMemoryId: m.id,
      name: normalizeAlooParatha(m.canonicalName),
      qty: String(q),
      unit: m.servingUnit,
      kcal: String(num(m.kcal) * f),
      proteinG: String(num(m.proteinG) * f),
      carbsG: String(num(m.carbsG) * f),
      fatG: String(num(m.fatG) * f),
    });
    await tx
      .update(schema.foodMemory)
      .set({ timesLogged: sql`${schema.foodMemory.timesLogged} + 1`, lastLoggedAt: now })
      .where(eq(schema.foodMemory.id, m.id));

    return { mealLogId: log.id };
  });
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
    name: normalizeAlooParatha(m.canonicalName),
    unit: m.servingUnit,
    servingQty: Number(m.servingQty) || 1,
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
