import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { AppShell, todayLabel } from "@/components/AppShell";
import { dayBounds, formatAppTime } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Daily timeline (Sprint 6): everything that happened today, in order. */
export default async function TimelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const { start, end } = dayBounds();
  const events = (await db.execute(sql`
    select * from (
      select ml.logged_at as at, 'meal' as kind,
             replace(coalesce(ml.meal_type,'meal'),'_',' ') || ': ' || ml.raw_input as label,
             round(sum(i.kcal))::int as value
      from meal_logs ml left join meal_log_items i on i.meal_log_id = ml.id
      where ml.user_id=${user.id}
        and ml.logged_at >= ${start.toISOString()} and ml.logged_at < ${end.toISOString()}
      group by ml.id
      union all
      select logged_at, 'water', ml || 'ml water', ml from water_logs
      where user_id=${user.id}
        and logged_at >= ${start.toISOString()} and logged_at < ${end.toISOString()}
      union all
      select started_at, 'workout',
             'Workout (' || (select count(*) from session_sets ss where ss.session_id = ws.id) || ' sets)',
             null
      from workout_sessions ws
      where user_id=${user.id}
        and started_at >= ${start.toISOString()} and started_at < ${end.toISOString()}
    ) t order by at
  `)) as unknown as Array<{ at: string; kind: string; label: string; value: number | null }>;

  return (
    <AppShell active="/home" eyebrow={todayLabel()} title="The shape of your day." subtitle="Everything you logged today, in order.">
      <section className="section">
        {events.length === 0 && <p className="small muted">Nothing logged yet today.</p>}
        {events.map((e, i) => (
          <div className="meal" key={i}>
            <div className="row between">
              <span>{e.label}</span>
              <span className="small muted">
                {formatAppTime(new Date(e.at))}
              </span>
            </div>
            {e.kind === "meal" && e.value != null && <p className="small muted mt-1">{e.value} kcal</p>}
          </div>
        ))}
      </section>
    </AppShell>
  );
}
