import { describe, expect, it } from "vitest";
import { inferMealType } from "./foodMemory";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 5, h, m));

describe("inferMealType (five slots)", () => {
  it("maps the day into breakfast / lunch / snack / dinner by local time", () => {
    expect(inferMealType(at(7, 30), "UTC")).toBe("breakfast");
    expect(inferMealType(at(10, 59), "UTC")).toBe("breakfast");
    expect(inferMealType(at(13), "UTC")).toBe("lunch");
    expect(inferMealType(at(16, 30), "UTC")).toBe("snack");
    expect(inferMealType(at(20), "UTC")).toBe("dinner");
  });
  it("late-night eating counts as dinner, never 'other'", () => {
    expect(inferMealType(at(23, 30), "UTC")).toBe("dinner");
    expect(inferMealType(at(1), "UTC")).toBe("dinner");
  });
});
