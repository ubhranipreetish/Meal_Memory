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
import { BottomNav } from "@/components/BottomNav";

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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 pb-24 pt-8">
      <h1 className="text-2xl font-semibold">Diet plan</h1>

      <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <h2 className="text-sm font-semibold">Right now</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {remainingKcal} kcal · {remainingProtein}g protein left today.
        </p>
        {suggestions.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {suggestions.map((s, i) => (
              <li key={i} className="flex justify-between">
                <span>{s.food.name} ×{s.qty} {s.food.unit}</span>
                <span className="text-neutral-500">{s.kcal} kcal · {s.proteinG}g P</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-neutral-500">Tomorrow&apos;s plan</h2>
          <span className={`text-xs ${plan.withinKcal && plan.withinProtein ? "text-emerald-600" : "text-amber-500"}`}>
            {plan.totalKcal} kcal / {plan.totalProteinG}g P · {plan.familiarPct}% your foods
          </span>
        </div>
        {plan.meals.map((m) => (
          <div key={m.slot} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex justify-between text-xs text-neutral-500">
              <span className="font-medium uppercase">{m.slot}</span>
              <span>{m.kcal} kcal · {m.proteinG}g P</span>
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {m.items.map((i, idx) => (
                <li key={idx} className="text-sm">
                  <div className="flex justify-between">
                    <span>{i.food.name} ×{i.qty} {i.food.unit}</span>
                    <span className="text-neutral-500">{i.kcal} kcal</span>
                  </div>
                  {i.swaps.length > 0 && (
                    <p className="mt-0.5 text-xs text-neutral-400">
                      or: {i.swaps.map((s) => `${s.food.name} ×${s.qty}`).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-neutral-400">
          Built from your own food memory (starter foods fill gaps). Respects your diet type, allergies and avoid-list. Refresh the page to re-generate.
        </p>
      </section>
      <BottomNav active="/home" />
    </main>
  );
}
