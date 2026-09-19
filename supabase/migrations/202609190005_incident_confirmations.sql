-- Community "I see this too" confirmations. Apply after 202609190004.
-- confirmation_count is independent of evidence_count / super-reports / 311.
begin;

alter table public.incidents
  add column if not exists confirmation_count integer not null default 0;

update public.incidents set confirmation_count = 0 where confirmation_count is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_confirmation_count_check') then
    alter table public.incidents add constraint incidents_confirmation_count_check
      check (confirmation_count >= 0);
  end if;
end $$;

create table if not exists public.incident_confirmations (
  incident_id text not null references public.incidents(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  created_at bigint not null,
  primary key (incident_id, session_id)
);

create index if not exists incident_confirmations_session
  on public.incident_confirmations(session_id, created_at desc);

alter table public.incident_confirmations enable row level security;
revoke all on public.incident_confirmations from anon, authenticated;
grant all on public.incident_confirmations to service_role;

comment on column public.incidents.confirmation_count is
  'Public tally of I-see-this-too confirmations. Not evidence_count and not a city filing.';
comment on table public.incident_confirmations is
  'One confirmation per session per incident. Does not create reports or 311 requests.';

commit;
