"use client";

import { useState, useTransition } from "react";
import { Pencil, RotateCcw, Check } from "lucide-react";
import { GOAL_LABELS, GOALS } from "@/types/profile";
import { calcTargets, type Targets, type Goal, type Gender, type ActivityLevel } from "@/lib/services/targets";
import { updateGoalsAndTargetsAction } from "./actions";

interface GoalsAndTargetsEditorProps {
  initialGoal: Goal;
  initialTargets: Targets;
  gender?: Gender | null;
  dob?: string | null;
  heightCm?: string | null;
  weightKg?: string | null;
  activityLevel?: ActivityLevel | null;
}

export function GoalsAndTargetsEditor({
  initialGoal,
  initialTargets,
  gender,
  dob,
  heightCm,
  weightKg,
  activityLevel,
}: GoalsAndTargetsEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [goal, setGoal] = useState<Goal>(initialGoal);
  const defaultFiber = initialTargets.fiberG ?? Math.max(25, Math.round((initialTargets.kcal / 1000) * 14));
  const [kcal, setKcal] = useState(String(initialTargets.kcal));
  const [proteinG, setProteinG] = useState(String(initialTargets.proteinG));
  const [carbsG, setCarbsG] = useState(String(initialTargets.carbsG));
  const [fatG, setFatG] = useState(String(initialTargets.fatG));
  const [fiberG, setFiberG] = useState(String(defaultFiber));
  const [waterMl, setWaterMl] = useState(String(initialTargets.waterMl));
  const [steps, setSteps] = useState(String(initialTargets.steps ?? 8000));

  const [savedGoal, setSavedGoal] = useState<Goal>(initialGoal);
  const [savedTargets, setSavedTargets] = useState<Targets>({ ...initialTargets, fiberG: defaultFiber });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCancel() {
    setError(null);
    setGoal(savedGoal);
    setKcal(String(savedTargets.kcal));
    setProteinG(String(savedTargets.proteinG));
    setCarbsG(String(savedTargets.carbsG));
    setFatG(String(savedTargets.fatG));
    setFiberG(String(savedTargets.fiberG ?? defaultFiber));
    setWaterMl(String(savedTargets.waterMl));
    setSteps(String(savedTargets.steps ?? 8000));
    setIsEditing(false);
  }

  function handleRecalculate() {
    const age = dob ? new Date().getFullYear() - new Date(dob).getFullYear() : 25;
    const h = heightCm ? Number(heightCm) : 170;
    const w = weightKg ? Number(weightKg) : 70;
    const g = gender === "female" ? "female" : "male";
    const act = activityLevel ?? "moderate";

    const computed = calcTargets({
      gender: g,
      age: Math.max(13, Math.min(100, age)),
      heightCm: Math.max(100, Math.min(250, h)),
      weightKg: Math.max(30, Math.min(300, w)),
      activityLevel: act,
      goal,
    });

    setKcal(String(computed.kcal));
    setProteinG(String(computed.proteinG));
    setCarbsG(String(computed.carbsG));
    setFatG(String(computed.fatG));
    setFiberG(String(computed.fiberG));
    setWaterMl(String(computed.waterMl));
    setSteps(String(computed.steps));
    setError(null);
  }

  function handleSave() {
    setError(null);
    setSuccess(null);

    const k = Number(kcal);
    const p = Number(proteinG);
    const c = Number(carbsG);
    const f = Number(fatG);
    const fib = Number(fiberG);
    const w = Number(waterMl);
    const s = Number(steps);

    if (!k || k < 500 || k > 10000) {
      setError("Calories must be between 500 and 10,000");
      return;
    }
    if (isNaN(p) || p < 0 || p > 1000) {
      setError("Protein must be between 0 and 1,000 g");
      return;
    }
    if (isNaN(c) || c < 0 || c > 1500) {
      setError("Carbs must be between 0 and 1,500 g");
      return;
    }
    if (isNaN(f) || f < 0 || f > 500) {
      setError("Fat must be between 0 and 500 g");
      return;
    }
    if (isNaN(fib) || fib < 0 || fib > 200) {
      setError("Fibre must be between 0 and 200 g");
      return;
    }
    if (!w || w < 500 || w > 15000) {
      setError("Water target must be between 500 and 15,000 ml");
      return;
    }

    startTransition(async () => {
      const res = await updateGoalsAndTargetsAction({
        goal,
        targets: {
          kcal: Math.round(k),
          proteinG: Math.round(p),
          carbsG: Math.round(c),
          fatG: Math.round(f),
          fiberG: Math.round(fib),
          waterMl: Math.round(w),
          steps: isNaN(s) || s < 1000 ? 8000 : Math.round(s),
        },
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to save targets");
      } else {
        setSavedGoal(goal);
        setSavedTargets({
          ...savedTargets,
          kcal: Math.round(k),
          proteinG: Math.round(p),
          carbsG: Math.round(c),
          fatG: Math.round(f),
          fiberG: Math.round(fib),
          waterMl: Math.round(w),
          steps: isNaN(s) || s < 1000 ? 8000 : Math.round(s),
        });
        setSuccess("Goals and daily targets updated successfully.");
        setIsEditing(false);
      }
    });
  }

  return (
    <section className="card section">
      <div className="row between items-center">
        <h2>Goals &amp; daily targets</h2>
        {!isEditing && (
          <button
            type="button"
            className="secondary small row items-center gap-1"
            onClick={() => {
              setIsEditing(true);
              setSuccess(null);
            }}
            style={{ minHeight: 36, padding: "6px 14px" }}
          >
            <Pencil size={14} aria-hidden="true" /> Edit
          </button>
        )}
      </div>

      {success && (
        <p className="small green row items-center gap-1 mt-3" role="status">
          <Check size={16} aria-hidden="true" /> {success}
        </p>
      )}

      {error && (
        <p className="small danger mt-3" role="alert">
          {error}
        </p>
      )}

      {!isEditing ? (
        <div className="mt-3">
          <div className="row between small" style={{ padding: "9px 0", borderBottom: "1px solid var(--pg-border)" }}>
            <span className="muted">Primary goal</span>
            <span className="font-semibold">{GOAL_LABELS[savedGoal]}</span>
          </div>

          <div className="grid2 mt-3">
            <StatCard label="Calories" value={`${savedTargets.kcal} kcal`} />
            <StatCard label="Protein" value={`${savedTargets.proteinG} g`} />
            <StatCard label="Carbs" value={`${savedTargets.carbsG} g`} />
            <StatCard label="Fat" value={`${savedTargets.fatG} g`} />
            <StatCard label="Water" value={`${savedTargets.waterMl} ml`} />
            <StatCard label="Fibre" value={`${savedTargets.fiberG ?? 30} g`} />
          </div>
        </div>
      ) : (
        <div className="mt-4 spaced">
          <label className="small muted">
            Primary goal
            <select
              className="field mt-1"
              value={goal}
              onChange={(e) => setGoal(e.target.value as Goal)}
            >
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABELS[g]}
                </option>
              ))}
            </select>
          </label>

          <div className="row between items-center mt-2">
            <p className="eyebrow muted">DAILY TARGET VALUES</p>
            <button
              type="button"
              className="secondary small row items-center gap-1"
              onClick={handleRecalculate}
              style={{ minHeight: 30, padding: "3px 10px", fontSize: "12px" }}
              title="Recalculate targets using your saved age, height, weight, and selected goal"
            >
              <RotateCcw size={12} aria-hidden="true" /> Recalculate from stats
            </button>
          </div>

          <div className="grid2">
            <TargetInput
              id="settings-kcal"
              label="Calories"
              unit="kcal"
              value={kcal}
              onChange={setKcal}
            />
            <TargetInput
              id="settings-protein"
              label="Protein"
              unit="g"
              value={proteinG}
              onChange={setProteinG}
            />
            <TargetInput
              id="settings-carbs"
              label="Carbs"
              unit="g"
              value={carbsG}
              onChange={setCarbsG}
            />
            <TargetInput
              id="settings-fat"
              label="Fat"
              unit="g"
              value={fatG}
              onChange={setFatG}
            />
            <TargetInput
              id="settings-water"
              label="Water"
              unit="ml"
              value={waterMl}
              onChange={setWaterMl}
            />
            <TargetInput
              id="settings-fiber"
              label="Fibre"
              unit="g"
              value={fiberG}
              onChange={setFiberG}
            />
          </div>

          <div className="row mt-4">
            <button
              type="button"
              className="secondary flex-1"
              onClick={handleCancel}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary flex-1"
              onClick={handleSave}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save targets"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: "14px" }}>
      <p className="small muted">{label}</p>
      <p className="metric mt-1" style={{ fontSize: "22px" }}>
        {value}
      </p>
    </div>
  );
}

function TargetInput({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="card" style={{ padding: "12px" }}>
      <div className="row between">
        <label htmlFor={id} className="small muted">
          {label}
        </label>
        <span className="small muted">{unit}</span>
      </div>
      <input
        id={id}
        type="number"
        className="field mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
