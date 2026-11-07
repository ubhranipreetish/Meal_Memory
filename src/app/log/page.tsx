import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayFeed, getTodayTotals, inferMealType } from "@/lib/services/foodMemory";
import { listSavedFoods } from "@/lib/services/history";
import { AppShell, todayLabel } from "@/components/AppShell";
import { formatAppTime } from "@/lib/time";
import { LogClient } from "./LogClient";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [feed, totals, savedFoods] = await Promise.all([
    getTodayFeed(user.id),
    getTodayTotals(user.id),
    listSavedFoods(user.id),
  ]);

  return (
    <AppShell
      active="/log"
      eyebrow={todayLabel()}
      aside="Your food journal"
      title="Eat. Log. Carry on."
      subtitle={
        totals.kcal > 0
          ? `${totals.kcal.toLocaleString()} kcal · ${totals.proteinG}g protein so far${totals.waterMl > 0 ? ` · ${(totals.waterMl / 1000).toFixed(1)}L water` : ""}`
          : "A little less tracking. A little more living."
      }
    >
      <LogClient
        feed={feed.map((f) => ({ ...f, loggedAt: f.loggedAt.toISOString(), timeLabel: formatAppTime(f.loggedAt) }))}
        savedFoods={savedFoods}
        suggestedMealType={inferMealType()}
      />
    </AppShell>
  );
}
