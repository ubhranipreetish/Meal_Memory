import { describe, expect, it } from "vitest";
import { onboardingSchema, targetValuesSchema, updateTargetsSchema } from "./profile";

describe("targetValuesSchema", () => {
  it("accepts valid target values with fiberG", () => {
    const valid = {
      kcal: 2200,
      proteinG: 160,
      carbsG: 220,
      fatG: 65,
      fiberG: 32,
      waterMl: 2500,
      steps: 8000,
    };
    const res = targetValuesSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("rejects calories below 500", () => {
    const invalid = {
      kcal: 400,
      proteinG: 160,
      carbsG: 220,
      fatG: 65,
      waterMl: 2500,
    };
    const res = targetValuesSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it("rejects negative protein", () => {
    const invalid = {
      kcal: 2000,
      proteinG: -10,
      carbsG: 200,
      fatG: 50,
      waterMl: 2000,
    };
    const res = targetValuesSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });
});

describe("updateTargetsSchema", () => {
  it("validates goal and targets", () => {
    const input = {
      goal: "lose_fat",
      targets: {
        kcal: 1800,
        proteinG: 150,
        carbsG: 180,
        fatG: 50,
        waterMl: 2500,
        steps: 10000,
      },
    };
    const res = updateTargetsSchema.safeParse(input);
    expect(res.success).toBe(true);
  });
});

describe("onboardingSchema with customTargets", () => {
  it("accepts valid onboarding payload with customTargets", () => {
    const payload = {
      name: "Alex",
      age: 26,
      gender: "male",
      heightCm: 175,
      weightKg: 72,
      goal: "build_muscle",
      activityLevel: "moderate",
      dietType: "non_veg",
      customTargets: {
        kcal: 2600,
        proteinG: 160,
        carbsG: 320,
        fatG: 70,
        waterMl: 2800,
        steps: 9000,
      },
    };
    const res = onboardingSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it("accepts valid onboarding payload without customTargets", () => {
    const payload = {
      name: "Alex",
      age: 26,
      gender: "male",
      heightCm: 175,
      weightKg: 72,
      goal: "build_muscle",
      activityLevel: "moderate",
      dietType: "non_veg",
    };
    const res = onboardingSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });
});
