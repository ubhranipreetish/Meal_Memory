"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { dateKey } from "@/lib/time";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

export async function logWeightAction(kg: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const w = z.number().min(20).max(400).parse(kg);
    const db = getDb();
    const date = dateKey();
    const existing = await db
      .select({ id: schema.weightLogs.id })
      .from(schema.weightLogs)
      .where(and(eq(schema.weightLogs.userId, user.id), eq(schema.weightLogs.date, date)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(schema.weightLogs).set({ weightKg: String(w) }).where(eq(schema.weightLogs.id, existing[0].id));
    } else {
      await db.insert(schema.weightLogs).values({ userId: user.id, date, weightKg: String(w) });
    }
    // keep profile's current weight in sync
    await db.update(schema.profiles).set({ currentWeightKg: String(w) }).where(eq(schema.profiles.id, user.id));
    revalidatePath("/home");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function logWaterAction(ml: number): Promise<{ ok: boolean }> {
  try {
    const user = await requireUser();
    const v = z.number().min(1).max(5000).parse(ml);
    await getDb().insert(schema.waterLogs).values({ userId: user.id, ml: Math.round(v) });
    revalidatePath("/home");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function logStepsAction(steps: number): Promise<{ ok: boolean }> {
  try {
    const user = await requireUser();
    const v = z.number().int().min(0).max(200000).parse(steps);
    const db = getDb();
    const date = dateKey();
    const existing = await db
      .select({ id: schema.stepsLogs.id })
      .from(schema.stepsLogs)
      .where(and(eq(schema.stepsLogs.userId, user.id), eq(schema.stepsLogs.date, date)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(schema.stepsLogs).set({ steps: v }).where(eq(schema.stepsLogs.id, existing[0].id));
    } else {
      await db.insert(schema.stepsLogs).values({ userId: user.id, date, steps: v });
    }
    revalidatePath("/home");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function logSleepAction(hours: number): Promise<{ ok: boolean }> {
  try {
    const user = await requireUser();
    const v = z.number().min(0).max(24).parse(hours);
    const db = getDb();
    const date = dateKey();
    const minutes = Math.round(v * 60);
    const existing = await db
      .select({ id: schema.sleepLogs.id })
      .from(schema.sleepLogs)
      .where(and(eq(schema.sleepLogs.userId, user.id), eq(schema.sleepLogs.date, date)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(schema.sleepLogs).set({ minutes }).where(eq(schema.sleepLogs.id, existing[0].id));
    } else {
      await db.insert(schema.sleepLogs).values({ userId: user.id, date, minutes });
    }
    revalidatePath("/home");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
