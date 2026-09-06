"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { analyzeReportAction, saveMeasurementAction } from "./actions";

interface WeightPoint { date: string; kg: number; trend: number }
interface Measurement { date: string; chestCm: string | null; waistCm: string | null; hipsCm: string | null; armCm: string | null; thighCm: string | null }
interface ReportCard { id: string; type: string; date: string; summary: string; metrics: Record<string, number>; deltas: { key: string; delta: number }[] }

export function ProgressClient({ weights, measurements, reports }: { weights: WeightPoint[]; measurements: Measurement[]; reports: ReportCard[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [m, setM] = useState({ chestCm: "", waistCm: "", hipsCm: "", armCm: "", thighCm: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const chartData = weights.map((w) => ({
    label: new Date(w.date).toLocaleDateString([], { day: "numeric", month: "short" }),
    kg: w.kg,
    trend: Math.round(w.trend * 10) / 10,
  }));

  function saveMeasurements() {
    startTransition(async () => {
      const payload = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== ""));
      const r = await saveMeasurementAction(payload);
      setMsg(r.ok ? "Measurements saved ✓" : r.error ?? "Failed");
      if (r.ok) { setM({ chestCm: "", waistCm: "", hipsCm: "", armCm: "", thighCm: "" }); router.refresh(); }
    });
  }

  function onReportPicked(f: File) {
    setMsg("Reading report…");
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1];
      startTransition(async () => {
        const r = await analyzeReportAction(base64, f.type || "image/jpeg");
        setMsg(r.ok ? "Report analyzed ✓" : r.error);
        if (r.ok) router.refresh();
      });
    };
    reader.readAsDataURL(f);
  }

  const cls = "w-full rounded-lg border border-neutral-300 bg-transparent px-2.5 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700";

  return (
    <div className="flex flex-col gap-5">
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      <section className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-500">Weight (with 7-day trend)</h2>
        {chartData.length < 2 ? (
          <p className="mt-2 text-sm text-neutral-400">Log your weight from the Home screen to see the chart.</p>
        ) : (
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.5} />
                <YAxis tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.5} domain={["dataMin - 1", "dataMax + 1"]} />
                <Tooltip labelStyle={{ color: "#111" }} />
                <Line type="monotone" dataKey="kg" stroke="#94a3b8" strokeWidth={1} dot={false} name="daily" />
                <Line type="monotone" dataKey="trend" stroke="#9cc716" strokeWidth={2.5} dot={false} name="7d trend" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-500">Measurements (cm)</h2>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {(["chestCm", "waistCm", "hipsCm", "armCm", "thighCm"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
              {k.replace("Cm", "")}
              <input type="number" step="any" className={cls} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <button className="mt-3 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-medium text-emerald-950 disabled:opacity-50" onClick={saveMeasurements} disabled={busy}>
          Save today&apos;s measurements
        </button>
        {measurements.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-xs text-neutral-500">
            {measurements.slice(0, 5).map((mm, i) => (
              <li key={i}>
                {mm.date}: {[["chest", mm.chestCm], ["waist", mm.waistCm], ["hips", mm.hipsCm], ["arm", mm.armCm], ["thigh", mm.thighCm]]
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-500">Body reports (InBody / DEXA / blood)</h2>
          <button className="text-xs text-emerald-600 underline underline-offset-2" onClick={() => fileRef.current?.click()} disabled={busy}>
            + upload
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onReportPicked(f); e.target.value = ""; }} />
        </div>
        {reports.length === 0 && <p className="mt-2 text-sm text-neutral-400">Upload a report photo or PDF — I&apos;ll extract the numbers and explain them.</p>}
        <div className="mt-2 flex flex-col gap-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex justify-between text-xs text-neutral-500">
                <span className="uppercase">{r.type}</span><span>{r.date}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed">{r.summary}</p>
              {Object.keys(r.metrics).length > 0 && (
                <p className="mt-2 text-xs text-neutral-500">
                  {Object.entries(r.metrics).slice(0, 6).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
                </p>
              )}
              {r.deltas.length > 0 && (
                <p className="mt-1 text-xs text-emerald-600">
                  vs previous: {r.deltas.map((d) => `${d.key.replace(/_/g, " ")} ${d.delta > 0 ? "+" : ""}${d.delta}`).join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
