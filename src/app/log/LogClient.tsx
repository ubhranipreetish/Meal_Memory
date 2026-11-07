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
import { ArrowUpRight, Camera, Check, Mic, Plus, Square, Trash2, X } from "lucide-react";
import { SavedFoodPicker } from "./SavedFoodPicker";
import type { listSavedFoods } from "@/lib/services/history";
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
  timeLabel: string;
  mealType: string | null;
  rawInput: string;
  items: { id: string; name: string; qty: number; unit: string | null; kcal: number; proteinG: number }[];
}

/** Longest single recording we'll upload (keeps payloads and quota sane). */
const MAX_RECORDING_MS = 30_000;
const MAX_SOURCE_PHOTO_BYTES = 15 * 1024 * 1024;

export function LogClient({
  feed,
  savedFoods = [],
  suggestedMealType,
}: {
  feed: FeedItem[];
  savedFoods?: Awaited<ReturnType<typeof listSavedFoods>>;
  suggestedMealType: MealType;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPEG, PNG, HEIC, or WebP).");
      return;
    }
    if (file.size > MAX_SOURCE_PHOTO_BYTES) {
      setError("That photo is too large — choose one under 15 MB.");
      return;
    }
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
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus(null);
      setError("Couldn't read that image — try a JPEG, PNG, or WebP photo.");
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
      if (r.items.length > 0) {
        setPendingPhotoPath(undefined);
        setPendingVoice(false);
        openReview(r);
        setStatus(null);
        return;
      }
      // Water-only input can be logged immediately.
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
          ? `Logged to ${MEAL_LABELS[slot]} ✓ — ${saved} new food${saved > 1 ? "s" : ""} saved to My foods`
          : `Logged to ${MEAL_LABELS[slot]} ✓`,
      );
      router.refresh();
    });
  }

  return (
    <>
      {/* ── Which slot of the day ─────────────────────────────────────── */}
      {!pendingLog && (
        <div className="section chips">
          {MEAL_TYPES.filter((m) => m !== "post_workout" || m === mealType).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mealType === m}
              onClick={() => setMealType(m)}
              className={"chip " + (mealType === m ? "selected" : "")}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
      )}
      {!pendingLog && (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            submitUtterance(text);
          }}
        >
          <textarea
            ref={inputRef}
            aria-label="What did you eat?"
            placeholder={'What did you eat?\ne.g. "2 aloo parathas and a glass of milk"'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />
          <div className="row between">
            <div className="row">
              <button
                type="button"
                aria-label={recording ? "Stop recording" : "Log by voice"}
                title="Speak in English, Hindi or Hinglish — I'll work out which"
                className="icon"
                style={recording ? { borderColor: "#e5484d", color: "#e5484d" } : undefined}
                onClick={startVoice}
                disabled={busy}
              >
                {recording ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
              </button>
              <button
                type="button"
                aria-label="Log from photo"
                className="icon"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <Camera size={20} />
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
            </div>
            <button className="primary" disabled={busy || !text.trim()}>
              {busy ? "Reading…" : "Log meal"}
              <ArrowUpRight size={18} />
            </button>
          </div>
        </form>
      )}

      {recording && (
        <p className="row small mt-3" style={{ color: "#e5484d" }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: "#e5484d" }} className="animate-pulse" />
          Listening — say what you ate, in any language. Tap the square to stop.
        </p>
      )}
      {status && !error && !recording && <p className="small green mt-3">{status}</p>}
      {error && <p className="small danger mt-3">{error}</p>}

      {!pendingLog && (
        <div className="section row">
          <SavedFoodPicker foods={savedFoods} meal={mealType} disabled={busy} onLogged={(name) => {
            setError(null);
            setStatus(`${name} logged to ${MEAL_LABELS[mealType].toLowerCase()}`);
            router.refresh();
          }} />
          <button type="button" className="icon green shrink-0" aria-label="Add manually"
            aria-expanded={showManual} aria-controls="manual-meal-entry" title="Add manually"
            disabled={busy} onClick={() => setShowManual((shown) => !shown)}>
            <Plus size={22} aria-hidden="true" />
          </button>
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
        <div id="manual-meal-entry" className={showManual ? "section" : undefined} hidden={!showManual}>
          {showManual && (
            <ManualEntry busy={busy} mealType={mealType} onDone={() => {
              setShowManual(false);
              setStatus(`Logged to ${MEAL_LABELS[mealType]} ✓`);
              router.refresh();
            }} />
          )}
        </div>
      )}

      {!pendingLog && <MealJournal feed={feed} busy={busy} />}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function MealSelect({ value, onChange, disabled, label = "Meal" }: {
  value: string;
  onChange: (meal: MealType) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="row small muted">
      Meal
      <select className="field meal-select" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as MealType)}>
        {!MEAL_TYPES.includes(value as MealType) && <option value={value} disabled>Choose a meal</option>}
        {MEAL_TYPES.filter((meal) => meal !== "post_workout" || meal === value).map((meal) => (
          <option key={meal} value={meal}>{MEAL_LABELS[meal]}</option>
        ))}
      </select>
    </label>
  );
}

