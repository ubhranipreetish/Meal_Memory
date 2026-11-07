"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { calcTargets, suggestGoal } from "@/lib/services/targets";
import {
  ACTIVITY_LABELS,
  ACTIVITY_LEVELS,
  DIET_LABELS,
  DIET_TYPES,
  GOAL_LABELS,
  GOALS,
  onboardingSchema,
} from "@/types/profile";
import { saveProfile } from "./actions";

type Form = {
  name: string;
  age: string;
  gender: "male" | "female";
  heightCm: string;
  weightKg: string;
  goal: (typeof GOALS)[number];
  activityLevel: (typeof ACTIVITY_LEVELS)[number];
  dietType: string;
  allergies: string;
  foodsAvoided: string;
};

const initial: Form = {
  name: "",
  age: "",
  gender: "male",
  heightCm: "",
  weightKg: "",
  goal: "build_muscle",
  activityLevel: "moderate",
  dietType: "",
  allergies: "",
  foodsAvoided: "",
};

const basicsSchema = onboardingSchema.pick({ name: true, age: true, gender: true, heightCm: true, weightKg: true });
const STEPS = ["About you", "Goals & diet", "Your daily targets"];

export function OnboardingForm({ previewOnly = false, fromSettings = false }: { previewOnly?: boolean; fromSettings?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initial);
  // once the user picks a goal themselves we stop auto-suggesting
  const [goalTouched, setGoalTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const preview = useMemo(() => {
    const age = Number(form.age);
    const heightCm = Number(form.heightCm);
    const weightKg = Number(form.weightKg);
    if (!age || !heightCm || !weightKg) return null;
    return calcTargets({ gender: form.gender, age, heightCm, weightKg, activityLevel: form.activityLevel, goal: form.goal });
  }, [form]);

  // Dynamic goal suggestion from age/gender/height/weight (recomputed live).
  const suggestion = useMemo(() => {
    const age = Number(form.age);
    const heightCm = Number(form.heightCm);
    const weightKg = Number(form.weightKg);
    if (!age || !heightCm || !weightKg) return null;
    return suggestGoal({ gender: form.gender, age, heightCm, weightKg });
  }, [form.age, form.gender, form.heightCm, form.weightKg]);

  /** Can the user leave the current step? (required fields per step) */
  const canAdvance =
    step === 0
      ? !!form.name.trim() && !!suggestion
      : step === 1
        ? !!form.dietType
        : true;

  /** Advance a step; entering "Goal" pre-selects the suggestion unless the user already chose. */
  function next() {
    if (step === 0) {
      const basics = basicsSchema.safeParse(form);
      if (!basics.success) {
        setError(basics.error.issues[0]?.message ?? "Check your age, height and weight.");
        return;
      }
      if (suggestion && !goalTouched) set("goal", suggestion.goal);
    }
    changeStep(step + 1);
  }

  function changeStep(nextStep: number) {
    setError(null);
    setStep(nextStep);
    window.scrollTo(0, 0);
  }

  function submit() {
    setError(null);
    const payload = {
      name: form.name.trim(),
      age: form.age,
      gender: form.gender,
      heightCm: form.heightCm,
      weightKg: form.weightKg,
      goal: form.goal,
      activityLevel: form.activityLevel,
      dietType: form.dietType || undefined,
      allergies: form.allergies ? form.allergies.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      foodsAvoided: form.foodsAvoided ? form.foodsAvoided.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    };
    const parsed = onboardingSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your entries");
      return;
    }
    if (previewOnly) {
      router.push("/preview/home");
      return;
    }
    startTransition(async () => {
      const res = await saveProfile(payload);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <main className="app app-backdrop onboarding">
      <header>
        <div className="row onboarding-brand">
          <Brand />
        </div>
        {fromSettings && step === 0 && (
          <Link href="/settings" className="green small mb-3 inline-flex min-h-11 items-center gap-2">
            <ArrowLeft size={16} aria-hidden="true" /> Back to Profile
          </Link>
        )}
        <p className="eyebrow green">
          STEP {step + 1} OF {STEPS.length}
        </p>
        <h1 className="mt-3">{STEPS[step]}</h1>
        <div className="row mt-4" style={{ gap: 6 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 9,
                background: i <= step ? "var(--pg-primary)" : "var(--pg-muted)",
              }}
            />
          ))}
        </div>
      </header>

      {step === 0 && (
        <section className="section spaced">
          <Field label="Name">
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" autoComplete="name" />
          </Field>
          <div className="grid2">
            <Field label="Age"><input type="number" className={inputCls} value={form.age} onChange={(e) => set("age", e.target.value)} /></Field>
            <Field label="Gender">
              <select className={inputCls} value={form.gender} onChange={(e) => set("gender", e.target.value as Form["gender"])}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
          </div>
          <div className="grid2">
            <Field label="Height (cm)"><input type="number" className={inputCls} value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} /></Field>
            <Field label="Weight (kg)"><input type="number" className={inputCls} value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} /></Field>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="section spaced">
          <Field label="Goal">
            <select
              className={inputCls}
              value={form.goal}
              onChange={(e) => { setGoalTouched(true); set("goal", e.target.value as Form["goal"]); }}
            >
              {GOALS.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
            </select>
          </Field>
          {suggestion && !goalTouched && (
            <p className="small muted">{suggestion.reason}</p>
          )}
          <Field label="Activity level">
            <select className={inputCls} value={form.activityLevel} onChange={(e) => set("activityLevel", e.target.value as Form["activityLevel"])}>
              {ACTIVITY_LEVELS.map((a) => <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>)}
            </select>
          </Field>
          <Field label="Diet">
            <select className={inputCls} value={form.dietType} onChange={(e) => set("dietType", e.target.value)}>
              <option value="" disabled>Select your diet…</option>
              {DIET_TYPES.map((d) => <option key={d} value={d}>{DIET_LABELS[d]}</option>)}
            </select>
          </Field>
          <details>
            <summary className="green small">Allergies and foods you avoid (optional)</summary>
            <div className="spaced mt-2">
              <Field label="Allergies (comma-separated)"><input className={inputCls} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="peanuts, shellfish" /></Field>
              <Field label="Foods you avoid (comma-separated)"><input className={inputCls} value={form.foodsAvoided} onChange={(e) => set("foodsAvoided", e.target.value)} placeholder="beef" /></Field>
            </div>
          </details>
        </section>
      )}

      {step === 2 && (
        <section className="section spaced">
          <p className="small muted">Based on your details, here are your daily targets. You can tweak everything later in Profile.</p>
          {preview ? (
            <div className="grid2">
              <Stat label="Calories" value={`${preview.kcal} kcal`} />
              <Stat label="Protein" value={`${preview.proteinG} g`} />
              <Stat label="Carbs" value={`${preview.carbsG} g`} />
              <Stat label="Fat" value={`${preview.fatG} g`} />
              <Stat label="Water" value={`${preview.waterMl} ml`} />
            </div>
          ) : (
            <p className="small danger">Please fill in age, height and weight in step 1.</p>
          )}
        </section>
      )}

      {error && <p className="small danger mt-3" role="alert">{error}</p>}

      <div className="row mt-4">
        {step > 0 && (
          <button className="secondary" onClick={() => changeStep(step - 1)} disabled={pending}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button className="primary flex-1" onClick={next} disabled={!canAdvance} style={{ opacity: canAdvance ? 1 : 0.4 }}>
            Continue
          </button>
        ) : (
          <button className="primary flex-1" onClick={submit} disabled={pending || !preview} style={{ opacity: pending || !preview ? 0.4 : 1 }}>
            {pending ? "Saving…" : previewOnly ? "Finish preview" : "Save & finish"}
          </button>
        )}
      </div>
    </main>
  );
}

const inputCls = "field mt-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="small muted">
      {label}
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="small muted">{label}</p>
      <p className="metric">{value}</p>
    </div>
  );
}
