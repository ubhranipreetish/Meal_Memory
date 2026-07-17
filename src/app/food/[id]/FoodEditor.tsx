"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFavoriteAction, updateFoodAction } from "./actions";

interface Food {
  id: string;
  name: string;
  unit: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isFavorite: boolean;
}

export function FoodEditor({ food }: { food: Food }) {
  const router = useRouter();
  const [v, setV] = useState({
    kcal: String(food.kcal),
    proteinG: String(food.proteinG),
    carbsG: String(food.carbsG),
    fatG: String(food.fatG),
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    Number(v.kcal) !== food.kcal ||
    Number(v.proteinG) !== food.proteinG ||
    Number(v.carbsG) !== food.carbsG ||
    Number(v.fatG) !== food.fatG;

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateFoodAction({ foodId: food.id, ...v });
      if (!r.ok) setError(r.error ?? "Failed");
      else {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  const cls =
    "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700";

  return (
    <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{food.name}</h1>
          <p className="text-sm text-neutral-500">per 1 {food.unit}</p>
        </div>
        <button
          className={`text-2xl ${food.isFavorite ? "text-amber-500" : "text-neutral-300 dark:text-neutral-700"}`}
          onClick={() => startTransition(async () => { await toggleFavoriteAction(food.id); router.refresh(); })}
          aria-label="Toggle favorite"
        >
          ★
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {(
          [
            ["kcal", "Calories (kcal)"],
            ["proteinG", "Protein (g)"],
            ["carbsG", "Carbs (g)"],
            ["fatG", "Fat (g)"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1 text-xs text-neutral-500">
            {label}
            <input
              type="number"
              step="any"
              className={cls}
              value={v[k]}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      <button
        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        onClick={save}
        disabled={pending || !dirty}
      >
        {saved ? "Saved ✓" : pending ? "Saving…" : "Save changes"}
      </button>
    </section>
  );
}