/** Client-side item state = ResolvedItem + review-card UI state. */
type ReviewItem = ResolvedItem & {
  id: number;
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
  const nextItemId = useRef(resolved.items.length);
  const [items, setItems] = useState<ReviewItem[]>(() =>
    resolved.items.map((i, id) => ({ ...i, id, saveToMemory: true, updateMemory: false, _edited: false })),
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
        prev.map((cur) => {
          if (cur.id !== it.id) return cur;
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

  const addItem = () => {
    const id = nextItemId.current++;
    setItems((prev) => [
      ...prev,
      {
        id,
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
  };

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

  return (
    <section className="meal-review section" aria-label="Review meal">
      <div className="row between flex-wrap">
        <h2>{source === "voice" ? "Review recording" : source === "photo" ? "Review photo" : "Review meal"}</h2>
        <MealSelect value={slot} onChange={setSlot} />
      </div>

      {items.map((item, idx) => {
        const t = itemTotals(item);
        return (
          <article className="card dish-review" key={item.id}>
            <div className="row dish-name">
              <label className="small muted flex-1 min-w-0">
                Dish name
                <input
                  className="field mt-1 font-semibold"
                  aria-label={`Dish ${idx + 1} name`}
                  value={item.name}
                  placeholder="e.g. Aloo Paratha"
                  disabled={item.estimating}
                  onChange={(e) => update(idx, { name: e.target.value }, true)}
                />
              </label>
              <button
                type="button"
                aria-label={`Remove ${item.name || "dish"}`}
                className="icon shrink-0 self-end"
                onClick={() => setItems((prev) => prev.filter((dish) => dish.id !== item.id))}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="grid2 mt-2">
              <label className="small muted">
                Quantity
                <input
                  className="field mt-1"
                  aria-label={`Dish ${idx + 1} quantity`}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={item.qty || ""}
                  onChange={(e) => update(idx, { qty: Math.max(0, Number(e.target.value) || 0) })}
                />
              </label>
              <label className="small muted">
                Unit
                <select
                  className="field mt-1"
                  aria-label={`Dish ${idx + 1} unit`}
                  value={item.unit}
                  disabled={item.estimating}
                  onChange={(e) => setUnit(idx, e.target.value)}
                >
                  {(UNITS as readonly string[]).includes(item.unit) ? null : <option value={item.unit}>{item.unit}</option>}
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            </div>

            <fieldset className="mt-3" disabled={item.estimating}>
              <legend className="small muted mb-1">
                Nutrition per {item.perQty > 1 ? `${item.perQty} ` : ""}{item.unit}
              </legend>
              <div className="dish-macros">
                {(["kcal", "proteinG", "carbsG", "fatG"] as const).map((key, index) => (
                  <label className="small muted" key={key}>
                    {["Calories", "Protein", "Carbs", "Fat"][index]}
                    <input
                      className="field mt-1"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      aria-label={`Dish ${idx + 1} ${["calories in kcal", "protein in grams", "carbs in grams", "fat in grams"][index]}`}
                      value={item.perUnit[key]}
                      onChange={(e) => setMacro(idx, key, e.target.value)}
                    />
                    <span className="dish-unit">{index === 0 ? "kcal" : "g"}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {item.estimating && <p role="status" className="small green mt-2">Updating nutrition…</p>}
            {item.estimateFailed && <p role="status" className="small danger mt-2">Couldn&rsquo;t update nutrition. Check these values before saving.</p>}

            <p className="small mt-2">
              <span className="muted">Dish total</span> <strong>{fmt(t.kcal)} kcal</strong> · {fmt(t.proteinG)}g P · {fmt(t.carbsG)}g C · {fmt(t.fatG)}g F
            </p>
            <p className="small muted mt-1">
              {item.status === "known" && !item.assumptions ? "From your foods" : item.confidence != null ? "Estimated nutrition" : "Your nutrition values"}
            </p>

            {item.status === "new" ? (
              <label className="row small muted mt-2" style={{ minHeight: 44 }}>
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={item.saveToMemory}
                  onChange={(e) => update(idx, { saveToMemory: e.target.checked })}
                />
                Save to my foods
              </label>
            ) : (
              item._edited && (
                <label className="row small muted mt-2" style={{ minHeight: 44 }}>
                  <input
                    type="checkbox"
                    className="accent-emerald-500"
                    checked={item.updateMemory}
                    onChange={(e) => update(idx, { updateMemory: e.target.checked, updateMemoryTouched: true })}
                  />
                  <span>
                    Also update my saved values
                    {item.memoryUnit && normalizeUnit(item.memoryUnit) !== normalizeUnit(item.unit)
                      ? ` (saved per ${item.memoryUnit} — this switches it to ${perLabel(item.unit)})`
                      : ""}
                  </span>
                </label>
              )
            )}
          </article>
        );
      })}

      <button type="button" className="green small mt-2" onClick={addItem}>
        + Add another item
      </button>

      {resolved.waterMl ? <p className="small muted mt-2">+ {resolved.waterMl} ml water</p> : null}

      <div className="row between mt-3">
        <div>
          <span className="small muted">Meal total</span>
          <p>
            <strong className="metric">{fmt(Math.round(totals.kcal))}</strong> kcal
          </p>
        </div>
        <span className="green small">
          {fmt(Math.round(totals.proteinG))}g protein
          {newCount > 0 && items.some((i) => i.status === "new" && i.saveToMemory)
            ? ` · saving ${items.filter((i) => i.status === "new" && i.saveToMemory).length} new`
            : ""}
        </span>
      </div>

      <div className="row mt-4">
        <button className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="primary flex-1" onClick={() => onConfirm({ ...resolved, mealType: slot, items }, slot)} disabled={busy || !valid}>
          {busy ? "Saving…" : `Log ${MEAL_LABELS[slot].toLowerCase()}`} <Check size={18} />
        </button>
      </div>
    </section>
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

  return (
    <div className="spaced mt-3">
      <label className="small muted">
        Food name
        <input className="field mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <div className="grid2">
        <label className="small muted">
          Quantity
          <input className="field mt-1" type="number" min="0" step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        </label>
        <label className="small muted">
          Unit
          <select className="field mt-1" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="eyebrow muted">{perLabel(f.unit).toUpperCase()}</p>
      <div className="grid2">
        {([
          ["kcal", "Calories · kcal", f.kcal],
          ["proteinG", "Protein · g", f.proteinG],
          ["carbsG", "Carbs · g", f.carbsG],
          ["fatG", "Fat · g", f.fatG],
        ] as const).map(([key, label, value]) => (
          <label className="small muted" key={key}>
            {label}
            <input
              className="field mt-1"
              type="number"
              min="0"
              step="any"
              value={value}
              onChange={(e) => setF({ ...f, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label className="row small muted" style={{ minHeight: 44 }}>
        <input type="checkbox" className="accent-emerald-500" checked={f.save} onChange={(e) => setF({ ...f, save: e.target.checked })} />
        Save to my foods
      </label>
      {err && <p className="small danger">{err}</p>}
      <button className="primary" onClick={saveEntry} disabled={busy}>
        Log {MEAL_LABELS[mealType].toLowerCase()}
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/** Review and correct the meals already logged today. */
function MealJournal({ feed, busy }: { feed: FeedItem[]; busy: boolean }) {
  const router = useRouter();
  const [changing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const total = feed.reduce((sum, meal) => sum + meal.items.reduce((kcal, item) => kcal + item.kcal, 0), 0);

  const move = (id: string, slot: string) =>
    startTransition(async () => {
      setError(null);
      const r = await setMealTypeAction(id, slot);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  const remove = (id: string) =>
    startTransition(async () => {
      setError(null);
      const r = await deleteMealLogAction(id);
      if (r.ok) router.refresh();
      else setError(r.error);
    });

  return (
    <section className="section" aria-label="Meal journal">
      <div className="row between flex-wrap">
        <h2>Meal journal</h2>
        {feed.length > 0 && <span className="chip">{Math.round(total).toLocaleString("en-IN")} kcal today</span>}
      </div>
      {error && <p role="alert" className="small danger mt-2">{error}</p>}
      {feed.length === 0 && (
        <div className="card mt-3">
          <p className="font-semibold">Your plate is still empty.</p>
          <p className="small muted mt-1">Log a meal above and it will appear here.</p>
        </div>
      )}
      {feed.map((meal) => {
        const calories = meal.items.reduce((sum, item) => sum + item.kcal, 0);
        const protein = meal.items.reduce((sum, item) => sum + item.proteinG, 0);
        return (
          <article className="card mt-3" key={meal.id}>
            <div className="row between">
              <div>
                <p className="eyebrow green">{mealLabel(meal.mealType)}</p>
                <time className="small muted" dateTime={meal.loggedAt}>{meal.timeLabel}</time>
              </div>
              <div className="text-right">
                <p className="font-semibold">{Math.round(calories)} kcal</p>
                <p className="small muted">{fmt(protein)} g protein</p>
              </div>
            </div>
            {meal.items.length ? (
              <ul className="journal-dishes mt-3">
                {meal.items.map((item) => (
                  <li className="row between small" key={item.id}>
                    <strong>{item.name}</strong>
                    <span className="muted shrink-0">{fmt(item.qty)} {item.unit}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="small mt-3">{meal.rawInput}</p>}
            <details className="journal-actions mt-2">
              <summary className="small muted">Edit log</summary>
              <div className="row between flex-wrap">
                <MealSelect label={`Meal for ${meal.rawInput}`} value={meal.mealType ?? ""} disabled={busy || changing} onChange={(slot) => move(meal.id, slot)} />
                <button type="button" className="icon danger shrink-0" aria-label={`Remove log for ${meal.rawInput}`} disabled={busy || changing} onClick={() => remove(meal.id)}>
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            </details>
          </article>
        );
      })}
    </section>
  );
}
