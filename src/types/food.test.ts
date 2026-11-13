import { describe, expect, it } from "vitest";
import { UNITS, coerceConfidence, itemTotals, mealLabel, normalizeUnit, perLabel, servingSize } from "./food";

describe("servingSize / perLabel", () => {
  it("countable units are per 1, measured units per 100", () => {
    expect(servingSize("piece")).toBe(1);
    expect(servingSize("glass")).toBe(1);
    expect(servingSize("g")).toBe(100);
    expect(servingSize("ml")).toBe(100);
    expect(perLabel("piece")).toBe("per piece");
    expect(perLabel("ml")).toBe("per 100 ml");
  });
});

describe("normalizeUnit", () => {
  it("folds katori into bowl — one word for one thing (ADR-010)", () => {
    expect(normalizeUnit("katori")).toBe("bowl");
    expect(normalizeUnit("Katoris")).toBe("bowl");
    expect(UNITS).not.toContain("katori");
  });
  it("accepts plurals and common spellings", () => {
    expect(normalizeUnit("pieces")).toBe("piece");
    expect(normalizeUnit("grams")).toBe("g");
    expect(normalizeUnit("ML")).toBe("ml");
    expect(normalizeUnit(" slice ")).toBe("slice");
  });
  it("falls back to serving for anything unknown or missing", () => {
    expect(normalizeUnit("handful")).toBe("serving");
    expect(normalizeUnit(null)).toBe("serving");
  });
});

describe("itemTotals", () => {
  const egg = { kcal: 78, proteinG: 6, carbsG: 0.6, fatG: 5 };
  it("scales countable items by qty", () => {
    expect(itemTotals({ qty: 2, perQty: 1, perUnit: egg })).toEqual({ kcal: 156, proteinG: 12, carbsG: 1.2, fatG: 10 });
  });
  it("scales measured items by qty / 100", () => {
    const milk = { kcal: 60, proteinG: 3.2, carbsG: 4.8, fatG: 3.2 };
    expect(itemTotals({ qty: 250, perQty: 100, perUnit: milk })).toEqual({ kcal: 150, proteinG: 8, carbsG: 12, fatG: 8 });
  });
  it("scales items with fiberG", () => {
    const apple = { kcal: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, fiberG: 4.4 };
    expect(itemTotals({ qty: 2, perQty: 1, perUnit: apple })).toEqual({
      kcal: 190,
      proteinG: 1,
      carbsG: 50,
      fatG: 0.6,
      fiberG: 8.8,
    });
  });
  it("never divides by zero", () => {
    expect(itemTotals({ qty: 2, perQty: 0, perUnit: egg }).kcal).toBe(0);
  });
});

describe("mealLabel", () => {
  it("labels the five slots and tolerates legacy values", () => {
    expect(mealLabel("post_workout")).toBe("Post-workout");
    expect(mealLabel("snack")).toBe("Snacks");
    expect(mealLabel("other")).toBe("Other");
    expect(mealLabel(null)).toBe("Meal");
  });
});

describe("coerceConfidence", () => {
  it("accepts a fraction as-is", () => {
    expect(coerceConfidence(0.8)).toBe(0.8);
  });
  it("rescales a percentage — models return 90 as readily as 0.9", () => {
    expect(coerceConfidence(90)).toBe(0.9);
    expect(coerceConfidence(95)).toBe(0.95);
  });
  it("clamps and defaults rather than failing a whole parse", () => {
    expect(coerceConfidence(500)).toBe(1);
    expect(coerceConfidence(-1)).toBe(0.5);
    expect(coerceConfidence(undefined)).toBe(0.5);
  });
});
