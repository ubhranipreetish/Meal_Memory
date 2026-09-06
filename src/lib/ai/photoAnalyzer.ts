/**
 * Meal-photo analysis (Sprint 4): image → structured food items via Gemini
 * vision, reusing the food-parse schema so results flow through the exact
 * same resolve → confirm → memory pipeline as typed logs.
 */
import { env } from "@/lib/env";
import { aiError } from "@/lib/ai/client";
import { FOOD_PARSE_SCHEMA } from "@/lib/ai/prompts/foodParse";
import { normalizeLlmResult } from "@/lib/ai/foodParser";
import type { ParseResult } from "@/types/food";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const PHOTO_SYSTEM = `You are the food-recognition engine of a personal fitness tracker used in India.
Identify every distinct food/drink visible in the photo.
- totalKcal / totalProteinG / totalCarbsG / totalFatG are for the WHOLE visible quantity of that item (qty × unit), not per unit. For weighed/poured foods "qty" is the estimated grams / ml on the plate.
- Choose the unit a person would COUNT for that food: discrete whole items (eggs, rotis, idlis, samosas, kebabs, chicken drumsticks/tikka pieces, whole fruit) => piece; things cut from something bigger (bread, pizza, cake, watermelon, papaya) => slice; loose food in a bowl (dal, sabzi, rice, curd, salad, cut fruit) => bowl; a composed meal (biryani, thali) => plate; milk/lassi/juice in a glass => glass; chai/coffee => cup; poured liquid with no vessel => ml; meat/paneer chunks with no clear count => g.
- Allowed units ONLY: piece, slice, bowl, plate, glass, cup, scoop, tbsp, tsp, serving, g, ml. Never use "katori" — say "bowl".
- COUNT CAREFULLY. "qty" is the number of whole units actually visible. Two halves of one egg are ONE egg. When the count is ambiguous, prefer the LOWER number — the user will correct it.
- Estimate portion sizes from visual cues (plate size, depth of bowl). Assume homemade Indian preparation unless clearly restaurant/packaged.
- "confidence" in [0,1] reflects BOTH identification and portion certainty.
- "assumptions" briefly notes what you assumed (count, size, preparation, hidden ingredients). Under 15 words.
- Name every item in English, title-case. Ignore cutlery, garnish, people, backgrounds. If no food is visible, return an empty items array.`;

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
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: FOOD_PARSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    throw aiError(res.status, await res.text().catch(() => ""));
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Vision API returned no content");
  return normalizeLlmResult(JSON.parse(text), "Vision");
}
