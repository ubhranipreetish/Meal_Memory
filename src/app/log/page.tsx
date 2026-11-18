import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDailyFeed, getTodayTotals, inferMealType } from "@/lib/services/foodMemory";
import { listSavedFoods } from "@/lib/services/history";
import { AppShell, todayLabel } from "@/components/AppShell";
import { dateKey, dayBounds, formatAppTime } from "@/lib/time";
import { LogClient } from "./LogClient";

export const dynamic = "force-dynamic";

export default async function LogPage({ searchParams }: { searchParams: Promise<{ day?: string | string[] }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const yesterday = (await searchParams).day === "yesterday";
  const now = new Date();
  const date = yesterday ? new Date(dayBounds(now).start.getTime() - 1) : now;
  const selectedDate = dateKey(date);
  const [feed, totals, savedFoods] = await Promise.all([
    getDailyFeed(user.id, date),
    getTodayTotals(user.id, date),
    listSavedFoods(user.id),
  ]);

  return (
    <AppShell
      active="/log"
      eyebrow={todayLabel(date)}
      aside="Your food journal"
      title="Eat. Log. Carry on."
      subtitle={
        totals.kcal > 0
          ? `${totals.kcal.toLocaleString()} kcal · ${totals.proteinG}g protein so far${totals.waterMl > 0 ? ` · ${(totals.waterMl / 1000).toFixed(1)}L water` : ""}`
          : "A little less tracking. A little more living."
      }
    >
      <LogClient
        key={selectedDate}
        date={selectedDate}
        yesterday={yesterday}
        feed={feed.map((f) => ({ ...f, loggedAt: f.loggedAt.toISOString(), timeLabel: f.backdated ? null : formatAppTime(f.loggedAt) }))}
        savedFoods={savedFoods}
        suggestedMealType={yesterday ? "dinner" : inferMealType(now)}
      />
    </AppShell>
  );
}
