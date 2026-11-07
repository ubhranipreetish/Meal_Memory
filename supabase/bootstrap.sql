-- Run this once in the Supabase SQL editor before `npm run db:push`.
-- The schema contains a pgvector column, so the extension must exist first.
create extension if not exists vector;
