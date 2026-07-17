import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

/** Daily timeline (Sprint 6): everything that happened today, in order. */
export default async function TimelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const events = (await db.execute(sql`
    select * from (
      select ml.logged_at as at, 'meal' as kind,
             coalesce(ml.meal_type,'meal') || ': ' || ml.raw_input as label,
             round(sum(i.kcal))::int as value
      from meal_logs ml left join meal_log_items i on i.meal_log_id = ml.id
      where ml.user_id=${user.id} and ml.logged_at >= date_trunc('day', now())
      group by ml.id
      union all
      select logged_at, 'water', ml || 'ml water', ml from water_logs
      where user_id=${user.id} and logged_at >= date_trunc('day', now())
      union all
      select started_at, 'workout',
             'Workout (' || (select count(*) from session_sets ss where ss.session_id = ws.id) || ' sets)',
             null
      from workout_sessions ws
      where user_id=${user.id} and started_at >= date_trunc('day', now())
    ) t order by at
  `)) as unknown as Array<{ at: string; kind: string; label: string; value: number | null }>;

  const ICON: Record<string, string> = { meal: "🍽", water: "💧", workout: "🏋️" };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-5 pb-24 pt-8">
      <h1 className="text-2xl font-semibold">Today&apos;s timeline</h1>
      {events.length === 0 && <p className="text-sm text-neutral-400">Nothing logged yet today.</p>}
      <ol className="relative flex flex-col gap-4 border-l border-neutral-200 pl-5 dark:border-neutral-800">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[27px] top-0.5 text-sm">{ICON[e.kind] ?? "•"}</span>
            <div className="text-xs text-neutral-500">
              {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-sm">
              {e.label}
              {e.kind === "meal" && e.value != null && <span className="text-neutral-500"> · {e.value} kcal</span>}
            </div>
          </li>
        ))}
      </ol>
      <BottomNav active="/home" />
    </main>
  );
}
