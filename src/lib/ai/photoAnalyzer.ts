/**
 * Meal-photo analysis (Sprint 4): image → structured food items via Gemini
 * vision, reusing the food-parse schema so results flow through the exact
 * same resolve → confirm → memory pipeline as typed logs.
 */
import { env } from "@/lib/env";
import { FOOD_PARSE_SCHEMA } from "@/lib/ai/prompts/foodParse";
import { parseResultSchema, type ParseResult } from "@/types/food";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const PHOTO_SYSTEM = `You are the food-recognition engine of a personal fitness tracker used in India.
Identify every distinct food/drink visible in the photo.
- Nutrition values are PER SINGLE UNIT (per piece / bowl / glass / plate / 100 g), NOT the total.
- "qty" is the number of units visible (e.g. 3 rotis => qty 3, unit "piece"; a bowl of dal => qty 1, unit "bowl").
- Estimate portion sizes from visual cues (plate size, depth of bowl). Assume homemade Indian preparation unless clearly restaurant/packaged.
- "confidence" in [0,1] reflects BOTH identification and portion certainty.
- "assumptions" briefly notes what you assumed (size, preparation, hidden ingredients). Under 15 words.
- Ignore cutlery, garnish, people, backgrounds. If no food is visible, return an empty items array.`;

export async function analyzeMealPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<ParseResult> {
  const model = env.geminiModel();
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${env.googleApiKey()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PHOTO_SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: "Identify the foods in this meal photo." },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: FOOD_PARSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vision API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Vision API returned no content");
  const parsed = parseResultSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Vision returned invalid shape: ${parsed.error.message}`);
  return parsed.data;
}
