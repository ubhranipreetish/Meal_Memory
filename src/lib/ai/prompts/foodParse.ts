/**
 * Prompt + response schema for the food-utterance parser (RULES.md #7:
 * prompts are versioned files, never inline strings).
 *
 * The model parses a natural-language food log into items and estimates
 * nutrition PER SINGLE UNIT of each item. Per-unit estimates let us store a
 * food once in memory and scale by quantity on every future log.
 */

export const FOOD_PARSE_SYSTEM = `You are the food-parsing engine of a personal fitness tracker used in India.
Parse the user's food-log utterance into structured items.

Rules:
- Nutrition values are PER SINGLE UNIT of the item (per 1 piece / 1 bowl / 1 glass / 1 plate / 1 cup / 100 g), NOT for the total quantity.
- "qty" is how many of that unit the user ate. "half a bowl" => qty 0.5, unit "bowl". "two aloo parathas" => qty 2, unit "piece".
- Prefer these units when natural: piece, bowl, plate, glass, cup, katori, slice, scoop, g, ml.
- Understand Indian, homemade, restaurant and international food. Assume typical homemade Indian preparation unless stated otherwise.
- Estimate realistically for homemade portions (e.g. 1 aloo paratha with ghee ≈ 250-320 kcal; 1 katori dal ≈ 120-180 kcal; 1 glass full-fat milk 250ml ≈ 150 kcal).
- "confidence" in [0,1]: how sure you are of the nutrition estimate for this user's likely portion.
- "assumptions" briefly states what you assumed (size, oil/ghee, preparation). Keep under 15 words.
- If the utterance mentions plain water (e.g. "drank 1 litre water"), set waterMl to the total ml and do NOT create a food item for it.
- If the utterance names a meal ("for breakfast", "lunch was..."), set mealType accordingly; else leave it null.
- Item "name": clean, title-case canonical name preserving user-specific qualifiers ("Mom's Paneer Paratha" stays as is).
- Ignore non-food chatter; if nothing edible is mentioned, return an empty items array.`;

/** Gemini responseSchema (OpenAPI subset). */
export const FOOD_PARSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unit: { type: "string" },
          kcal: { type: "number" },
          proteinG: { type: "number" },
          carbsG: { type: "number" },
          fatG: { type: "number" },
          confidence: { type: "number" },
          assumptions: { type: "string", nullable: true },
        },
        required: ["name", "qty", "unit", "kcal", "proteinG", "carbsG", "fatG", "confidence"],
      },
    },
    waterMl: { type: "number", nullable: true },
    mealType: {
      type: "string",
      enum: ["breakfast", "lunch", "snack", "dinner", "other"],
      nullable: true,
    },
  },
  required: ["items"],
} as const;
