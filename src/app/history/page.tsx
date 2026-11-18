import { ChevronDown } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readMealWindow } from "@/lib/services/history";
import { normalizeAlias, normalizeAlooParatha } from "@/lib/services/quickParse";
import { dateKey, formatAppTime, recentWeek } from "@/lib/time";
import { AppShell } from "@/components/AppShell";
import { MEAL_TYPES, mealLabel } from "@/types/food";
import { WeekTrend } from "./WeekTrend";
import { RelogButton } from "./RelogButton";

export const dynamic = "force-dynamic";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if ((await searchParams).tab === "foods") redirect("/settings#saved-foods");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { keys, start, end } = recentWeek();
  const logs = await readMealWindow(user.id, start, end);
  const days = new Map(keys.map((key) => [key, { calories: 0, protein: 0, meals: [] as typeof logs }]));
  const mealCalories = new Map<string, number>();
  const foods = new Map<string, { name: string; meals: number; protein: number }>();

  for (const log of logs) {
    const day = days.get(dateKey(log.loggedAt));
    if (day) {
      day.calories += log.totalKcal;
      day.meals.push(log);
      day.protein += log.items.reduce((sum, item) => sum + item.proteinG, 0);
    }

    const category = MEAL_TYPES.find((meal) => meal === log.mealType) ?? "other";
    mealCalories.set(category, (mealCalories.get(category) ?? 0) + log.totalKcal);
    const seen = new Set<string>();
    for (const item of log.items) {
      const name = normalizeAlooParatha(item.name);
      const key = normalizeAlias(name);
      const food = foods.get(key) ?? { name, meals: 0, protein: 0 };
      if (!seen.has(key)) food.meals++;
      seen.add(key);
      food.protein += item.proteinG;
      foods.set(key, food);
    }
  }

  const ranked = [...foods.values()];
  const mostLogged = [...ranked].sort((a, b) => b.meals - a.meals || a.name.localeCompare(b.name)).slice(0, 3);
  const topProtein = ranked.filter((food) => food.protein > 0).sort((a, b) => b.protein - a.protein || a.name.localeCompare(b.name)).slice(0, 3);
  const total = [...days.values()].reduce((sum, day) => sum + day.calories, 0);

  const trend = [...days].reverse().map(([key, day], index) => ({
    label: index === 6 ? "Today" : index === 5 ? "Yest." : new Date(key + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
    calories: day.meals.length ? day.calories : null,
    protein: day.meals.length ? day.protein : null,
  }));

  return (
    <AppShell active="/history" eyebrow="LAST 7 DAYS" title="This Week" subtitle="Your meals and calories, including today.">
      <div className="grid2 section">
        <section className="card">
          <h2>Calories logged</h2>
          <p className="metric green">{format(total)} <span className="small muted">kcal</span></p>
        </section>
        <section className="card">
          <h2>Meals logged</h2>
          <p className="metric green">{format(logs.length)}</p>
        </section>
      </div>

      <WeekTrend title="Calorie trend" unit="kcal" days={trend.map(({ label, calories }) => ({ label, value: calories }))} />
      <WeekTrend title="Protein trend" unit="g" days={trend.map(({ label, protein }) => ({ label, value: protein }))} />

      <section className="card section">
        <h2>Calories by meal</h2>
        <p className="small muted">Share of calories logged this week</p>
        <ul className="mt-3">
          {[...MEAL_TYPES, "other"].filter((meal) => (meal !== "post_workout" && meal !== "other") || mealCalories.has(meal)).map((meal, index) => {
            const calories = mealCalories.get(meal) ?? 0;
            const share = total > 0 ? (calories / total) * 100 : 0;
            return (
              <li className={`week-meal week-meal-${index} mt-3`} key={meal}>
                <div className="row between small">
                  <strong>{mealLabel(meal)}</strong>
                  <span className="muted">{format(calories)} kcal · {Math.round(share)}%</span>
                </div>
                <div className="bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></div>
              </li>
            );
          })}
        </ul>
      </section>

      {ranked.length > 0 && (
        <section className="card section spaced" aria-label="Weekly insights">
          <div>
            <h2>Most logged</h2>
            {mostLogged.map((food, i) => <p className="row between small mt-2" key={i}><span>{food.name}</span><span className="muted shrink-0">{food.meals} {food.meals === 1 ? "meal" : "meals"}</span></p>)}
          </div>
          <div>
            <h2>Top protein sources</h2>
            {topProtein.length === 0 && <p className="small muted mt-2">No protein logged yet.</p>}
            {topProtein.map((food, i) => <p className="row between small mt-2" key={i}><span>{food.name}</span><span className="muted shrink-0">{format(food.protein)} g</span></p>)}
          </div>
        </section>
      )}

      <section className="section">
        <h2>Daily meals</h2>
        {[...days].map(([key, day], index) => (
          <details className="meal week-day" key={key}>
            <summary>
              <strong>{index === 0 ? "Today" : index === 1 ? "Yesterday" : new Date(key + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</strong>
              <span className="row small muted">
                {day.meals.length ? `${format(day.calories)} kcal` : "No meals logged"}
                <ChevronDown className="week-day-chevron shrink-0" size={16} aria-hidden="true" />
              </span>
            </summary>
            {day.meals.length === 0 && <p className="small muted">Nothing was logged for this day.</p>}
            {day.meals.map((meal) => (
              <article className="entry" key={meal.id}>
                <p className="eyebrow muted">
                  {mealLabel(meal.mealType)}
                  {dateKey(meal.createdAt) === dateKey(meal.loggedAt) && ` · ${formatAppTime(meal.loggedAt)}`}
                </p>
                {meal.items.length ? (
                  <ul className="mt-2">
                    {meal.items.map((item) => (
                      <li className="row between small" key={item.id}>
                        <span>{normalizeAlooParatha(item.name)} · {item.qty} {item.unit}</span>
                        <span className="muted shrink-0">{format(item.kcal)} kcal</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="small mt-2">{meal.rawInput}</p>}
                <div className="row between mt-2">
                  <strong className="small">{format(meal.totalKcal)} kcal</strong>
                  <RelogButton mealLogId={meal.id} />
                </div>
              </article>
            ))}
          </details>
        ))}
      </section>
    </AppShell>
  );
}

function format(value: number) {
  return Math.round(value).toLocaleString("en-IN");
}
