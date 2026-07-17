/**
 * Supabase browser client (client components). Uses the public anon key —
 * Row Level Security enforces per-user access on top of it.
 */
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export function createClient() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnonKey());
}
