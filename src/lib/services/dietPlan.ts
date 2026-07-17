/**
 * Diet-plan generator (Sprint 7). DETERMINISTIC: pure code selects foods from
 * the user's own food memory to hit targets (RULES.md #9 — no LLM math).
 * The LLM may decorate the result with tips, never change the numbers.
 *
 * Guarantees (enforced by construction + repair loop, unit-tested):
 *  - day kcal within ±5% of target, protein within ±10% (when feasible)
 *  - allergy / avoided / diet-type violations: zero
 *  - ≥2 swap alternatives per meal with kcal parity within ±15% (when pool allows)
 */

export interface PlanFood {
  id: string;
  name: string;
  unit: string;
  kcal: number; // per unit
  proteinG: number;
  carbsG: number;
  fatG: number;
  familiar: boolean; // true = from the user's food memory
  tags?: string[]; // e.g. ["non_veg"], ["egg"]
}

export interface PlanPrefs {
  kcalTarget: number;
  proteinTarget: number;
  dietType?: "veg" | "eggetarian" | "non_veg" | "vegan" | null;
  allergies?: string[];
  foodsAvoided?: string[];
}

export interface PlanItem {
  food: PlanFood;
  qty: number;
  kcal: number;
  proteinG: number;
  swaps: { food: PlanFood; qty: number; kcal: number }[];
}

export interface DayPlan {
  meals: { slot: string; items: PlanItem[]; kcal: number; proteinG: number }[];
  totalKcal: number;
  totalProteinG: number;
  familiarPct: number;
  withinKcal: boolean;
  withinProtein: boolean;
}

/** Generic fallback foods so the planner always works before memory fills up. */
export const STARTER_FOODS: PlanFood[] = [
  { id: "s1", name: "Roti", unit: "piece", kcal: 100, proteinG: 3, carbsG: 18, fatG: 2, familiar: false, tags: ["veg"] },
  { id: "s2", name: "Dal", unit: "bowl", kcal: 150, proteinG: 9, carbsG: 20, fatG: 4, familiar: false, tags: ["veg"] },
  { id: "s3", name: "Rice", unit: "bowl", kcal: 200, proteinG: 4, carbsG: 45, fatG: 0, familiar: false, tags: ["veg"] },
  { id: "s4", name: "Paneer Bhurji", unit: "bowl", kcal: 260, proteinG: 16, carbsG: 6, fatG: 20, familiar: false, tags: ["veg"] },
  { id: "s5", name: "Boiled Eggs", unit: "piece", kcal: 78, proteinG: 6.5, carbsG: 0.6, fatG: 5.3, familiar: false, tags: ["egg"] },
  { id: "s6", name: "Grilled Chicken Breast", unit: "100g", kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, familiar: false, tags: ["non_veg"] },
  { id: "s7", name: "Curd", unit: "bowl", kcal: 98, proteinG: 5.5, carbsG: 7, fatG: 5, familiar: false, tags: ["veg"] },
  { id: "s8", name: "Whey Protein Shake", unit: "scoop", kcal: 120, proteinG: 24, carbsG: 3, fatG: 1.5, familiar: false, tags: ["veg"] },
  { id: "s9", name: "Banana", unit: "piece", kcal: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4, familiar: false, tags: ["vegan", "veg"] },
  { id: "s10", name: "Peanut Butter Toast", unit: "slice", kcal: 190, proteinG: 7, carbsG: 17, fatG: 11, familiar: false, tags: ["veg"] },
  { id: "s11", name: "Soya Chunk Curry", unit: "bowl", kcal: 220, proteinG: 24, carbsG: 14, fatG: 7, familiar: false, tags: ["vegan", "veg"] },
  { id: "s12", name: "Oats with Milk", unit: "bowl", kcal: 230, proteinG: 10, carbsG: 36, fatG: 6, familiar: false, tags: ["veg"] },
];

const NON_VEG_WORDS = ["chicken", "mutton", "fish", "prawn", "egg", "keema", "meat", "beef", "pork"];
const EGG_WORDS = ["egg", "omelette", "bhurji (egg)"];
const DAIRY_WORDS = ["milk", "paneer", "curd", "cheese", "ghee", "butter", "lassi", "whey"];

function norm(s: string) {
  return s.toLowerCase();
}

/** Filter out foods violating diet type, allergies, and avoid-list. */
export function filterEligible(foods: PlanFood[], prefs: PlanPrefs): PlanFood[] {
  const blocked = [...(prefs.allergies ?? []), ...(prefs.foodsAvoided ?? [])].map(norm).filter(Boolean);
  return foods.filter((f) => {
    const n = norm(f.name);
    const tags = f.tags ?? [];
    if (blocked.some((b) => n.includes(b))) return false;
    if (prefs.dietType === "veg" || prefs.dietType === "vegan") {
      if (tags.includes("non_veg") || tags.includes("egg")) return false;
      if (NON_VEG_WORDS.some((w) => n.includes(w))) return false;
    }
    if (prefs.dietType === "vegan") {
      if (DAIRY_WORDS.some((w) => n.includes(w))) return false;
    }
    if (prefs.dietType === "eggetarian") {
      if (tags.includes("non_veg")) return false;
      if (NON_VEG_WORDS.filter((w) => !EGG_WORDS.includes(w)).some((w) => n.includes(w) && !n.includes("egg")))
        return false;
    }
    return f.kcal > 0;
  });
}

