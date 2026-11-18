"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { deleteSavedFood, toggleFavorite, updateFoodNutrition } from "@/lib/services/history";

const editSchema = z.object({
  foodId: z.string().uuid(),
  kcal: z.coerce.number().min(0),
  proteinG: z.coerce.number().min(0),
  carbsG: z.coerce.number().min(0),
  fatG: z.coerce.number().min(0),
  fiberG: z.coerce.number().min(0).optional(),
});

export async function updateFoodAction(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const input = editSchema.parse(raw);
    await updateFoodNutrition(user.id, input.foodId, input);
    revalidatePath(`/food/${input.foodId}`);
    revalidatePath("/settings");
    revalidatePath("/log");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function toggleFavoriteAction(foodId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await toggleFavorite(user.id, foodId);
  revalidatePath(`/food/${foodId}`);
  revalidatePath("/settings");
  revalidatePath("/log");
  return { ok: true };
}

export async function deleteFoodAction(foodId: string): Promise<{ error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    await deleteSavedFood(user.id, z.uuid().parse(foodId));
  } catch {
    return { error: "Couldn’t delete this saved food. Refresh and try again." };
  }

  revalidatePath(`/food/${foodId}`);
  revalidatePath("/settings");
  revalidatePath("/log");
  revalidatePath("/history");
  redirect("/settings#saved-foods");
}
