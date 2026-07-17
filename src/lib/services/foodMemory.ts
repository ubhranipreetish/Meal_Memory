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
  quickParseSegments,
  quickParseWater,
} from "@/lib/services/quickParse";
import type { ConfirmLogInput, MealType, ResolvedItem, ResolvedLog } from "@/types/food";

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
  if (!(dist < FUZZY_MAX_DISTANCE) || !sharedToken(name, canonical)) return null;
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

/** Meal type from local time when the user didn't say. */
export function inferMealType(d: Date = new Date()): MealType {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 4) return "other";
  if (h < 11) return "breakfast";
  if (h < 15.5) return "lunch";
  if (h < 18.5) return "snack";
  if (h < 23) return "dinner";
  return "other";
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
  return { kcal: num(m.kcal), proteinG: num(m.proteinG), carbsG: num(m.carbsG), fatG: num(m.fatG) };
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
      const items: ResolvedItem[] = segments.map((s) => {
        const m = hits.get(s.namePart)!;
        return {
          name: m.canonicalName,
          typedName: s.namePart,
          qty: s.qty,
          unit: s.unit ?? m.servingUnit,
          status: "known",
          foodMemoryId: m.id,
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

  // Path B: one AI call parses + estimates; memory overrides estimates.
  const parsed = await parseFoodUtterance(utterance);
  const items = await resolveParsedItems(userId, parsed.items);

  return {
    raw: utterance,
    mealType: parsed.mealType ?? inferMealType(),
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
      if (m) {
        return {
          name: m.canonicalName,
          typedName: i.name,
          qty: i.qty,
          unit: i.unit,
          status: "known" as const,
          foodMemoryId: m.id,
          perUnit: memoryToPerUnit(m),
        };
      }
      return {
        name: i.name,
        typedName: i.name,
        qty: i.qty,
        unit: i.unit,
        status: "new" as const,
        perUnit: { kcal: i.kcal, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG },
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

  // 1. Ensure a food_memory row per item.
  const itemMemoryIds: string[] = [];
  for (const item of input.items) {
    if (item.status === "known" && item.foodMemoryId) {
      itemMemoryIds.push(item.foodMemoryId);
      await db
        .update(schema.foodMemory)
        .set({
          timesLogged: sql`${schema.foodMemory.timesLogged} + 1`,
          lastLoggedAt: now,
          updatedAt: now,
        })
        .where(and(eq(schema.foodMemory.id, item.foodMemoryId), eq(schema.foodMemory.userId, userId)));

      // Alias learning: a new phrasing that resolved (via AI or fuzzy match)
      // becomes an exact alias → future logs are zero-AI (Sprint 2).
      const typed = normalizeAlias(item.typedName);
      if (typed && typed !== normalizeAlias(item.name)) {
        await db
          .insert(schema.foodAliases)
          .values({ userId, foodMemoryId: item.foodMemoryId, alias: typed })
          .onConflictDoNothing();
      }
    } else {
      const [mem] = await db
        .insert(schema.foodMemory)
        .values({
          userId,
          canonicalName: item.name,
          servingUnit: item.unit,
          servingQty: "1",
          kcal: String(item.perUnit.kcal),
          proteinG: String(item.perUnit.proteinG),
          carbsG: String(item.perUnit.carbsG),
          fatG: String(item.perUnit.fatG),
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
        await db
          .insert(schema.foodAliases)
          .values({ userId, foodMemoryId: mem.id, alias })
          .onConflictDoNothing();
      }

      // Best-effort embedding for fuzzy matching — never blocks the log.
      try {
        const vec = await embedText(item.name);
        await db
          .update(schema.foodMemory)
          .set({ embedding: vec })
          .where(eq(schema.foodMemory.id, mem.id));
      } catch {
        /* fuzzy matching simply won't hit this food until backfilled */
      }
    }
  }

  // 2. Meal log + item snapshots (raw utterance always kept — RULES.md #6/#12).
  let mealLogId: string | null = null;
  if (input.items.length > 0) {
    const [log] = await db
      .insert(schema.mealLogs)
      .values({
        userId,
        loggedAt: now,
        mealType: input.mealType,
        rawInput: input.raw,
        inputMode: input.inputMode,
        photoPath: input.photoPath ?? null,
      })
      .returning({ id: schema.mealLogs.id });
    mealLogId = log.id;

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      await db.insert(schema.mealLogItems).values({
        userId,
        mealLogId: log.id,
        foodMemoryId: itemMemoryIds[i],
        qty: String(item.qty),
        unit: item.unit,
        kcal: String(item.perUnit.kcal * item.qty),
        proteinG: String(item.perUnit.proteinG * item.qty),
        carbsG: String(item.perUnit.carbsG * item.qty),
        fatG: String(item.perUnit.fatG * item.qty),
      });
    }
  }

  // 3. Water.
  if (input.waterMl && input.waterMl > 0) {
    await db.insert(schema.waterLogs).values({ userId, loggedAt: now, ml: Math.round(input.waterMl) });
  }

  return { mealLogId };
}

/** Today's consumed totals for the dashboard. */
export async function getTodayTotals(userId: string) {
  const db = getDb();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [meals] = await db
    .select({
      kcal: sql<number>`coalesce(sum(${schema.mealLogItems.kcal}), 0)::float`,
      proteinG: sql<number>`coalesce(sum(${schema.mealLogItems.proteinG}), 0)::float`,
      carbsG: sql<number>`coalesce(sum(${schema.mealLogItems.carbsG}), 0)::float`,
      fatG: sql<number>`coalesce(sum(${schema.mealLogItems.fatG}), 0)::float`,
    })
    .from(schema.mealLogItems)
    .innerJoin(schema.mealLogs, eq(schema.mealLogItems.mealLogId, schema.mealLogs.id))
    .where(and(eq(schema.mealLogs.userId, userId), sql`${schema.mealLogs.loggedAt} >= ${start.toISOString()}`));

  const [water] = await db
    .select({ ml: sql<number>`coalesce(sum(${schema.waterLogs.ml}), 0)::int` })
    .from(schema.waterLogs)
    .where(and(eq(schema.waterLogs.userId, userId), sql`${schema.waterLogs.loggedAt} >= ${start.toISOString()}`));

  return {
    kcal: Math.round(meals.kcal),
    proteinG: Math.round(meals.proteinG),
    carbsG: Math.round(meals.carbsG),
    fatG: Math.round(meals.fatG),
    waterMl: water.ml,
  };
}

/** Today's meal logs with items, newest first (for the /log feed). */
export async function getTodayFeed(userId: string) {
  const db = getDb();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const logs = await db
    .select()
    .from(schema.mealLogs)
    .where(and(eq(schema.mealLogs.userId, userId), sql`${schema.mealLogs.loggedAt} >= ${start.toISOString()}`))
    .orderBy(sql`${schema.mealLogs.loggedAt} desc`);

  if (logs.length === 0) return [];
  const items = await db
    .select({
      item: schema.mealLogItems,
      foodName: schema.foodMemory.canonicalName,
    })
    .from(schema.mealLogItems)
    .leftJoin(schema.foodMemory, eq(schema.mealLogItems.foodMemoryId, schema.foodMemory.id))
    .where(inArray(schema.mealLogItems.mealLogId, logs.map((l) => l.id)));

  return logs.map((l) => ({
    id: l.id,
    loggedAt: l.loggedAt,
    mealType: l.mealType,
    rawInput: l.rawInput,
    items: items
      .filter((r) => r.item.mealLogId === l.id)
      .map((r) => ({
        id: r.item.id,
        name: r.foodName ?? "Food",
        qty: num(r.item.qty),
        unit: r.item.unit,
        kcal: Math.round(num(r.item.kcal)),
        proteinG: Math.round(num(r.item.proteinG)),
        foodMemoryId: r.item.foodMemoryId,
      })),
  }));
}
