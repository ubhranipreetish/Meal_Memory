"use server";

import { createClient } from "@/lib/supabase/server";
import { coachChat, generateDailyBrief, type ChatTurn } from "@/lib/ai/coach";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

export async function chatAction(
  message: string,
  history: ChatTurn[],
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const { reply } = await coachChat(user.id, message.slice(0, 1000), history);
    return { ok: true, reply };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Coach unavailable" };
  }
}

export async function regenerateBriefAction(): Promise<{ ok: true; brief: string } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const brief = await generateDailyBrief(user.id);
    return { ok: true, brief };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
