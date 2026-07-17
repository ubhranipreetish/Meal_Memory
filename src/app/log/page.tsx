import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayFeed, getTodayTotals } from "@/lib/services/foodMemory";
import { listFoods } from "@/lib/services/history";
import { BottomNav } from "@/components/BottomNav";
import { LogClient } from "./LogClient";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [feed, totals, recentFoods] = await Promise.all([
    getTodayFeed(user.id),
    getTodayTotals(user.id),
    listFoods(user.id, "recent", 8),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-24 pt-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Log food</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Today so far: <span className="font-medium text-neutral-700 dark:text-neutral-300">{totals.kcal} kcal</span> · {totals.proteinG}g protein
          {totals.waterMl > 0 && <> · {totals.waterMl}ml water</>}
        </p>
      </header>
      <LogClient
        feed={feed.map((f) => ({
          ...f,
          loggedAt: f.loggedAt.toISOString(),
        }))}
        recentFoods={recentFoods.map((f) => ({ id: f.id, name: f.name, kcal: f.kcal, unit: f.unit }))}
      />
      <BottomNav active="/log" />
    </main>
  );
}
