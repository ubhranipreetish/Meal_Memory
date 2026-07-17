"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { finishSession, logSet, startSession } from "@/lib/services/workouts";
import { getDb, schema } from "@/lib/db";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

export async function startSessionAction(): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  try {
    const user = await requireUser();
    const sessionId = await startSession(user.id);
    revalidatePath("/workout");
    return { ok: true, sessionId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

const setSchema = z.object({
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().positive(),
  weightKg: z.number().min(0),
  reps: z.number().int().positive(),
});

export async function logSetAction(raw: unknown): Promise<{ ok: boolean; isPr?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const input = setSchema.parse(raw);
    const { isPr } = await logSet(user.id, input);
    return { ok: true, isPr };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function finishSessionAction(sessionId: string, notes?: string): Promise<{ ok: boolean }> {
  try {
    const user = await requireUser();
    await finishSession(user.id, sessionId, notes);
    revalidatePath("/workout");
    revalidatePath("/home");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

const customExerciseSchema = z.object({ name: z.string().min(2), muscleGroup: z.string().min(2) });

export async function addCustomExerciseAction(raw: unknown): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const user = await requireUser();
    const input = customExerciseSchema.parse(raw);
    const db = getDb();
    const [row] = await db
      .insert(schema.exercises)
      .values({ userId: user.id, name: input.name, muscleGroup: input.muscleGroup, isCustom: true })
      .returning({ id: schema.exercises.id });
    revalidatePath("/workout");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
