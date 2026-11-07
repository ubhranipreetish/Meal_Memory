"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { analyzeMealPhoto } from "@/lib/ai/photoAnalyzer";
import { parseMealAudio } from "@/lib/ai/voiceLogger";
import { estimateForUnit } from "@/lib/ai/unitEstimator";
import {
  confirmAndLog,
  deleteMealLog,
  resolveParsedItems,
  resolveUtterance,
  setMealLogType,
  inferMealType,
} from "@/lib/services/foodMemory";
import { MEAL_TYPES, confirmLogSchema, type ResolvedLog } from "@/types/food";
import { validateBase64Upload } from "@/lib/uploadValidation";
import { z } from "zod";

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
    const text = z.string().trim().min(1, "Describe what you ate").max(1000, "Keep the description under 1,000 characters").parse(utterance);
    const t0 = Date.now();
    const resolved = await resolveUtterance(user.id, text);
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
    const upload = validateBase64Upload(imageBase64, mimeType, "photo");
    const t0 = Date.now();
    const parsed = await analyzeMealPhoto(imageBase64, upload.mimeType);
    const items = await resolveParsedItems(user.id, parsed.items);

    // Best-effort photo upload (session-scoped client → per-user folder RLS).
    let photoPath: string | undefined;
    try {
      const supabase = await createClient();
      const path = `${user.id}/${Date.now()}.${upload.extension}`;
      const { error } = await supabase.storage
        .from("meal-photos")
        .upload(path, upload.buffer, { contentType: upload.mimeType });
      if (!error) photoPath = path;
    } catch {
      /* photo storage is optional — never blocks logging */
    }

    const resolved: ResolvedLog = {
      raw: "[photo] meal photo",
      mealType: parsed.mealType ?? inferMealType(),
      mealTypeExplicit: parsed.mealType != null,
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

export type VoiceActionResult =
  | { ok: true; resolved: ResolvedLog; transcript: string; language: string; tookMs: number }
  | { ok: false; error: string };

/**
 * Voice → one Gemini call that transcribes AND parses (ADR-010). The language
 * is detected from the audio, so the user never picks one.
 */
export async function voiceAction(audioBase64: string, mimeType: string): Promise<VoiceActionResult> {
  try {
    const user = await requireUser();
    const upload = validateBase64Upload(audioBase64, mimeType, "audio");
    const t0 = Date.now();
    const parsed = await parseMealAudio(audioBase64, upload.mimeType);
    const items = await resolveParsedItems(user.id, parsed.items);
    const resolved: ResolvedLog = {
      raw: parsed.transcript || "[voice] meal",
      mealType: parsed.mealType ?? inferMealType(),
      mealTypeExplicit: parsed.mealType != null,
      waterMl: parsed.waterMl ?? undefined,
      items,
      // Voice always reviews — speech recognition of food words is error-prone.
      needsConfirmation: items.length > 0,
      zeroAi: false,
    };
    return { ok: true, resolved, transcript: parsed.transcript, language: parsed.language, tookMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't understand that recording" };
  }
}

export type ReestimateActionResult =
  | { ok: true; perUnit: { kcal: number; proteinG: number; carbsG: number; fatG: number }; perQty: number; approxGrams: number; confidence: number; assumptions: string | null }
  | { ok: false; error: string };

/**
 * Re-estimate one item's nutrition after the user changes its unit. A piece of
 * butter chicken is not a quarter of a bowl, so the old numbers can't be
 * rescaled — they have to be replaced (ADR-010).
 */
export async function reestimateUnitAction(name: string, unit: string): Promise<ReestimateActionResult> {
  try {
    await requireUser();
    const safeName = z.string().trim().min(1, "Name the food first").max(120).parse(name);
    const safeUnit = z.enum(["piece", "slice", "bowl", "plate", "glass", "cup", "scoop", "tbsp", "tsp", "serving", "g", "ml"]).parse(unit);
    const e = await estimateForUnit(safeName, safeUnit);
    return {
      ok: true,
      perUnit: { kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG },
      perQty: e.perQty,
      approxGrams: e.approxGrams,
      confidence: e.confidence,
      assumptions: e.assumptions ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't re-estimate" };
  }
}

export type ConfirmActionResult = { ok: true } | { ok: false; error: string };

export async function confirmAction(raw: unknown): Promise<ConfirmActionResult> {
  try {
    const user = await requireUser();
    const input = confirmLogSchema.parse(raw);
    await confirmAndLog(user.id, input);
    revalidatePath("/history");
    revalidatePath("/settings");
    revalidatePath("/log");
    revalidatePath("/home");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Saving failed" };
  }
}

export async function deleteMealLogAction(mealLogId: string): Promise<ConfirmActionResult> {
  try {
    const user = await requireUser();
    await deleteMealLog(user.id, mealLogId);
    revalidatePath("/log");
    revalidatePath("/home");
    revalidatePath("/history");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

export async function setMealTypeAction(mealLogId: string, mealType: string): Promise<ConfirmActionResult> {
  try {
    const user = await requireUser();
    const t = MEAL_TYPES.find((m) => m === mealType);
    if (!t) throw new Error("Unknown meal slot");
    await setMealLogType(user.id, mealLogId, t);
    revalidatePath("/log");
    revalidatePath("/history");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}
