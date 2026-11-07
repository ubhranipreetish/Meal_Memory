"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { generateReviewAction } from "./actions";

export function GenerateReviewButton({ period }: { period: "weekly" | "monthly" }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return (
    <button
      className="secondary flex-1 small"
      disabled={busy}
      onClick={() => startTransition(async () => { await generateReviewAction(period); router.refresh(); })}
    >
      {busy ? "…" : `Generate ${period}`}
    </button>
  );
}
