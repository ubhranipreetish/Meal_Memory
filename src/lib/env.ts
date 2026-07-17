/**
 * Central environment access. Reads from process.env with light validation.
 * Does NOT hard-throw at import time (so the app builds before Supabase is
 * configured); throws only when a required value is actually used.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example and set it in .env.local`,
    );
  }
  return v;
}

export const env = {
  // Supabase (public — safe for the browser)
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),

  // Server-only secrets
  databaseUrl: () => required("DATABASE_URL"),
  googleApiKey: () => required("GOOGLE_API_KEY"),

  // AI model (overridable; defaults to the free-tier flash model)
  geminiModel: () => process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
};
