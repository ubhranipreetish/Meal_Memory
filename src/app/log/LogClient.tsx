"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
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
import { ArrowUpRight, Camera, Check, LoaderCircle, Mic, Plus, Square, Trash2, X } from "lucide-react";
import { DishMacroFields } from "@/components/DishMacroFields";
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
  timeLabel: string | null;
  mealType: string | null;
  rawInput: string;
  items: { id: string; name: string; qty: number; unit: string | null; kcal: number; proteinG: number }[];
}

/** Longest single recording we'll upload (keeps payloads and quota sane). */
const MAX_RECORDING_MS = 30_000;
const MAX_SOURCE_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_REVIEW_ITEMS = 30;

type CaptureMode = "voice" | "photo";
type CaptureHandler = (resolved: ResolvedLog, mode: CaptureMode, photoPath?: string) => void;

export function LogClient({
  date,
  yesterday,
  feed,
  savedFoods = [],
  suggestedMealType,
}: {
  date: string;
  yesterday: boolean;
  feed: FeedItem[];
  savedFoods?: Awaited<ReturnType<typeof listSavedFoods>>;
  suggestedMealType: MealType;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileHandlerRef = useRef<CaptureHandler | null>(null);
  const captureLock = useRef(false);
  const [mealType, setMealType] = useState<MealType>(suggestedMealType);
  const [text, setText] = useState("");
  const [pendingLog, setPendingLog] = useState<ResolvedLog | null>(null);
  const [pendingPhotoPath, setPendingPhotoPath] = useState<string | undefined>(undefined);
  const [pendingMode, setPendingMode] = useState<"text" | CaptureMode>("text");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [recording, setRecording] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const recorderRef = useRef<{ stop: () => void } | null>(null);
  const [busy, startTransition] = useTransition();
  const [switchingDay, startDaySwitch] = useTransition();
  const daySuffix = yesterday ? " for yesterday" : "";

  function beginCapture() {
    if (captureLock.current || busy) return false;
    captureLock.current = true;
    setCapturing(true);
    setError(null);
    setStatus(null);
    return true;
  }

  function endCapture() {
    captureLock.current = false;
    setCapturing(false);
    setStatus(null);
  }

  async function startVoice(onCapture: CaptureHandler) {
    if (recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio. You can add the food manually.");
      return;
    }
    if (!beginCapture()) return;

    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const timer = setTimeout(() => stop(), MAX_RECORDING_MS);
      function stop() {
        clearTimeout(timer);
        if (rec.state !== "inactive") rec.stop();
      }
      rec.onstop = () => {
        clearTimeout(timer);
        stream?.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setRecording(false);
        void transcribe(new Blob(chunks, { type: rec.mimeType }), onCapture);
      };
      rec.start();
      recorderRef.current = { stop };
      setRecording(true);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      endCapture();
      setError("Couldn't start recording. Check microphone access and try again.");
    }
  }

  async function transcribe(blob: Blob, onCapture: CaptureHandler) {
    let context: AudioContext | undefined;
    try {
      if (!blob.size) {
        setError("Didn't catch anything. Try recording again.");
        return;
      }
      setStatus("Reading recording…");
      const AudioContextClass = window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      context = new AudioContextClass();
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const mono = toMono(Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i)));
      const samples = normalize(downsample(mono, decoded.sampleRate, VOICE_SAMPLE_RATE));
      const res = await voiceAction(toBase64(encodeWav(samples, VOICE_SAMPLE_RATE)), "audio/wav");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!pendingLog) setText(res.transcript);
      if (!res.resolved.items.length && !res.resolved.waterMl) {
        setError(res.transcript
          ? `I heard "${res.transcript}" but couldn't find a food in it.`
          : "Didn't catch that. Try recording again.");
        return;
      }
      onCapture(res.resolved, "voice");
    } catch {
      setError("Couldn't process that recording. Try again or add the food manually.");
    } finally {
      void context?.close().catch(() => {});
      endCapture();
    }
  }

  async function onPhotoPicked(file: File, onCapture: CaptureHandler) {
    if (!beginCapture()) return;
    let url: string | undefined;
    try {
      if (!file.type.startsWith("image/")) {
        setError("Choose an image file (JPEG, PNG, HEIC, or WebP).");
        return;
      }
      if (file.size > MAX_SOURCE_PHOTO_BYTES) {
        setError("That photo is too large. Choose one under 15 MB.");
        return;
      }
      setStatus("Reading photo…");
      const img = new Image();
      url = URL.createObjectURL(file);
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
      setStatus("Recognizing your meal…");
      const res = await photoAction(base64, "image/jpeg", !pendingPhotoPath);
      if (!res.ok) {
        setError(res.error);
        if (!pendingLog) setShowManual(true);
        return;
      }
      if (!res.resolved.items.length) {
        setError("Couldn't spot any food in that photo. Try another angle or add it manually.");
        return;
      }
      onCapture(res.resolved, "photo", res.photoPath);
    } catch {
      setError("Couldn't process that photo. Try again or add the food manually.");
    } finally {
      if (url) URL.revokeObjectURL(url);
      endCapture();
    }
  }

  const openCapturedReview: CaptureHandler = (resolved, mode, photoPath) => {
    setPendingPhotoPath(photoPath);
    setPendingMode(mode);
    openReview(resolved);
  };

  function pickPhoto(onCapture: CaptureHandler) {
    if (busy || captureLock.current) return;
    fileHandlerRef.current = onCapture;
    photoInputRef.current?.click();
  }

  function readPhotoInput(input: HTMLInputElement) {
    const file = input.files?.[0];
    const onCapture = fileHandlerRef.current;
    fileHandlerRef.current = null;
    input.value = "";
    if (file && onCapture) void onPhotoPicked(file, onCapture);
  }

  const feedback = (
    <>
      {recording && <p role="status" className="small mt-3" style={{ color: "#e5484d" }}>Listening… Tap stop when you’re done.</p>}
      {status && !error && !recording && <p role="status" className="small green mt-3">{status}</p>}
      {error && <p role="alert" className="small danger mt-3">{error}</p>}
    </>
  );

  function openReview(r: ResolvedLog) {
    if (r.mealTypeExplicit) setMealType(r.mealType);
    setPendingLog(r);
  }

  function submitUtterance(utterance: string) {
    if (!utterance.trim() || captureLock.current || busy) return;
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
        setPendingMode("text");
        openReview(r);
        setStatus(null);
        return;
      }
      // Water-only input can be logged immediately.
      const c = await confirmAction({ ...toConfirmPayload(r), date, mealType: slot, inputMode: "text" });
      if (!c.ok) {
        setError(c.error);
      } else {
        setText("");
        setStatus(
          r.waterMl && r.items.length === 0
            ? `Water logged${daySuffix} 💧`
            : `Logged to ${MEAL_LABELS[slot]} ${r.zeroAi ? "⚡ instantly from your food memory" : "✓"}`,
        );
        router.refresh();
      }
    });
  }

  function confirmPending(edited: ResolvedLog, slot: MealType) {
    if (captureLock.current || busy) return;
    setError(null);
    startTransition(async () => {
      const c = await confirmAction({
        ...toConfirmPayload(edited),
        date,
        mealType: slot,
        photoPath: pendingPhotoPath,
        inputMode: pendingMode,
      });
      if (!c.ok) {
        setError(c.error);
        return;
      }
      const saved = edited.items.filter((i) => i.status === "new" && (i as Partial<ReviewItem>).saveToMemory !== false).length;
      setPendingLog(null);
      setPendingPhotoPath(undefined);
      setPendingMode("text");
      setText("");
      setMealType(slot);
      setStatus(
        saved > 0
          ? `Logged to ${MEAL_LABELS[slot]}${daySuffix} ✓ — ${saved} new food${saved > 1 ? "s" : ""} saved to My foods`
          : `Logged to ${MEAL_LABELS[slot]}${daySuffix} ✓`,
      );
      router.refresh();
    });
  }

  return (
    <>
      <nav className="section chips items-center" aria-label="Meal log date">
        {[false, true].map((isYesterday) => {
          const current = yesterday === isYesterday;
          const href = isYesterday ? "/log?day=yesterday" : "/log";
          return (
            <Link key={href} href={href} scroll={false}
              className={current ? "chip selected" : "chip"}
              aria-current={current ? "page" : undefined}
              aria-disabled={busy || capturing || switchingDay}
              onNavigate={(event) => {
                event.preventDefault();
                if (busy || captureLock.current || switchingDay || current) return;
                startDaySwitch(() => router.push(href, { scroll: false }));
              }}
            >{isYesterday ? "Yesterday" : "Today"}</Link>
          );
        })}
        <span role="status" className="row small green">
          {switchingDay && <>
            <LoaderCircle size={16} className="shrink-0 motion-safe:animate-spin" aria-hidden="true" />
            {yesterday ? "Loading today…" : "Loading yesterday…"}
          </>}
        </span>
      </nav>
      <div aria-busy={switchingDay} inert={switchingDay} className={switchingDay ? "opacity-60" : undefined}>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => readPhotoInput(event.currentTarget)}
        />
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
            <div className="row between flex-wrap">
              <div className="row flex-wrap">
                <CaptureButtons
                  busy={busy}
                  capturing={capturing}
                  recording={recording}
                  onVoice={() => void startVoice(openCapturedReview)}
                  onPhoto={() => pickPhoto(openCapturedReview)}
                />
                <button type="button" className={`icon shrink-0${showManual ? " green" : ""}`} aria-label="Add manually"
                  aria-expanded={showManual} aria-controls="manual-meal-entry" title="Add manually"
                  disabled={busy || capturing} onClick={() => setShowManual((shown) => !shown)}>
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>
              <button className="primary ml-auto" disabled={busy || capturing || !text.trim()}>
                {busy ? "Reading…" : "Log meal"}
                <ArrowUpRight size={18} />
              </button>
            </div>
          </form>
        )}

        {!pendingLog && feedback}

        {!pendingLog && (
          <div id="manual-meal-entry" className="card mt-3" hidden={!showManual}>
            {showManual && (
              <ManualEntry busy={busy || capturing} mealType={mealType} date={date} yesterday={yesterday} onDone={() => {
                setShowManual(false);
                setStatus(`Logged to ${MEAL_LABELS[mealType]}${daySuffix} ✓`);
                router.refresh();
              }} />
            )}
          </div>
        )}

        {!pendingLog && (
          <div className="section row">
            <SavedFoodPicker foods={savedFoods} meal={mealType} date={date} yesterday={yesterday} disabled={busy || capturing} onLogged={(name) => {
              setError(null);
              setStatus(`${name} logged to ${MEAL_LABELS[mealType].toLowerCase()}${yesterday ? " yesterday" : ""}`);
              router.refresh();
            }} />
          </div>
        )}

        {pendingLog && (
          <ReviewCard
            key={pendingLog.raw + pendingLog.items.length}
            resolved={pendingLog}
            initialSlot={mealType}
            source={pendingMode}
            yesterday={yesterday}
            busy={busy}
            capturing={capturing}
            feedback={feedback}
            recording={recording}
            onVoice={startVoice}
            onPhoto={pickPhoto}
            onAttachPhoto={(path) => setPendingPhotoPath((current) => current ?? path)}
            onConfirm={confirmPending}
            onCancel={() => {
              setPendingLog(null);
              setPendingPhotoPath(undefined);
              setPendingMode("text");
              setError(null);
            }}
          />
        )}

        {!pendingLog && <MealJournal feed={feed} busy={busy} yesterday={yesterday} />}
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function CaptureButtons({ busy, capturing, recording, onVoice, onPhoto, withLabels = false }: {
  busy: boolean;
  capturing: boolean;
  recording: boolean;
  onVoice: () => void;
  onPhoto: () => void;
  withLabels?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={recording ? "Stop recording" : "Log by voice"}
        className={withLabels ? "secondary" : "icon"}
        style={recording ? { borderColor: "#e5484d", color: "#e5484d" } : undefined}
        onClick={onVoice}
        disabled={busy || (capturing && !recording)}
      >
        {recording ? <Square size={16} fill="currentColor" aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
        {withLabels && (recording ? "Stop recording" : "Voice")}
      </button>
      <button
        type="button"
        aria-label="Log from photo"
        className={withLabels ? "secondary" : "icon"}
        onClick={onPhoto}
        disabled={busy || capturing}
      >
        <Camera size={20} aria-hidden="true" />
        {withLabels && "Photo"}
      </button>
    </>
  );
}

function MealSelect({ value, onChange, disabled, label = "Meal" }: {
  value: string;
  onChange: (meal: MealType) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="row small muted min-w-0">
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
  yesterday,
  busy,
  capturing,
  feedback,
  recording,
  onVoice,
  onPhoto,
  onAttachPhoto,
  onConfirm,
  onCancel,
}: {
  resolved: ResolvedLog;
  initialSlot: MealType;
  source: "text" | CaptureMode;
  yesterday: boolean;
  busy: boolean;
  capturing: boolean;
  feedback: ReactNode;
  recording: boolean;
  onVoice: (onCapture: CaptureHandler) => Promise<void>;
  onPhoto: (onCapture: CaptureHandler) => void;
  onAttachPhoto: (path: string) => void;
  onConfirm: (edited: ResolvedLog, slot: MealType) => void;
  onCancel: () => void;
}) {
  const [slot, setSlot] = useState<MealType>(initialSlot);
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [additionError, setAdditionError] = useState<string | null>(null);
  const [raw, setRaw] = useState(resolved.raw);
  const [waterMl, setWaterMl] = useState(resolved.waterMl);
  const addOptionsId = useId();
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
    if (items.length >= MAX_REVIEW_ITEMS) return;
    setAdditionError(null);
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
        perUnit: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
        saveToMemory: true,
        updateMemory: false,
        _edited: true,
      },
    ]);
    setShowAddOptions(false);
  };

  const appendCapture: CaptureHandler = (addition, _mode, photoPath) => {
    if (items.length + addition.items.length > MAX_REVIEW_ITEMS) {
      setAdditionError(`A meal can have up to ${MAX_REVIEW_ITEMS} dishes. Remove a dish or log the rest separately.`);
      return;
    }
    const totalWater = (waterMl ?? 0) + (addition.waterMl ?? 0);
    if (totalWater > 10_000) {
      setAdditionError("Log the extra water separately. This meal already has too much water to save together.");
      return;
    }
    const newItems = addition.items.map((item) => ({
      ...item,
      id: nextItemId.current++,
      saveToMemory: true,
      updateMemory: false,
      _edited: false,
    }));
    setItems((previous) => [...previous, ...newItems]);
    setRaw((previous) => `${previous} + ${addition.raw}`.slice(0, 2000));
    setWaterMl(totalWater || undefined);
    if (photoPath) onAttachPhoto(photoPath);
    setAdditionError(null);
    setShowAddOptions(false);
  };

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, it) => {
          const t = itemTotals(it);
          return {
            kcal: acc.kcal + t.kcal,
            proteinG: acc.proteinG + t.proteinG,
            carbsG: acc.carbsG + t.carbsG,
            fatG: acc.fatG + t.fatG,
            fiberG: acc.fiberG + (t.fiberG ?? 0),
          };
        },
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
      ),
    [items],
  );

  const valid =
    items.length > 0 && items.every((it) => it.name.trim().length > 0 && it.qty > 0 && !it.estimating);
  const newCount = items.filter((i) => i.status === "new").length;

  return (
    <section className="meal-review section" aria-label="Review meal">
      <div className="row between flex-wrap">
        <h2>{{ voice: "Review recording", photo: "Review photo", text: "Review meal" }[source]}</h2>
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
                disabled={busy || capturing}
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
              <DishMacroFields macros={item.perUnit} dishNumber={idx + 1} onChange={(key, value) => setMacro(idx, key, value)} />
            </fieldset>

            {item.estimating && <p role="status" className="small green mt-2">Updating nutrition…</p>}
            {item.estimateFailed && <p role="status" className="small danger mt-2">Couldn&rsquo;t update nutrition. Check these values before saving.</p>}

            <p className="small mt-2">
              <span className="muted">Dish total</span> <strong>{fmt(t.kcal)} kcal</strong> · {fmt(t.proteinG)}g P · {fmt(t.carbsG)}g C · {fmt(t.fatG)}g F · {fmt(t.fiberG ?? 0)}g Fibre
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

      <button type="button" className="row green small min-h-11 mt-2"
        aria-expanded={showAddOptions} aria-controls={addOptionsId}
        disabled={busy || capturing || items.length >= MAX_REVIEW_ITEMS}
        onClick={() => {
          setAdditionError(null);
          setShowAddOptions((open) => !open);
        }}>
        <Plus size={16} aria-hidden="true" /> Add another item
      </button>
      <div id={addOptionsId} hidden={!showAddOptions}>
        {showAddOptions && (
          <div className="row flex-wrap mt-2">
            <CaptureButtons
              busy={busy}
              capturing={capturing}
              recording={recording}
              onVoice={() => void onVoice(appendCapture)}
              onPhoto={() => onPhoto(appendCapture)}
              withLabels
            />
            <button type="button" className="secondary" disabled={busy || capturing} onClick={addItem}>
              <Plus size={18} aria-hidden="true" /> Manual
            </button>
          </div>
        )}
      </div>
      {additionError && <p role="alert" className="small danger mt-2">{additionError}</p>}
      {feedback}

      {waterMl ? <p className="small muted mt-2">+ {waterMl} ml water</p> : null}

      <div className="row between mt-3">
        <div>
          <span className="small muted">Meal total</span>
          <p>
            <strong className="metric">{fmt(Math.round(totals.kcal))}</strong> kcal
          </p>
        </div>
        <span className="green small">
          {fmt(Math.round(totals.proteinG))}g P · {fmt(Math.round(totals.fiberG))}g fibre
          {newCount > 0 && items.some((i) => i.status === "new" && i.saveToMemory)
            ? ` · saving ${items.filter((i) => i.status === "new" && i.saveToMemory).length} new`
            : ""}
        </span>
      </div>

      <div className="row mt-4">
        <button className="secondary" onClick={onCancel} disabled={busy || capturing}>
          Cancel
        </button>
        <button className="primary flex-1" onClick={() => onConfirm({ ...resolved, raw, waterMl, mealType: slot, items }, slot)} disabled={busy || capturing || !valid}>
          {busy ? "Saving…" : `Log ${MEAL_LABELS[slot].toLowerCase()}${yesterday ? " for yesterday" : ""}`} <Check size={18} />
        </button>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/** Manual fallback — AI down must never block logging (RULES.md #13). */
function ManualEntry({ busy, mealType, date, yesterday, onDone }: { busy: boolean; mealType: MealType; date: string; yesterday: boolean; onDone: () => void }) {
  const [f, setF] = useState({ name: "", qty: "1", unit: "piece", kcal: "", proteinG: "0", carbsG: "0", fatG: "0", fiberG: "0", save: true });
  const [err, setErr] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

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
        date,
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
            perUnit: { kcal, proteinG: Number(f.proteinG) || 0, carbsG: Number(f.carbsG) || 0, fatG: Number(f.fatG) || 0, fiberG: Number(f.fiberG) || 0 },
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
          ["fiberG", "Fibre · g", f.fiberG],
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
      <button className="primary" onClick={saveEntry} disabled={busy || saving}>
        {saving ? "Saving…" : `Log ${MEAL_LABELS[mealType].toLowerCase()}${yesterday ? " for yesterday" : ""}`}
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/** Review and correct the meals for the selected day. */
function MealJournal({ feed, busy, yesterday }: { feed: FeedItem[]; busy: boolean; yesterday: boolean }) {
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
        {feed.length > 0 && <span className="chip">{Math.round(total).toLocaleString("en-IN")} kcal {yesterday ? "yesterday" : "today"}</span>}
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
                {meal.timeLabel && <time className="small muted" dateTime={meal.loggedAt}>{meal.timeLabel}</time>}
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
