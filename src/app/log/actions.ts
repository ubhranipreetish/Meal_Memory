"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { analyzeMealPhoto } from "@/lib/ai/photoAnalyzer";
import {
  confirmAndLog,
  inferMealType,
  resolveParsedItems,
  resolveUtterance,
} from "@/lib/services/foodMemory";
import { confirmLogSchema, type ResolvedLog } from "@/types/food";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

export type ParseActionResult =
  | { ok: true; resolved: ResolvedLog; tookMs: number }
  | { ok: false; error: string };

export async function parseAction(utterance: string): Promise<ParseActionResult> {
  try {
    const user = await requireUser();
    const t0 = Date.now();
    const resolved = await resolveUtterance(user.id, utterance.trim());
    return { ok: true, resolved, tookMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Parsing failed" };
  }
}

export type PhotoActionResult =
  | { ok: true; resolved: ResolvedLog; photoPath?: string; tookMs: number }
  | { ok: false; error: string };

/** Photo → vision analysis + storage upload → same resolve/confirm pipeline. */
export async function photoAction(imageBase64: string, mimeType: string): Promise<PhotoActionResult> {
  try {
    const user = await requireUser();
    const t0 = Date.now();
    const parsed = await analyzeMealPhoto(imageBase64, mimeType);
    const items = await resolveParsedItems(user.id, parsed.items);

    // Best-effort photo upload (session-scoped client → per-user folder RLS).
    let photoPath: string | undefined;
    try {
      const supabase = await createClient();
      const ext = mimeType.includes("png") ? "png" : "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("meal-photos")
        .upload(path, Buffer.from(imageBase64, "base64"), { contentType: mimeType });
      if (!error) photoPath = path;
    } catch {
      /* photo storage is optional — never blocks logging */
    }

    const resolved: ResolvedLog = {
      raw: "[photo] meal photo",
      mealType: parsed.mealType ?? inferMealType(),
      waterMl: parsed.waterMl ?? undefined,
      items,
      // Photos always confirm — portions are visual estimates (SPRINTS.md S4).
      needsConfirmation: items.length > 0,
      zeroAi: false,
    };
    return { ok: true, resolved, photoPath, tookMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Photo analysis failed" };
  }
}

export type ConfirmActionResult = { ok: true } | { ok: false; error: string };

export async function confirmAction(raw: unknown): Promise<ConfirmActionResult> {
  try {
    const user = await requireUser();
    const input = confirmLogSchema.parse(raw);
    await confirmAndLog(user.id, input);
    revalidatePath("/log");
    revalidatePath("/home");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Saving failed" };
  }
}
