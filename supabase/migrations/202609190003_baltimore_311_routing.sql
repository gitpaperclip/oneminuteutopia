begin;

alter table public.image_analyses
  add column if not exists baltimore_service_candidates text[] not null default '{}';
alter table public.image_analyses
  add column if not exists routing_disposition text not null default 'manual_review';
alter table public.reports
  add column if not exists baltimore_service_candidates text[] not null default '{}';
alter table public.reports
  add column if not exists routing_disposition text not null default 'manual_review';
alter table public.incidents
  add column if not exists baltimore_service_candidates text[] not null default '{}';
alter table public.incidents
  add column if not exists routing_disposition text not null default 'manual_review';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'image_analyses_routing_disposition_check') then
    alter table public.image_analyses add constraint image_analyses_routing_disposition_check
      check (routing_disposition in ('311','manual_review','emergency','no_submission'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reports_routing_disposition_check') then
    alter table public.reports add constraint reports_routing_disposition_check
      check (routing_disposition in ('311','manual_review','emergency','no_submission'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incidents_routing_disposition_check') then
    alter table public.incidents add constraint incidents_routing_disposition_check
      check (routing_disposition in ('311','manual_review','emergency','no_submission'));
  end if;
end $$;

create index if not exists image_analyses_baltimore_services
  on public.image_analyses using gin(baltimore_service_candidates);
create index if not exists incidents_baltimore_services
  on public.incidents using gin(baltimore_service_candidates);

comment on column public.image_analyses.baltimore_service_candidates is
  'Exact current Baltimore SRType candidates derived deterministically from incident_type.';
comment on column public.image_analyses.routing_disposition is
  '311, manual_review, emergency, or no_submission; emergency rows must never be auto-filed as 311.';

commit;
