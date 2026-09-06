"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  MEAL_LABELS,
  MEAL_TYPES,
  UNITS,
  itemTotals,
  mealLabel,
  normalizeUnit,
  perLabel,
  servingSize,
  type MealType,
  type ResolvedItem,
  type ResolvedLog,
} from "@/types/food";
import { quickLogAction } from "@/app/history/actions";
import { VOICE_SAMPLE_RATE, downsample, encodeWav, normalize, toBase64, toMono } from "@/lib/audio/wav";
import {
  confirmAction,
  deleteMealLogAction,
  parseAction,
  photoAction,
  reestimateUnitAction,
  setMealTypeAction,
  voiceAction,
} from "./actions";

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
  servingQty: number;
}

/** Longest single recording we'll upload (keeps payloads and quota sane). */
const MAX_RECORDING_MS = 30_000;

export function LogClient({
  feed,
  recentFoods = [],
  suggestedMealType,
}: {
  feed: FeedItem[];
  recentFoods?: RecentFood[];
  suggestedMealType: MealType;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mealType, setMealType] = useState<MealType>(suggestedMealType);
  const [text, setText] = useState("");
  const [pendingLog, setPendingLog] = useState<ResolvedLog | null>(null);
  const [pendingPhotoPath, setPendingPhotoPath] = useState<string | undefined>(undefined);
  const [pendingVoice, setPendingVoice] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<{ stop: () => void } | null>(null);
  const [busy, startTransition] = useTransition();

  /**
   * Voice input (ADR-010): record → 16 kHz mono WAV → one Gemini call that
   * transcribes AND parses. Gemini detects Hindi / English / Hinglish itself,
   * which is why there is no language switch any more.
   */
  async function startVoice() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio — type it instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("I need microphone access to log by voice — allow it and tap 🎤 again.");
      return;
    }

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      recorderRef.current = null;
      void transcribe(new Blob(chunks, { type: rec.mimeType }));
    };

    const stopTimer = setTimeout(() => rec.state !== "inactive" && rec.stop(), MAX_RECORDING_MS);
    recorderRef.current = {
      stop: () => {
        clearTimeout(stopTimer);
        if (rec.state !== "inactive") rec.stop();
      },
    };
    setError(null);
    setStatus(null);
    setRecording(true);
    rec.start();
  }

  /** Recorded audio → WAV → server. Kept out of startVoice so it can be retried. */
  async function transcribe(blob: Blob) {
    if (blob.size === 0) {
      setError("Didn't catch anything — tap 🎤 and speak.");
      return;
    }
    setStatus("Listening back… 🎤");
    let base64: string;
    try {
      const ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      void ctx.close();
      const mono = toMono(Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i)));
      const samples = normalize(downsample(mono, decoded.sampleRate, VOICE_SAMPLE_RATE));
      base64 = toBase64(encodeWav(samples, VOICE_SAMPLE_RATE));
    } catch {
      setStatus(null);
      setError("Couldn't read that recording — try again, or type it.");
      return;
    }

    startTransition(async () => {
      const res = await voiceAction(base64, "audio/wav");
      setStatus(null);
      if (!res.ok) {
        setError(`${res.error} — you can type it instead.`);
        return;
      }
      setText(res.transcript);
      if (res.resolved.items.length === 0 && !res.resolved.waterMl) {
        setError(
          res.transcript
            ? `I heard "${res.transcript}" but couldn't find a food in it — edit it and tap Log.`
            : "Didn't catch that — tap 🎤 and try again.",
        );
        return;
      }
      setPendingPhotoPath(undefined);
      setPendingVoice(true);
      openReview(res.resolved);
    });
  }

  /** Photo input: downscale client-side, then vision-analyze → review card. */
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
      const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
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
        setPendingVoice(false);
        openReview(res.resolved);
        setStatus(null);
      });
    };
    img.src = url;
  }

  function openReview(r: ResolvedLog) {
    if (r.mealTypeExplicit) setMealType(r.mealType);
    setPendingLog(r);
  }

  function submitUtterance(utterance: string) {
    if (!utterance.trim()) return;
    setError(null);
    setStatus("Understanding…");
    startTransition(async () => {
      const res = await parseAction(utterance.trim());
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
      const slot = r.mealTypeExplicit ? r.mealType : mealType;
      if (r.needsConfirmation) {
        setPendingPhotoPath(undefined);
        setPendingVoice(false);
        openReview(r);
        setStatus(null);
        return;
      }
      // Everything known (or water-only) → log instantly into the chosen slot.
      const c = await confirmAction({ ...toConfirmPayload(r), mealType: slot, inputMode: "text" });
      if (!c.ok) {
        setError(c.error);
      } else {
        setText("");
        setStatus(
          r.waterMl && r.items.length === 0
            ? "Water logged 💧"
            : `Logged to ${MEAL_LABELS[slot]} ${r.zeroAi ? "⚡ instantly from your food memory" : "✓"}`,
        );
        router.refresh();
      }
    });
  }

  function confirmPending(edited: ResolvedLog, slot: MealType) {
    setError(null);
    startTransition(async () => {
      const c = await confirmAction({
        ...toConfirmPayload(edited),
        mealType: slot,
        photoPath: pendingPhotoPath,
        inputMode: pendingPhotoPath ? "photo" : pendingVoice ? "voice" : "text",
      });
      if (!c.ok) {
        setError(c.error);
        return;
      }
      const saved = edited.items.filter((i) => i.status === "new" && (i as Partial<ReviewItem>).saveToMemory !== false).length;
      setPendingLog(null);
      setPendingPhotoPath(undefined);
      setPendingVoice(false);
      setText("");
      setMealType(slot);
      setStatus(
        saved > 0
          ? `Logged to ${MEAL_LABELS[slot]} ✓ — ${saved} new food${saved > 1 ? "s" : ""} saved, next time it logs instantly`
          : `Logged to ${MEAL_LABELS[slot]} ✓`,
      );
      router.refresh();
    });
  }

  function focusInputFor(slot: MealType) {
    setMealType(slot);
    inputRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* ── Which slot of the day ─────────────────────────────────────── */}
      {!pendingLog && (
        <div className="-mt-1">
          <p className="mb-1.5 text-xs text-neutral-500">
            Logging to{suggestedMealType === "post_workout" && mealType === "post_workout" ? " (workout detected)" : ""}
          </p>
          <SlotChips value={mealType} onChange={setMealType} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitUtterance(text);
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-transparent px-4 py-3 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700"
          placeholder='e.g. "2 aloo parathas and a glass of milk"' 
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy || !!pendingLog}
        />
        <button
          type="button"
          aria-label={recording ? "Stop recording" : "Log by voice"}
          title="Speak in English, Hindi or Hinglish — I'll work out which"
          className={`flex items-center justify-center rounded-xl border px-3 ${recording ? "border-red-500 text-red-500" : "border-neutral-300 text-neutral-500 dark:border-neutral-700"}`}
          onClick={startVoice}
          disabled={busy || !!pendingLog}
        >
          {recording ? (
            <span className="block h-3 w-3 animate-pulse rounded-sm bg-red-500" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-5 w-5" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          )}
        </button>
        <button
          type="button"
          aria-label="Log from photo"
          className="flex items-center justify-center rounded-xl border border-neutral-300 px-3 text-neutral-500 dark:border-neutral-700"
          onClick={() => fileRef.current?.click()}
          disabled={busy || !!pendingLog}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
            <circle cx="12" cy="13.5" r="3.5" />
          </svg>
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
          className="rounded-xl bg-emerald-400 px-5 text-sm font-medium text-emerald-950 disabled:opacity-50"
          disabled={busy || !text.trim() || !!pendingLog}
        >
          {busy ? "…" : "Log"}
        </button>
      </form>

      {recording && (
        <p className="flex items-center gap-2 text-sm text-red-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          Listening — say what you ate, in any language. Tap the square to stop.
        </p>
      )}
      {status && !error && !recording && <p className="text-sm text-emerald-600">{status}</p>}
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
                  const r = await quickLogAction(f.id, mealType);
                  if (r.ok) {
                    setStatus(`${f.name} logged to ${MEAL_LABELS[mealType]} ⚡`);
                    setError(null);
                    router.refresh();
                  }
                })
              }
              title={`Log ${f.servingQty} ${f.unit} (${f.kcal} kcal)`}
            >
              + {f.name}
            </button>
          ))}
        </div>
      )}

      {pendingLog && (
        <ReviewCard
          key={pendingLog.raw + pendingLog.items.length}
          resolved={pendingLog}
          initialSlot={mealType}
          source={pendingPhotoPath ? "photo" : pendingVoice ? "voice" : "text"}
          busy={busy}
          onConfirm={confirmPending}
          onCancel={() => {
            setPendingLog(null);
            setPendingPhotoPath(undefined);
            setPendingVoice(false);
          }}
        />
      )}

      {!pendingLog && (
        <button
          className="self-start text-xs text-neutral-500 underline underline-offset-4"
          onClick={() => setShowManual((s) => !s)}
        >
          {showManual ? "Hide manual entry" : "Add manually instead"}
        </button>
      )}
      {showManual && !pendingLog && (
        <ManualEntry
          busy={busy}
          mealType={mealType}
          onDone={() => {
            setShowManual(false);
            setStatus(`Logged to ${MEAL_LABELS[mealType]} ✓`);
            router.refresh();
          }}
        />
      )}

      <TodayBySlot feed={feed} busy={busy} onLogInto={focusInputFor} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function SlotChips({ value, onChange, compact = false }: { value: MealType; onChange: (m: MealType) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MEAL_TYPES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-full ${compact ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs"} font-medium transition-colors ${
            value === m
              ? "bg-emerald-400 text-emerald-950"
              : "border border-neutral-300 text-neutral-500 hover:border-emerald-500 dark:border-neutral-700"
          }`}
        >
          {MEAL_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

/** Client-side item state = ResolvedItem + review-card UI state. */
type ReviewItem = ResolvedItem & {
  saveToMemory: boolean;
  updateMemory: boolean;
  /** true once the user ticks/unticks updateMemory themselves — stops us overriding them. */
  updateMemoryTouched?: boolean;
  /** a unit re-estimate is in flight for this item */
  estimating?: boolean;
  estimateFailed?: boolean;
  approxGrams?: number;
  _edited: boolean;
};

function toConfirmPayload(r: ResolvedLog) {
  return {
    raw: r.raw,
    mealType: r.mealType,
    waterMl: r.waterMl,
    items: r.items.map((i) => {
      const ri = i as Partial<ReviewItem> & ResolvedItem;
      return {
        name: i.name.trim(),
        typedName: i.typedName || i.name.trim(),
        qty: i.qty,
        unit: i.unit,
        perQty: i.perQty,
        status: i.status,
        foodMemoryId: i.foodMemoryId,
        perUnit: i.perUnit,
        confidence: i.confidence,
        assumptions: i.assumptions,
        saveToMemory: ri.saveToMemory ?? true,
        updateMemory: ri.updateMemory ?? false,
      };
    }),
    inputMode: "text" as const,
  };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Review card — the single place every AI-recognized meal passes through
 * (RULES.md #1 / #14): name, quantity, unit and per-serving macros are all
 * editable, totals update live, and the user decides whether a new food is
 * saved to their memory.
 */
function ReviewCard({
  resolved,
  initialSlot,
  source,
  busy,
  onConfirm,
  onCancel,
}: {
  resolved: ResolvedLog;
  initialSlot: MealType;
  source: "text" | "voice" | "photo";
  busy: boolean;
  onConfirm: (edited: ResolvedLog, slot: MealType) => void;
  onCancel: () => void;
}) {
  const [slot, setSlot] = useState<MealType>(initialSlot);
  const [, startEstimate] = useTransition();
  const [items, setItems] = useState<ReviewItem[]>(() =>
    resolved.items.map((i) => ({ ...i, saveToMemory: true, updateMemory: false, _edited: false })),
  );

  const update = (idx: number, patch: Partial<ReviewItem>, edited = false) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch, _edited: it._edited || edited };
        // "Also update my saved values" defaults ON once the user edits a saved
        // food — but only while it's still logged in the unit it was saved in.
        // Switching bowl → piece describes a different serving, so it must not
        // quietly overwrite the saved food (the user can still tick it).
        if (!next.updateMemoryTouched) {
          next.updateMemory =
            next.status === "known" &&
            next._edited &&
            (!next.memoryUnit || normalizeUnit(next.memoryUnit) === normalizeUnit(next.unit));
        }
        return next;
      }),
    );

  const setMacro = (idx: number, key: keyof ResolvedItem["perUnit"], v: string) => {
    const n = Number(v);
    const it = items[idx];
    update(idx, { perUnit: { ...it.perUnit, [key]: isFinite(n) && n >= 0 ? n : 0 } }, true);
  };

  /**
   * Changing the unit changes what one serving IS, so the old macros can't be
   * rescaled — a piece of butter chicken isn't a quarter of a bowl. Ask the
   * model for that unit's nutrition and replace the values (ADR-010).
   */
  const setUnit = (idx: number, unit: string) => {
    const it = items[idx];
    if (normalizeUnit(unit) === normalizeUnit(it.unit)) return;
    const name = it.name.trim();
    // Snap quantity to something sensible for the new unit (4 → 100 g, not 4 g).
    const qty = servingSize(unit) === 100 ? Math.max(50, servingSize(it.unit) === 100 ? it.qty : 100) : it.qty;
    update(idx, { unit, perQty: servingSize(unit), qty, estimating: !!name }, true);
    if (!name) return;

    startEstimate(async () => {
      const res = await reestimateUnitAction(name, unit);
      setItems((prev) =>
        prev.map((cur, i) => {
          // The user may have typed on while we waited — only apply if the unit still matches.
          if (i !== idx || normalizeUnit(cur.unit) !== normalizeUnit(unit)) return cur;
          if (!res.ok) return { ...cur, estimating: false, estimateFailed: true };
          return {
            ...cur,
            estimating: false,
            estimateFailed: false,
            perUnit: res.perUnit,
            perQty: res.perQty,
            approxGrams: res.approxGrams,
            confidence: res.confidence,
            assumptions: res.assumptions,
          };
        }),
      );
    });
  };

  const stepQty = (idx: number, dir: 1 | -1) => {
    const it = items[idx];
    const step = servingSize(it.unit) === 100 ? 50 : it.qty < 1 ? 0.5 : 1;
    const q = Math.max(step === 50 ? 10 : 0.25, Math.round((it.qty + dir * step) * 100) / 100);
    update(idx, { qty: q });
  };

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        name: "",
        typedName: "",
        qty: 1,
        unit: "piece",
        perQty: 1,
        status: "new",
        perUnit: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        saveToMemory: true,
        updateMemory: false,
        _edited: true,
      },
    ]);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, it) => {
          const t = itemTotals(it);
          return { kcal: acc.kcal + t.kcal, proteinG: acc.proteinG + t.proteinG, carbsG: acc.carbsG + t.carbsG, fatG: acc.fatG + t.fatG };
        },
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      ),
    [items],
  );

  const valid =
    items.length > 0 && items.every((it) => it.name.trim().length > 0 && it.qty > 0 && !it.estimating);
  const newCount = items.filter((i) => i.status === "new").length;

  const inputCls =
    "rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-emerald-500 dark:border-neutral-700 dark:text-neutral-100";

  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {source === "photo" ? "Here's what I saw" : source === "voice" ? "Here's what I heard" : "Check the estimate"}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {source === "photo"
              ? "Fix the count if I miscounted — then adjust anything else."
              : source === "voice"
                ? `"${resolved.raw}"`
                : "Values are per serving. Edit anything — you're the authority."}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          {fmt(Math.round(totals.kcal))} kcal
        </span>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-neutral-400">Meal</p>
        <SlotChips value={slot} onChange={setSlot} compact />
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {items.map((item, idx) => {
          const t = itemTotals(item);
          return (
            <div key={idx} className="rounded-xl border border-neutral-200 bg-white/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
              {/* name + status */}
              <div className="flex items-center gap-2">
                <input
                  className={`${inputCls} min-w-0 flex-1 font-medium`}
                  value={item.name}
                  placeholder="Food name"
                  onChange={(e) => update(idx, { name: e.target.value }, true)}
                />
                <button
                  type="button"
                  aria-label="Remove item"
                  className="rounded-lg px-2 py-1 text-neutral-400 hover:text-red-500"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                {item.status === "known" ? (
                  <span className="text-emerald-600">From your foods</span>
                ) : (
                  <>
                    AI estimate{item.confidence != null ? ` · ${(item.confidence * 100).toFixed(0)}% sure` : ""}
                  </>
                )}
                {item.assumptions ? ` · ${item.assumptions}` : ""}
              </p>

              {/* quantity + unit */}
              <div className="mt-2 flex items-center gap-2">
                <span className="w-12 text-xs text-neutral-500">Qty</span>
                <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
                  <button type="button" className="px-3 py-1.5 text-sm" onClick={() => stepQty(idx, -1)} aria-label="Less">
                    −
                  </button>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    inputMode="decimal"
                    className="w-16 border-x border-neutral-300 bg-transparent py-1.5 text-center text-sm outline-none dark:border-neutral-700"
                    value={item.qty}
                    onChange={(e) => update(idx, { qty: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <button type="button" className="px-3 py-1.5 text-sm" onClick={() => stepQty(idx, 1)} aria-label="More">
                    +
                  </button>
                </div>
                <select className={`${inputCls} flex-1`} value={item.unit} onChange={(e) => setUnit(idx, e.target.value)}>
                  {(UNITS as readonly string[]).includes(item.unit) ? null : <option value={item.unit}>{item.unit} (old)</option>}
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              {/* per-serving macros */}
              <p className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-400">
                {perLabel(item.unit).replace(/^per/, "Per")}
                {item.approxGrams ? <span className="normal-case tracking-normal">≈ {Math.round(item.approxGrams)} g</span> : null}
                {item.estimating && <span className="normal-case tracking-normal text-emerald-600">re-estimating…</span>}
                {item.estimateFailed && <span className="normal-case tracking-normal text-amber-600">couldn&apos;t re-estimate — check the numbers</span>}
              </p>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {(["kcal", "proteinG", "carbsG", "fatG"] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-1 text-[11px] text-neutral-500">
                    {k === "kcal" ? "kcal" : k === "proteinG" ? "protein g" : k === "carbsG" ? "carbs g" : "fat g"}
                    <input
                      type="number"
                      step="any"
                      min={0}
                      inputMode="decimal"
                      className={`${inputCls} ${item.estimating ? "animate-pulse opacity-50" : ""}`}
                      value={item.perUnit[k]}
                      onChange={(e) => setMacro(idx, k, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                = <span className="font-medium">{fmt(t.kcal)} kcal</span> · {fmt(t.proteinG)}g P · {fmt(t.carbsG)}g C · {fmt(t.fatG)}g F
                <span className="text-neutral-400"> for {fmt(item.qty)} {item.unit}</span>
              </p>

              {/* memory toggles */}
              {item.status === "new" ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                  <input type="checkbox" className="accent-emerald-500" checked={item.saveToMemory} onChange={(e) => update(idx, { saveToMemory: e.target.checked })} />
                  Save to my foods — next time it logs instantly
                </label>
              ) : (
                item._edited && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                    <input type="checkbox" className="accent-emerald-500" checked={item.updateMemory} onChange={(e) => update(idx, { updateMemory: e.target.checked, updateMemoryTouched: true })} />
                    Also update my saved values for this food
                    {item.memoryUnit && servingSize(item.memoryUnit) !== servingSize(item.unit) ? ` (it's saved per ${item.memoryUnit} — this would switch it to ${perLabel(item.unit).replace("per ", "per ")})` : ""}
                  </label>
                )
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="mt-3 text-xs text-emerald-600 underline underline-offset-4" onClick={addItem}>
        + Add another item
      </button>

      {resolved.waterMl ? <p className="mt-2 text-xs text-neutral-500">+ {resolved.waterMl} ml water</p> : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">
          {fmt(Math.round(totals.kcal))} kcal · {fmt(Math.round(totals.proteinG))}g protein
          {newCount > 0 && items.some((i) => i.status === "new" && i.saveToMemory) ? ` · saving ${items.filter((i) => i.status === "new" && i.saveToMemory).length} new` : ""}
        </p>
        <div className="flex gap-2">
          <button className="rounded-lg px-3 py-2 text-sm text-neutral-500" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-medium text-emerald-950 disabled:opacity-50"
            onClick={() => onConfirm({ ...resolved, mealType: slot, items }, slot)}
            disabled={busy || !valid}
          >
            {busy ? "Saving…" : `Log ${MEAL_LABELS[slot].toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/** Manual fallback — AI down must never block logging (RULES.md #13). */
function ManualEntry({ busy, mealType, onDone }: { busy: boolean; mealType: MealType; onDone: () => void }) {
  const [f, setF] = useState({ name: "", qty: "1", unit: "piece", kcal: "", proteinG: "0", carbsG: "0", fatG: "0", save: true });
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function saveEntry() {
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
        mealType,
        items: [
          {
            name: f.name.trim(),
            typedName: f.name.trim(),
            qty,
            unit: f.unit || "piece",
            perQty: servingSize(f.unit || "piece"),
            status: "new",
            perUnit: { kcal, proteinG: Number(f.proteinG) || 0, carbsG: Number(f.carbsG) || 0, fatG: Number(f.fatG) || 0 },
            saveToMemory: f.save,
          },
        ],
        inputMode: "text",
      });
      if (!res.ok) setErr(res.error);
      else onDone();
    });
  }

  const cls = "rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700";
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="grid grid-cols-3 gap-2">
        <input className={`${cls} col-span-3`} placeholder="Food name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={cls} type="number" step="any" placeholder="Qty" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        <select className={cls} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input className={cls} type="number" step="any" placeholder={`kcal ${perLabel(f.unit)}`} value={f.kcal} onChange={(e) => setF({ ...f, kcal: e.target.value })} />
        <input className={cls} type="number" step="any" placeholder="Protein g" value={f.proteinG} onChange={(e) => setF({ ...f, proteinG: e.target.value })} />
        <input className={cls} type="number" step="any" placeholder="Carbs g" value={f.carbsG} onChange={(e) => setF({ ...f, carbsG: e.target.value })} />
        <input className={cls} type="number" step="any" placeholder="Fat g" value={f.fatG} onChange={(e) => setF({ ...f, fatG: e.target.value })} />
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
        <input type="checkbox" className="accent-emerald-500" checked={f.save} onChange={(e) => setF({ ...f, save: e.target.checked })} />
        Save to my foods
      </label>
      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
      <button className="mt-3 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-medium text-emerald-950 disabled:opacity-50" onClick={saveEntry} disabled={busy}>
        Log {MEAL_LABELS[mealType].toLowerCase()}
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/** Today's feed grouped into the five slots, with per-slot totals and fix-ups. */
function TodayBySlot({ feed, busy, onLogInto }: { feed: FeedItem[]; busy: boolean; onLogInto: (m: MealType) => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const groups = useMemo(() => {
    const known = new Set<string>(MEAL_TYPES);
    const by = new Map<string, FeedItem[]>();
    for (const f of feed) {
      const k = f.mealType && known.has(f.mealType) ? f.mealType : "other";
      by.set(k, [...(by.get(k) ?? []), f]);
    }
    const order: string[] = [...MEAL_TYPES, ...(by.has("other") ? ["other"] : [])];
    return order.map((slot) => {
      const logs = by.get(slot) ?? [];
      const kcal = logs.reduce((s, l) => s + l.items.reduce((a, i) => a + i.kcal, 0), 0);
      const proteinG = logs.reduce((s, l) => s + l.items.reduce((a, i) => a + i.proteinG, 0), 0);
      return { slot, logs, kcal, proteinG };
    });
  }, [feed]);

  const move = (id: string, slot: string) =>
    startTransition(async () => {
      const r = await setMealTypeAction(id, slot);
      if (r.ok) router.refresh();
    });
  const remove = (id: string) =>
    startTransition(async () => {
      const r = await deleteMealLogAction(id);
      setConfirmDelete(null);
      if (r.ok) router.refresh();
    });

  return (
    <section className="mt-2 flex flex-col gap-4">
      <h2 className="text-sm font-medium text-neutral-500">Today</h2>
      {groups.map(({ slot, logs, kcal, proteinG }) => (
        <div key={slot}>
          <div className="mb-1.5 flex items-baseline justify-between">
            <h3 className={`text-sm font-semibold ${logs.length === 0 ? "text-neutral-400" : ""}`}>{mealLabel(slot)}</h3>
            {logs.length > 0 ? (
              <span className="text-xs text-neutral-500">
                {Math.round(kcal)} kcal · {Math.round(proteinG)}g P
              </span>
            ) : (
              MEAL_TYPES.includes(slot as MealType) && (
                <button type="button" className="text-xs text-emerald-600" onClick={() => onLogInto(slot as MealType)}>
                  + Log {mealLabel(slot).toLowerCase()}
                </button>
              )
            )}
          </div>
          {logs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-2.5 text-xs text-neutral-400 dark:border-neutral-800">Nothing yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {logs.map((f) => (
                <div key={f.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span className="italic text-neutral-400">&quot;{f.rawInput}&quot;</span>
                    <span>{new Date(f.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1">
                    {f.items.map((i) => (
                      <li key={i.id} className="flex justify-between text-sm">
                        <span>
                          {i.name} <span className="text-neutral-400">· {fmt(i.qty)}{i.unit ? ` ${i.unit}` : ""}</span>
                        </span>
                        <span className="text-neutral-500">{i.kcal} kcal · {i.proteinG}g P</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-1 text-neutral-400">
                      Move to
                      <select
                        className="rounded-md border border-neutral-300 bg-transparent px-1.5 py-0.5 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                        value={MEAL_TYPES.includes((f.mealType ?? "") as MealType) ? (f.mealType as string) : ""}
                        onChange={(e) => e.target.value && move(f.id, e.target.value)}
                        disabled={busy}
                      >
                        {!MEAL_TYPES.includes((f.mealType ?? "") as MealType) && <option value="">—</option>}
                        {MEAL_TYPES.map((m) => (
                          <option key={m} value={m}>
                            {MEAL_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {confirmDelete === f.id ? (
                      <span className="flex items-center gap-2">
                        <button type="button" className="text-red-500" onClick={() => remove(f.id)} disabled={busy}>
                          Delete
                        </button>
                        <button type="button" className="text-neutral-400" onClick={() => setConfirmDelete(null)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="text-neutral-400 hover:text-red-500" onClick={() => setConfirmDelete(f.id)} disabled={busy}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
