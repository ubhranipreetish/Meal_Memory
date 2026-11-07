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
  const proteinLeft = Math.max(t.proteinG - c.proteinG, 0);

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

      {/* Protein first, then the other macros */}
      <section className="card section home-macros" aria-label="Daily macros">
        <div>
          <div className="row between">
            <h2>Protein first</h2>
            <span className="green home-protein-grams">
              {c.proteinG}g <span className="muted small">/ {t.proteinG}g</span>
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${t.proteinG > 0 ? Math.min((c.proteinG / t.proteinG) * 100, 100) : 0}%` }} />
          </div>
          <p className="small muted mt-2">
            {proteinLeft > 0 ? `${proteinLeft}g to go. A little at each meal.` : "Protein target hit. Nice work."}
          </p>
        </div>
        <div className="grid2 mt-4">
          {([
            ["Carbs", c.carbsG, t.carbsG],
            ["Fat", c.fatG, t.fatG],
          ] as const).map(([name, value, target]) => (
            <div key={name}>
              <div className="row between small">
                <span>{name}</span>
                <span className="muted">
                  {value}/{target}g
                </span>
              </div>
              <div className="bar">
                <i
                  style={{
                    width: `${target > 0 ? Math.min((value / target) * 100, 100) : 0}%`,
                    opacity: 0.6,
                    background: value > target ? "var(--pg-amber)" : undefined,
                  }}
                />
              </div>
              <p className="small muted mt-1">
                {value > target ? `${value - target}g over` : `${target - value}g remaining`}
              </p>
            </div>
          ))}
        </div>
      </section>

    </AppShell>
  );
}
