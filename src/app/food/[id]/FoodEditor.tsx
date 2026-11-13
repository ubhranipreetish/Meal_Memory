"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toggleFavoriteAction, updateFoodAction } from "./actions";

interface Food {
  id: string;
  name: string;
  unit: string;
  servingQty: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  isFavorite: boolean;
}

export function FoodEditor({ food }: { food: Food }) {
  const router = useRouter();
  const [v, setV] = useState({
    kcal: String(food.kcal),
    proteinG: String(food.proteinG),
    carbsG: String(food.carbsG),
    fatG: String(food.fatG),
    fiberG: String(food.fiberG ?? 0),
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    Number(v.kcal) !== food.kcal ||
    Number(v.proteinG) !== food.proteinG ||
    Number(v.carbsG) !== food.carbsG ||
    Number(v.fatG) !== food.fatG ||
    Number(v.fiberG) !== (food.fiberG ?? 0);

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

  return (
    <section className="card section">
      <div className="row between">
        <div>
          <h2>{food.name}</h2>
          <p className="small muted">
            per {food.servingQty > 1 ? `${food.servingQty} ` : ""}
            {food.unit}
          </p>
        </div>
        <button
          className="icon green"
          aria-label={`${food.isFavorite ? "Unfavourite" : "Favourite"} ${food.name}`}
          aria-pressed={food.isFavorite}
          onClick={() =>
            startTransition(async () => {
              await toggleFavoriteAction(food.id);
              router.refresh();
            })
          }
        >
          <Star size={20} fill={food.isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="grid2 mt-4">
        {([
          ["kcal", "Calories · kcal"],
          ["proteinG", "Protein · g"],
          ["carbsG", "Carbs · g"],
          ["fatG", "Fat · g"],
          ["fiberG", "Fibre · g"],
        ] as const).map(([k, label]) => (
          <label key={k} className="small muted">
            {label}
            <input className="field mt-1" type="number" min="0" step="any" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </label>
        ))}
      </div>

      {error && <p className="small danger mt-2">{error}</p>}
      <button className="primary mt-4" onClick={save} disabled={pending || !dirty} style={{ opacity: pending || !dirty ? 0.4 : 1 }}>
        {saved ? "Saved ✓" : pending ? "Saving…" : "Save changes"}
      </button>
    </section>
  );
}
