import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayBrief } from "@/lib/ai/coach";
import { BottomNav } from "@/components/BottomNav";
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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-5 pb-24 pt-8">
      <h1 className="text-2xl font-semibold">Coach</h1>
      <CoachClient initialBrief={brief} />
      <BottomNav active="/coach" />
    </main>
  );
}
