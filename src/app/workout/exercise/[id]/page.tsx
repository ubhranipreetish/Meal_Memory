import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exerciseHistory } from "@/lib/services/workouts";
import { AppShell } from "@/components/AppShell";
import { ExerciseChart } from "./ExerciseChart";

export const dynamic = "force-dynamic";

export default async function ExerciseHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const data = await exerciseHistory(user.id, id);
  if (!data) notFound();

  const first = data.series[0];
  const last = data.series[data.series.length - 1];

  return (
    <AppShell
      active="/workout"
      eyebrow={data.exercise.muscleGroup ?? "EXERCISE"}
      aside={<Link href="/workout" style={{ color: "inherit" }}>← Workout</Link>}
      title={data.exercise.name}
      subtitle="Every set you've logged for this lift."
    >
      {data.series.length === 0 ? (
        <p className="small muted section">No sets logged yet for this exercise.</p>
      ) : (
        <>
          <div className="grid2 section">
            <Stat label="Best" value={`${data.bestWeight} kg`} />
            <Stat label="Sessions" value={String(data.series.length)} />
            {first && last && <Stat label="Progress" value={`${first.topWeight}→${last.topWeight} kg`} />}
          </div>
          <section className="card section">
            <h2>Top set weight over time</h2>
            <div className="chart mt-3">
              <ExerciseChart series={data.series} />
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="small muted">{label}</p>
      <p className="metric">{value}</p>
    </div>
  );
}
