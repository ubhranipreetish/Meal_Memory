import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { getTodayTotals } from "@/lib/services/foodMemory";
import { workoutDoneToday } from "@/lib/services/workouts";
import { getTodayBrief } from "@/lib/ai/coach";
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
  const [c, workoutDone, brief, [weightRow], [stepsRow], [sleepRow]] = await Promise.all([
    getTodayTotals(user.id),
    workoutDoneToday(user.id),
    getTodayBrief(user.id),
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

      {brief && (
        <Link href="/coach" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">✦ Coach brief</div>
          <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed">{brief}</p>
        </Link>
      )}

      {/* Hero: the two numbers that matter (UX_AUDIT /home) */}
      <section className="rounded-3xl border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex items-center gap-5">
          <Ring consumed={c.kcal} target={t.kcal} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Protein</div>
            <div className="mt-0.5 font-display text-2xl font-semibold leading-none">
              {c.proteinG}
              <span className="text-sm font-normal text-neutral-400"> / {t.proteinG} g</span>
            </div>
            <Bar consumed={c.proteinG} target={t.proteinG} />
            <p className="mt-1.5 text-xs text-neutral-500">
              {c.proteinG >= t.proteinG ? "Protein target hit 💪" : `${t.proteinG - c.proteinG} g to go`}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-900">
          <Chip label="Carbs" value={`${c.carbsG}`} sub={`/${t.carbsG}g`} over={c.carbsG > t.carbsG} />
          <Chip label="Fat" value={`${c.fatG}`} sub={`/${t.fatG}g`} over={c.fatG > t.fatG} />
          <Chip label="Water" value={`${(c.waterMl / 1000).toFixed(1)}`} sub={`/${(t.waterMl / 1000).toFixed(1)}L`} />
          <Chip label="Steps" value={`${((stepsRow ? stepsRow.steps : 0) / 1000).toFixed(1)}k`} sub={`/${(t.steps / 1000).toFixed(0)}k`} />
        </div>
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
        className="rounded-xl bg-emerald-400 px-5 py-3 text-center text-sm font-medium text-emerald-950"
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

/** Hero calorie ring — one focal number instead of a grid of equal cards. */
function Ring({ consumed, target }: { consumed: number; target: number }) {
  const over = consumed > target;
  const pct = target > 0 ? Math.min(1, consumed / target) : 0;
  const r = 52;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative h-[124px] w-[124px] shrink-0">
      <svg viewBox="0 0 124 124" className="h-full w-full -rotate-90">
        <circle cx="62" cy="62" r={r} fill="none" strokeWidth="10" className="stroke-neutral-200 dark:stroke-neutral-800" />
        <circle
          cx="62" cy="62" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
          className={over ? "stroke-amber-500" : "stroke-emerald-500"}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[26px] font-bold leading-none">{consumed.toLocaleString()}</span>
        <span className={`mt-0.5 text-[10px] ${over ? "text-amber-500" : "text-neutral-500"}`}>
          {over ? `${(consumed - target).toLocaleString()} over` : `of ${target.toLocaleString()} kcal`}
        </span>
      </div>
    </div>
  );
}

function Bar({ consumed, target }: { consumed: number; target: number }) {
  const over = consumed > target;
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
      <div className={`h-full rounded ${over ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Chip({ label, value, sub, over }: { label: string; value: string; sub: string; over?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-sm font-semibold ${over ? "text-amber-500" : ""}`}>
        {value}
        <span className="text-[10px] font-normal text-neutral-400">{sub}</span>
      </div>
    </div>
  );
}
