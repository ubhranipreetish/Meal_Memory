"use client";

import { useState, useTransition } from "react";
import type { ChatTurn } from "@/lib/ai/coach";
import { chatAction, regenerateBriefAction } from "./actions";

export function CoachClient({ initialBrief }: { initialBrief: string | null }) {
  const [brief, setBrief] = useState(initialBrief);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function send(e: React.FormEvent) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;
    setError(null);
    setTurns((t) => [...t, { role: "user", text: msg }]);
    setText("");
    startTransition(async () => {
      const r = await chatAction(msg, turns);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTurns((t) => [...t, { role: "coach", text: r.reply }]);
    });
  }

  function refreshBrief() {
    startTransition(async () => {
      const r = await regenerateBriefAction();
      if (r.ok) setBrief(r.brief);
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Today&apos;s brief</h2>
          <button className="text-xs text-emerald-600 underline underline-offset-2 disabled:opacity-50" onClick={refreshBrief} disabled={busy}>
            {brief ? "refresh" : busy ? "thinking…" : "generate"}
          </button>
        </div>
        {brief ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{brief}</p>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">
            No brief yet today — tap generate and I&apos;ll look at your data.
          </p>
        )}
      </section>

      <section className="flex flex-1 flex-col gap-3">
        {turns.map((t, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              t.role === "user"
                ? "self-end bg-emerald-400 text-emerald-950"
                : "self-start border border-neutral-200 dark:border-neutral-800"
            }`}
          >
            {t.text}
          </div>
        ))}
        {busy && turns.at(-1)?.role === "user" && (
          <div className="self-start rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-400 dark:border-neutral-800">
            thinking…
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </section>

      <form onSubmit={send} className="sticky bottom-16 flex gap-2 bg-inherit pt-1">
        <input
          className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950"
          placeholder='Ask anything — "how much protein left today?"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <button className="rounded-xl bg-emerald-400 px-5 text-sm font-medium text-emerald-950 disabled:opacity-50" disabled={busy || !text.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
