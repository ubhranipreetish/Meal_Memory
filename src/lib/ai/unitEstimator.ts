/**
 * Per-unit re-estimation (ADR-010).
 *
 * When the user changes an item's unit in the review card — "Butter Chicken"
 * from 1 bowl to 4 pieces — the old numbers are meaningless: a piece of a meat
 * curry is one chunk (~55 g), not a whole bowl. Rescaling by quantity (what the
 * UI used to do) silently multiplied a bowl by four. So we ask the model for
 * the nutrition of exactly ONE serving of the new unit and replace the values.
 *
 * Returns PER-SERVING values directly (per 1 countable unit, per 100 g/ml) —
 * this is a single small question, so unlike the bulk parser it doesn't need
 * the totals-in/per-serving-out trick.
 */
import { z } from "zod";
import { aiClient } from "@/lib/ai/client";
import { coerceConfidence, normalizeUnit, perLabel, servingSize } from "@/types/food";

const UNIT_ESTIMATE_SYSTEM = `You are the nutrition-estimation engine of a personal fitness tracker used in India.
Given a food name and ONE serving description, return that serving's nutrition.

- Return values for EXACTLY the serving described — not for a typical portion, not for the whole dish.
- Assume typical homemade Indian preparation unless the name says otherwise (restaurant, packaged, air-fried…).
- A "piece" of a gravy dish (butter chicken, chicken curry, paneer butter masala) is ONE chunk of the solid with a little gravy, about 50-60 g — far smaller than a bowl (~200 g) or a plate.
- A "slice" is one cut portion: pizza ~100 g, bread ~30 g, watermelon ~150 g, cake ~80 g.
- A "bowl" is ~200 g of loose food; a "plate" is a full composed meal; a "glass" ~250 ml; a "cup" ~150 ml.
- Whole fruit as "piece": medium banana ~120 g, apple ~180 g, orange ~130 g.
- Count every component in the name (with milk, with ghee, with cheese) toward the numbers.
- "approxGrams" is the weight in grams of that one serving (for g/ml servings, just repeat 100).
- "confidence" is a number between 0 and 1.
- "assumptions" states the size/preparation you assumed, under 12 words.`;

const UNIT_ESTIMATE_SCHEMA = {
  type: "object",
  properties: {
    kcal: { type: "number" },
    proteinG: { type: "number" },
    carbsG: { type: "number" },
    fatG: { type: "number" },
    approxGrams: { type: "number" },
    confidence: { type: "number" },
    assumptions: { type: "string", nullable: true },
  },
  required: ["kcal", "proteinG", "carbsG", "fatG", "approxGrams", "confidence"],
} as const;

const unitEstimateSchema = z.object({
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
  approxGrams: z.number().min(0),
  confidence: z.number(),
  assumptions: z.string().nullable().optional(),
});
export type UnitEstimate = z.infer<typeof unitEstimateSchema> & { unit: string; perQty: number };

/** Nutrition for one serving of `name` in `unit` (per 1, or per 100 for g/ml). */
export async function estimateForUnit(name: string, unit: string): Promise<UnitEstimate> {
  const u = normalizeUnit(unit);
  const raw = await aiClient.generateJSON<unknown>({
    system: UNIT_ESTIMATE_SYSTEM,
    prompt: `Food: ${name}\nServing: ${perLabel(u).replace(/^per /, "1 ").replace("1 100", "100")}\nGive the nutrition of that one serving.`,
    jsonSchema: UNIT_ESTIMATE_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.1,
  });
  const parsed = unitEstimateSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Unit estimate returned invalid shape: ${parsed.error.message}`);
  return { ...parsed.data, confidence: coerceConfidence(parsed.data.confidence), unit: u, perQty: servingSize(u) };
}
