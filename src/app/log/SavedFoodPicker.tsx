"use client";

import { useRef, useState, useTransition } from "react";
import { Bookmark, X } from "lucide-react";
import { quickLogAction } from "@/app/history/actions";
import { SavedFoodsList, type SavedFood } from "@/components/SavedFoodsList";
import { MEAL_LABELS, type MealType } from "@/types/food";

export function SavedFoodPicker({ foods, meal, date, yesterday, disabled, onLogged }: {
  foods: SavedFood[];
  meal: MealType;
  date: string;
  yesterday: boolean;
  disabled: boolean;
  onLogged: (name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pickerSession, setPickerSession] = useState(0);
  const [selected, setSelected] = useState<SavedFood | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!selected || pending) return;
    const food = selected;
    setError(null);
    startTransition(async () => {
      const result = await quickLogAction(food.id, meal, date);
      if (!result.ok) {
        setError(result.error ?? "Couldn’t log this food.");
        return;
      }
      dialog.current?.close();
      onLogged(food.name);
    });
  }

  return (
    <>
      <button type="button" className="secondary row flex-1 justify-center" disabled={disabled} onClick={() => {
        setPickerSession((session) => session + 1);
        setSelected(null);
        setError(null);
        dialog.current?.showModal();
      }}>
        <Bookmark size={18} aria-hidden="true" /> Add from saved foods
      </button>
      <dialog ref={dialog} className="card food-dialog" aria-labelledby="saved-picker-title" onCancel={(event) => {
        if (pending) event.preventDefault();
      }}>
        <div className="row between">
          <h2 id="saved-picker-title">{selected ? "Confirm food" : "Saved foods"}</h2>
          <button className="icon shrink-0" type="button" aria-label="Close saved foods" disabled={pending} onClick={() => dialog.current?.close()}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {selected ? (
          <div className="mt-3">
            <p>Add <strong>{selected.name}</strong> to <strong>{MEAL_LABELS[meal].toLowerCase()}</strong>{yesterday ? " for yesterday" : ""}?</p>
            <p className="small muted mt-2">{selected.servingQty} {selected.unit} · {selected.kcal} kcal</p>
            {error && <p className="small danger mt-2" role="alert">{error}</p>}
            <div className="row mt-4">
              <button type="button" className="secondary" disabled={pending} onClick={() => setSelected(null)}>Back</button>
              <button type="button" className="primary flex-1" disabled={pending} onClick={confirm}>{pending ? "Logging…" : "Confirm"}</button>
            </div>
          </div>
        ) : null}
        <div hidden={!!selected}>
          <SavedFoodsList key={pickerSession} foods={foods} onPick={setSelected} />
        </div>
      </dialog>
    </>
  );
}
