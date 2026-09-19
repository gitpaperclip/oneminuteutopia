-- Demo-only mock government filing status. Apply after 202609190003.
-- The worker writes these columns; the app never claims a real city case number.
begin;

alter table public.incidents add column if not exists mock_reference_id text;
alter table public.incidents add column if not exists mock_submitted_at bigint;
alter table public.incidents add column if not exists mock_status text not null default 'pending';
alter table public.incidents add column if not exists mock_error text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_mock_status_check') then
    alter table public.incidents add constraint incidents_mock_status_check
      check (mock_status in ('pending', 'submitted', 'failed'));
  end if;
end $$;

create index if not exists incidents_mock_pending
  on public.incidents(updated_at desc)
  where mock_reference_id is null and evidence_count >= 2;

comment on column public.incidents.mock_reference_id is
  'Confirmation ID from the mock government demo site. Not a Baltimore City case number.';
comment on column public.incidents.mock_status is
  'pending, submitted, or failed for the demo Playwright worker only.';

commit;
