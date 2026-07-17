"use client";

import { useMemo, useState, useTransition } from "react";
import { calcTargets } from "@/lib/services/targets";
import {
  ACTIVITY_LABELS,
  ACTIVITY_LEVELS,
  BUDGET_LEVELS,
  DIET_TYPES,
  GOAL_LABELS,
  GOALS,
  GYM_EXPERIENCE,
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
  gymExperience: string;
  dietType: string;
  allergies: string;
  foodsAvoided: string;
  budgetLevel: string;
};

const initial: Form = {
  name: "",
  age: "",
  gender: "male",
  heightCm: "",
  weightKg: "",
  goal: "build_muscle",
  activityLevel: "moderate",
  gymExperience: "",
  dietType: "",
  allergies: "",
  foodsAvoided: "",
  budgetLevel: "",
};

const STEPS = ["Basics", "Goal & activity", "Preferences", "Your targets"];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initial);
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

  function submit() {
    setError(null);
    const payload = {
      name: form.name,
      age: form.age,
      gender: form.gender,
      heightCm: form.heightCm,
      weightKg: form.weightKg,
      goal: form.goal,
      activityLevel: form.activityLevel,
      gymExperience: form.gymExperience || undefined,
      dietType: form.dietType || undefined,
      allergies: form.allergies ? form.allergies.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      foodsAvoided: form.foodsAvoided ? form.foodsAvoided.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      budgetLevel: form.budgetLevel || undefined,
    };
    const parsed = onboardingSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your entries");
      return;
    }
    startTransition(async () => {
      const res = await saveProfile(payload);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-5 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Let&apos;s set up your plan</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </p>
        <div className="mt-3 flex gap-1">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded ${i <= step ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-800"}`} />
          ))}
        </div>
      </header>

      {step === 0 && (
        <section className="flex flex-col gap-4">
          <Field label="Name">
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Age"><input type="number" className={inputCls} value={form.age} onChange={(e) => set("age", e.target.value)} /></Field>
            <Field label="Gender">
              <select className={inputCls} value={form.gender} onChange={(e) => set("gender", e.target.value as Form["gender"])}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Height (cm)"><input type="number" className={inputCls} value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} /></Field>
            <Field label="Weight (kg)"><input type="number" className={inputCls} value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} /></Field>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <Field label="Goal">
            <select className={inputCls} value={form.goal} onChange={(e) => set("goal", e.target.value as Form["goal"])}>
              {GOALS.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
            </select>
          </Field>
          <Field label="Activity level">
            <select className={inputCls} value={form.activityLevel} onChange={(e) => set("activityLevel", e.target.value as Form["activityLevel"])}>
              {ACTIVITY_LEVELS.map((a) => <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>)}
            </select>
          </Field>
          <Field label="Gym experience">
            <select className={inputCls} value={form.gymExperience} onChange={(e) => set("gymExperience", e.target.value)}>
              <option value="">Prefer not to say</option>
              {GYM_EXPERIENCE.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <Field label="Diet">
            <select className={inputCls} value={form.dietType} onChange={(e) => set("dietType", e.target.value)}>
              <option value="">No preference</option>
              {DIET_TYPES.map((d) => <option key={d} value={d}>{d.replace("_", "-")}</option>)}
            </select>
          </Field>
          <Field label="Allergies (comma-separated)"><input className={inputCls} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="peanuts, shellfish" /></Field>
          <Field label="Foods you avoid (comma-separated)"><input className={inputCls} value={form.foodsAvoided} onChange={(e) => set("foodsAvoided", e.target.value)} placeholder="beef" /></Field>
          <Field label="Budget">
            <select className={inputCls} value={form.budgetLevel} onChange={(e) => set("budgetLevel", e.target.value)}>
              <option value="">No preference</option>
              {BUDGET_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-neutral-500">Based on your details, here are your daily targets. You can tweak everything later in Settings.</p>
          {preview ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Calories" value={`${preview.kcal} kcal`} />
              <Stat label="Protein" value={`${preview.proteinG} g`} />
              <Stat label="Carbs" value={`${preview.carbsG} g`} />
              <Stat label="Fat" value={`${preview.fatG} g`} />
              <Stat label="Water" value={`${preview.waterMl} ml`} />
              <Stat label="Steps" value={`${preview.steps.toLocaleString()}`} />
            </div>
          ) : (
            <p className="text-sm text-red-500">Please fill in age, height and weight in step 1.</p>
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="mt-auto flex justify-between gap-3 pt-4">
        <button className={btnGhost} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button className={btnPrimary} onClick={() => setStep((s) => s + 1)}>Next</button>
        ) : (
          <button className={btnPrimary} onClick={submit} disabled={pending || !preview}>
            {pending ? "Saving…" : "Save & finish"}
          </button>
        )}
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700";
const btnPrimary = "rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50";
const btnGhost = "rounded-lg px-5 py-2 text-sm font-medium text-neutral-600 disabled:opacity-40 dark:text-neutral-300";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
