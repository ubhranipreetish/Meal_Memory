# Personal Gym 🏋️

A personal AI-powered fitness companion — nutritionist, gym coach, and fitness
diary in one app. Log food by just typing what you ate; the app understands it,
remembers it forever, and coaches you toward your goal.

## Why it's different

Most trackers make you search a database for every meal. Personal Gym works the
way you talk:

> *"I ate 2 aloo parathas and a glass of milk"*

- **AI parsing** — Gemini turns natural language (incl. Indian/homemade food)
  into structured items with per-unit nutrition estimates.
- **Food memory** — you confirm a new food **once**; it's stored permanently in
  your personal memory. Repeat logs are an instant database lookup with
  **zero AI calls** (<200 ms), including plurals, typos, and paraphrases
  (pgvector embedding match: "mom's paneer paratha" ≈ "paneer paratha").
- **Honest history** — nutrition is snapshotted at log time; editing a food
  never rewrites your past meals.
- **Workouts** — session logger with rest timer, automatic PR detection,
  per-exercise progress charts, plans.
- **Dashboard** — calories/protein/carbs/fat/water/steps vs. auto-calculated
  targets (Mifflin-St Jeor), plus quick-logs for weight/water/steps/sleep.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS, Recharts |
| DB / Auth / Storage | Supabase (Postgres + pgvector, RLS, Supabase Auth) |
| ORM | Drizzle |
| AI | Google Gemini (free tier) behind a provider-agnostic client (`src/lib/ai/client.ts`) |
| Tests | Vitest |

No model training, no fine-tuning — all "learning" is per-user database memory
plus retrieval. Every table is scoped by `user_id` with Row Level Security.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Gemini values
npm run db:push              # apply schema to your Supabase Postgres
# then run supabase/rls.sql in the Supabase SQL editor (RLS + pgvector)
npx tsx scripts/seed-exercises.ts   # seed the global exercise library
npm run dev                  # http://localhost:3000
```

Required env vars (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `GOOGLE_API_KEY`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` | dev server / production build |
| `npm test` | unit tests (targets math, parsing, PR detection) |
| `npm run db:push` | push Drizzle schema to Postgres |
| `npx tsx scripts/eval-parser.ts` | 20-utterance parser benchmark |
| `npx tsx scripts/seed-exercises.ts` | seed ~230 exercises |

## Project structure

```
src/
  app/            # routes: home, log, history, food/[id], workout, coach…
  lib/
    ai/           # ALL AI calls live here (client, parser, embeddings, prompts)
    services/     # pure business logic (targets, food memory, workouts, metrics)
    db/           # Drizzle schema + client
    supabase/     # auth clients (browser / server / proxy)
  types/          # shared Zod schemas
scripts/          # seeds + benchmark evals
supabase/         # rls.sql (RLS policies + pgvector)
```

---

*Built primarily with AI coding tools. Localhost-first; single user today,
multi-user-safe by design.*
