import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listFoods, searchHistory } from "@/lib/services/history";
import { BottomNav } from "@/components/BottomNav";
import { MEAL_TYPES, mealLabel } from "@/types/food";
import { RelogButton } from "./RelogButton";

export const dynamic = "force-dynamic";

const MEAL_FILTERS = ["all", ...MEAL_TYPES] as const;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; meal?: string; tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const q = params.q ?? "";
  const meal = params.meal && params.meal !== "all" ? params.meal : undefined;
  const tab = params.tab === "foods" ? "foods" : "meals";

  const [logs, frequent, favorites] = await Promise.all([
    tab === "meals" ? searchHistory(user.id, { q, mealType: meal, limit: 50 }) : Promise.resolve([]),
    tab === "foods" ? listFoods(user.id, "frequent", 30) : Promise.resolve([]),
    tab === "foods" ? listFoods(user.id, "favorites", 30) : Promise.resolve([]),
  ]);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, meal: params.meal ?? "all", tab, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") p.set(k, v);
    const s = p.toString();
    return s ? `/history?${s}` : "/history";
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-5 pb-24 pt-8">
      <h1 className="text-2xl font-semibold">History</h1>

      <div className="flex gap-2">
        <Link href={qs({ tab: undefined })} className={tabCls(tab === "meals")}>Meals</Link>
        <Link href={qs({ tab: "foods" })} className={tabCls(tab === "foods")}>My foods</Link>
      </div>

      {tab === "meals" && (
        <>
          <form action="/history" className="flex gap-2">
            <input type="hidden" name="meal" value={params.meal ?? ""} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search meals or foods…"
              className="flex-1 rounded-xl border border-neutral-300 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700"
            />
            <button className="rounded-xl bg-emerald-400 px-4 text-sm font-medium text-emerald-950">Search</button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {MEAL_FILTERS.map((m) => (
              <Link
                key={m}
                href={qs({ meal: m })}
                className={`rounded-full px-3 py-1 text-xs ${
                  (params.meal ?? "all") === m
                    ? "bg-emerald-400 text-emerald-950"
                    : "border border-neutral-300 text-neutral-500 dark:border-neutral-700"
                }`}
              >
                {m === "all" ? "All" : mealLabel(m)}
              </Link>
            ))}
          </div>

          <section className="flex flex-col gap-3">
            {logs.length === 0 && <p className="text-sm text-neutral-400">No meals found.</p>}
            {logs.map((l) => (
              <div key={l.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>{mealLabel(l.mealType)} · {l.totalKcal} kcal</span>
                  <span>
                    {l.loggedAt.toLocaleDateString([], { day: "numeric", month: "short" })}{" "}
                    {l.loggedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {l.items.map((i) => (
                    <li key={i.id} className="flex justify-between text-sm">
                      {i.foodMemoryId ? (
                        <Link href={`/food/${i.foodMemoryId}`} className="underline-offset-4 hover:underline">
                          {i.name} <span className="text-neutral-400">×{i.qty}{i.unit ? ` ${i.unit}` : ""}</span>
                        </Link>
                      ) : (
                        <span>{i.name}</span>
                      )}
                      <span className="text-neutral-500">{i.kcal} kcal</span>
                    </li>
                  ))}
                </ul>
                <RelogButton mealLogId={l.id} />
              </div>
            ))}
          </section>
        </>
      )}

      {tab === "foods" && (
        <section className="flex flex-col gap-5">
          {favorites.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-neutral-500">★ Favorites</h2>
              <FoodList foods={favorites} />
            </div>
          )}
          <div>
            <h2 className="mb-2 text-sm font-medium text-neutral-500">Most eaten</h2>
            <FoodList foods={frequent} />
          </div>
        </section>
      )}

      <BottomNav active="/history" />
    </main>
  );
}

function tabCls(active: boolean) {
  return `rounded-lg px-4 py-1.5 text-sm font-medium ${
    active ? "bg-emerald-400 text-emerald-950" : "border border-neutral-300 text-neutral-500 dark:border-neutral-700"
  }`;
}

function FoodList({
  foods,
}: {
  foods: { id: string; name: string; unit: string; servingQty: number; kcal: number; proteinG: number; timesLogged: number; isFavorite: boolean }[];
}) {
  if (foods.length === 0) return <p className="text-sm text-neutral-400">Nothing here yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {foods.map((f) => (
        <li key={f.id}>
          <Link
            href={`/food/${f.id}`}
            className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800"
          >
            <span>
              {f.isFavorite && <span className="mr-1 text-amber-500">★</span>}
              {f.name}
              <span className="ml-1 text-xs text-neutral-400">×{f.timesLogged}</span>
            </span>
            <span className="text-neutral-500">{f.kcal} kcal / {f.servingQty > 1 ? `${f.servingQty} ` : ""}{f.unit}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
