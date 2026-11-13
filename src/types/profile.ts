/**
 * Shared Zod schemas (RULES.md #19: single source of truth for LLM output,
 * API validation, and forms). Onboarding form + profile shape live here.
 */
import { z } from "zod";

export const GENDERS = ["male", "female"] as const;
export const GOALS = [
  "build_muscle",
  "lose_fat",
  "lean_bulk",
  "recomp",
  "athletic",
  "general",
] as const;
export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;
export const GYM_EXPERIENCE = ["beginner", "intermediate", "advanced"] as const;
export const DIET_TYPES = ["veg", "eggetarian", "non_veg", "vegan"] as const;

export const GOAL_LABELS: Record<(typeof GOALS)[number], string> = {
  build_muscle: "Build muscle",
  lose_fat: "Lose fat",
  lean_bulk: "Lean bulk",
  recomp: "Body recomposition",
  athletic: "Athletic performance",
  general: "General fitness",
};

export const GYM_EXPERIENCE_LABELS: Record<(typeof GYM_EXPERIENCE)[number], string> = {
  beginner: "Beginner — new to the gym",
  intermediate: "Intermediate — training regularly",
  advanced: "Advanced — years of training",
};

export const DIET_LABELS: Record<(typeof DIET_TYPES)[number], string> = {
  veg: "Vegetarian",
  eggetarian: "Eggetarian (veg + eggs)",
  non_veg: "Non-vegetarian",
  vegan: "Vegan",
};

export const ACTIVITY_LABELS: Record<(typeof ACTIVITY_LEVELS)[number], string> = {
  sedentary: "Sedentary (little/no exercise)",
  light: "Light (1–3 days/week)",
  moderate: "Moderate (3–5 days/week)",
  active: "Active (6–7 days/week)",
  very_active: "Very active (hard training / physical job)",
};

export const targetValuesSchema = z.object({
  kcal: z.coerce.number().int().min(500, "Calories must be at least 500").max(10000, "Calories must be 10,000 or less"),
  proteinG: z.coerce.number().int().min(0, "Protein cannot be negative").max(1000, "Protein too high"),
  carbsG: z.coerce.number().int().min(0, "Carbs cannot be negative").max(1500, "Carbs too high"),
  fatG: z.coerce.number().int().min(0, "Fat cannot be negative").max(500, "Fat too high"),
  fiberG: z.coerce.number().int().min(0, "Fibre cannot be negative").max(200, "Fibre too high").optional(),
  waterMl: z.coerce.number().int().min(500, "Water must be at least 500 ml").max(15000, "Water too high"),
  steps: z.coerce.number().int().min(1000, "Steps must be at least 1,000").max(50000, "Steps too high").optional(),
});

export type TargetValues = z.infer<typeof targetValuesSchema>;

export const updateTargetsSchema = z.object({
  goal: z.enum(GOALS),
  targets: targetValuesSchema,
});

export type UpdateTargetsInput = z.infer<typeof updateTargetsSchema>;

export const onboardingSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age: z.coerce.number().int().min(13).max(100),
  gender: z.enum(GENDERS),
  heightCm: z.coerce.number().min(100).max(250),
  weightKg: z.coerce.number().min(30).max(300),
  goal: z.enum(GOALS),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  gymExperience: z.enum(GYM_EXPERIENCE).optional(),
  dietType: z.enum(DIET_TYPES, { message: "Pick your diet" }),
  allergies: z.array(z.string()).optional(),
  foodsAvoided: z.array(z.string()).optional(),
  customTargets: targetValuesSchema.optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
