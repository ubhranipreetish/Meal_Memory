/**
 * Food memory resolution + logging (RULES.md #5, #14, #15).
 *
 * Resolution order: exact alias match → (Sprint 2: embedding fuzzy match) →
 * LLM estimation → user confirm → store permanently.
 *
 * Path A (zero AI): deterministic quick-parse + every segment hits an alias.
 * Path B (one AI call): Gemini parses AND estimates per-unit nutrition in a
 * single call; stored values override estimates for known foods.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { parseFoodUtterance } from "@/lib/ai/foodParser";
import { embedText } from "@/lib/ai/embeddings";
import {
  aliasCandidates,
  normalizeAlias,
  normalizeAlooParatha,
  quickParseSegments,
  quickParseWater,
} from "@/lib/services/quickParse";
import {
  MEAL_TYPES,
  itemTotals,
  servingSize,
  type ConfirmLogInput,
  type MealType,
  type ResolvedItem,
  type ResolvedLog,
} from "@/types/food";
import { dateKey, dayBounds, hourInTimeZone, mealLogDate } from "@/lib/time";

/**
 * Fuzzy-match ceiling: cosine distance must be below this AND the candidate
 * must share ≥1 meaningful token with the stored name/aliases (guards against
 * embedding near-misses like "aloo paratha" ≈ "paneer paratha").
 */
const FUZZY_MAX_DISTANCE = 0.25;

function sharedToken(a: string, b: string): boolean {
  const ta = new Set(normalizeAlias(a).split(" ").filter((t) => t.length > 2));
  return normalizeAlias(b)
    .split(" ")
    .some((t) => t.length > 2 && ta.has(t));
}

/** Embedding-based fuzzy lookup against the user's food memory (Sprint 2). */
async function fuzzyLookup(userId: string, name: string): Promise<MemoryRow | null> {
  const db = getDb();
  let vec: number[];
  try {
    vec = await embedText(name);
  } catch {
    return null; // embeddings unavailable → behave like a miss
  }
  const lit = `[${vec.join(",")}]`;
  const rows = (await db.execute(
    sql`select *, (embedding <=> ${lit}::vector) as dist
        from food_memory
        where user_id = ${userId} and embedding is not null
        order by embedding <=> ${lit}::vector
        limit 1`,
  )) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  const dist = Number(row.dist);
  const canonical = String(row.canonical_name);
  const isAlooParatha = (value: string) => /\bAloo Parathas?\b/.test(normalizeAlooParatha(value));
  if (isAlooParatha(name) !== isAlooParatha(canonical)) return null;
  if (!(dist < FUZZY_MAX_DISTANCE) || !sharedToken(normalizeAlooParatha(name), normalizeAlooParatha(canonical))) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    canonicalName: canonical,
    servingUnit: String(row.serving_unit),
    servingQty: String(row.serving_qty),
    kcal: row.kcal as string | null,
    proteinG: row.protein_g as string | null,
    carbsG: row.carbs_g as string | null,
    fatG: row.fat_g as string | null,
  } as MemoryRow;
}

/** Meal slot from local time when the user didn't say (pure; unit-tested). */
export function inferMealType(d: Date = new Date(), timeZone?: string): MealType {
  const h = hourInTimeZone(d, timeZone);
  if (h < 4) return "dinner"; // late-night eating counts toward dinner
  if (h < 11) return "breakfast";
  if (h < 15.5) return "lunch";
  if (h < 18.5) return "snack";
  return "dinner";
}

type MemoryRow = typeof schema.foodMemory.$inferSelect;

