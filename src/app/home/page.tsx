import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { getTodayTotals } from "@/lib/services/foodMemory";
import { workoutDoneToday } from "@/lib/services/workouts";
import { signOut } from "@/app/login/actions";
import type { Targets } from "@/lib/services/targets";
import { GOAL_LABELS } from "@/types/profile";
import { BottomNav } from "@/components/BottomNav";
import { QuickLogs } from "./QuickLogs";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).limit(1);
  if (!profile || !profile.targets) redirect("/onboarding");

  const today = new Date().toISOString().slice(0, 10);
  const t = profile.targets as Targets;
  const [c, workoutDone, [weightRow], [stepsRow], [sleepRow]] = await Promise.all([
    getTodayTotals(user.id),
    workoutDoneToday(user.id),
    db.select().from(schema.weightLogs).where(and(eq(schema.weightLogs.userId, user.id), eq(schema.weightLogs.date, today))).limit(1),
    db.select().from(schema.stepsLogs).where(and(eq(schema.stepsLogs.userId, user.id), eq(schema.stepsLogs.date, today))).limit(1),
    db.select().from(schema.sleepLogs).where(and(eq(schema.sleepLogs.userId, user.id), eq(schema.sleepLogs.date, today))).limit(1),
  ]);
  const goalLabel = profile.goal ? GOAL_LABELS[profile.goal as keyof typeof GOAL_LABELS] : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-5 pb-24 pt-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-neutral-500">Hi {profile.name ?? "there"} 👋</p>
          <h1 className="text-2xl font-semibold">Today</h1>
          {goalLabel && <p className="mt-1 text-sm text-emerald-600">Goal: {goalLabel}</p>}
        </div>
        <Link href="/settings" className="text-sm text-neutral-500 underline underline-offset-4">
          Settings
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Macro label="Calories" unit="kcal" consumed={c.kcal} target={t.kcal} accent />
        <Macro label="Protein" unit="g" consumed={c.proteinG} target={t.proteinG} accent />
        <Macro label="Carbs" unit="g" consumed={c.carbsG} target={t.carbsG} />
        <Macro label="Fat" unit="g" consumed={c.fatG} target={t.fatG} />
        <Macro label="Water" unit="ml" consumed={c.waterMl} target={t.waterMl} />
        <Macro label="Steps" unit="" consumed={stepsRow ? stepsRow.steps : 0} target={t.steps} />
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Tile
          label="Workout"
          value={workoutDone ? "Done ✓" : "Not yet"}
          accent={workoutDone}
          href="/workout"
        />
        <Tile
          label="Weight"
          value={weightRow ? `${Number(weightRow.weightKg)} kg` : "—"}
          accent={!!weightRow}
        />
        <Tile
          label="Sleep"
          value={sleepRow ? `${(sleepRow.minutes / 60).toFixed(1)} h` : "—"}
          accent={!!sleepRow}
        />
      </section>

      <QuickLogs
        todayWeightKg={weightRow ? Number(weightRow.weightKg) : null}
        todaySteps={stepsRow ? stepsRow.steps : null}
        todaySleepH={sleepRow ? sleepRow.minutes / 60 : null}
      />

      <Link
        href="/log"
        className="rounded-xl bg-emerald-600 px-5 py-3 text-center text-sm font-medium text-white"
      >
        + Log food
      </Link>

      <form action={signOut} className="mt-auto pt-6">
        <button className="text-sm text-neutral-500 underline underline-offset-4">Sign out</button>
      </form>
      <BottomNav active="/home" />
    </main>
  );
}

function Tile({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: string;
  accent?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={`rounded-2xl border p-3 text-center ${
        accent ? "border-emerald-500/40 bg-emerald-500/5" : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Macro({
  label,
  unit,
  consumed,
  target,
  accent,
}: {
  label: string;
  unit: string;
  consumed: number;
  target: number;
  accent?: boolean;
}) {
  const remaining = Math.max(0, target - consumed);
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent ? "border-emerald-500/40 bg-emerald-500/5" : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">
        {consumed.toLocaleString()}
        <span className="text-sm font-normal text-neutral-400"> / {target.toLocaleString()} {unit}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
        <div className="h-full rounded bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-neutral-500">{remaining.toLocaleString()} {unit} left</div>
    </div>
  );
}
