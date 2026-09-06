/**
 * Daily calorie + macro target calculation.
 *
 * Pure functions, no I/O, no AI — this is deterministic math the coach and
 * dashboard rely on (RULES.md #9: LLMs never do arithmetic that matters).
 *
 * Method: Mifflin-St Jeor BMR -> activity-scaled TDEE -> goal-adjusted kcal
 * -> macro split. Unit-tested in targets.test.ts.
 */

export type Gender = "male" | "female";

export type ActivityLevel =
  | "sedentary" // little/no exercise
  | "light" // 1-3 days/week
  | "moderate" // 3-5 days/week
  | "active" // 6-7 days/week
  | "very_active"; // hard training / physical job

export type Goal =
  | "build_muscle"
  | "lose_fat"
  | "lean_bulk"
  | "recomp"
  | "athletic"
  | "general";

export interface TargetInputs {
  gender: Gender;
  age: number; // years
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface Targets {
  bmr: number; // Basal Metabolic Rate (kcal/day)
  tdee: number; // Total Daily Energy Expenditure (kcal/day)
  kcal: number; // goal-adjusted daily calorie target
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  steps: number;
}

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Calorie adjustment applied to TDEE, as a multiplier, per goal. */
const GOAL_KCAL_MULTIPLIER: Record<Goal, number> = {
  lose_fat: 0.8, // ~20% deficit
  build_muscle: 1.1, // ~10% surplus
  lean_bulk: 1.08, // ~8% surplus (slower, leaner gain)
  recomp: 1.0, // maintenance
  athletic: 1.05, // slight surplus to fuel performance
  general: 1.0, // maintenance
};

/** Protein target in grams per kg of bodyweight, per goal. */
const GOAL_PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose_fat: 2.2, // higher to preserve muscle in a deficit
  build_muscle: 2.0,
  lean_bulk: 2.0,
  recomp: 2.0,
  athletic: 1.8,
  general: 1.6,
};

/** Fraction of total calories that comes from fat, per goal. */
const GOAL_FAT_FRACTION: Record<Goal, number> = {
  lose_fat: 0.25,
  build_muscle: 0.25,
  lean_bulk: 0.25,
  recomp: 0.25,
  athletic: 0.3,
  general: 0.3,
};

/** Daily step target, per goal. */
const GOAL_STEPS: Record<Goal, number> = {
  lose_fat: 10000,
  build_muscle: 8000,
  lean_bulk: 8000,
  recomp: 9000,
  athletic: 10000,
  general: 8000,
};

const WATER_ML_PER_KG = 35;

/** Mifflin-St Jeor Basal Metabolic Rate (kcal/day). */
export function calcBMR(input: Pick<TargetInputs, "gender" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return input.gender === "male" ? base + 5 : base - 161;
}

/** Total Daily Energy Expenditure = BMR scaled by activity level. */
export function calcTDEE(input: Pick<TargetInputs, "gender" | "age" | "heightCm" | "weightKg" | "activityLevel">): number {
  return calcBMR(input) * ACTIVITY_MULTIPLIER[input.activityLevel];
}

const round10 = (n: number) => Math.round(n / 10) * 10;
const round = (n: number) => Math.round(n);

/** Full daily targets: calories, macros, water, steps. */
export function calcTargets(input: TargetInputs): Targets {
  const bmr = calcBMR(input);
  const tdee = calcTDEE(input);
  const kcalRaw = tdee * GOAL_KCAL_MULTIPLIER[input.goal];
  const kcal = round10(kcalRaw);

  const proteinG = round(GOAL_PROTEIN_G_PER_KG[input.goal] * input.weightKg);
  const fatG = round((GOAL_FAT_FRACTION[input.goal] * kcal) / 9);
  // Carbs fill the remaining calories after protein (4 kcal/g) and fat (9 kcal/g).
  const carbsG = Math.max(0, round((kcal - proteinG * 4 - fatG * 9) / 4));

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    kcal,
    proteinG,
    carbsG,
    fatG,
    waterMl: round10(WATER_ML_PER_KG * input.weightKg),
    steps: GOAL_STEPS[input.goal],
  };
}

// ── Goal suggestion from body stats (onboarding) ─────────────────────────────

/** BMI = kg / m². Plain helper so the UI can show it alongside the suggestion. */
export function calcBMI(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  if (!(m > 0)) return 0;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export interface GoalSuggestion {
  goal: Goal;
  bmi: number;
  /** Short, human reason shown under the pre-selected goal. */
  reason: string;
}

/**
 * Suggest a starting goal from age/gender/height/weight (WHO BMI bands, with
 * an Asian-population-aware overweight cut-off of 23 since this app is built
 * for Indian users). This is a *default*, never a lock — the user can override.
 */
export function suggestGoal(input: {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
}): GoalSuggestion {
  const bmi = calcBMI(input.heightCm, input.weightKg);

  if (bmi === 0) {
    return { goal: "general", bmi, reason: "Enter your height and weight for a tailored suggestion." };
  }
  if (bmi < 18.5) {
    return {
      goal: "build_muscle",
      bmi,
      reason: `Your BMI is ${bmi} (underweight), so building size and strength in a calorie surplus makes sense.`,
    };
  }
  if (bmi < 23) {
    return {
      goal: "lean_bulk",
      bmi,
      reason: `Your BMI is ${bmi} (healthy range) — a lean bulk adds muscle while keeping fat gain slow.`,
    };
  }
  if (bmi < 27.5) {
    return {
      goal: "recomp",
      bmi,
      reason: `Your BMI is ${bmi} (slightly above the healthy range) — recomposition builds muscle while losing fat.`,
    };
  }
  return {
    goal: "lose_fat",
    bmi,
    reason: `Your BMI is ${bmi}, so prioritising fat loss will have the biggest impact on your health.`,
  };
}
