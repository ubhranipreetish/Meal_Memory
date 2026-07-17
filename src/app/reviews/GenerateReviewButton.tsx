"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { generateReviewAction } from "./actions";

export function GenerateReviewButton({ period }: { period: "weekly" | "monthly" }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return (
    <button
      className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-600 disabled:opacity-50"
      disabled={busy}
      onClick={() => startTransition(async () => { await generateReviewAction(period); router.refresh(); })}
    >
      {busy ? "…" : `Generate ${period}`}
    </button>
  );
}
