"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { finishSessionAction, logSetAction, startSessionAction } from "./actions";

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
}

interface ActiveSet {
  id?: string;
  exerciseId: string | null;
  exerciseName: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  isPr: boolean;
}

interface ActiveSession {
  id: string;
  startedAt: string;
  sets: ActiveSet[];
}

interface RecentSession {
  id: string;
  startedAt: string;
  setCount: number;
  volume: number;
  prs: number;
  exerciseCount: number;
}

const REST_SECONDS = 90;

export function WorkoutClient({
  exercises,
  active: initialActive,
  recent,
}: {
  exercises: Exercise[];
  active: ActiveSession | null;
  recent: RecentSession[];
}) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveSession | null>(initialActive);
  const [busy, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      const r = await startSessionAction();
      if (r.ok && r.sessionId) {
        setActive({ id: r.sessionId, startedAt: new Date().toISOString(), sets: [] });
      }
    });
  }

  function finish() {
    if (!active) return;
    startTransition(async () => {
      await finishSessionAction(active.id);
      setActive(null);
      router.refresh();
    });
  }

  return (
    <div className="spaced">
      {!active ? (
        <button
          className="primary w-full"
          onClick={start}
          disabled={busy}
        >
          ▶ Start workout
        </button>
      ) : (
        <ActiveSessionPanel
          session={active}
          exercises={exercises}
          onSetLogged={(s) => setActive((a) => (a ? { ...a, sets: [...a.sets, s] } : a))}
          onFinish={finish}
          busy={busy}
        />
      )}

      <section>
        <h2>Recent sessions</h2>
        {recent.length === 0 && <p className="small muted">No workouts yet.</p>}
        <div className="flex flex-col gap-2">
          {recent.map((s) => (
            <div key={s.id} className="meal">
              <div className="row between">
                <span className="font-medium">
                  {new Date(s.startedAt).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
                </span>
                {s.prs > 0 && <span className="text-amber-500">🏆 {s.prs} PR{s.prs > 1 ? "s" : ""}</span>}
              </div>
              <p className="small muted">
                {s.exerciseCount} exercises · {s.setCount} sets · {s.volume.toLocaleString()} kg volume
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ActiveSessionPanel({
  session,
  exercises,
  onSetLogged,
  onFinish,
  busy,
}: {
  session: ActiveSession;
  exercises: Exercise[];
  onSetLogged: (s: ActiveSet) => void;
  onFinish: () => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [prFlash, setPrFlash] = useState<string | null>(null);
  const [rest, setRest] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return exercises.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, exercises]);

  // rest countdown
  useEffect(() => {
    if (rest == null) return;
    restRef.current = setInterval(() => {
      setRest((r) => {
        if (r == null || r <= 1) {
          if (restRef.current) clearInterval(restRef.current);
          return null;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (restRef.current) clearInterval(restRef.current);
    };
  }, [rest != null]); // eslint-disable-line react-hooks/exhaustive-deps

  const setsForSelected = session.sets.filter((s) => s.exerciseId === selected?.id);
  const nextSetNumber = setsForSelected.length + 1;

  function addSet() {
    if (!selected) return;
    const w = Number(weight);
    const r = Number(reps);
    if (!isFinite(w) || w < 0 || !Number.isInteger(r) || r <= 0) return;
    startTransition(async () => {
      const res = await logSetAction({
        sessionId: session.id,
        exerciseId: selected.id,
        setNumber: nextSetNumber,
        weightKg: w,
        reps: r,
      });
      if (res.ok) {
        onSetLogged({
          exerciseId: selected.id,
          exerciseName: selected.name,
          setNumber: nextSetNumber,
          weightKg: w,
          reps: r,
          isPr: !!res.isPr,
        });
        if (res.isPr) {
          setPrFlash(`🏆 PR on ${selected.name}!`);
          setTimeout(() => setPrFlash(null), 4000);
        }
        setRest(REST_SECONDS);
      }
    });
  }

  // group logged sets by exercise for display
  const grouped = session.sets.reduce<Record<string, ActiveSet[]>>((acc, s) => {
    (acc[s.exerciseName] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="card">
      <div className="row between">
        <h2 className="text-sm font-semibold">Session in progress</h2>
        <span className="small muted">
          started {new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {prFlash && <p className="mt-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-600">{prFlash}</p>}
      {rest != null && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-neutral-900/5 px-3 py-2 text-sm dark:bg-white/5">
          <span>Rest: <span className="font-semibold tabular-nums">{Math.floor(rest / 60)}:{String(rest % 60).padStart(2, "0")}</span></span>
          <button className="green small" onClick={() => setRest(null)}>skip</button>
        </div>
      )}

      {/* exercise picker */}
      <div className="mt-3">
        {selected ? (
          <div className="row between field">
            <span className="font-medium">{selected.name}</span>
            <button className="green small" onClick={() => { setSelected(null); setQuery(""); }}>
              change
            </button>
          </div>
        ) : (
          <>
            <input
              className="field"
              placeholder="Search exercise… (e.g. bench press)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {matches.length > 0 && (
              <ul className="mt-1">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      className="row between small meal" style={{ width: "100%" }}
                      onClick={() => { setSelected(m); setQuery(""); }}
                    >
                      <span>{m.name}</span>
                      <span className="text-xs capitalize text-neutral-400">{m.muscleGroup}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* set entry */}
      {selected && (
        <div className="mt-3 flex items-end gap-2">
          <label className="small muted flex-1">
            Weight (kg)
            <input
              type="number" step="any" inputMode="decimal"
              className="field"
              value={weight} onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label className="small muted flex-1">
            Reps
            <input
              type="number" inputMode="numeric"
              className="field"
              value={reps} onChange={(e) => setReps(e.target.value)}
            />
          </label>
          <button
            className="primary"
            onClick={addSet}
            disabled={busy || !weight || !reps}
          >
            Set {nextSetNumber} ✓
          </button>
        </div>
      )}

      {/* logged sets */}
      {Object.keys(grouped).length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {Object.entries(grouped).map(([name, sets]) => (
            <div key={name}>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{name}</h3>
                {sets[0].exerciseId && (
                  <Link href={`/workout/exercise/${sets[0].exerciseId}`} className="green small">
                    history
                  </Link>
                )}
              </div>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-neutral-600 dark:text-neutral-300">
                {sets.map((s, i) => (
                  <li key={i} className="row between">
                    <span>Set {s.setNumber}: {s.weightKg} kg × {s.reps}</span>
                    {s.isPr && <span className="text-amber-500">🏆 PR</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <button
        className="mt-4 w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
        onClick={onFinish}
        disabled={busy}
      >
        Finish workout
      </button>
    </div>
  );
}
