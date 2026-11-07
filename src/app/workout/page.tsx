import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, listExercises, recentSessions } from "@/lib/services/workouts";
import { AppShell } from "@/components/AppShell";
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
    <AppShell active="/workout" eyebrow="TRAIN" aside={<Link href="/workout/plans" style={{ color: "inherit" }}>Plans →</Link>} title="Make this set count." subtitle="Log as you go. The numbers take care of themselves.">
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
    </AppShell>
  );
}