/** Look up a set of names against the user's aliases. Returns name→memory row. */
async function lookupAliases(
  userId: string,
  names: string[],
): Promise<Map<string, MemoryRow>> {
  const db = getDb();
  const candidates = [...new Set(names.flatMap(aliasCandidates))];
  if (candidates.length === 0) return new Map();

  const rows = await db
    .select({ alias: schema.foodAliases.alias, memory: schema.foodMemory })
    .from(schema.foodAliases)
    .innerJoin(schema.foodMemory, eq(schema.foodAliases.foodMemoryId, schema.foodMemory.id))
    .where(and(eq(schema.foodAliases.userId, userId), inArray(schema.foodAliases.alias, candidates)));

  const byAlias = new Map(rows.map((r) => [r.alias, r.memory]));
  const out = new Map<string, MemoryRow>();
  for (const name of names) {
    for (const cand of aliasCandidates(name)) {
      const hit = byAlias.get(cand);
      if (hit) {
        out.set(name, hit);
        break;
      }
    }
  }
  return out;
}

const num = (v: string | null) => (v == null ? 0 : Number(v));

function memoryToPerUnit(m: MemoryRow) {
  return { kcal: num(m.kcal), proteinG: num(m.proteinG), carbsG: num(m.carbsG), fatG: num(m.fatG), fiberG: num(m.fiberG) };
}

/**
 * Resolve an utterance into loggable items.
 * Never throws on AI failure at the call site's expense — callers surface the
 * error and the UI offers the manual fallback (RULES.md #13).
 */
export async function resolveUtterance(userId: string, utterance: string): Promise<ResolvedLog> {
  // Water-only utterance → zero AI.
  const water = quickParseWater(utterance);
  if (water) {
    return {
      raw: utterance,
      mealType: inferMealType(),
      waterMl: water.ml,
      items: [],
      needsConfirmation: false,
      zeroAi: true,
    };
  }

  // Path A: deterministic parse + full alias coverage → zero AI.
  const segments = quickParseSegments(utterance);
  if (segments) {
    const hits = await lookupAliases(userId, segments.map((s) => s.namePart));
    if (segments.every((s) => hits.has(s.namePart))) {
      // A measured↔countable unit mismatch ("1 glass" of a food saved per 100 ml)
      // can't be scaled deterministically → let the AI estimate that phrasing.
      const convertible = segments.every((s) => {
        const m = hits.get(s.namePart)!;
        return !s.unit || servingSize(s.unit) === servingSize(m.servingUnit);
      });
      if (!convertible) return resolveViaAi(userId, utterance);
      const items: ResolvedItem[] = segments.map((s) => {
        const m = hits.get(s.namePart)!;
        const unit = s.unit ?? m.servingUnit;
        return {
          name: normalizeAlooParatha(m.canonicalName),
          typedName: s.namePart,
          qty: s.qty,
          unit,
          perQty: Number(m.servingQty) || servingSize(unit),
          status: "known",
          foodMemoryId: m.id,
          memoryUnit: m.servingUnit,
          perUnit: memoryToPerUnit(m),
        };
      });
      return {
        raw: utterance,
        mealType: inferMealType(),
        items,
        needsConfirmation: false,
        zeroAi: true,
      };
    }
  }

  return resolveViaAi(userId, utterance);
}

/** Path B: one AI call parses + estimates; memory overrides estimates. */
async function resolveViaAi(userId: string, utterance: string): Promise<ResolvedLog> {
  const parsed = await parseFoodUtterance(utterance);
  const items = await resolveParsedItems(userId, parsed.items);

  return {
    raw: utterance,
    mealType: parsed.mealType ?? inferMealType(),
    mealTypeExplicit: parsed.mealType != null,
    waterMl: parsed.waterMl ?? undefined,
    items,
    needsConfirmation: items.some((i) => i.status === "new"),
    zeroAi: false,
  };
}

/**
 * Resolve already-parsed items (from the text parser OR the photo analyzer)
 * against food memory: exact alias → fuzzy embedding match → new (RULES.md #5).
 */
