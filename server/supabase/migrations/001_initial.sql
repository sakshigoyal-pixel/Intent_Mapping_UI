-- Run this in Supabase Dashboard → SQL Editor to create tables for the intent_mapping API.

-- Annotations (replaces db.json / MongoDB annotations)
create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  video_id text not null default 'default',
  start_time decimal not null check (start_time >= 0),
  end_time decimal not null check (end_time >= 0),
  intent text not null,
  text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_annotations_video_id on public.annotations (video_id);
create index if not exists idx_annotations_intent on public.annotations (intent);
create index if not exists idx_annotations_created_at on public.annotations (created_at desc);

-- Queue (replaces queue.json) – single row for app state
create table if not exists public.queue (
  id int primary key default 1 check (id = 1),
  current_index int not null default 0,
  videos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.queue (id, current_index, videos)
values (1, 0, '[]'::jsonb)
on conflict (id) do nothing;

-- Timestamps (replaces CSV files in data/timestamps/) – one row per video
create table if not exists public.timestamps (
  video_name text primary key,
  segments jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Optional: enable RLS and add policies if you want client-side access later.
-- For server-only access with service_role key, RLS can stay disabled.
