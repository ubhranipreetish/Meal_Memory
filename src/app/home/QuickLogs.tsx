"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logSleepAction, logStepsAction, logWeightAction } from "./quickActions";

/** ≤2-tap check-in for weight / steps / sleep (water has its own card). */
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
    <details className="section">
      <summary className="green" style={{ minHeight: 44 }}>
        Quick log weight, steps or sleep {flash && <span className="small muted">· {flash} saved ✓</span>}
      </summary>
      <div className="spaced mt-3">
        <NumberQuick
          label="Weight · kg"
          placeholder={todayWeightKg ? String(todayWeightKg) : "75.0"}
          busy={busy}
          onSubmit={(v) => startTransition(async () => { if ((await logWeightAction(v)).ok) done("Weight"); })}
        />
        <NumberQuick
          label="Steps"
          placeholder={todaySteps ? String(todaySteps) : "8000"}
          busy={busy}
          integer
          onSubmit={(v) => startTransition(async () => { if ((await logStepsAction(v)).ok) done("Steps"); })}
        />
        <NumberQuick
          label="Sleep · hours"
          placeholder={todaySleepH ? String(todaySleepH) : "7.5"}
          busy={busy}
          onSubmit={(v) => startTransition(async () => { if ((await logSleepAction(v)).ok) done("Sleep"); })}
        />
      </div>
    </details>
  );
}

function NumberQuick({
  label,
  placeholder,
  busy,
  integer,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  busy: boolean;
  integer?: boolean;
  onSubmit: (v: number) => void;
}) {
  const [v, setV] = useState("");
  const parsed = integer ? parseInt(v, 10) : parseFloat(v);
  const valid = isFinite(parsed) && parsed > 0;
  return (
    <label className="small muted">
      {label}
      <div className="row mt-1">
        <input
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          className="field"
          placeholder={placeholder}
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
        <button
          className="primary"
          disabled={busy || !valid}
          style={{ opacity: busy || !valid ? 0.4 : 1 }}
          onClick={() => { onSubmit(parsed); setV(""); }}
        >
          Save
        </button>
      </div>
    </label>
  );
}
