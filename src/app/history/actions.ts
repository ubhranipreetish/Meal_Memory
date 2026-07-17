"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { quickLogFood, relogMeal } from "@/lib/services/history";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

export async function relogAction(mealLogId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await relogMeal(user.id, mealLogId);
    revalidatePath("/history");
    revalidatePath("/home");
    revalidatePath("/log");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function quickLogAction(foodMemoryId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await quickLogFood(user.id, foodMemoryId, 1);
    revalidatePath("/log");
    revalidatePath("/home");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
