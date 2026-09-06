"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logSleepAction, logStepsAction, logWaterAction, logWeightAction } from "./quickActions";

/** ≤2-tap quick logging for weight / water / steps / sleep (Sprint 3). */
export function QuickLogs({
  todayWeightKg,
  todaySteps,
  todaySleepH,
}: {
  todayWeightKg: number | null;
  todaySteps: number | null;
  todaySleepH: number | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  const done = (msg: string) => {
    setFlash(msg);
    router.refresh();
    setTimeout(() => setFlash(null), 2000);
  };

  return (
    <section className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-500">Quick log</h2>
        {flash && <span className="text-xs text-emerald-600">{flash} ✓</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <NumberQuick
          label="Weight"
          unit="kg"
          placeholder={todayWeightKg ? String(todayWeightKg) : "75.0"}
          busy={busy}
          onSubmit={(v) => startTransition(async () => { if ((await logWeightAction(v)).ok) done("Weight"); })}
        />
        <div className="flex flex-col gap-1 text-xs text-neutral-500">
          Water
          <div className="flex gap-1.5">
            {[250, 500, 750].map((ml) => (
              <button
                key={ml}
                className="flex-1 rounded-lg border border-neutral-300 py-2 text-xs hover:border-emerald-500 disabled:opacity-50 dark:border-neutral-700"
                disabled={busy}
                onClick={() => startTransition(async () => { if ((await logWaterAction(ml)).ok) done(`+${ml}ml`); })}
              >
                +{ml}
              </button>
            ))}
          </div>
        </div>
        <NumberQuick
          label="Steps"
          unit=""
          placeholder={todaySteps ? String(todaySteps) : "8000"}
          busy={busy}
          integer
          onSubmit={(v) => startTransition(async () => { if ((await logStepsAction(v)).ok) done("Steps"); })}
        />
        <NumberQuick
          label="Sleep"
          unit="h"
          placeholder={todaySleepH ? String(todaySleepH) : "7.5"}
          busy={busy}
          onSubmit={(v) => startTransition(async () => { if ((await logSleepAction(v)).ok) done("Sleep"); })}
        />
      </div>
    </section>
  );
}

function NumberQuick({
  label,
  unit,
  placeholder,
  busy,
  integer,
  onSubmit,
}: {
  label: string;
  unit: string;
  placeholder: string;
  busy: boolean;
  integer?: boolean;
  onSubmit: (v: number) => void;
}) {
  const [v, setV] = useState("");
  const parsed = integer ? parseInt(v, 10) : parseFloat(v);
  const valid = isFinite(parsed) && parsed > 0;
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-500">
      {label} {unit && <span className="sr-only">({unit})</span>}
      <div className="flex gap-1.5">
        <input
          type="number"
          step="any"
          inputMode="decimal"
          className="w-full min-w-0 rounded-lg border border-neutral-300 bg-transparent px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700"
          placeholder={placeholder}
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
        <button
          className="rounded-lg bg-emerald-400 px-3 text-sm font-medium text-emerald-950 disabled:opacity-40"
          disabled={busy || !valid}
          onClick={() => { onSubmit(parsed); setV(""); }}
        >
          ✓
        </button>
      </div>
    </label>
  );
}
