"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createPlanAction, deletePlanAction } from "./actions";

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
}

interface PlanRow {
  id: string;
  name: string;
  items: { name: string; dayLabel: string; targetSets: number; targetReps: number }[];
}

interface Draft {
  exerciseId: string;
  name: string;
  dayLabel: string;
  targetSets: number;
  targetReps: number;
}

export function PlanBuilder({ exercises, plans }: { exercises: Exercise[]; plans: PlanRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [planName, setPlanName] = useState("");
  const [day, setDay] = useState("Day 1");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return exercises.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 5);
  }, [query, exercises]);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await createPlanAction({
        name: planName,
        exercises: draft.map((d) => ({
          exerciseId: d.exerciseId,
          dayLabel: d.dayLabel,
          targetSets: d.targetSets,
          targetReps: d.targetReps,
        })),
      });
      if (!r.ok) setError(r.error ?? "Failed");
      else {
        setCreating(false);
        setPlanName("");
        setDraft([]);
        router.refresh();
      }
    });
  }

  const inputCls =
    "field";

  return (
    <div className="spaced">
      {!creating ? (
        <button className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-medium text-emerald-950" onClick={() => setCreating(true)}>
          + New plan
        </button>
      ) : (
        <div className="card">
          <input className={`${inputCls} w-full`} placeholder="Plan name (e.g. Push Pull Legs)" value={planName} onChange={(e) => setPlanName(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <input className={`${inputCls} w-28`} placeholder="Day label" value={day} onChange={(e) => setDay(e.target.value)} />
            <div className="relative flex-1">
              <input className={`${inputCls} w-full`} placeholder="Add exercise…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow dark:border-neutral-800 dark:bg-neutral-900">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-500/10"
                        onClick={() => {
                          setDraft((d) => [...d, { exerciseId: m.id, name: m.name, dayLabel: day, targetSets: 3, targetReps: 8 }]);
                          setQuery("");
                        }}
                      >
                        {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {draft.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {draft.map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="small muted">{d.dayLabel} · </span>
                    {d.name}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-neutral-500">
                    <input
                      type="number"
                      className={`${inputCls} w-12 px-1.5 py-1 text-center`}
                      value={d.targetSets}
                      onChange={(e) => setDraft((dd) => dd.map((x, j) => (j === i ? { ...x, targetSets: Number(e.target.value) || 1 } : x)))}
                    />
                    ×
                    <input
                      type="number"
                      className={`${inputCls} w-12 px-1.5 py-1 text-center`}
                      value={d.targetReps}
                      onChange={(e) => setDraft((dd) => dd.map((x, j) => (j === i ? { ...x, targetReps: Number(e.target.value) || 1 } : x)))}
                    />
                    <button className="ml-1 text-red-400" onClick={() => setDraft((dd) => dd.filter((_, j) => j !== i))}>✕</button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button className="px-4 py-2 text-sm text-neutral-500" onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
            <button
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-medium text-emerald-950 disabled:opacity-40"
              onClick={save}
              disabled={busy || planName.trim().length < 2 || draft.length === 0}
            >
              Save plan
            </button>
          </div>
        </div>
      )}

      {plans.map((p) => (
        <div key={p.id} className="card">
          <div className="row between">
            <h3 className="text-sm font-semibold">{p.name}</h3>
            <button
              className="text-xs text-red-400 underline underline-offset-2"
              onClick={() => startTransition(async () => { await deletePlanAction(p.id); router.refresh(); })}
            >
              delete
            </button>
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
            {p.items.map((it, i) => (
              <li key={i} className="row between">
                <span><span className="small muted">{it.dayLabel} · </span>{it.name}</span>
                <span className="text-neutral-500">{it.targetSets}×{it.targetReps}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
