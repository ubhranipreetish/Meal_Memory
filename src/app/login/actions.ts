"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { z } from "zod";

export type AuthResult = { ok: false; error: string } | { ok: true; redirectTo: string };

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid credentials" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: error.message };
  return { ok: true, redirectTo: "/home" };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid credentials" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${env.siteUrl()}/auth/callback?next=/onboarding` },
  });
  if (error) return { ok: false, error: error.message };
  // If email confirmation is disabled (recommended for local dev), a session
  // exists immediately and we can go straight to onboarding.
  if (data.session) return { ok: true, redirectTo: "/onboarding" };
  return { ok: false, error: "Account created. Check your email to confirm, then sign in." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
