import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, listExercises, recentSessions } from "@/lib/services/workouts";
import { BottomNav } from "@/components/BottomNav";
import { WorkoutClient } from "./WorkoutClient";

export const dynamic = "force-dynamic";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [exercises, active, recent] = await Promise.all([
    listExercises(user.id),
    getActiveSession(user.id),
    recentSessions(user.id, 8),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 pb-24 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Workout</h1>
        <a href="/workout/plans" className="text-sm text-neutral-500 underline underline-offset-4">Plans</a>
      </div>
      <WorkoutClient
        exercises={exercises.map((e) => ({
          id: e.id,
          name: e.name,
          muscleGroup: e.muscleGroup ?? "other",
        }))}
        active={
          active
            ? {
                id: active.id,
                startedAt: active.startedAt?.toISOString() ?? new Date().toISOString(),
                sets: active.sets,
              }
            : null
        }
        recent={recent.map((s) => ({
          id: s.id,
          startedAt: s.startedAt.toISOString(),
          setCount: s.setCount,
          volume: s.volume,
          prs: s.prs,
          exerciseCount: s.exerciseCount,
        }))}
      />
      <BottomNav active="/workout" />
    </main>
  );
}
