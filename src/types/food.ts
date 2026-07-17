/**
 * Zod schemas for the food-logging pipeline (RULES.md #19: shared source of
 * truth between LLM output, server actions, and UI).
 */
import { z } from "zod";

export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner", "other"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** One item as returned by the LLM parser — nutrition is PER SINGLE UNIT. */
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

/** An item after resolution against the user's food memory. */
export interface ResolvedItem {
  name: string; // canonical (memory) name if known, else parsed name
  qty: number;
  unit: string;
  status: "known" | "new";
  foodMemoryId?: string;
  /** Per-single-unit nutrition (from memory if known, else LLM estimate). */
  perUnit: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  confidence?: number;
  assumptions?: string | null;
  /** The exact phrase the user typed for this item (becomes an alias). */
  typedName: string;
}

export interface ResolvedLog {
  raw: string;
  mealType: MealType;
  waterMl?: number;
  items: ResolvedItem[];
  /** true if any item is new → UI must show the confirmation card. */
  needsConfirmation: boolean;
  /** true if resolution used zero AI calls (deterministic quick-parse hit). */
  zeroAi: boolean;
}

/** Payload the client sends back on confirm (possibly user-edited). */
export const confirmItemSchema = z.object({
  name: z.string().min(1),
  typedName: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1),
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
});

export const confirmLogSchema = z.object({
  raw: z.string().min(1),
  mealType: z.enum(MEAL_TYPES),
  waterMl: z.number().min(0).optional(),
  items: z.array(confirmItemSchema),
  inputMode: z.enum(["text", "voice", "photo", "quick_pick"]).default("text"),
});
export type ConfirmLogInput = z.infer<typeof confirmLogSchema>;
