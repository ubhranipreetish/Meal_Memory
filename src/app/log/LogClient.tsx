"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ResolvedLog } from "@/types/food";
import { quickLogAction } from "@/app/history/actions";
import { confirmAction, parseAction, photoAction } from "./actions";

interface FeedItem {
  id: string;
  loggedAt: string;
  mealType: string | null;
  rawInput: string;
  items: { id: string; name: string; qty: number; unit: string | null; kcal: number; proteinG: number }[];
}

interface RecentFood {
  id: string;
  name: string;
  kcal: number;
  unit: string;
}

export function LogClient({ feed, recentFoods = [] }: { feed: FeedItem[]; recentFoods?: RecentFood[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pendingLog, setPendingLog] = useState<ResolvedLog | null>(null);
  const [pendingPhotoPath, setPendingPhotoPath] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  /** Voice input (Sprint 4): Web Speech API fills the text box. */
  function startVoice() {
    type SR = { new (): {
      lang: string; interimResults: boolean;
      onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
      onend: () => void; onerror: () => void; start: () => void;
    } };
    const w = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Voice input isn't supported in this browser — try Chrome.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => setText(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  /** Photo input (Sprint 4): downscale client-side, then vision-analyze. */
  function onPhotoPicked(file: File) {
    setError(null);
    setStatus("Reading photo…");
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.split(",")[1];
      setStatus("Recognizing your meal… 📷");
      startTransition(async () => {
        const res = await photoAction(base64, "image/jpeg");
        if (!res.ok) {
          setError(`${res.error} — you can add it manually below.`);
          setShowManual(true);
          setStatus(null);
          return;
        }
        if (res.resolved.items.length === 0) {
          setStatus(null);
          setError("Couldn't spot any food in that photo — try another angle or add manually.");
          return;
        }
        setPendingPhotoPath(res.photoPath);
        setPendingLog(res.resolved);
        setStatus(null);
      });
    };
    img.src = url;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const utterance = text.trim();
    if (!utterance) return;
    setError(null);
    setStatus("Understanding…");
    startTransition(async () => {
      const res = await parseAction(utterance);
      if (!res.ok) {
        setError(`${res.error} — you can add it manually below.`);
        setShowManual(true);
        setStatus(null);
        return;
      }
      const r = res.resolved;
      if (r.items.length === 0 && !r.waterMl) {
        setStatus(null);
        setError("Couldn't find any food in that — try rephrasing, or add manually.");
        return;
      }
      if (r.needsConfirmation) {
        setPendingLog(r);
        setStatus(null);
      } else {
        // All known (or water-only) → log silently.
        const c = await confirmAction(toConfirmPayload(r));
        if (!c.ok) {
          setError(c.error);
        } else {
          setText("");
          setStatus(r.zeroAi ? "Logged instantly ⚡ (from your food memory)" : "Logged ✓");
          router.refresh();
        }
      }
    });
  }

  function confirmPending(edited: ResolvedLog) {
    setError(null);
    startTransition(async () => {
      const c = await confirmAction({
        ...toConfirmPayload(edited),
        photoPath: pendingPhotoPath,
        inputMode: pendingPhotoPath ? ("photo" as const) : ("text" as const),
      });
      if (!c.ok) {
        setError(c.error);
        return;
      }
      setPendingLog(null);
      setPendingPhotoPath(undefined);
      setText("");
      setStatus("Saved to your food memory ✓ — next time it logs instantly");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-neutral-300 bg-transparent px-4 py-3 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700"
          placeholder='e.g. "2 aloo parathas and a glass of milk"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy || !!pendingLog}
        />
        <button
          type="button"
          aria-label="Log by voice"
          className={`rounded-xl border px-3 text-lg ${listening ? "border-red-500 text-red-500" : "border-neutral-300 text-neutral-500 dark:border-neutral-700"}`}
          onClick={startVoice}
          disabled={busy || !!pendingLog}
        >
          {listening ? "●" : "🎤"}
        </button>
        <button
          type="button"
          aria-label="Log from photo"
          className="rounded-xl border border-neutral-300 px-3 text-lg text-neutral-500 dark:border-neutral-700"
          onClick={() => fileRef.current?.click()}
          disabled={busy || !!pendingLog}
        >
          📷
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPhotoPicked(f);
            e.target.value = "";
          }}
        />
        <button
          className="rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy || !text.trim() || !!pendingLog}
        >
          {busy ? "…" : "Log"}
        </button>
      </form>

      {status && !error && <p className="text-sm text-emerald-600">{status}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {recentFoods.length > 0 && !pendingLog && (
        <div className="flex flex-wrap gap-1.5">
          {recentFoods.map((f) => (
            <button
              key={f.id}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const r = await quickLogAction(f.id);
                  if (r.ok) {
                    setStatus(`${f.name} logged ⚡`);
                    setError(null);
                    router.refresh();
                  }
                })
              }
              title={`Log 1 ${f.unit} (${f.kcal} kcal)`}
            >
              + {f.name}
            </button>
          ))}
        </div>
      )}

      {pendingLog && (
        <ConfirmCard
          resolved={pendingLog}
          busy={busy}
          onConfirm={confirmPending}
          onCancel={() => setPendingLog(null)}
        />
      )}

      <button
        className="self-start text-xs text-neutral-500 underline underline-offset-4"
        onClick={() => setShowManual((s) => !s)}
      >
        {showManual ? "Hide manual entry" : "Add manually instead"}
      </button>
      {showManual && <ManualEntry busy={busy} onDone={() => { setShowManual(false); setStatus("Logged ✓"); router.refresh(); }} />}

      <section className="mt-2 flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Today</h2>
        {feed.length === 0 && <p className="text-sm text-neutral-400">Nothing logged yet today.</p>}
        {feed.map((f) => (
          <div key={f.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span className="capitalize">{f.mealType ?? "meal"}</span>
              <span>{new Date(f.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p className="mt-1 text-xs italic text-neutral-400">&quot;{f.rawInput}&quot;</p>
            <ul className="mt-2 flex flex-col gap-1">
              {f.items.map((i) => (
                <li key={i.id} className="flex justify-between text-sm">
                  <span>
                    {i.name} <span className="text-neutral-400">×{i.qty}{i.unit ? ` ${i.unit}` : ""}</span>
                  </span>
                  <span className="text-neutral-500">{i.kcal} kcal · {i.proteinG}g P</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function toConfirmPayload(r: ResolvedLog) {
  return {
    raw: r.raw,
    mealType: r.mealType,
    waterMl: r.waterMl,
    items: r.items.map((i) => ({
      name: i.name,
      typedName: i.typedName,
      qty: i.qty,
      unit: i.unit,
      status: i.status,
      foodMemoryId: i.foodMemoryId,
      perUnit: i.perUnit,
      confidence: i.confidence,
      assumptions: i.assumptions,
    })),
    inputMode: "text" as const,
  };
}

/** Editable confirmation card for new foods (RULES.md #14). */
function ConfirmCard({
  resolved,
  busy,
  onConfirm,
  onCancel,
}: {
  resolved: ResolvedLog;
  busy: boolean;
  onConfirm: (edited: ResolvedLog) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState(resolved.items);

  const setPerUnit = (idx: number, key: "kcal" | "proteinG" | "carbsG" | "fatG", v: string) => {
    const n = Number(v);
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, perUnit: { ...it.perUnit, [key]: isFinite(n) ? n : 0 } } : it)),
    );
  };

  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
      <h3 className="text-sm font-semibold">New food{items.filter((i) => i.status === "new").length > 1 ? "s" : ""} — confirm the estimate</h3>
      <p className="mt-0.5 text-xs text-neutral-500">
        Values are per single {items.find((i) => i.status === "new")?.unit ?? "serving"}. Edit if you know better — saved forever after this.
      </p>
      <div className="mt-3 flex flex-col gap-4">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-neutral-200 bg-white/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {item.name} <span className="text-neutral-400">×{item.qty} {item.unit}</span>
              </span>
              {item.status === "known" ? (
                <span className="text-xs text-emerald-600">from memory</span>
              ) : (
                item.confidence != null && (
                  <span className="text-xs text-neutral-500">confidence {(item.confidence * 100).toFixed(0)}%</span>
                )
              )}
            </div>
            {item.status === "new" && (
              <>
                {item.assumptions && <p className="mt-1 text-xs text-neutral-500">Assumed: {item.assumptions}</p>}
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {(["kcal", "proteinG", "carbsG", "fatG"] as const).map((k) => (
                    <label key={k} className="flex flex-col gap-1 text-xs text-neutral-500">
                      {k === "kcal" ? "kcal" : k === "proteinG" ? "protein g" : k === "carbsG" ? "carbs g" : "fat g"}
                      <input
                        type="number"
                        step="any"
                        className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-500 dark:border-neutral-700 dark:text-neutral-100"
                        value={item.perUnit[k]}
                        onChange={(e) => setPerUnit(idx, k, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="rounded-lg px-4 py-2 text-sm text-neutral-500" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => onConfirm({ ...resolved, items })}
          disabled={busy}
        >
          {busy ? "Saving…" : "Confirm & log"}
        </button>
      </div>
    </div>
  );
}

/** Manual fallback — AI down must never block logging (RULES.md #13). */
function ManualEntry({ busy, onDone }: { busy: boolean; onDone: () => void }) {
  const [f, setF] = useState({ name: "", qty: "1", unit: "piece", kcal: "", proteinG: "0", carbsG: "0", fatG: "0" });
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save() {
    setErr(null);
    const qty = Number(f.qty);
    const kcal = Number(f.kcal);
    if (!f.name.trim() || !isFinite(qty) || qty <= 0 || !isFinite(kcal)) {
      setErr("Name, quantity and kcal are required.");
      return;
    }
    startTransition(async () => {
      const res = await confirmAction({
        raw: `${f.qty} ${f.unit} ${f.name} (manual)`,
        mealType: "other",
        items: [
          {
            name: f.name.trim(),
            typedName: f.name.trim(),
            qty,
            unit: f.unit || "piece",
            status: "new",
            perUnit: {
              kcal,
              proteinG: Number(f.proteinG) || 0,
              carbsG: Number(f.carbsG) || 0,
              fatG: Number(f.fatG) || 0,
            },
          },
        ],
        inputMode: "text",
      });
      if (!res.ok) setErr(res.error);
      else onDone();
    });
  }

  const cls =
    "rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700";
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="grid grid-cols-3 gap-2">
        <input className={`${cls} col-span-3`} placeholder="Food name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={cls} type="number" step="any" placeholder="Qty" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        <input className={cls} placeholder="Unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
        <input className={cls} type="number" step="any" placeholder="kcal / unit" value={f.kcal} onChange={(e) => setF({ ...f, kcal: e.target.value })} />
        <input className={cls} type="number" step="any" placeholder="Protein g" value={f.proteinG} onChange={(e) => setF({ ...f, proteinG: e.target.value })} />
        <input className={cls} type="number" step="any" placeholder="Carbs g" value={f.carbsG} onChange={(e) => setF({ ...f, carbsG: e.target.value })} />
        <input className={cls} type="number" step="any" placeholder="Fat g" value={f.fatG} onChange={(e) => setF({ ...f, fatG: e.target.value })} />
      </div>
      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
      <button className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={save} disabled={busy}>
        Save
      </button>
    </div>
  );
}
