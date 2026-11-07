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

function siteUrl(): string {
  let candidate =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    process.env.VERCEL_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    "http://localhost:3000";
  if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
    candidate = `https://${candidate}`;
  }
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an http(s) URL");
  }
  return url.origin;
}

export const env = {
  // Supabase (public — safe for the browser)
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  siteUrl,

  // Server-only secrets
  databaseUrl: () => required("DATABASE_URL"),
  googleApiKey: () => required("GOOGLE_API_KEY"),

  // AI model (overridable; defaults to the free-tier flash model)
  geminiModel: () => process.env.GEMINI_MODEL ?? "gemini-2.5-flash",

  // Server-side date grouping. Keep this aligned with the user's home zone.
  appTimeZone: () => process.env.APP_TIME_ZONE ?? "Asia/Kolkata",

  // Cron routes must never become public just because configuration was missed.
  cronSecret: () => required("CRON_SECRET"),
};
