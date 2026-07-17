"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { confirmAndLog, resolveUtterance } from "@/lib/services/foodMemory";
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
