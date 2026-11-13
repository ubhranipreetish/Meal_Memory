import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { getTodayMealTotals } from "@/lib/services/foodMemory";
import type { Targets } from "@/lib/services/targets";
import { GOAL_LABELS } from "@/types/profile";
import { AppShell, todayLabel } from "@/components/AppShell";

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

  const t = profile.targets as Targets;
  const c = await getTodayMealTotals(user.id);
  const goalLabel = profile.goal ? GOAL_LABELS[profile.goal as keyof typeof GOAL_LABELS] : "";

  const over = c.kcal > t.kcal;
  const kcalPct = t.kcal > 0 ? Math.min(100, (c.kcal / t.kcal) * 100) : 0;
  const fiberTarget = t.fiberG ?? Math.max(25, Math.round((t.kcal / 1000) * 14));
  const fiberConsumed = c.fiberG ?? 0;

  return (
    <AppShell
      active="/home"
      className="home-dashboard"
      eyebrow={todayLabel()}
      aside={goalLabel ? `Goal: ${goalLabel}` : undefined}
      title={`Hi ${profile.name ?? "there"}.`}
    >
      {/* Hero: today's energy */}
      <section className="card section home-energy text-center">
        <p className="eyebrow muted">CALORIES TODAY</p>
        <div className="energy-gauge">
          <svg viewBox="0 0 260 180" className="size-full" aria-label={`${c.kcal} of ${t.kcal} calories`}>
            <path d="M 35 145 A 100 100 0 1 1 225 145" pathLength="100" fill="none" stroke="var(--pg-muted)" strokeWidth="12" strokeLinecap="round" />
            {/* a round cap on a zero-length dash renders as a stray dot */}
            {kcalPct > 0 && (
              <path
                d="M 35 145 A 100 100 0 1 1 225 145"
                pathLength="100"
                fill="none"
                stroke={over ? "var(--pg-amber)" : "var(--pg-primary)"}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${kcalPct} 100`}
              />
            )}
          </svg>
          <div className="energy-value">
            <p style={{ fontSize: 46, lineHeight: 1.1, letterSpacing: -2 }}>{c.kcal.toLocaleString()}</p>
            <p className="small muted">of {t.kcal.toLocaleString()} kcal</p>
          </div>
        </div>
        <span style={{ color: over ? "var(--pg-amber)" : "var(--pg-primary)" }}>
          {Math.abs(t.kcal - c.kcal).toLocaleString()} {over ? "over" : "left for today"}
        </span>
      </section>

      <Link className="primary mt-4" href="/log">
        Log a meal <Plus size={18} aria-hidden="true" />
      </Link>

      {/* Uniform 2x2 grid for all 4 macros */}
      <section className="card section home-macros" aria-label="Daily macros">
        <div className="grid2" style={{ rowGap: 20 }}>
          {([
            { name: "Protein", current: c.proteinG, target: t.proteinG },
            { name: "Fibre", current: fiberConsumed, target: fiberTarget },
            { name: "Carbs", current: c.carbsG, target: t.carbsG },
            { name: "Fat", current: c.fatG, target: t.fatG },
          ] as const).map(({ name, current, target }) => {
            const left = Math.max(target - current, 0);
            const over = current > target;
            const overAmt = current - target;
            const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
            return (
              <div key={name}>
                <div className="row between">
                  <h2>{name}</h2>
                  <span className="green home-protein-grams">
                    {current}g <span className="muted small">/ {target}g</span>
                  </span>
                </div>
                <div className="bar">
                  <i
                    style={{
                      width: `${pct}%`,
                      background: over ? "var(--pg-amber)" : undefined,
                    }}
                  />
                </div>
                <p className="small muted mt-2">
                  {over ? `${overAmt}g over.` : left > 0 ? `${left}g to go.` : `${name} target hit.`}
                </p>
              </div>
            );
          })}
        </div>
      </section>

    </AppShell>
  );
}
