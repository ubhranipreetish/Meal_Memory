"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { relogAction } from "./actions";

/** One-tap re-log of a past meal (Sprint 2 benchmark: ≤2 taps). */
export function RelogButton({ mealLogId }: { mealLogId: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="secondary small"
      disabled={pending || done}
      onClick={() =>
        startTransition(async () => {
          const r = await relogAction(mealLogId);
          if (r.ok) {
            setDone(true);
            router.refresh();
            setTimeout(() => setDone(false), 2500);
          }
        })
      }
    >
      {done ? "Logged again ✓" : pending ? "…" : "↻ Log again"}
    </button>
  );
}
