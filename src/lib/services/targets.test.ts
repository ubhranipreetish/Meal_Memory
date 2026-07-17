import { describe, expect, it } from "vitest";
import { calcBMR, calcTDEE, calcTargets, type TargetInputs } from "./targets";

/**
 * Sprint 0 benchmark: targets math must match hand-calculated values for 3
 * test personas. Intermediate BMR/TDEE are checked exactly; final kcal is
 * checked exactly (deterministic rounding) which is stronger than the ±1%
 * the benchmark requires.
 */

describe("calcBMR (Mifflin-St Jeor)", () => {
  it("male", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(calcBMR({ gender: "male", age: 30, heightCm: 180, weightKg: 80 })).toBe(1780);
  });

  it("female", () => {
    // 10*60 + 6.25*165 - 5*28 - 161 = 1330.25
    expect(calcBMR({ gender: "female", age: 28, heightCm: 165, weightKg: 60 })).toBeCloseTo(1330.25, 2);
  });
});

describe("calcTDEE", () => {
  it("scales BMR by activity multiplier", () => {
    // 1780 * 1.55 (moderate) = 2759
    expect(
      calcTDEE({ gender: "male", age: 30, heightCm: 180, weightKg: 80, activityLevel: "moderate" }),
    ).toBeCloseTo(2759, 2);
  });
});

describe("calcTargets — 3 personas", () => {
  it("Persona A: male 30y 180cm 80kg, moderate, build_muscle", () => {
    const input: TargetInputs = {
      gender: "male",
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityLevel: "moderate",
      goal: "build_muscle",
    };
    const t = calcTargets(input);
    expect(t.bmr).toBe(1780);
    expect(t.tdee).toBe(2759);
    expect(t.kcal).toBe(3030); // 2759 * 1.10 = 3034.9 -> 3030
    expect(t.proteinG).toBe(160); // 2.0 g/kg * 80
    expect(t.fatG).toBe(84); // 25% of 3030 / 9
    expect(t.carbsG).toBe(409); // remainder
    expect(t.waterMl).toBe(2800);
    expect(t.steps).toBe(8000);
  });

  it("Persona B: female 28y 165cm 60kg, light, lose_fat", () => {
    const input: TargetInputs = {
      gender: "female",
      age: 28,
      heightCm: 165,
      weightKg: 60,
      activityLevel: "light",
      goal: "lose_fat",
    };
    const t = calcTargets(input);
    expect(t.bmr).toBe(1330);
    expect(t.tdee).toBe(1829);
    expect(t.kcal).toBe(1460); // 1829.09 * 0.8 = 1463.3 -> 1460
    expect(t.proteinG).toBe(132); // 2.2 g/kg * 60
    expect(t.fatG).toBe(41);
    expect(t.carbsG).toBe(141);
    expect(t.waterMl).toBe(2100);
    expect(t.steps).toBe(10000);
  });

  it("Persona C: male 40y 175cm 90kg, sedentary, recomp", () => {
    const input: TargetInputs = {
      gender: "male",
      age: 40,
      heightCm: 175,
      weightKg: 90,
      activityLevel: "sedentary",
      goal: "recomp",
    };
    const t = calcTargets(input);
    expect(t.bmr).toBe(1799);
    expect(t.tdee).toBe(2159);
    expect(t.kcal).toBe(2160); // maintenance
    expect(t.proteinG).toBe(180);
    expect(t.fatG).toBe(60);
    expect(t.carbsG).toBe(225);
    expect(t.waterMl).toBe(3150);
    expect(t.steps).toBe(9000);
  });
});

describe("macro calories reconcile with kcal target", () => {
  it("protein*4 + carbs*4 + fat*9 is within rounding of kcal", () => {
    const input: TargetInputs = {
      gender: "male",
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityLevel: "moderate",
      goal: "build_muscle",
    };
    const t = calcTargets(input);
    const macroKcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    // within one macro-gram's worth of rounding error
    expect(Math.abs(macroKcal - t.kcal)).toBeLessThanOrEqual(9);
  });
});