export async function resolveParsedItems(
  userId: string,
  parsedItems: import("@/types/food").ParsedItem[],
): Promise<ResolvedItem[]> {
  const hits = await lookupAliases(userId, parsedItems.map((i) => i.name));
  return Promise.all(
    parsedItems.map(async (i) => {
      const m = hits.get(i.name) ?? (await fuzzyLookup(userId, i.name));
      const estimate = { kcal: i.kcal, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, fiberG: i.fiberG ?? 0 };
      if (m) {
        const memoryQty = Number(m.servingQty) || servingSize(m.servingUnit);
        // Same kind of unit → trust the user's confirmed memory values.
        if (servingSize(i.unit) === servingSize(m.servingUnit)) {
          return {
            name: normalizeAlooParatha(m.canonicalName),
            typedName: i.name,
            qty: i.qty,
            unit: i.unit,
            perQty: memoryQty,
            status: "known" as const,
            foodMemoryId: m.id,
            memoryUnit: m.servingUnit,
            perUnit: memoryToPerUnit(m),
          };
        }
        // Different kind ("glass" vs saved "per 100 ml") → keep the memory
        // link (stats, no duplicate) but use the AI estimate for THIS unit.
        return {
          name: normalizeAlooParatha(m.canonicalName),
          typedName: i.name,
          qty: i.qty,
          unit: i.unit,
          perQty: servingSize(i.unit),
          status: "known" as const,
          foodMemoryId: m.id,
          memoryUnit: m.servingUnit,
          perUnit: estimate,
          confidence: i.confidence,
          assumptions: `Estimated per ${i.unit} — your saved ${m.canonicalName} is per ${memoryQty} ${m.servingUnit}`,
        };
      }
      return {
        name: i.name,
        typedName: i.name,
        qty: i.qty,
        unit: i.unit,
        perQty: servingSize(i.unit),
        status: "new" as const,
        perUnit: estimate,
        confidence: i.confidence,
        assumptions: i.assumptions ?? null,
      };
    }),
  );
}

/**
 * Persist a confirmed log: create memory rows + aliases for new foods,
 * bump stats on known foods, write meal_log + item snapshots and water.
 */
