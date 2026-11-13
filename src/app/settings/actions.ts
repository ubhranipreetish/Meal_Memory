"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { updateTargetsSchema, type UpdateTargetsInput } from "@/types/profile";
import type { Targets } from "@/lib/services/targets";

export async function updateGoalsAndTargetsAction(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in" };

    const parsed = updateTargetsSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const input: UpdateTargetsInput = parsed.data;

    const db = getDb();
    const [profile] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.id))
      .limit(1);
    if (!profile) return { ok: false, error: "Profile not found" };

    const existingTargets = (profile.targets as Targets | null) ?? {
      bmr: 0,
      tdee: 0,
      kcal: input.targets.kcal,
      proteinG: input.targets.proteinG,
      carbsG: input.targets.carbsG,
      fatG: input.targets.fatG,
      fiberG: input.targets.fiberG ?? Math.max(25, Math.round((input.targets.kcal / 1000) * 14)),
      waterMl: input.targets.waterMl,
      steps: input.targets.steps ?? 8000,
    };

    const newTargets: Targets = {
      bmr: existingTargets.bmr ?? 0,
      tdee: existingTargets.tdee ?? 0,
      kcal: input.targets.kcal,
      proteinG: input.targets.proteinG,
      carbsG: input.targets.carbsG,
      fatG: input.targets.fatG,
      fiberG: input.targets.fiberG ?? existingTargets.fiberG ?? Math.max(25, Math.round((input.targets.kcal / 1000) * 14)),
      waterMl: input.targets.waterMl,
      steps: input.targets.steps ?? existingTargets.steps ?? 8000,
    };

    const now = new Date();
    const existingHistory = Array.isArray(profile.targetsHistory) ? profile.targetsHistory : [];

    await db
      .update(schema.profiles)
      .set({
        goal: input.goal,
        targets: newTargets,
        targetsHistory: [...existingHistory, { at: now.toISOString(), targets: newTargets }],
        updatedAt: now,
      })
      .where(eq(schema.profiles.id, user.id));

    revalidatePath("/settings");
    revalidatePath("/home");
    revalidatePath("/plan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update targets" };
  }
}
