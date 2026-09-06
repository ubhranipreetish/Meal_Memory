"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { quickLogFood, relogMeal } from "@/lib/services/history";
import { MEAL_TYPES } from "@/types/food";

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

export async function quickLogAction(foodMemoryId: string, mealType?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const slot = MEAL_TYPES.find((m) => m === mealType);
    await quickLogFood(user.id, foodMemoryId, undefined, slot);
    revalidatePath("/log");
    revalidatePath("/home");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
