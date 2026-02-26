-- Row-based timestamps: one row per segment (video_name, start, end as strings).
-- Run in Supabase SQL Editor after 001_initial.sql.
-- Matches CSV format: video_name, start, end (e.g. ab, 00:12, 00:34).
-- The API parses start/end (e.g. "00:12") to seconds and returns segments for the playing video by name.

create table if not exists public.timestamp_rows (
  id bigserial primary key,
  video_name text not null,
  start text not null,
  "end" text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_timestamp_rows_video_name on public.timestamp_rows (video_name);

comment on table public.timestamp_rows is 'One row per segment; start and end are time strings (e.g. 00:12, 00:34).';
