import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { listExercises } from "@/lib/services/workouts";
import { BottomNav } from "@/components/BottomNav";
import { PlanBuilder } from "./PlanBuilder";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const [plans, exercises] = await Promise.all([
    db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.userId, user.id)).orderBy(desc(schema.workoutPlans.createdAt)),
    listExercises(user.id),
  ]);

  const planRows = await Promise.all(
    plans.map(async (p) => {
      const items = await db
        .select({ pe: schema.planExercises, exName: schema.exercises.name })
        .from(schema.planExercises)
        .leftJoin(schema.exercises, eq(schema.planExercises.exerciseId, schema.exercises.id))
        .where(eq(schema.planExercises.planId, p.id))
        .orderBy(schema.planExercises.orderIndex);
      return {
        id: p.id,
        name: p.name,
        items: items.map((i) => ({
          name: i.exName ?? "Exercise",
          dayLabel: i.pe.dayLabel ?? "",
          targetSets: i.pe.targetSets ?? 3,
          targetReps: i.pe.targetReps ?? 8,
        })),
      };
    }),
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 pb-24 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Workout plans</h1>
        <Link href="/workout" className="text-sm text-neutral-500 underline underline-offset-4">← Workout</Link>
      </div>

      <PlanBuilder
        exercises={exercises.map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup ?? "other" }))}
        plans={planRows}
      />
      <BottomNav active="/workout" />
    </main>
  );
}
