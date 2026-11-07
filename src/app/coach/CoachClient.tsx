"use client";

import { useState, useTransition } from "react";
import { Send, Sparkles } from "lucide-react";
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
    <>
      <section className="card section">
        <div className="row between">
          <div className="row green">
            <Sparkles size={20} />
            <span className="eyebrow">TODAY&rsquo;S BRIEF</span>
          </div>
          <button className="small green" onClick={refreshBrief} disabled={busy}>
            {busy ? "thinking…" : brief ? "refresh" : "generate"}
          </button>
        </div>
        {brief ? (
          <p className="mt-3 whitespace-pre-wrap">{brief}</p>
        ) : (
          <p className="small muted mt-3">No brief yet today — tap generate and I&rsquo;ll look at your data.</p>
        )}
      </section>

      <section className="section">
        {turns.length === 0 && (
          <div className="bubble">
            <p className="eyebrow green mb-2">YOUR COACH</p>
            Ask me anything about your food, your training or how the week&rsquo;s going.
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={"bubble " + (t.role === "user" ? "user" : "")} style={{ whiteSpace: "pre-wrap" }}>
            {t.text}
          </div>
        ))}
        {busy && turns.at(-1)?.role === "user" && <div className="bubble muted">thinking…</div>}
        {error && <p className="small danger">{error}</p>}
      </section>

      {turns.length === 0 && (
        <div className="chips">
          {["How much protein do I have left today?", "What should I eat for dinner?", "How was my week?"].map((q) => (
            <button key={q} className="chip" onClick={() => setText(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={send} className="composer">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Message your coach"
          placeholder="Ask what&rsquo;s on your mind…"
          disabled={busy}
        />
        <div className="row between">
          <span className="small muted">Uses your logged meals and training.</span>
          <button className="primary" disabled={busy || !text.trim()}>
            Send <Send size={17} />
          </button>
        </div>
      </form>
    </>
  );
}
