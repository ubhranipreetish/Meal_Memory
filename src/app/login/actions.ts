"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthResult = { ok: false; error: string } | { ok: true; redirectTo: string };

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, redirectTo: "/home" };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  // If email confirmation is disabled (recommended for local dev), a session
  // exists immediately and we can go straight to onboarding.
  if (data.session) return { ok: true, redirectTo: "/onboarding" };
  return { ok: false, error: "Account created. Check your email to confirm, then sign in." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
