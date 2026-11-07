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
drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- exercises (global rows have null user_id) -----------------------------------
alter table public.exercises enable row level security;
drop policy if exists "exercises_read" on public.exercises;
drop policy if exists "exercises_insert" on public.exercises;
drop policy if exists "exercises_update" on public.exercises;
drop policy if exists "exercises_delete" on public.exercises;
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
    execute format('drop policy if exists %I on public.%I;', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t || '_own', t
    );
  end loop;
end $$;

-- Private upload buckets ------------------------------------------------------
-- Paths are always <auth.uid()>/<timestamp>.<ext>. The app stores only the
-- path in public tables; these policies prevent users from reading or writing
-- another user's files if download views are added later.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('meal-photos', 'meal-photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('reports', 'reports', false, 5242880, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meal_photos_own" on storage.objects;
create policy "meal_photos_own" on storage.objects
  for all to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "reports_own" on storage.objects;
create policy "reports_own" on storage.objects
  for all to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