export async function confirmAndLog(userId: string, input: ConfirmLogInput) {
  const db = getDb();
  const now = new Date();
  const loggedAt = mealLogDate(input.date, now);
  const pendingEmbeddings: { id: string; name: string }[] = [];

  const result = await db.transaction(async (tx) => {
    // 1. Ensure a food_memory row per item (null when the user chose not to save).
    const itemMemoryIds: (string | null)[] = [];
    for (const item of input.items) {
      if (item.status === "known" && item.foodMemoryId) {
        const updated = await tx
        .update(schema.foodMemory)
        .set({
          timesLogged: sql`${schema.foodMemory.timesLogged} + 1`,
          lastLoggedAt: now,
          updatedAt: now,
          // User edited the values in the review card and asked to keep them:
          // the user is the authority (ADR-006). Past logs keep their snapshots.
          ...(item.updateMemory
            ? {
                canonicalName: item.name,
                servingUnit: item.unit,
                servingQty: String(item.perQty),
                kcal: String(item.perUnit.kcal),
                proteinG: String(item.perUnit.proteinG),
                carbsG: String(item.perUnit.carbsG),
                fatG: String(item.perUnit.fatG),
                fiberG: String(item.perUnit.fiberG ?? 0),
                source: "user_entered",
                confidence: "1",
              }
            : {}),
        })
        .where(and(eq(schema.foodMemory.id, item.foodMemoryId), eq(schema.foodMemory.userId, userId)))
        .returning({ id: schema.foodMemory.id });
        if (updated.length === 0) throw new Error("Saved food not found");
        itemMemoryIds.push(updated[0].id);

        // Alias learning: a new phrasing that resolved (via AI or fuzzy match)
        // becomes an exact alias → future logs are zero-AI (Sprint 2).
        const typed = normalizeAlias(item.typedName);
        if (typed && typed !== normalizeAlias(item.name)) {
          await tx
            .insert(schema.foodAliases)
            .values({ userId, foodMemoryId: updated[0].id, alias: typed })
            .onConflictDoNothing();
        }
      } else if (!item.saveToMemory) {
        itemMemoryIds.push(null); // one-off: logged with its snapshot only
      } else {
        const [mem] = await tx
          .insert(schema.foodMemory)
          .values({
            userId,
            canonicalName: item.name,
            servingUnit: item.unit,
            servingQty: String(item.perQty),
            kcal: String(item.perUnit.kcal),
            proteinG: String(item.perUnit.proteinG),
            carbsG: String(item.perUnit.carbsG),
            fatG: String(item.perUnit.fatG),
            fiberG: String(item.perUnit.fiberG ?? 0),
            source: item.confidence != null ? "llm_estimate" : "user_entered",
            confidence: item.confidence != null ? String(item.confidence) : null,
            assumptions: item.assumptions ?? null,
            timesLogged: 1,
            lastLoggedAt: now,
          })
          .returning({ id: schema.foodMemory.id });
        itemMemoryIds.push(mem.id);

        // aliases: canonical name + what the user typed
        const aliases = [...new Set([normalizeAlias(item.name), normalizeAlias(item.typedName)])].filter(Boolean);
        for (const alias of aliases) {
          await tx
            .insert(schema.foodAliases)
            .values({ userId, foodMemoryId: mem.id, alias })
            .onConflictDoNothing();
        }

        pendingEmbeddings.push({ id: mem.id, name: item.name });
      }
    }

    // 2. Meal log + item snapshots (raw utterance always kept — RULES.md #6/#12).
    let mealLogId: string | null = null;
    if (input.items.length > 0) {
      const [log] = await tx
        .insert(schema.mealLogs)
        .values({
          userId,
          loggedAt,
          mealType: input.mealType,
          rawInput: input.raw,
          inputMode: input.inputMode,
          photoPath: input.photoPath ?? null,
        })
        .returning({ id: schema.mealLogs.id });
      mealLogId = log.id;

      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        const t = itemTotals(item);
        await tx.insert(schema.mealLogItems).values({
          userId,
          mealLogId: log.id,
          foodMemoryId: itemMemoryIds[i],
          name: item.name,
          qty: String(item.qty),
          unit: item.unit,
          kcal: String(t.kcal),
          proteinG: String(t.proteinG),
          carbsG: String(t.carbsG),
          fatG: String(t.fatG),
          fiberG: String(t.fiberG ?? 0),
        });
      }
    }

    // 3. Water.
    if (input.waterMl && input.waterMl > 0) {
      await tx.insert(schema.waterLogs).values({ userId, loggedAt, ml: Math.round(input.waterMl) });
    }

    return { mealLogId };
  });

  // Embeddings are optional and involve a network call, so keep them outside
  // the database transaction. A failure never rolls back a successfully logged meal.
  await Promise.allSettled(
    pendingEmbeddings.map(async ({ id, name }) => {
      const vec = await embedText(name);
      await db
        .update(schema.foodMemory)
        .set({ embedding: vec })
        .where(and(eq(schema.foodMemory.id, id), eq(schema.foodMemory.userId, userId)));
    }),
  );

  return result;
}

/** Today's consumed totals for the dashboard. */
export async function getTodayMealTotals(userId: string, now = new Date()) {
  const db = getDb();
  const { start, end } = dayBounds(now);

  const [meals] = await db
    .select({
      kcal: sql<number>`coalesce(sum(${schema.mealLogItems.kcal}), 0)::float`,
      proteinG: sql<number>`coalesce(sum(${schema.mealLogItems.proteinG}), 0)::float`,
      carbsG: sql<number>`coalesce(sum(${schema.mealLogItems.carbsG}), 0)::float`,
      fatG: sql<number>`coalesce(sum(${schema.mealLogItems.fatG}), 0)::float`,
      fiberG: sql<number>`coalesce(sum(${schema.mealLogItems.fiberG}), 0)::float`,
    })
    .from(schema.mealLogItems)
    .innerJoin(schema.mealLogs, eq(schema.mealLogItems.mealLogId, schema.mealLogs.id))
    .where(
      and(
        eq(schema.mealLogs.userId, userId),
        sql`${schema.mealLogs.loggedAt} >= ${start.toISOString()}`,
        sql`${schema.mealLogs.loggedAt} < ${end.toISOString()}`,
      ),
    );

  return {
    kcal: Math.round(meals.kcal),
    proteinG: Math.round(meals.proteinG),
    carbsG: Math.round(meals.carbsG),
    fatG: Math.round(meals.fatG),
    fiberG: Math.round(meals.fiberG),
  };
}

