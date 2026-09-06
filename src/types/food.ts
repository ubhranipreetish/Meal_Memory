/**
 * Zod schemas for the food-logging pipeline (RULES.md #19: shared source of
 * truth between LLM output, server actions, and UI).
 */
import { z } from "zod";

/** The five slots a day is divided into (ADR-009). `other` is legacy-only. */
export const MEAL_TYPES = ["breakfast", "lunch", "snack", "post_workout", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snacks",
  post_workout: "Post-workout",
  dinner: "Dinner",
};
/** Display label for any stored meal_type value (incl. legacy rows). */
export function mealLabel(t: string | null | undefined): string {
  return (MEAL_LABELS as Record<string, string>)[t ?? ""] ?? (t ? t[0].toUpperCase() + t.slice(1) : "Meal");
}

/**
 * Units the app understands. Countable units carry nutrition per 1 unit;
 * measured units (g / ml) carry nutrition per 100 — so "250 ml milk" is
 * qty 250, unit "ml", perQty 100. `servingSize(unit)` is the single source
 * of that rule (ADR-009).
 */
export const COUNT_UNITS = ["piece", "slice", "bowl", "plate", "glass", "cup", "scoop", "tbsp", "tsp", "serving"] as const;
export const MEASURED_UNITS = ["g", "ml"] as const;
export const UNITS = [...COUNT_UNITS, ...MEASURED_UNITS] as const;
export function servingSize(unit: string): number {
  return (MEASURED_UNITS as readonly string[]).includes(unit) ? 100 : 1;
}

/**
 * Map anything the LLM, an old row, or a user might say onto a supported unit.
 * "katori" folds into "bowl" (ADR-010 — one word for one thing); unknown units
 * become "serving" so nothing is ever stored in a unit the UI can't show.
 */
const UNIT_ALIASES: Record<string, (typeof UNITS)[number]> = {
  katori: "bowl", katoris: "bowl", katory: "bowl",
  pieces: "piece", pcs: "piece", pc: "piece", whole: "piece", nos: "piece",
  slices: "slice", bowls: "bowl", plates: "plate", glasses: "glass",
  cups: "cup", scoops: "scoop", servings: "serving", portion: "serving",
  tablespoon: "tbsp", tablespoons: "tbsp", teaspoon: "tsp", teaspoons: "tsp",
  gram: "g", grams: "g", gm: "g", gms: "g", kg: "g",
  millilitre: "ml", milliliter: "ml", litre: "ml", liter: "ml", l: "ml",
};
export function normalizeUnit(unit: string | null | undefined): (typeof UNITS)[number] {
  const u = (unit ?? "").trim().toLowerCase();
  if ((UNITS as readonly string[]).includes(u)) return u as (typeof UNITS)[number];
  return UNIT_ALIASES[u] ?? "serving";
}
/** "per piece" / "per 100 ml" */
export function perLabel(unit: string): string {
  const s = servingSize(unit);
  return s === 1 ? `per ${unit}` : `per ${s} ${unit}`;
}

/**
 * Models report confidence as 0.9 one call and 90 the next (gemini-2.5-flash
 * does both). Accept either rather than throwing away a whole parse over it.
 */
export function coerceConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0.5;
  return Math.min(1, n > 1 ? n / 100 : n);
}

/** One item as returned by the LLM parser — nutrition is PER SERVING (see servingSize). */
export const parsedItemSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1),
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
  confidence: z.number().min(0).max(1),
  assumptions: z.string().optional().nullable(),
});
export type ParsedItem = z.infer<typeof parsedItemSchema>;

export const parseResultSchema = z.object({
  items: z.array(parsedItemSchema),
  waterMl: z.number().min(0).optional().nullable(),
  mealType: z.enum(MEAL_TYPES).optional().nullable(),
});
export type ParseResult = z.infer<typeof parseResultSchema>;

export interface PerUnit {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** An item after resolution against the user's food memory. */
export interface ResolvedItem {
  name: string; // canonical (memory) name if known, else parsed name
  qty: number;
  unit: string;
  /** The serving the perUnit values describe: 1 for countable units, 100 for g/ml. */
  perQty: number;
  status: "known" | "new";
  foodMemoryId?: string;
  /** Known items: the unit the saved food is stored in (UI uses it to decide whether an edit should overwrite memory by default). */
  memoryUnit?: string;
  /** Per-serving nutrition (from memory if known, else LLM estimate). */
  perUnit: PerUnit;
  confidence?: number;
  assumptions?: string | null;
  /** The exact phrase the user typed for this item (becomes an alias). */
  typedName: string;
}

export interface ResolvedLog {
  raw: string;
  mealType: MealType;
  /** true when the user named the slot ("for breakfast") — UI should switch to it. */
  mealTypeExplicit?: boolean;
  waterMl?: number;
  items: ResolvedItem[];
  /** true if any item is new → UI must show the confirmation card. */
  needsConfirmation: boolean;
  /** true if resolution used zero AI calls (deterministic quick-parse hit). */
  zeroAi: boolean;
}

/** Total nutrition of one logged item: perUnit × qty / perQty. Pure, unit-tested. */
export function itemTotals(item: { qty: number; perQty: number; perUnit: PerUnit }): PerUnit {
  const f = item.perQty > 0 ? item.qty / item.perQty : 0;
  const r = (n: number) => Math.round(n * f * 10) / 10;
  return {
    kcal: r(item.perUnit.kcal),
    proteinG: r(item.perUnit.proteinG),
    carbsG: r(item.perUnit.carbsG),
    fatG: r(item.perUnit.fatG),
  };
}

/** Payload the client sends back on confirm (possibly user-edited). */
export const confirmItemSchema = z.object({
  name: z.string().min(1),
  typedName: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1),
  perQty: z.number().positive().default(1),
  status: z.enum(["known", "new"]),
  foodMemoryId: z.string().uuid().optional(),
  perUnit: z.object({
    kcal: z.number().min(0),
    proteinG: z.number().min(0),
    carbsG: z.number().min(0),
    fatG: z.number().min(0),
  }),
  confidence: z.number().min(0).max(1).optional(),
  assumptions: z.string().nullable().optional(),
  /** New items: store in food memory for instant future logging (default yes). */
  saveToMemory: z.boolean().default(true),
  /** Known items whose values the user edited: also update the saved food. */
  updateMemory: z.boolean().default(false),
});

export const confirmLogSchema = z.object({
  raw: z.string().min(1),
  mealType: z.enum(MEAL_TYPES),
  waterMl: z.number().min(0).optional(),
  items: z.array(confirmItemSchema),
  inputMode: z.enum(["text", "voice", "photo", "quick_pick"]).default("text"),
  photoPath: z.string().optional(),
});
export type ConfirmLogInput = z.infer<typeof confirmLogSchema>;
