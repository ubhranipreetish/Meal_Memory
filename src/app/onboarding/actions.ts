"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { calcTargets } from "@/lib/services/targets";
import { onboardingSchema } from "@/types/profile";

export type OnboardingResult = { ok: false; error: string } | { ok: true };

/** Approximate dob from age (Jan 1 of birth year) so profiles.dob is populated. */
function dobFromAge(age: number): string {
  const year = new Date().getFullYear() - age;
  return `${year}-01-01`;
}

export async function saveProfile(raw: unknown): Promise<OnboardingResult> {
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in" };
  }

  const targets = calcTargets({
    gender: input.gender,
    age: input.age,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    activityLevel: input.activityLevel,
    goal: input.goal,
  });

  const db = getDb();
  const now = new Date();
  const row = {
    id: user.id,
    name: input.name,
    dob: dobFromAge(input.age),
    gender: input.gender,
    heightCm: String(input.heightCm),
    currentWeightKg: String(input.weightKg),
    goal: input.goal,
    activityLevel: input.activityLevel,
    gymExperience: input.gymExperience,
    dietType: input.dietType,
    allergies: input.allergies ?? [],
    foodsAvoided: input.foodsAvoided ?? [],
    targets,
    targetsHistory: [{ at: now.toISOString(), targets }],
    updatedAt: now,
  };

  await db
    .insert(schema.profiles)
    .values(row)
    .onConflictDoUpdate({ target: schema.profiles.id, set: row });

  revalidatePath("/settings");
  revalidatePath("/home");
  redirect("/home");
}
