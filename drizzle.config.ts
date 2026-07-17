import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load env from .env.local for CLI commands (drizzle-kit generate/push).
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Supabase manages the auth/storage schemas — only touch our own tables.
  schemaFilter: ["public"],
});
