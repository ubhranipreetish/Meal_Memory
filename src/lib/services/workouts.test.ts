import { describe, expect, it } from "vitest";
import { isPersonalRecord } from "./workouts";

describe("isPersonalRecord", () => {
  it("first weighted set is a PR", () => {
    expect(isPersonalRecord([], { weightKg: 20, reps: 10 })).toBe(true);
  });

  it("zero weight or reps is never a PR", () => {
    expect(isPersonalRecord([], { weightKg: 0, reps: 10 })).toBe(false);
    expect(isPersonalRecord([{ weightKg: 20, reps: 8 }], { weightKg: 20, reps: 0 })).toBe(false);
  });

  it("heavier than all history → PR", () => {
    const h = [
      { weightKg: 40, reps: 8 },
      { weightKg: 45, reps: 5 },
    ];
    expect(isPersonalRecord(h, { weightKg: 47.5, reps: 1 })).toBe(true);
  });

  it("same weight, more reps → PR", () => {
    const h = [{ weightKg: 45, reps: 5 }];
    expect(isPersonalRecord(h, { weightKg: 45, reps: 6 })).toBe(true);
  });

  it("same weight, same or fewer reps → not a PR", () => {
    const h = [{ weightKg: 45, reps: 5 }];
    expect(isPersonalRecord(h, { weightKg: 45, reps: 5 })).toBe(false);
    expect(isPersonalRecord(h, { weightKg: 45, reps: 4 })).toBe(false);
  });

  it("lighter weight, fewer reps than achieved at heavier → not a PR", () => {
    const h = [{ weightKg: 50, reps: 8 }];
    expect(isPersonalRecord(h, { weightKg: 40, reps: 8 })).toBe(false);
    expect(isPersonalRecord(h, { weightKg: 40, reps: 6 })).toBe(false);
  });

  it("lighter weight but MORE reps than anything at-or-above → rep PR", () => {
    const h = [
      { weightKg: 50, reps: 5 },
      { weightKg: 60, reps: 3 },
    ];
    expect(isPersonalRecord(h, { weightKg: 50, reps: 6 })).toBe(true);
  });

  it("12-week progression: each top-weight jump is a PR", () => {
    const history: { weightKg: number; reps: number }[] = [];
    const weeks = [20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45, 45];
    const prFlags: boolean[] = [];
    for (const w of weeks) {
      const set = { weightKg: w, reps: 8 };
      prFlags.push(isPersonalRecord(history, set));
      history.push(set);
    }
    // every week except the last (repeat of 45×8) is a PR
    expect(prFlags).toEqual([true, true, true, true, true, true, true, true, true, true, true, false]);
  });
});
