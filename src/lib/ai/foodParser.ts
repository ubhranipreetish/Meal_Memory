/**
 * Utterance → structured food items via Gemini structured output.
 * One AI call parses AND estimates nutrition in a single round trip. The model
 * reports totals for the quantity eaten; `normalizeLlmItems` converts them to
 * per-serving values (servingSize: 1 per countable unit, 100 per g/ml) so the
 * rest of the pipeline never sees LLM-specific shapes. Estimates are only
 * *used* for items that miss the user's food memory.
 */
import { z } from "zod";
import { normalizeAlooParatha } from "@/lib/services/quickParse";
import { aiClient } from "@/lib/ai/client";
import { FOOD_PARSE_SCHEMA, FOOD_PARSE_SYSTEM } from "@/lib/ai/prompts/foodParse";
import { MEAL_TYPES, coerceConfidence, normalizeUnit, servingSize, type ParseResult, type ParsedItem } from "@/types/food";

/** Exact shape the LLM returns (totals for qty × unit). */
export const llmItemSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1),
  totalKcal: z.number().min(0),
  totalProteinG: z.number().min(0),
  totalCarbsG: z.number().min(0),
  totalFatG: z.number().min(0),
  confidence: z.number(),
  assumptions: z.string().optional().nullable(),
});
export const llmParseResultSchema = z.object({
  items: z.array(llmItemSchema),
  waterMl: z.number().min(0).optional().nullable(),
  mealType: z.enum(MEAL_TYPES).optional().nullable(),
});
export type LlmParseResult = z.infer<typeof llmParseResultSchema>;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Totals for the eaten quantity → per-serving values. Pure; unit-tested. */
export function normalizeLlmItems(items: LlmParseResult["items"]): ParsedItem[] {
  return items.map((i) => {
    const unit = normalizeUnit(i.unit);
    const f = servingSize(unit) / i.qty;
    return {
      name: normalizeAlooParatha(i.name),
      qty: i.qty,
      unit,
      kcal: round1(i.totalKcal * f),
      proteinG: round1(i.totalProteinG * f),
      carbsG: round1(i.totalCarbsG * f),
      fatG: round1(i.totalFatG * f),
      confidence: coerceConfidence(i.confidence),
      assumptions: i.assumptions ?? null,
    };
  });
}

export function normalizeLlmResult(raw: unknown, source: string): ParseResult {
  const parsed = llmParseResultSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`${source} returned invalid shape: ${parsed.error.message}`);
  return {
    items: normalizeLlmItems(parsed.data.items),
    waterMl: parsed.data.waterMl,
    mealType: parsed.data.mealType,
  };
}

export async function parseFoodUtterance(utterance: string): Promise<ParseResult> {
  const raw = await aiClient.generateJSON<unknown>({
    system: FOOD_PARSE_SYSTEM,
    prompt: normalizeAlooParatha(utterance),
    jsonSchema: FOOD_PARSE_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
  });
  return normalizeLlmResult(raw, "Parser");
}
