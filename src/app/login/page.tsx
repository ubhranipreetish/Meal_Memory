"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signIn, signUp } from "./actions";

export default function LoginPage() {
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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5">
      <div>
        <h1 className="text-2xl font-semibold">Personal Gym</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {mode === "signin" ? "Welcome back." : "Create your account."}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          className={inputCls}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={inputCls}
          type="password"
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50" disabled={pending}>
          {pending ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      <button
        className="text-sm text-neutral-500 underline underline-offset-4"
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError(null);
        }}
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </main>
  );
}

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700";
