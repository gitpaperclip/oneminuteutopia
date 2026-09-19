-- Case scores on each report and incident-level community scores.
-- Apply after 202609190006. Additive.
-- Report danger and confidence stay on existing columns: seriousness, ai_confidence.
begin;

alter table public.reports add column if not exists case_score double precision;
alter table public.image_analyses add column if not exists case_score double precision;

alter table public.incidents add column if not exists incident_score double precision not null default 0;
alter table public.incidents add column if not exists report_count integer not null default 0;
alter table public.incidents add column if not exists government_report_status text not null default 'not_ready';
alter table public.incidents drop column if exists danger_level;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_government_report_status_check') then
    alter table public.incidents add constraint incidents_government_report_status_check
      check (government_report_status in (
        'not_ready', 'ready_to_submit', 'submitting', 'submitted', 'failed'
      ));
  end if;
end $$;

comment on column public.reports.case_score is
  'Backend (seriousness/10)*(0.5+0.5*ai_confidence). seriousness is 0-10, ai_confidence is 0-1. Not supplied by the browser.';
comment on column public.image_analyses.case_score is
  'Backend (seriousness/10)*(0.5+0.5*ai_confidence/100). seriousness is 0-10, ai_confidence is 0-100.';
comment on column public.incidents.incident_score is
  '1 - product(1 - independent case scores). Always between 0 and 1.';
comment on column public.incidents.report_count is
  'Independent sessions contributing a case_score, not raw evidence_count.';
comment on column public.incidents.government_report_status is
  'Demo filing gate: not_ready, ready_to_submit, submitting, submitted, failed.';

update public.reports
set case_score = (least(10::double precision, greatest(0::double precision, coalesce(seriousness, 0))) / 10.0)
  * (0.5 + 0.5 * least(1::double precision, greatest(0::double precision, coalesce(ai_confidence, 0))))
where case_score is null;

update public.image_analyses
set case_score = case
  when analysis_status = 'unavailable' or seriousness is null then 0
  else (least(10::double precision, greatest(0::double precision, seriousness)) / 10.0)
    * (0.5 + 0.5 * least(1::double precision, greatest(0::double precision, ai_confidence::double precision / 100.0)))
end
where case_score is null;

update public.incidents
set report_count = case when report_count = 0 then evidence_count else report_count end;

commit;
