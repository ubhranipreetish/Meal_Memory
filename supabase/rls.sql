-- Row Level Security policies for Personal Gym.
--
-- ORDER OF OPERATIONS (run once, per docs/SETUP or the chat instructions):
--   1. In Supabase SQL Editor, run:  create extension if not exists vector;
--   2. From the project:              npm run db:push   (creates the tables)
--   3. In Supabase SQL Editor, run THIS FILE (enables RLS + policies)
--
-- Every user-scoped table: a row is visible/writable only to its owner
-- (user_id = auth.uid()). profiles is keyed by id = auth.uid(). exercises
-- allows reading global (seeded) rows where user_id is null.

create extension if not exists vector;

-- profiles (id = auth user id) ------------------------------------------------
alter table public.profiles enable row level security;
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- exercises (global rows have null user_id) -----------------------------------
alter table public.exercises enable row level security;
create policy "exercises_read" on public.exercises
  for select using (user_id is null or auth.uid() = user_id);
create policy "exercises_insert" on public.exercises
  for insert with check (auth.uid() = user_id);
create policy "exercises_update" on public.exercises
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exercises_delete" on public.exercises
  for delete using (auth.uid() = user_id);

-- all other user-scoped tables ------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'food_memory','food_aliases','meal_logs','meal_log_items',
    'workout_plans','plan_exercises','workout_sessions','session_sets',
    'weight_logs','water_logs','sleep_logs','steps_logs',
    'body_reports','measurements','progress_photos',
    'reviews','coach_notes','user_facts'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t || '_own', t
    );
  end loop;
end $$;
