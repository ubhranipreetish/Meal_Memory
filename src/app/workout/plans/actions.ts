"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

const planSchema = z.object({
  name: z.string().trim().min(2).max(100),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().uuid(),
        dayLabel: z.string().trim().min(1).max(50),
        targetSets: z.number().int().min(1).max(10),
        targetReps: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(100),
});

export async function createPlanAction(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const input = planSchema.parse(raw);
    const db = getDb();
    const exerciseIds = [...new Set(input.exercises.map((exercise) => exercise.exerciseId))];
    const accessible = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(
        and(
          inArray(schema.exercises.id, exerciseIds),
          or(isNull(schema.exercises.userId), eq(schema.exercises.userId, user.id)),
        ),
      );
    if (accessible.length !== exerciseIds.length) throw new Error("One or more exercises are unavailable");

    await db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(schema.workoutPlans)
        .values({ userId: user.id, name: input.name })
        .returning({ id: schema.workoutPlans.id });
      await tx.insert(schema.planExercises).values(
        input.exercises.map((exercise, i) => ({
          userId: user.id,
          planId: plan.id,
          exerciseId: exercise.exerciseId,
          dayLabel: exercise.dayLabel,
          targetSets: exercise.targetSets,
          targetReps: exercise.targetReps,
          orderIndex: i,
        })),
      );
    });
    revalidatePath("/workout/plans");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deletePlanAction(planId: string): Promise<{ ok: boolean }> {
  try {
    const user = await requireUser();
    const db = getDb();
    await db
      .delete(schema.workoutPlans)
      .where(and(eq(schema.workoutPlans.id, planId), eq(schema.workoutPlans.userId, user.id)));
    revalidatePath("/workout/plans");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
