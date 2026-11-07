# MealMemory

MealMemory is a calorie and macro diary for Indian home cooking. Describe a meal
such as “two aloo parathas and a bowl of dahi,” review the nutrition estimate,
and save dishes you eat often.

- **Welcome tour and sign-in** introduce the app, then guide you through setting up your nutrition targets.
- **Today** shows calories, protein, carbs, and fat against your daily targets.
- **Eat** supports text, voice, photo, and manual logging. Review quantities and
  nutrition before saving. Pick a dish from your saved foods and confirm to log it.
- **This Week** shows seven days of calorie and protein trends, calories by meal
  category, and expandable daily meal logs.
- **Profile** is where you edit nutrition goals, manage saved foods, and switch themes.

Saved foods are specific to each account. Editing a saved dish changes future
logs. Past meals retain the nutrition recorded when they were logged.

## Stack

Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, Postgres with
pgvector, Supabase Storage, Drizzle, and Google Gemini. Vitest covers the
application's unit tests.

## Run locally

Use Node.js 22.12+ on the Node 22 release line, or Node.js 24.

```bash
npm ci
cp .env.example .env.local
```

Fill in `.env.local` using your Supabase project and Google Gemini API key. For
an existing MealMemory database, run `npm run db:check` to verify it. For a new
Supabase project, follow this order:

1. Run [supabase/bootstrap.sql](supabase/bootstrap.sql) in the Supabase SQL
   Editor to enable the required extensions.
2. Run `npm run db:push` locally to create the application tables. Use a direct
   or session-pooler connection for `DIRECT_URL`.
3. Run [supabase/rls.sql](supabase/rls.sql) in the SQL Editor to install row
   security policies and private storage buckets.
4. Run `npm run db:check` to verify the schema, extensions, and buckets.

In Supabase Authentication → URL Configuration, allow
`http://localhost:3000/auth/callback` for local email confirmation. Then run
`npm run dev` and open [localhost:3000](http://localhost:3000).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js server |
| `npm run build` / `npm start` | Build and run the production server |
| `npm run check` | Run lint, tests, and the production build |
| `npm run db:check` | Check the connected database without writing |
| `npm run db:push` | Apply the Drizzle schema to the configured database |

## Repository layout

| Path | Contents |
| --- | --- |
| `src/app/` | Routes, server actions, sign-in, tour, and meal screens |
| `src/components/` | Shared app shell, navigation, branding, and controls |
| `src/lib/` | Supabase and Gemini clients, database schema, and meal services |
| `src/types/` | Shared data types and validation |
| `public/` | App icons and web app manifest |
| `supabase/` | Database bootstrap, row security, and storage setup |
| `scripts/` | Database checks and development diagnostics |

## Deploy

Deploy the repository as a full Next.js application. The same deployment
serves the UI and server actions. Supabase continues to provide authentication,
database, and storage. Gemini powers meal estimates.

- **Vercel:** Import the GitHub repository, select the Next.js preset, and set
  the environment variables below. Test photo and voice logging against the
  [Vercel Functions payload limit](https://vercel.com/docs/functions/limitations#request-body-size).
- **Render:** Create a [Node.js web service](https://render.com/docs/deploy-nextjs-app)
  from the GitHub repository. Use `npm ci && npm run build` as the build command
  and `npm start` as the start command.

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`DATABASE_URL`, and `GOOGLE_API_KEY` in the hosting dashboard. Set
`NEXT_PUBLIC_SITE_URL` to the deployed HTTPS origin. `GEMINI_MODEL` and
`APP_TIME_ZONE` are optional overrides. Keep `DIRECT_URL` for schema
administration. The current Vercel config has no scheduled jobs.

Set the Supabase Auth Site URL to the production origin and allow the
production `/auth/callback` URL. Configure
[custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) before opening
email sign-ups to users outside the Supabase project team. After deployment,
verify sign-up confirmation, sign-in, first-time setup, logging, and saved
foods on the HTTPS URL.

Use [.env.example](.env.example) as the reference for environment variable
names. Keep real credentials in your local environment or hosting dashboard.