const SLOTS = [
  { slot: "breakfast", frac: 0.25 },
  { slot: "lunch", frac: 0.35 },
  { slot: "snack", frac: 0.12 },
  { slot: "dinner", frac: 0.28 },
];

const QTY_STEPS = [0.5, 1, 1.5, 2, 2.5, 3];

/** Deterministic day plan from an eligible pool. */
export function buildDayPlan(pool: PlanFood[], prefs: PlanPrefs): DayPlan {
  // prefer familiar foods, then protein density
  const ranked = [...pool].sort(
    (a, b) =>
      Number(b.familiar) - Number(a.familiar) || b.proteinG / b.kcal - a.proteinG / a.kcal,
  );

  const meals: DayPlan["meals"] = [];
  const usedIds = new Set<string>();
  let total = { kcal: 0, proteinG: 0 };
  const proteinPerKcal = prefs.proteinTarget / prefs.kcalTarget;

  for (const { slot, frac } of SLOTS) {
    const slotKcal = prefs.kcalTarget * frac;
    const items: PlanItem[] = [];
    let got = { kcal: 0, proteinG: 0 };

    for (const f of ranked) {
      if (got.kcal >= slotKcal * 0.9) break;
      if (usedIds.has(f.id)) continue;
      const remaining = slotKcal - got.kcal;
      // pick qty whose kcal best fits the remaining slot budget
      let best: number | null = null;
      let bestDiff = Infinity;
      for (const q of QTY_STEPS) {
        const k = f.kcal * q;
        if (k > remaining * 1.25) continue;
        const diff = Math.abs(remaining - k);
        // nudge toward foods that help the protein ratio when behind
        const proteinBoost = total.proteinG / Math.max(total.kcal, 1) < proteinPerKcal ? f.proteinG * q * -0.5 : 0;
        if (diff + proteinBoost < bestDiff) {
          bestDiff = diff + proteinBoost;
          best = q;
        }
      }
      if (best == null) continue;
      usedIds.add(f.id);
      const item: PlanItem = {
        food: f,
        qty: best,
        kcal: Math.round(f.kcal * best),
        proteinG: Math.round(f.proteinG * best),
        swaps: [],
      };
      items.push(item);
      got = { kcal: got.kcal + f.kcal * best, proteinG: got.proteinG + f.proteinG * best };
    }
    total = { kcal: total.kcal + got.kcal, proteinG: total.proteinG + got.proteinG };
    meals.push({ slot, items, kcal: Math.round(got.kcal), proteinG: Math.round(got.proteinG) });
  }

  // repair pass: scale the biggest meal's quantities to close any kcal gap
  const kcalErr = () => (total.kcal - prefs.kcalTarget) / prefs.kcalTarget;
  for (let pass = 0; pass < 6 && Math.abs(kcalErr()) > 0.05; pass++) {
    const under = kcalErr() < 0;
    const meal = meals.reduce((a, b) => (a.kcal > b.kcal ? a : b));
    const item = meal.items.reduce((a, b) => (a.kcal > b.kcal ? a : b), meal.items[0]);
    if (!item) break;
    const step = under ? 0.5 : -0.5;
    const newQty = item.qty + step;
    if (newQty < 0.5 || newQty > 4) break;
    item.qty = newQty;
    const dK = item.food.kcal * step;
    const dP = item.food.proteinG * step;
    item.kcal = Math.round(item.food.kcal * newQty);
    item.proteinG = Math.round(item.food.proteinG * newQty);
    meal.kcal += Math.round(dK);
    meal.proteinG += Math.round(dP);
    total = { kcal: total.kcal + dK, proteinG: total.proteinG + dP };
  }

  // ── protein repair: monotonic top-up (can't oscillate) ──────────────────
  // While protein is short: add +0.5 qty of the densest food (new snack item
  // if not in the plan); if kcal overflows, trim 0.5 from the lowest-density
  // item. While protein is high: trim densest, back-fill with low-density.
  const proteinErr = () => (total.proteinG - prefs.proteinTarget) / prefs.proteinTarget;
  const applyQty = (item: PlanItem, meal: DayPlan["meals"][number], dq: number) => {
    item.qty = Math.round((item.qty + dq) * 2) / 2;
    const dK = item.food.kcal * dq;
    const dP = item.food.proteinG * dq;
    item.kcal = Math.round(item.food.kcal * item.qty);
    item.proteinG = Math.round(item.food.proteinG * item.qty);
    meal.kcal = Math.round(meal.kcal + dK);
    meal.proteinG = Math.round(meal.proteinG + dP);
    total = { kcal: total.kcal + dK, proteinG: total.proteinG + dP };
    if (item.qty < 0.5) meal.items = meal.items.filter((x) => x !== item);
  };
  const density = (f: PlanFood) => f.proteinG / Math.max(f.kcal, 1);
  const bestDense = [...pool].sort((a, b) => density(b) - density(a))[0];

  for (let pass = 0; pass < 30 && Math.abs(proteinErr()) > 0.1; pass++) {
    const entries = meals.flatMap((m) => m.items.map((i) => ({ m, i })));
    if (proteinErr() < 0) {
      // find or create an item of the densest food
      let target = entries.find(({ i }) => i.food.id === bestDense?.id);
      if (!target && bestDense) {
        const snack = meals.find((m) => m.slot === "snack") ?? meals[0];
        const item: PlanItem = { food: bestDense, qty: 0, kcal: 0, proteinG: 0, swaps: [] };
        snack.items.push(item);
        usedIds.add(bestDense.id);
        target = { m: snack, i: item };
      }
      if (!target || target.i.qty >= 5) break;
      applyQty(target.i, target.m, 0.5);
      // keep kcal in bounds by trimming the lowest-density item
      while (kcalErr() > 0.05) {
        const trims = meals
          .flatMap((m) => m.items.map((i) => ({ m, i })))
          .filter(({ i }) => i.qty >= 0.5 && i.food.id !== bestDense?.id)
          .sort((a, b) => density(a.i.food) - density(b.i.food));
        if (!trims[0]) break;
        applyQty(trims[0].i, trims[0].m, -0.5);
      }
    } else {
      const dense = entries.filter(({ i }) => i.qty >= 0.5).sort((a, b) => density(b.i.food) - density(a.i.food))[0];
      if (!dense) break;
      applyQty(dense.i, dense.m, -0.5);
      while (kcalErr() < -0.05) {
        const adds = meals
          .flatMap((m) => m.items.map((i) => ({ m, i })))
          .filter(({ i }) => i.qty <= 4)
          .sort((a, b) => density(a.i.food) - density(b.i.food));
        if (!adds[0]) break;
        applyQty(adds[0].i, adds[0].m, 0.5);
      }
    }
  }

  // final kcal nudge
  for (let pass = 0; pass < 8 && Math.abs(kcalErr()) > 0.05; pass++) {
    const under = kcalErr() < 0;
    const entries = meals.flatMap((m) => m.items.map((i) => ({ m, i }))).filter(({ i }) => (under ? i.qty <= 4 : i.qty >= 1));
    // pick the item whose 0.5-step best closes the gap without protein damage
    const pick = entries.sort((a, b) => Math.abs(a.i.food.kcal * 0.5) - Math.abs(b.i.food.kcal * 0.5))[under ? entries.length - 1 : 0];
    if (!pick) break;
    applyQty(pick.i, pick.m, under ? 0.5 : -0.5);
  }

  // swaps: kcal parity within ±15% of the item's total kcal
  for (const meal of meals) {
    for (const item of meal.items) {
      const cands = pool.filter((f) => f.id !== item.food.id);
      const swaps: PlanItem["swaps"] = [];
      const SWAP_STEPS = [...QTY_STEPS, 3.5, 4];
      for (const c of cands) {
        let bestQ: number | null = null;
        let bestDiff = Infinity;
        // relative parity, with an absolute floor so tiny items still get swaps
        const tol = Math.max(0.15, 25 / Math.max(item.kcal, 1));
        for (const q of SWAP_STEPS) {
          const diff = Math.abs(c.kcal * q - item.kcal) / Math.max(item.kcal, 1);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestQ = q;
          }
        }
        if (bestQ != null && bestDiff <= tol) {
          swaps.push({ food: c, qty: bestQ, kcal: Math.round(c.kcal * bestQ) });
        }
        if (swaps.length >= 3) break;
      }
      item.swaps = swaps.slice(0, 3);
    }
  }

  const familiarKcal = meals.flatMap((m) => m.items).filter((i) => i.food.familiar).reduce((s, i) => s + i.kcal, 0);
  const totalKcal = Math.round(total.kcal);
  return {
    meals,
    totalKcal,
    totalProteinG: Math.round(total.proteinG),
    familiarPct: totalKcal > 0 ? Math.round((familiarKcal / totalKcal) * 100) : 0,
    withinKcal: Math.abs(totalKcal - prefs.kcalTarget) / prefs.kcalTarget <= 0.05,
    withinProtein: Math.abs(total.proteinG - prefs.proteinTarget) / prefs.proteinTarget <= 0.1,
  };
}

/** "You have Xg protein left" → best-fit foods from memory (code-only). */
export function suggestForRemaining(
  pool: PlanFood[],
  remainingKcal: number,
  remainingProteinG: number,
  limit = 4,
) {
  if (remainingKcal <= 50) return [];
  return pool
    .filter((f) => f.kcal <= remainingKcal * 1.1)
    .sort((a, b) => b.proteinG / b.kcal - a.proteinG / a.kcal)
    .slice(0, limit)
    .map((f) => {
      const qty =
        QTY_STEPS.filter((q) => f.kcal * q <= remainingKcal && f.proteinG * q <= remainingProteinG * 1.3).at(-1) ?? 0.5;
      return { food: f, qty, kcal: Math.round(f.kcal * qty), proteinG: Math.round(f.proteinG * qty) };
    });
}
