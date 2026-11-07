import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { getTodayTotals } from "@/lib/services/foodMemory";
import {
  buildDayPlan,
  filterEligible,
  STARTER_FOODS,
  suggestForRemaining,
  type PlanFood,
} from "@/lib/services/dietPlan";
import type { Targets } from "@/lib/services/targets";
import { AppShell } from "@/components/AppShell";
import { mealLabel } from "@/types/food";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).limit(1);
  if (!profile?.targets) redirect("/onboarding");
  const t = profile.targets as Targets;

  const memory = await db.select().from(schema.foodMemory).where(eq(schema.foodMemory.userId, user.id));
  const memFoods: PlanFood[] = memory
    .filter((m) => Number(m.kcal) > 0)
    .map((m) => ({
      id: m.id,
      name: m.canonicalName,
      unit: m.servingUnit,
      kcal: Number(m.kcal),
      proteinG: Number(m.proteinG ?? 0),
      carbsG: Number(m.carbsG ?? 0),
      fatG: Number(m.fatG ?? 0),
      familiar: true,
    }));

  const prefs = {
    kcalTarget: t.kcal,
    proteinTarget: t.proteinG,
    dietType: (profile.dietType as "veg" | "eggetarian" | "non_veg" | "vegan" | null) ?? null,
    allergies: profile.allergies ?? [],
    foodsAvoided: profile.foodsAvoided ?? [],
  };
  const pool = filterEligible([...memFoods, ...STARTER_FOODS], prefs);
  const plan = buildDayPlan(pool, prefs);

  const today = await getTodayTotals(user.id);
  const remainingKcal = Math.max(0, t.kcal - today.kcal);
  const remainingProtein = Math.max(0, t.proteinG - today.proteinG);
  const suggestions = suggestForRemaining(pool, remainingKcal, remainingProtein);

  return (
    <AppShell active="/home" eyebrow="MEAL PLAN" title="A plan for your plate." subtitle="Built from foods you already eat.">
      <section className="card section">
        <p className="eyebrow green">RIGHT NOW</p>
        <h2 className="mt-2">
          {remainingKcal} kcal &middot; {remainingProtein}g protein left
        </h2>
        {suggestions.length > 0 ? (
          <>
            <p className="small muted mt-2">These would fit what&rsquo;s left of today:</p>
            {suggestions.map((s, i) => (
              <div className="row between small mt-2" key={i}>
                <span>
                  {s.food.name} &times;{s.qty} {s.food.unit}
                </span>
                <span className="muted">
                  {s.kcal} kcal &middot; {s.proteinG}g P
                </span>
              </div>
            ))}
          </>
        ) : (
          <p className="small muted mt-2">Nothing to suggest right now — you&rsquo;re on target.</p>
        )}
      </section>

      <section className="section">
        <div className="row between">
          <h2>Tomorrow&rsquo;s plan</h2>
          <span className="small" style={{ color: plan.withinKcal && plan.withinProtein ? "var(--pg-primary)" : "var(--pg-amber)" }}>
            {plan.totalKcal} kcal / {plan.totalProteinG}g P
          </span>
        </div>
        <p className="small muted mt-1">{plan.familiarPct}% from foods you already eat.</p>

        {plan.meals.map((m) => (
          <div className="meal" key={m.slot}>
            <p className="eyebrow green">{mealLabel(m.slot)}</p>
            <div className="row between mt-2">
              <h2>{m.items.map((i) => i.food.name).join(", ")}</h2>
            </div>
            <p className="small muted mt-1">
              {m.kcal} kcal &middot; {m.proteinG}g protein
            </p>
            {m.items.map((i, idx) => (
              <div key={idx} className="mt-2">
                <div className="row between small">
                  <span>
                    {i.food.name} &times;{i.qty} {i.food.unit}
                  </span>
                  <span className="muted">{i.kcal} kcal</span>
                </div>
                {i.swaps.length > 0 && (
                  <details className="small muted">
                    <summary style={{ minHeight: 44, paddingTop: 12 }}>See swap alternatives</summary>
                    <div className="chips">
                      {i.swaps.map((sw, j) => (
                        <span className="chip" key={j}>
                          {sw.food.name} &times;{sw.qty}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        ))}
        <p className="small muted mt-3">
          Respects your diet type, allergies and avoid-list. Refresh to re-generate.
        </p>
      </section>
    </AppShell>
  );
}
