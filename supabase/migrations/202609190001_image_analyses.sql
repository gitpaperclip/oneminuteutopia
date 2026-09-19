-- The reports, sessions, and analyses belong to the SAME Supabase project.
begin;
create table if not exists public.image_analyses (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  image_path text not null unique,
  image_hash text not null,
  category text not null check (category in (
    'roads_and_sidewalks', 'traffic_signals_and_streetlights', 'trash_and_sanitation',
    'water_drainage_and_sewage', 'trees_and_public_spaces', 'buildings_and_construction',
    'electricity_and_gas', 'animals', 'fire_injury_or_immediate_threat',
    'other_hazard', 'no_visible_hazard', 'unable_to_assess'
  )),
  seriousness smallint,
  ai_confidence smallint not null check (ai_confidence between 0 and 100),
  model text not null,
  analysis_status text not null default 'complete' check (analysis_status in ('complete', 'unavailable')),
  prompt_version text not null,
  created_at timestamptz not null default now(),
  report_id text unique,
  incident_id text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_address text,
  submitted_at timestamptz,
  check (
    (category = 'unable_to_assess' and seriousness is null and ai_confidence = 0)
    or (category = 'no_visible_hazard' and seriousness is not null and seriousness = 0)
    or (category not in ('unable_to_assess','no_visible_hazard') and seriousness is not null and seriousness between 1 and 10)
  )
);
-- Supports an installation that already applied the original overlay migration.
alter table public.image_analyses add column if not exists analysis_status text not null default 'complete' check (analysis_status in ('complete', 'unavailable'));
comment on column public.image_analyses.ai_confidence is 'Model self-estimate, 0-100; not calibrated accuracy.';
comment on column public.image_analyses.seriousness is 'Initial image assessment, not overall danger; NULL means unable to assess.';
alter table public.image_analyses enable row level security;
revoke all on public.image_analyses from anon, authenticated;
grant all on public.image_analyses to service_role;
-- The app uses server-side session cookies, not Supabase Auth. No public policies.
create index if not exists image_analyses_submitted on public.image_analyses(submitted_at) where report_id is not null;

commit;
