import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayBrief } from "@/lib/ai/coach";
import { AppShell } from "@/components/AppShell";
import { CoachClient } from "./CoachClient";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const brief = await getTodayBrief(user.id);

  return (
    <AppShell active="/coach" eyebrow="YOUR COACH" title="In your corner." subtitle="Your goals. Your food. Your pace.">
      <CoachClient initialBrief={brief} />
    </AppShell>
  );
}
