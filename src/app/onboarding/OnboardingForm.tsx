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

export interface InitialProfileData {
  name?: string | null;
  dob?: string | null;
  gender?: string | null;
  heightCm?: string | null;
  currentWeightKg?: string | null;
  goal?: string | null;
  activityLevel?: string | null;
  dietType?: string | null;
  targets?: {
    kcal?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    fiberG?: number;
    waterMl?: number;
    steps?: number;
  } | null;
}

type Form = {
  name: string;
  age: string;
  gender: "male" | "female";
  heightCm: string;
  weightKg: string;
  goal: (typeof GOALS)[number];
  activityLevel: (typeof ACTIVITY_LEVELS)[number];
  dietType: string;
};

type TargetKeys = "kcal" | "proteinG" | "carbsG" | "fatG" | "fiberG" | "waterMl" | "steps";

const basicsSchema = onboardingSchema.pick({ name: true, age: true, gender: true, heightCm: true, weightKg: true });
const STEPS = ["About you", "Goals & diet", "Your daily targets"];

export function OnboardingForm({
  previewOnly = false,
  fromSettings = false,
  initialProfile,
}: {
  previewOnly?: boolean;
  fromSettings?: boolean;
  initialProfile?: InitialProfileData | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const initialAge = initialProfile?.dob
    ? String(new Date().getFullYear() - new Date(initialProfile.dob).getFullYear())
    : "";

  const [form, setForm] = useState<Form>(() => ({
    name: initialProfile?.name ?? "",
    age: initialAge,
    gender: (initialProfile?.gender as Form["gender"]) ?? "male",
    heightCm: initialProfile?.heightCm ? String(Math.round(Number(initialProfile.heightCm))) : "",
    weightKg: initialProfile?.currentWeightKg ? String(Math.round(Number(initialProfile.currentWeightKg))) : "",
    goal: (initialProfile?.goal as Form["goal"]) ?? "build_muscle",
    activityLevel: (initialProfile?.activityLevel as Form["activityLevel"]) ?? "moderate",
    dietType: initialProfile?.dietType ?? "",
  }));

  const [customTargets, setCustomTargets] = useState<Partial<Record<TargetKeys, string>>>(() => {
    if (initialProfile?.targets) {
      return {
        kcal: initialProfile.targets.kcal != null ? String(initialProfile.targets.kcal) : undefined,
        proteinG: initialProfile.targets.proteinG != null ? String(initialProfile.targets.proteinG) : undefined,
        carbsG: initialProfile.targets.carbsG != null ? String(initialProfile.targets.carbsG) : undefined,
        fatG: initialProfile.targets.fatG != null ? String(initialProfile.targets.fatG) : undefined,
        fiberG: initialProfile.targets.fiberG != null ? String(initialProfile.targets.fiberG) : undefined,
        waterMl: initialProfile.targets.waterMl != null ? String(initialProfile.targets.waterMl) : undefined,
        steps: initialProfile.targets.steps != null ? String(initialProfile.targets.steps) : undefined,
      };
    }
    return {};
  });

  // once the user picks a goal themselves we stop auto-suggesting
  const [goalTouched, setGoalTouched] = useState(() => Boolean(initialProfile?.goal));
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

  const hasCustomTargets = useMemo(() => {
    return Object.keys(customTargets).some(
      (k) => customTargets[k as TargetKeys] !== undefined && customTargets[k as TargetKeys] !== ""
    );
  }, [customTargets]);

  function updateCustomTarget(key: TargetKeys, val: string) {
    setCustomTargets((prev) => ({ ...prev, [key]: val }));
  }

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

    const targetPayload = preview
      ? {
          kcal: customTargets.kcal !== undefined && customTargets.kcal !== "" ? Number(customTargets.kcal) : preview.kcal,
          proteinG: customTargets.proteinG !== undefined && customTargets.proteinG !== "" ? Number(customTargets.proteinG) : preview.proteinG,
          carbsG: customTargets.carbsG !== undefined && customTargets.carbsG !== "" ? Number(customTargets.carbsG) : preview.carbsG,
          fatG: customTargets.fatG !== undefined && customTargets.fatG !== "" ? Number(customTargets.fatG) : preview.fatG,
          fiberG: customTargets.fiberG !== undefined && customTargets.fiberG !== "" ? Number(customTargets.fiberG) : preview.fiberG,
          waterMl: customTargets.waterMl !== undefined && customTargets.waterMl !== "" ? Number(customTargets.waterMl) : preview.waterMl,
          steps: customTargets.steps !== undefined && customTargets.steps !== "" ? Number(customTargets.steps) : preview.steps,
        }
      : undefined;

    const payload = {
      name: form.name.trim(),
      age: form.age,
      gender: form.gender,
      heightCm: form.heightCm,
      weightKg: form.weightKg,
      goal: form.goal,
      activityLevel: form.activityLevel,
      dietType: form.dietType || undefined,
      customTargets: hasCustomTargets ? targetPayload : undefined,
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
        </section>
      )}

      {step === 2 && (
        <section className="section spaced">
          <div className="row between items-center">
            <p className="small muted">
              {hasCustomTargets
                ? "Custom targets active. You can edit any value or reset."
                : "Calculated from your age, weight, and goal. You can edit any target below:"}
            </p>
            {hasCustomTargets && (
              <button
                type="button"
                className="secondary small"
                onClick={() => setCustomTargets({})}
                style={{ minHeight: 32, padding: "4px 10px", fontSize: "13px" }}
              >
                ↺ Reset to calculated
              </button>
            )}
          </div>

          <Field label="Goal">
            <select
              className={inputCls}
              value={form.goal}
              onChange={(e) => {
                setGoalTouched(true);
                set("goal", e.target.value as Form["goal"]);
              }}
            >
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>

          {preview ? (
            <div className="grid2">
              <div className="card">
                <div className="row between">
                  <label className="small muted" htmlFor="ob-kcal">
                    Calories
                  </label>
                  <span className="small muted">kcal</span>
                </div>
                <input
                  id="ob-kcal"
                  type="number"
                  className={inputCls}
                  value={customTargets.kcal !== undefined ? customTargets.kcal : preview.kcal}
                  onChange={(e) => updateCustomTarget("kcal", e.target.value)}
                  placeholder={String(preview.kcal)}
                />
              </div>

              <div className="card">
                <div className="row between">
                  <label className="small muted" htmlFor="ob-protein">
                    Protein
                  </label>
                  <span className="small muted">g</span>
                </div>
                <input
                  id="ob-protein"
                  type="number"
                  className={inputCls}
                  value={customTargets.proteinG !== undefined ? customTargets.proteinG : preview.proteinG}
                  onChange={(e) => updateCustomTarget("proteinG", e.target.value)}
                  placeholder={String(preview.proteinG)}
                />
              </div>

              <div className="card">
                <div className="row between">
                  <label className="small muted" htmlFor="ob-carbs">
                    Carbs
                  </label>
                  <span className="small muted">g</span>
                </div>
                <input
                  id="ob-carbs"
                  type="number"
                  className={inputCls}
                  value={customTargets.carbsG !== undefined ? customTargets.carbsG : preview.carbsG}
                  onChange={(e) => updateCustomTarget("carbsG", e.target.value)}
                  placeholder={String(preview.carbsG)}
                />
              </div>

              <div className="card">
                <div className="row between">
                  <label className="small muted" htmlFor="ob-fat">
                    Fat
                  </label>
                  <span className="small muted">g</span>
                </div>
                <input
                  id="ob-fat"
                  type="number"
                  className={inputCls}
                  value={customTargets.fatG !== undefined ? customTargets.fatG : preview.fatG}
                  onChange={(e) => updateCustomTarget("fatG", e.target.value)}
                  placeholder={String(preview.fatG)}
                />
              </div>

              <div className="card">
                <div className="row between">
                  <label className="small muted" htmlFor="ob-water">
                    Water
                  </label>
                  <span className="small muted">ml</span>
                </div>
                <input
                  id="ob-water"
                  type="number"
                  className={inputCls}
                  value={customTargets.waterMl !== undefined ? customTargets.waterMl : preview.waterMl}
                  onChange={(e) => updateCustomTarget("waterMl", e.target.value)}
                  placeholder={String(preview.waterMl)}
                />
              </div>

              <div className="card">
                <div className="row between">
                  <label className="small muted" htmlFor="ob-fiber">
                    Fibre
                  </label>
                  <span className="small muted">g</span>
                </div>
                <input
                  id="ob-fiber"
                  type="number"
                  className={inputCls}
                  value={customTargets.fiberG !== undefined ? customTargets.fiberG : preview.fiberG}
                  onChange={(e) => updateCustomTarget("fiberG", e.target.value)}
                  placeholder={String(preview.fiberG)}
                />
              </div>
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
