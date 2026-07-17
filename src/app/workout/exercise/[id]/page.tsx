import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exerciseHistory } from "@/lib/services/workouts";
import { BottomNav } from "@/components/BottomNav";
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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 pb-24 pt-8">
      <Link href="/workout" className="text-sm text-neutral-500 underline underline-offset-4">← Workout</Link>
      <div>
        <h1 className="text-2xl font-semibold">{data.exercise.name}</h1>
        <p className="mt-0.5 text-sm capitalize text-neutral-500">{data.exercise.muscleGroup}</p>
      </div>

      {data.series.length === 0 ? (
        <p className="text-sm text-neutral-400">No sets logged yet for this exercise.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Best" value={`${data.bestWeight} kg`} />
            <Stat label="Sessions" value={String(data.series.length)} />
            {first && last && (
              <Stat
                label="Progress"
                value={`${first.topWeight}→${last.topWeight} kg`}
              />
            )}
          </div>
          <section className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="mb-3 text-sm font-medium text-neutral-500">Top set weight over time</h2>
            <ExerciseChart series={data.series} />
          </section>
        </>
      )}
      <BottomNav active="/workout" />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 text-center dark:border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
