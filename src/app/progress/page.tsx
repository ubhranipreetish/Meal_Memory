import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { ProgressClient } from "./ProgressClient";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const [weights, measurements, reports] = await Promise.all([
    db.execute(sql`
      with daily as (select date, weight_kg::float as kg from weight_logs where user_id=${user.id} order by date)
      select date::text, kg, avg(kg) over (order by date rows between 6 preceding and current row) as trend
      from daily order by date desc limit 90
    `) as unknown as Promise<Array<{ date: string; kg: number; trend: number }>>,
    db.select().from(schema.measurements).where(eq(schema.measurements.userId, user.id)).orderBy(desc(schema.measurements.date)).limit(10),
    db.select().from(schema.bodyReports).where(eq(schema.bodyReports.userId, user.id)).orderBy(desc(schema.bodyReports.reportDate)).limit(6),
  ]);

  // report-vs-previous deltas (SQL/code, not AI)
  const reportCards = reports.map((r, i) => {
    const prev = reports[i + 1];
    const cur = (r.metrics ?? {}) as Record<string, number>;
    const prevM = (prev?.metrics ?? {}) as Record<string, number>;
    const deltas = Object.entries(cur)
      .filter(([k]) => k in prevM && typeof cur[k] === "number")
      .map(([k, v]) => ({ key: k, delta: Math.round((v - prevM[k]) * 10) / 10 }))
      .filter((d) => d.delta !== 0)
      .slice(0, 5);
    return {
      id: r.id,
      type: r.reportType ?? "report",
      date: r.reportDate ?? "",
      summary: r.aiSummary ?? "",
      metrics: cur,
      deltas: prev ? deltas : [],
    };
  });

  return (
    <AppShell active="/home" eyebrow="PROGRESS" title="See the bigger picture." subtitle="Small changes add up.">
      <ProgressClient
        weights={[...weights].reverse()}
        measurements={measurements.map((m) => ({
          date: m.date,
          chestCm: m.chestCm, waistCm: m.waistCm, hipsCm: m.hipsCm, armCm: m.armCm, thighCm: m.thighCm,
        }))}
        reports={reportCards}
      />
    </AppShell>
  );
}
