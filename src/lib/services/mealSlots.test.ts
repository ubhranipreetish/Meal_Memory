import { describe, expect, it } from "vitest";
import { inferMealType } from "./foodMemory";

const at = (h: number, m = 0) => {
  const d = new Date(2026, 8, 5, h, m);
  return d;
};

describe("inferMealType (five slots)", () => {
  it("maps the day into breakfast / lunch / snack / dinner by local time", () => {
    expect(inferMealType(at(7, 30))).toBe("breakfast");
    expect(inferMealType(at(10, 59))).toBe("breakfast");
    expect(inferMealType(at(13))).toBe("lunch");
    expect(inferMealType(at(16, 30))).toBe("snack");
    expect(inferMealType(at(20))).toBe("dinner");
  });
  it("late-night eating counts as dinner, never 'other'", () => {
    expect(inferMealType(at(23, 30))).toBe("dinner");
    expect(inferMealType(at(1))).toBe("dinner");
  });
});
