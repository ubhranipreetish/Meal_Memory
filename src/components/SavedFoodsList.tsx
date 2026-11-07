"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { listSavedFoods } from "@/lib/services/history";
import { MEAL_LABELS, MEAL_TYPES, type MealType } from "@/types/food";

export type SavedFood = Awaited<ReturnType<typeof listSavedFoods>>[number];
const filters = ["all", ...MEAL_TYPES, "other"] as const;

export function SavedFoodsList({ foods, onPick }: {
  foods: SavedFood[];
  onPick?: (food: SavedFood) => void;
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const visible = foods.filter(({ mealType }) =>
    filter === "all" || (filter === "other" ? !MEAL_TYPES.includes(mealType as MealType) : mealType === filter),
  );

  if (foods.length === 0) return <p className="small muted mt-3">Foods you save while logging will appear here.</p>;

  return (
    <div className="mt-3">
      <div className="chips" role="group" aria-label="Filter saved foods by meal">
        {filters.filter((value) => value !== "post_workout" || foods.some((food) => food.mealType === value)).map((value) => (
          <button type="button" className={`chip ${filter === value ? "selected" : ""}`} aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>
            {value === "all" ? "All" : value === "other" ? "Other" : MEAL_LABELS[value]}
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="small muted mt-3">No saved foods for this meal yet.</p>}
      <ul className="mt-2">
        {visible.map((food) => {
          const content = <>
            <span><strong>{food.isFavorite && "★ "}{food.name}</strong><span className="small muted block">{food.servingQty} {food.unit} · {food.kcal} kcal</span></span>
            <ChevronRight size={18} className="green shrink-0" aria-hidden="true" />
          </>;
          return (
            <li className="saved-food-row" key={food.id}>
              {onPick
                ? <button className="row between saved-food-option" type="button" onClick={() => onPick(food)}>{content}</button>
                : <Link className="row between saved-food-option" href={`/food/${food.id}`}>{content}</Link>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
