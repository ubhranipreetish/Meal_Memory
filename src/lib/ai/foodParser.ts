/**
 * Utterance → structured food items via Gemini structured output.
 * One AI call parses AND estimates per-unit nutrition in a single round trip;
 * estimates are only *used* for items that miss the user's food memory
 * (known items keep their stored, user-confirmed values).
 */
import { aiClient } from "@/lib/ai/client";
import { FOOD_PARSE_SCHEMA, FOOD_PARSE_SYSTEM } from "@/lib/ai/prompts/foodParse";
import { parseResultSchema, type ParseResult } from "@/types/food";

export async function parseFoodUtterance(utterance: string): Promise<ParseResult> {
  const raw = await aiClient.generateJSON<unknown>({
    system: FOOD_PARSE_SYSTEM,
    prompt: utterance,
    jsonSchema: FOOD_PARSE_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
  });
  const parsed = parseResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Parser returned invalid shape: ${parsed.error.message}`);
  }
  return parsed.data;
}