export async function getTodayTotals(userId: string, now = new Date()) {
  const db = getDb();
  const { start, end } = dayBounds(now);
  const [meals, [water]] = await Promise.all([
    getTodayMealTotals(userId, now),
    db
      .select({ ml: sql<number>`coalesce(sum(${schema.waterLogs.ml}), 0)::int` })
      .from(schema.waterLogs)
      .where(
        and(
          eq(schema.waterLogs.userId, userId),
          sql`${schema.waterLogs.loggedAt} >= ${start.toISOString()}`,
          sql`${schema.waterLogs.loggedAt} < ${end.toISOString()}`,
        ),
      ),
  ]);
  return { ...meals, waterMl: water.ml };
}

const mealSlotOrder = new Map<string | null, number>(MEAL_TYPES.map((slot, index) => [slot, index]));

/** Meal logs for the selected local day in slot order, earliest first within each slot. */
export async function getDailyFeed(userId: string, date: Date) {
  const db = getDb();
  const { key, start, end } = dayBounds(date);

  const logs = await db
    .select()
    .from(schema.mealLogs)
    .where(
      and(
        eq(schema.mealLogs.userId, userId),
        sql`${schema.mealLogs.loggedAt} >= ${start.toISOString()}`,
        sql`${schema.mealLogs.loggedAt} < ${end.toISOString()}`,
      ),
    )
    .orderBy(schema.mealLogs.loggedAt, schema.mealLogs.createdAt, schema.mealLogs.id);

  if (logs.length === 0) return [];
  const items = await db
    .select({
      item: schema.mealLogItems,
      foodName: schema.foodMemory.canonicalName,
    })
    .from(schema.mealLogItems)
    .leftJoin(schema.foodMemory, eq(schema.mealLogItems.foodMemoryId, schema.foodMemory.id))
    .where(inArray(schema.mealLogItems.mealLogId, logs.map((l) => l.id)));

  // Stable sorting keeps the chronological order of entries in the same slot.
  logs.sort((a, b) =>
    (mealSlotOrder.get(a.mealType) ?? MEAL_TYPES.length) -
    (mealSlotOrder.get(b.mealType) ?? MEAL_TYPES.length),
  );

  return logs.map((l) => ({
    id: l.id,
    loggedAt: l.loggedAt,
    backdated: dateKey(l.createdAt) !== key,
    mealType: l.mealType,
    rawInput: l.rawInput,
    items: items
      .filter((r) => r.item.mealLogId === l.id)
      .map((r) => ({
        id: r.item.id,
        name: r.item.name ?? r.foodName ?? "Food",
        qty: num(r.item.qty),
        unit: r.item.unit,
        kcal: num(r.item.kcal),
        proteinG: num(r.item.proteinG),
        foodMemoryId: r.item.foodMemoryId,
      })),
  }));
}

/** Delete one of the user's meal logs (items cascade). Memory rows are untouched. */
export async function deleteMealLog(userId: string, mealLogId: string) {
  const db = getDb();
  const deleted = await db
    .delete(schema.mealLogs)
    .where(and(eq(schema.mealLogs.id, mealLogId), eq(schema.mealLogs.userId, userId)))
    .returning({ id: schema.mealLogs.id });
  if (deleted.length === 0) throw new Error("Meal not found");
}

/** Move a logged meal to another slot (e.g. instant log guessed "dinner", it was post-workout). */
export async function setMealLogType(userId: string, mealLogId: string, mealType: MealType) {
  const db = getDb();
  const updated = await db
    .update(schema.mealLogs)
    .set({ mealType, updatedAt: new Date() })
    .where(and(eq(schema.mealLogs.id, mealLogId), eq(schema.mealLogs.userId, userId)))
    .returning({ id: schema.mealLogs.id });
  if (updated.length === 0) throw new Error("Meal not found");
}
