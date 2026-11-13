import { describe, expect, it } from "vitest";
import { retryAfterMs } from "./client";
import { normalizeLlmItems } from "./foodParser";

const base = { confidence: 0.9, assumptions: null };

describe("normalizeLlmItems (totals → per serving)", () => {
  it("countable: total for 2 eggs becomes per piece", () => {
    const [egg] = normalizeLlmItems([{ ...base, name: "Boiled Egg", qty: 2, unit: "piece", totalKcal: 156, totalProteinG: 12, totalCarbsG: 1.2, totalFatG: 10 }]);
    expect(egg).toMatchObject({ qty: 2, unit: "piece", kcal: 78, proteinG: 6, carbsG: 0.6, fatG: 5 });
  });
  it("measured: total for 250 ml becomes per 100 ml", () => {
    const [milk] = normalizeLlmItems([{ ...base, name: "Milk", qty: 250, unit: "ml", totalKcal: 150, totalProteinG: 8, totalCarbsG: 12, totalFatG: 8 }]);
    expect(milk).toMatchObject({ qty: 250, unit: "ml", kcal: 60, proteinG: 3.2, carbsG: 4.8, fatG: 3.2 });
  });
  it("fractions: half a bowl scales up to per bowl", () => {
    const [dal] = normalizeLlmItems([{ ...base, name: "Dal", qty: 0.5, unit: "bowl", totalKcal: 75, totalProteinG: 4, totalCarbsG: 10, totalFatG: 2 }]);
    expect(dal.kcal).toBe(150);
  });
  it("unknown units fall back to 'serving'", () => {
    const [x] = normalizeLlmItems([{ ...base, name: "X", qty: 1, unit: "handful", totalKcal: 100, totalProteinG: 1, totalCarbsG: 1, totalFatG: 1 }]);
    expect(x.unit).toBe("serving");
  });
  it("normalizes totalFiberG to per serving", () => {
    const [apple] = normalizeLlmItems([{ ...base, name: "Apple", qty: 2, unit: "piece", totalKcal: 190, totalProteinG: 1, totalCarbsG: 50, totalFatG: 0.6, totalFiberG: 8.8 }]);
    expect(apple).toMatchObject({ fiberG: 4.4 });
  });
});

describe("retryAfterMs", () => {
  it("reads Google's own retry hint off a 429 body", () => {
    expect(retryAfterMs('"message": "...Please retry in 30.656753955s."')).toBe(30657);
    expect(retryAfterMs("Please retry in 2s")).toBe(2000);
  });
  it("returns null when there is no hint to honour", () => {
    expect(retryAfterMs("some other error")).toBeNull();
  });
});
