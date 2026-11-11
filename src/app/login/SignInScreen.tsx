"use client";

import { ArrowRight, Bookmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Brand } from "@/components/Brand";
import { signIn, signUp } from "./actions";

export function SignInScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
      if (!res.ok) setError(res.error);
      else router.push(res.redirectTo);
    });
  }

  return (
    <main className="app auth-landing">
      <header className="auth-header row between flex-wrap">
        <Brand size={38} />
      </header>

      <div className="auth-layout">
        <section className="auth-story" aria-labelledby="auth-story-title">
          <div className="auth-orbits" aria-hidden="true" />
          <div className="auth-story-copy">
            <p className="eyebrow green">YOUR EVERYDAY FOOD DIARY</p>
            <h1 id="auth-story-title">Good food.<br /><em>Remembered.</em></h1>
            <p className="muted">From aloo parathas to evening chai, log what you eat and keep your usuals close.</p>
          </div>
          <div className="auth-sample row" aria-label="Saved meal example">
            <span className="auth-sample-icon"><Bookmark size={19} aria-hidden="true" /></span>
            <div>
              <p className="eyebrow muted">FROM SAVED FOODS</p>
              <p className="font-semibold">Dal, roti &amp; dahi</p>
            </div>
          </div>
        </section>

        <section className="auth-panel card" aria-labelledby="auth-form-title">
          <p className="eyebrow green">{mode === "signin" ? "WELCOME BACK" : "GET STARTED"}</p>
          <h2 id="auth-form-title" className="mt-2">{mode === "signin" ? "Sign in to MealMemory" : "Create your account"}</h2>
          <p className="small muted mt-2">
            {mode === "signin" ? "Pick up where you left off with your meals." : "Start your diary and save the dishes you eat most."}
          </p>

          <form onSubmit={submit} className="spaced mt-5">
            <label className="small">
              Email
              <input className="field mt-1" type="email" autoComplete="email"
                placeholder="you@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="small">
              Password
              <input className="field mt-1" type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            </label>
            {error && <p className="small danger" role="alert">{error}</p>}
            <button className="primary mt-1" disabled={pending}>
              {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </form>

          <p className="auth-switch small muted mt-4">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button type="button" className="green font-semibold" disabled={pending} onClick={() => {
              setMode((current) => current === "signin" ? "signup" : "signin");
              setError(null);
            }}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}
